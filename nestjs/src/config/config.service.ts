import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';

export interface AppConfig {
  rag: {
    topK: number;
    chunkSize: number;
    chunkOverlap: number;
    embeddingModel: string;
    rerankThreshold: number;
    rrfConstant: number;
  };
}

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger('AppConfigService');

  private readonly defaultConfig: AppConfig = {
    rag: {
      topK: 5,
      chunkSize: 500,
      chunkOverlap: 50,
      embeddingModel: 'text-embedding-v4',
      rerankThreshold: 0.35,
      rrfConstant: 60,
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getAllConfig(): Promise<AppConfig> {
    const cached = await this.redis.get<AppConfig>('app:full-config');
    if (cached) return cached;

    const configs = await this.prisma.systemConfig.findMany();
    const merged = { ...this.defaultConfig };

    for (const cfg of configs) {
      try {
        const keys = cfg.key.split('.');
        let target: any = merged;
        for (let i = 0; i < keys.length - 1; i++) {
          target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = JSON.parse(cfg.value);
      } catch {
        // 忽略解析错误，使用默认值
      }
    }

    await this.redis.set('app:full-config', merged, 300);
    return merged;
  }

  async updateConfig(body: any): Promise<{ message: string }> {
    const configMap = new Map<string, string>();

    // RAG config
    if (body.ragTopK !== undefined)
      configMap.set('rag.topK', JSON.stringify(body.ragTopK));
    if (body.ragChunkSize)
      configMap.set('rag.chunkSize', JSON.stringify(body.ragChunkSize));
    if (body.ragChunkOverlap !== undefined)
      configMap.set('rag.chunkOverlap', JSON.stringify(body.ragChunkOverlap));
    if (body.ragEmbeddingModel)
      configMap.set('rag.embeddingModel', JSON.stringify(body.ragEmbeddingModel));
    if (body.ragRerankThreshold !== undefined)
      configMap.set('rag.rerankThreshold', JSON.stringify(body.ragRerankThreshold));
    if (body.ragRrfConstant)
      configMap.set('rag.rrfConstant', JSON.stringify(body.ragRrfConstant));

    for (const [key, value] of configMap) {
      await this.prisma.systemConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    await this.redis.del('app:full-config');

    await this.prisma.activity.create({
      data: {
        type: 'config',
        icon: '⚙️',
        text: 'RAG 配置已更新',
      },
    });

    this.logger.log('配置已更新并刷新缓存');
    return { message: '配置已保存并生效' };
  }
}