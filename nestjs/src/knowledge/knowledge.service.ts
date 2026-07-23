import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
  ) {}

  // ─── 文档上传 ──────────────────────────────────────────────────────────

  async uploadDocument(file: Express.Multer.File, userId: string) {
    if (!file) throw new BadRequestException('请选择文件');

    const ext = path.extname(file.originalname).toLowerCase();
    const typeMap: Record<string, string> = {
      '.pdf': 'pdf',
      '.docx': 'docx',
      '.md': 'md',
      '.txt': 'txt',
      '.epub': 'epub',
    };
    const type = typeMap[ext];
    if (!type) throw new BadRequestException(`不支持的文件格式: ${ext}`);

    const size = this.formatSize(file.size);

    const document = await this.prisma.document.create({
      data: {
        name: file.originalname,
        type,
        size,
        path: file.path,
        status: 'uploaded',
        uploadedBy: userId,
      },
    });

    // 异步处理文档（索引到向量库）
    this.processDocumentAsync(document.id, file.path, type).catch((err) => {
      this.logger.error(`文档处理失败: ${err.message}`);
    });

    return document;
  }

  // ─── 文档列表 ──────────────────────────────────────────────────────────

  async getDocuments(params: {
    search?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const { search, status, page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (search) {
      where.name = { contains: search };
    }
    if (status && status !== 'all') {
      where.status = status;
    }

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      list: documents,
      total,
      page,
      pageSize,
    };
  }

  // ─── 文档详情 ──────────────────────────────────────────────────────────

  async getDocument(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { chunks: { orderBy: { chunkIndex: 'asc' }, take: 20 } },
    });
    if (!doc) throw new NotFoundException('文档不存在');
    return doc;
  }

  // ─── 删除文档 ──────────────────────────────────────────────────────────

  async deleteDocument(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('文档不存在');

    // 删除文件
    if (doc.path && fs.existsSync(doc.path)) {
      fs.unlinkSync(doc.path);
    }

    // 从向量库中删除相关向量
    await this.ragService.deleteDocumentVectors(id);

    // 删除数据库记录（级联删除分块）
    await this.prisma.document.delete({ where: { id } });

    return { message: '文档已删除' };
  }

  // ─── 文档预览 ──────────────────────────────────────────────────────────

  async previewDocument(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { chunks: { orderBy: { chunkIndex: 'asc' }, take: 50 } },
    });
    if (!doc) throw new NotFoundException('文档不存在');

    // 返回文本内容预览
    const preview = doc.chunks
      .map((c) => c.content)
      .join('\n...\n')
      .slice(0, 10000);

    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      status: doc.status,
      chunkCount: doc.chunkCount,
      preview,
      chunks: doc.chunks.map((c) => ({
        index: c.chunkIndex,
        content: c.content.slice(0, 500),
      })),
    };
  }

  // ─── 重新索引 ──────────────────────────────────────────────────────────

  async reindexDocument(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('文档不存在');

    // 清除旧的分块和向量
    await this.prisma.docChunk.deleteMany({ where: { documentId: id } });

    await this.prisma.document.update({
      where: { id },
      data: { status: 'processing', chunkCount: 0 },
    });

    // 重新处理
    this.processDocumentAsync(id, doc.path, doc.type).catch((err) => {
      this.logger.error(`重新索引失败: ${err.message}`);
    });

    return { message: '已开始重新索引' };
  }

  // ─── 统计 ──────────────────────────────────────────────────────────────

  async getStats() {
    const [totalDocs, indexedDocs, processingDocs, failedDocs] =
      await Promise.all([
        this.prisma.document.count(),
        this.prisma.document.count({ where: { status: 'indexed' } }),
        this.prisma.document.count({ where: { status: 'processing' } }),
        this.prisma.document.count({ where: { status: 'failed' } }),
      ]);

    const totalChunks = await this.prisma.docChunk.count();

    return {
      totalDocuments: totalDocs,
      indexedDocuments: indexedDocs,
      processingDocuments: processingDocs,
      failedDocuments: failedDocs,
      totalChunks,
    };
  }

  // ─── 私有方法 ──────────────────────────────────────────────────────────

  private async processDocumentAsync(
    docId: string,
    filePath: string,
    type: string,
  ) {
    try {
      // 更新状态为处理中
      await this.prisma.document.update({
        where: { id: docId },
        data: { status: 'processing' },
      });

      // 加载文档内容
      let content = '';
      if (type === 'md' || type === 'txt') {
        content = fs.readFileSync(filePath, 'utf-8');
      } else if (type === 'epub') {
        try {
          const loader = new EPubLoader(filePath, { splitChapters: true });
          const documents = await loader.load();
          content = documents.map((d) => d.pageContent).join('\n\n');
        } catch {
          throw new Error('EPUB 解析失败，请确保文件格式正确');
        }
      } else if (type === 'pdf') {
        try {
          const pdfParse = require('pdf-parse');
          const buffer = fs.readFileSync(filePath);
          const data = await pdfParse(buffer);
          content = data.text;
        } catch {
          throw new Error('PDF 解析失败，请确保 pdf-parse 已安装');
        }
      } else if (type === 'docx') {
        try {
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ path: filePath });
          content = result.value;
        } catch {
          throw new Error('Word 解析失败，请确保 mammoth 已安装');
        }
      }

      if (!content || content.trim().length === 0) {
        throw new Error('文档内容为空');
      }

      // 获取文档名称
      const document = await this.prisma.document.findUnique({
        where: { id: docId },
        select: { name: true },
      });

      // 使用 RagService 进行分块、向量化并存入 Milvus（与 rag-book 方式一致）
      const { chunkCount, chunks } = await this.ragService.addTexts(
        content,
        docId,
        document?.name ?? 'unknown',
      );

      // 保存分块到数据库（与 Milvus 中的分块保持一致）
      await this.prisma.docChunk.createMany({
        data: chunks.map((chunk) => ({
          documentId: docId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
        })),
      });

      // 更新为已索引
      await this.prisma.document.update({
        where: { id: docId },
        data: { status: 'indexed', chunkCount },
      });

      this.logger.log(`文档 ${docId} 索引完成: ${chunkCount} 个分块`);
    } catch (err) {
      this.logger.error(`文档处理失败 (${docId}): ${(err as Error).message}`);
      await this.prisma.document.update({
        where: { id: docId },
        data: { status: 'failed' },
      });
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ─── 数据恢复：从 uploads 目录重新导入残留文件 ──────────────────────────

  /**
   * 扫描 uploads/documents/ 目录，将残留的文件重新导入数据库。
   * 数据库重置后，Document 记录丢失，但原始文件和 Milvus 向量还在。
   * 此方法仅恢复 Document 记录，不重新分块和向量化。
   * 如需重新索引，可手动触发"重新索引"。
   */
  async recoverDocuments(userId: string) {
    // 校验 userId 是否有效（数据库重置后旧 userId 可能已不存在）
    let validUserId: string | undefined = userId;
    const userExists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      const fallbackUser = await this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
      validUserId = fallbackUser?.id ?? undefined;
    }

    const uploadsDir = path.resolve(__dirname, '..', '..', '..', 'uploads', 'documents');
    if (!fs.existsSync(uploadsDir)) {
      return { message: '无残留文件需要恢复', count: 0, total: 0, results: [] };
    }

    const files = fs.readdirSync(uploadsDir).filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ['.md', '.txt', '.pdf', '.docx', '.epub'].includes(ext);
    });

    if (files.length === 0) {
      return { message: '无残留文件需要恢复', count: 0, total: 0, results: [] };
    }

    this.logger.log(`发现 ${files.length} 个残留文件，开始恢复...`);

    const results: { file: string; status: string; error?: string }[] = [];

    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const ext = path.extname(file).toLowerCase();
      const docName = path.basename(file, ext); // 文件名（不含扩展名）作为文档名称
      const typeMap: Record<string, string> = {
        '.pdf': 'pdf',
        '.docx': 'docx',
        '.md': 'md',
        '.txt': 'txt',
        '.epub': 'epub',
      };
      const type = typeMap[ext];

      try {
        // 检查是否已恢复（幂等性）
        const existing = await this.prisma.document.findFirst({
          where: { path: filePath },
        });
        if (existing) {
          results.push({ file, status: 'skipped', error: '已存在' });
          continue;
        }

        const stats = fs.statSync(filePath);
        const size = this.formatSize(stats.size);

        // 先查 Milvus 是否有同名文件的向量，有则复用旧 UUID，避免孤儿数据
        const existingDocId = await this.ragService.findDocumentIdByFileName(file);
        const docId = existingDocId ?? randomUUID();
        const status = existingDocId ? 'indexed' : 'uploaded';

        await this.prisma.document.create({
          data: {
            id: docId,
            name: docName,
            type,
            size,
            path: filePath,
            status,
            uploadedBy: validUserId,
          },
        });

        if (existingDocId) {
          // 从 Milvus 中恢复 DocChunk 记录，无需重新嵌入
          const chunks = await this.ragService.getChunksByDocumentId(existingDocId);
          if (chunks.length > 0) {
            await this.prisma.docChunk.createMany({
              data: chunks.map((chunk) => ({
                documentId: existingDocId,
                content: chunk.content,
                chunkIndex: chunk.chunkIndex,
              })),
            });
            await this.prisma.document.update({
              where: { id: existingDocId },
              data: { chunkCount: chunks.length },
            });
          }
          this.logger.log(`恢复成功: ${file}（复用旧 UUID: ${existingDocId}，${chunks.length} 个分块）`);
        } else {
          this.logger.log(`恢复成功: ${file}（新建记录，未找到 Milvus 向量）`);
        }
        results.push({ file, status: 'success' });
      } catch (err) {
        results.push({ file, status: 'failed', error: (err as Error).message });
        this.logger.error(`恢复失败: ${file} — ${(err as Error).message}`);
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    return {
      message: `恢复完成: ${successCount}/${files.length} 个成功`,
      count: successCount,
      total: files.length,
      results,
    };
  }
}
