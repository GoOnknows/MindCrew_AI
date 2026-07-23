import { ChatOpenAI } from '@langchain/openai';
import type { ModelConfigDto } from '../model-config';

export function createModelFromConfig(config: ModelConfigDto): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: config.apiKey,
    modelName: config.modelName,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    configuration: {
      baseURL: config.baseUrl,
    },
  });
}