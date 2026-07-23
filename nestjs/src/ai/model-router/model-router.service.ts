import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { CachedModel } from './types';
import { checkModelHealth } from './health-check';
import { getOrCreateModel } from './model-cache';
import { ModelConfigService } from '../model-config';

@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);

  private readonly modelCache = new Map<string, CachedModel>();
  private readonly pendingCreations = new Map<string, Promise<BaseChatModel>>();

  private readonly cacheTtlMs: number;
  private readonly healthCheckTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly modelConfigService: ModelConfigService,
  ) {
    this.cacheTtlMs = parseInt(
      configService.get<string>('MODEL_CACHE_TTL_MS') ?? '300000', 10,
    );
    this.healthCheckTimeoutMs = parseInt(
      configService.get<string>('HEALTH_CHECK_TIMEOUT_MS') ?? '5000', 10,
    );
  }

  /**
   * 解析模型：根据模型 ID 获取对应的 LLM 实例
   * @param modelId 模型 ID，不传则使用默认模型
   */
  async resolve(modelId?: string): Promise<BaseChatModel> {
    const modelConfig = modelId
      ? await this.modelConfigService.findById(modelId)
      : await this.modelConfigService.findDefault();

    if (!modelConfig) {
      throw new Error('未找到可用的模型配置，请先在 AI 配置页面添加模型');
    }

    return getOrCreateModel(modelConfig, this.modelCache, this.pendingCreations, this.cacheTtlMs);
  }

  async healthCheck(modelId?: string): Promise<boolean> {
    const modelConfig = modelId
      ? await this.modelConfigService.findById(modelId)
      : await this.modelConfigService.findDefault();

    if (!modelConfig) return false;
    return checkModelHealth(modelConfig, this.healthCheckTimeoutMs, this.logger);
  }

  invalidateCache(modelId?: string): void {
    if (modelId) {
      this.modelCache.delete(modelId);
    } else {
      this.modelCache.clear();
      this.pendingCreations.clear();
    }
    this.logger.log(`模型缓存已清除${modelId ? ` (${modelId})` : ''}`);
  }
}