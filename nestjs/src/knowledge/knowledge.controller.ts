import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { KnowledgeService } from './knowledge.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';

@Controller('api/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  /** 上传文档 */
  @UseGuards(JwtAuthGuard)
  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/documents',
        filename: (_req, file, cb) => {
          // 保留原始文件名，重名时追加 (1) (2) ...
          const ext = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, ext);
          let filename = file.originalname;
          let counter = 1;
          const uploadDir = path.resolve('./uploads/documents');
          while (fs.existsSync(path.join(uploadDir, filename))) {
            filename = `${baseName}(${counter})${ext}`;
            counter++;
          }
          cb(null, filename);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.knowledgeService.uploadDocument(file, req.user.id);
  }

  /** 文档列表 */
  @UseGuards(JwtAuthGuard)
  @Get('documents')
  async getDocuments(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.knowledgeService.getDocuments({
      search,
      status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  /** 文档详情 */
  @UseGuards(JwtAuthGuard)
  @Get('documents/:id')
  async getDocument(@Param('id') id: string) {
    return this.knowledgeService.getDocument(id);
  }

  /** 删除文档 */
  @UseGuards(JwtAuthGuard)
  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string) {
    return this.knowledgeService.deleteDocument(id);
  }

  /** 文档预览 */
  @UseGuards(JwtAuthGuard)
  @Get('documents/:id/preview')
  async previewDocument(@Param('id') id: string, @Res() res: any) {
    const preview = await this.knowledgeService.previewDocument(id);
    return res.json(preview);
  }

  /** 重新索引 */
  @UseGuards(JwtAuthGuard)
  @Post('documents/:id/reindex')
  async reindexDocument(@Param('id') id: string) {
    return this.knowledgeService.reindexDocument(id);
  }

  /** 统计 */
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getStats() {
    return this.knowledgeService.getStats();
  }

  /** 数据恢复：从 uploads 目录重新导入残留文件 */
  @UseGuards(JwtAuthGuard)
  @Post('recover')
  async recoverDocuments(@Request() req: any) {
    return this.knowledgeService.recoverDocuments(req.user.id);
  }
}
