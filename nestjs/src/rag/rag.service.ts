import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PromptTemplate } from '@langchain/core/prompts';
import { ModelRouterService } from '../ai/model-router/model-router.service';
import { AppConfigService } from '../config/config.service';
import {
  MilvusClient,
  DataType,
  IndexType,
  MetricType,
} from '@zilliz/milvus2-sdk-node';

const COLLECTION_NAME = 'knowledge_base';
const VECTOR_DIM = 1024;
const SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_TOP_K = 5;
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 50;
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-v4';

/**
 * RAG 知识库服务
 *
 * 全链路（与 rag-book 方式一致）：
 *   1. 文档分割   → RecursiveCharacterTextSplitter 按递归优先级切分 chunk
 *   2. 向量化     → OpenAIEmbeddings 将每个 chunk 转为 1024 维向量
 *   3. 向量存储   → Milvus（持久化，集合名 knowledge_base）
 *   4. 相似检索   → 用户提问向量化 → COSINE 相似度 → Top-K
 *   5. LLM 增强生成 → 拼接 prompt + 检索片段 + 用户问题 → 通过 ModelRouter 调用 LLM
 */
@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);

  private client: MilvusClient;
  private embeddings: OpenAIEmbeddings;
  private splitter: RecursiveCharacterTextSplitter;
  private initialized = false;

  private readonly systemPrompt =
    '你是一个知识库助手，请基于以下提供的资料回答用户问题。如果资料中没有相关信息，请如实告知"资料中未找到相关信息"。\n\n' +
    '回答要求：\n1. 引用资料中的具体内容\n2. 语言简洁清晰\n3. 不要编造不存在的信息';

  private lastEmbeddingModel: string;
  private lastChunkSize: number;
  private lastChunkOverlap: number;

  constructor(
    private readonly modelRouter: ModelRouterService,
    private readonly configService: ConfigService,
    private readonly appConfigService: AppConfigService,
  ) {
    // 初始化 Milvus 客户端
    const address =
      this.configService.get<string>('MILVUS_ADDRESS') || 'localhost:19530';
    const token = this.configService.get<string>('MILVUS_TOKEN') || '';
    this.client = new MilvusClient({ address, token });

    // 占位：embeddings 和 splitter 将在 onModuleInit 中异步初始化
    this.lastEmbeddingModel = DEFAULT_EMBEDDING_MODEL;
    this.lastChunkSize = DEFAULT_CHUNK_SIZE;
    this.lastChunkOverlap = DEFAULT_CHUNK_OVERLAP;
  }

  async onModuleInit() {
    await this.ensureCollection();
    await this.applyConfigIfChanged(true);
  }

  /** 读取动态配置，按需重建 embeddings 和 splitter */
  private async applyConfigIfChanged(force = false) {
    try {
      const cfg = await this.appConfigService.getAllConfig();
      const ragCfg = cfg.rag;

      const embeddingModel =
        this.configService.get<string>('EMBEDDING_MODEL_NAME') ||
        ragCfg.embeddingModel ||
        DEFAULT_EMBEDDING_MODEL;
      const chunkSize = ragCfg.chunkSize ?? DEFAULT_CHUNK_SIZE;
      const chunkOverlap = ragCfg.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

      const needRebuildEmbeddings =
        force || !this.embeddings || this.lastEmbeddingModel !== embeddingModel;
      const needRebuildSplitter =
        force ||
        !this.splitter ||
        this.lastChunkSize !== chunkSize ||
        this.lastChunkOverlap !== chunkOverlap;

      if (needRebuildEmbeddings) {
        this.embeddings = new OpenAIEmbeddings({
          apiKey: this.configService.get<string>('API_KEY'),
          model: embeddingModel,
          configuration: {
            baseURL: this.configService.get<string>('BASE_URL'),
          },
          dimensions: VECTOR_DIM,
        });
        this.lastEmbeddingModel = embeddingModel;
        if (!force) {
          this.logger.log(`Embedding 模型已更新为: ${embeddingModel}`);
        }
      }

      if (needRebuildSplitter) {
        this.splitter = new RecursiveCharacterTextSplitter({
          chunkSize,
          chunkOverlap,
        });
        this.lastChunkSize = chunkSize;
        this.lastChunkOverlap = chunkOverlap;
        if (!force) {
          this.logger.log(
            `分块参数已更新: chunkSize=${chunkSize}, chunkOverlap=${chunkOverlap}`,
          );
        }
      }
    } catch (error) {
      if (!this.embeddings) {
        throw new Error(
          `RAG 初始化失败：无法加载配置 - ${(error as Error).message}`,
        );
      }
      this.logger.warn(
        `刷新 RAG 配置失败，使用上次配置: ${(error as Error).message}`,
      );
    }
  }

  // ─── 集合管理 ──────────────────────────────────────────────────────────

  private async ensureCollection() {
    try {
      await this.client.connectPromise;
    } catch {
      // 连接可能已建立，忽略
    }
    try {
      const hasCollection = await this.client.hasCollection({
        collection_name: COLLECTION_NAME,
      });
      if (!hasCollection.value) {
        this.logger.log('Milvus 集合不存在，创建集合...');
        await this.client.createCollection({
          collection_name: COLLECTION_NAME,
          fields: [
            { name: 'id', data_type: DataType.VarChar, max_length: 100, is_primary_key: true },
            { name: 'document_id', data_type: DataType.VarChar, max_length: 100 },
            { name: 'document_name', data_type: DataType.VarChar, max_length: 500 },
            { name: 'chunk_index', data_type: DataType.Int32 },
            { name: 'content', data_type: DataType.VarChar, max_length: 10000 },
            { name: 'vector', data_type: DataType.FloatVector, dim: VECTOR_DIM },
          ],
        });
        this.logger.log('Milvus 集合创建成功');
        await this.client.createIndex({
          collection_name: COLLECTION_NAME,
          field_name: 'vector',
          index_type: IndexType.IVF_FLAT,
          metric_type: MetricType.COSINE,
          params: { nlist: VECTOR_DIM },
        });
        this.logger.log('Milvus 索引创建成功');
      } else {
        this.logger.log('Milvus 集合已存在');
      }
      await this.client.loadCollection({ collection_name: COLLECTION_NAME });
      this.initialized = true;
      this.logger.log('Milvus 集合加载成功');
    } catch (error) {
      this.logger.error(`Milvus 初始化失败: ${(error as Error).message}`);
    }
  }

  // ─── 公共 API ──────────────────────────────────────────────────────────

  /**
   * 添加文档文本到知识库
   * @param text 文档全文
   * @param documentId 文档 ID
   * @param documentName 文档名称
   * @returns 分块信息（chunkCount + chunks 列表）
   */
  async addTexts(
    text: string,
    documentId: string,
    documentName: string,
  ): Promise<{ chunkCount: number; chunks: { content: string; chunkIndex: number }[] }> {
    if (!this.initialized) {
      await this.ensureCollection();
      if (!this.initialized) {
        throw new Error('Milvus 未就绪，无法添加知识库');
      }
    }

    await this.applyConfigIfChanged();

    const chunks = await this.splitter.splitText(text);
    this.logger.log(`文本拆分完成: ${chunks.length} 个片段（chunkSize=${this.lastChunkSize}, overlap=${this.lastChunkOverlap}）`);

    // 并发生成向量（与 rag-book 一致）
    const insertData = await Promise.all(
      chunks.map(async (chunk, idx) => {
        const vector = await this.embeddings.embedQuery(chunk);
        return {
          id: `${documentId}_${idx}`,
          document_id: documentId,
          document_name: documentName,
          chunk_index: idx,
          content: chunk,
          vector,
        };
      }),
    );

    const validData = insertData.filter((item) => item !== null);
    if (validData.length > 0) {
      await this.client.insert({
        collection_name: COLLECTION_NAME,
        data: validData,
      });
      this.logger.log(`已插入 ${validData.length} 个向量到 Milvus`);
    }

    return {
      chunkCount: chunks.length,
      chunks: chunks.map((content, i) => ({ content, chunkIndex: i })),
    };
  }

  /** RAG 问答：检索 + 增强生成 */
  async answer(question: string): Promise<{ answer: string; sources: string[] }> {
    if (!this.initialized) {
      throw new Error('RAG 系统未初始化，请先上传文档');
    }

    await this.applyConfigIfChanged();
    const cfg = await this.appConfigService.getAllConfig();
    const topK = cfg.rag.topK ?? DEFAULT_TOP_K;

    // 1. 向量化问题
    const queryVector = await this.embeddings.embedQuery(question);

    // 2. Milvus 相似度搜索（与 rag-book 一致）
    const searchResult = await this.client.search({
      collection_name: COLLECTION_NAME,
      limit: topK,
      vector: queryVector,
      output_fields: ['id', 'document_id', 'document_name', 'chunk_index', 'content'],
      metric_type: MetricType.COSINE,
    });

    const results = searchResult.results.filter(
      (item) => (item.score as number) >= SIMILARITY_THRESHOLD,
    );
    if (results.length === 0) {
      return { answer: '', sources: [] };
    }

    // 3. 构建 Prompt
    const context = results
      .map((item, i) => `[片段${i + 1}]\n${item.content}`)
      .join('\n\n----\n\n');

    const prompt = PromptTemplate.fromTemplate(
      `${this.systemPrompt}\n\n参考资料：\n{context}\n\n用户问题：{question}\n\n回答：`,
    );

    const formatted = await prompt.format({ context, question });

    // 4. 通过模型路由器获取 LLM
    const model = await this.modelRouter.resolve();
    const response = await model.invoke(formatted);

    const sources = results.map((item) => item.document_name as string);

    return {
      answer:
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content),
      sources,
    };
  }

  /** 纯检索（不调用 LLM 生成），返回原始片段 */
  async search(
    question: string,
    topK?: number,
  ): Promise<{ content: string; documentName: string; chunkIndex: number; score: number }[]> {
    if (!this.initialized) {
      throw new Error('RAG 系统未初始化');
    }

    await this.applyConfigIfChanged();
    let effectiveTopK = topK;
    if (effectiveTopK == null) {
      const cfg = await this.appConfigService.getAllConfig();
      effectiveTopK = cfg.rag.topK ?? DEFAULT_TOP_K;
    }

    const queryVector = await this.embeddings.embedQuery(question);

    const searchResult = await this.client.search({
      collection_name: COLLECTION_NAME,
      limit: effectiveTopK,
      vector: queryVector,
      output_fields: ['id', 'document_id', 'document_name', 'chunk_index', 'content'],
      metric_type: MetricType.COSINE,
    });

    return searchResult.results
      .filter((item) => (item.score as number) >= SIMILARITY_THRESHOLD)
      .map((item) => ({
        content: (item as any).content as string,
        documentName: (item as any).document_name as string,
        chunkIndex: (item as any).chunk_index as number,
        score: (item as any).score as number,
      }));
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /** 删除文档的向量数据 */
  async deleteDocumentVectors(documentId: string): Promise<void> {
    try {
      const hasCollection = await this.client.hasCollection({
        collection_name: COLLECTION_NAME,
      });
      if (hasCollection.value) {
        await this.client.deleteEntities({
          collection_name: COLLECTION_NAME,
          expr: `document_id == '${documentId}'`,
        });
        this.logger.log(`已删除文档 ${documentId} 的向量数据`);
      }
    } catch (error) {
      this.logger.error(`删除向量失败: ${(error as Error).message}`);
    }
  }

  /** 按文件名查询 Milvus，返回匹配的 document_id（用于恢复时复用旧 UUID） */
  async findDocumentIdByFileName(documentName: string): Promise<string | null> {
    try {
      const hasCollection = await this.client.hasCollection({
        collection_name: COLLECTION_NAME,
      });
      if (!hasCollection.value) return null;

      const result = await this.client.query({
        collection_name: COLLECTION_NAME,
        expr: `document_name == '${documentName}'`,
        output_fields: ['document_id'],
        limit: 1,
      });
      return result.data?.length > 0 ? result.data[0].document_id : null;
    } catch (error) {
      this.logger.error(`查询 Milvus 失败: ${(error as Error).message}`);
      return null;
    }
  }

  /** 按 document_id 查询 Milvus，返回所有分块内容（用于恢复时重建 DocChunk） */
  async getChunksByDocumentId(
    documentId: string,
  ): Promise<{ content: string; chunkIndex: number }[]> {
    try {
      const hasCollection = await this.client.hasCollection({
        collection_name: COLLECTION_NAME,
      });
      if (!hasCollection.value) return [];

      const result = await this.client.query({
        collection_name: COLLECTION_NAME,
        expr: `document_id == '${documentId}'`,
        output_fields: ['chunk_index', 'content'],
      });
      return (result.data ?? [])
        .map((item: any) => ({
          content: item.content as string,
          chunkIndex: item.chunk_index as number,
        }))
        .sort((a, b) => a.chunkIndex - b.chunkIndex);
    } catch (error) {
      this.logger.error(`查询 Milvus 分块失败: ${(error as Error).message}`);
      return [];
    }
  }
}