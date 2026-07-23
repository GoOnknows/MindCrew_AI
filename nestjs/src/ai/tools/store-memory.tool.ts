import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { FactoryProvider } from '@nestjs/common';
import { MemoryService } from '../../memory/memory.service';

export const STORE_MEMORY_TOOL = 'STORE_MEMORY_TOOL';

export const storeMemoryToolProvider: FactoryProvider = {
  provide: STORE_MEMORY_TOOL,
  useFactory: (memoryService: MemoryService) => {
    return tool(
      async ({
        userId,
        content,
        type,
        confidence,
      }: {
        userId: string;
        content: string;
        type: 'preference' | 'fact' | 'decision';
        confidence?: number;
      }) => {
        try {
          const result = await memoryService.storeToLongTermMemory(
            userId,
            content,
            type,
            confidence,
          );
          return result;
        } catch (e) {
          return `存储到长期记忆失败：${(e as Error).message}`;
        }
      },
      {
        name: 'store_memory',
        description:
          '将重要信息主动存储到用户的长期记忆（用户画像）中，供后续对话参考。适合存储用户偏好、个人事实、重要决策等信息',
        schema: z.object({
          userId: z.string().min(1).describe('用户ID'),
          content: z
            .string()
            .min(1)
            .describe('要存储的信息内容，如"喜欢使用TypeScript"'),
          type: z
            .enum(['preference', 'fact', 'decision'])
            .describe('信息类型：preference（偏好）、fact（事实）、decision（决策）'),
          confidence: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe('置信度，范围0-1，默认0.8'),
        }),
      },
    );
  },
  inject: [MemoryService],
};