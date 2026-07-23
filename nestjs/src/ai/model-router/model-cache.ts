import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CachedModel } from './types';
import { createModelFromConfig } from './model-factory';
import type { ModelConfigDto } from '../model-config';

export async function getOrCreateModel(
  modelConfig: ModelConfigDto,
  modelCache: Map<string, CachedModel>,
  pendingCreations: Map<string, Promise<BaseChatModel>>,
  cacheTtlMs: number,
): Promise<BaseChatModel> {
  const key = modelConfig.id;
  return getOrCreate(key, modelCache, pendingCreations, cacheTtlMs, () =>
    Promise.resolve(createModelFromConfig(modelConfig)),
  );
}

async function getOrCreate(
  key: string,
  modelCache: Map<string, CachedModel>,
  pendingCreations: Map<string, Promise<BaseChatModel>>,
  cacheTtlMs: number,
  factory: () => Promise<BaseChatModel>,
): Promise<BaseChatModel> {
  const cached = modelCache.get(key);
  if (cached && Date.now() - cached.createdAt < cacheTtlMs) {
    return cached.model;
  }

  const pending = pendingCreations.get(key);
  if (pending) {
    return pending;
  }

  const promise = factory()
    .then((model) => {
      modelCache.set(key, { model, createdAt: Date.now() });
      return model;
    })
    .finally(() => {
      pendingCreations.delete(key);
    });

  pendingCreations.set(key, promise);
  return promise;
}