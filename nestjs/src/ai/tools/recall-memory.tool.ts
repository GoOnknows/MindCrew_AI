import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { FactoryProvider } from '@nestjs/common';
import { MemoryService } from '../../memory/memory.service';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

export const RECALL_MEMORY_TOOL = 'RECALL_MEMORY_TOOL';

export const recallMemoryToolProvider: FactoryProvider = {
  provide: RECALL_MEMORY_TOOL,
  useFactory: (memoryService: MemoryService) => {
    return tool(
      async ({
        userId,
        sessionId,
      }: {
        userId: string;
        sessionId?: string;
      }) => {
        try {
          const sid = sessionId ?? `recall_${userId}`;
          const history = await memoryService.loadHistory(sid, userId);

          if (history.length === 0) {
            return '未找到该用户的记忆信息。';
          }

          return history
            .map((msg) => {
              if (msg instanceof SystemMessage) {
                return `【系统】${msg.content}`;
              }
              if (msg instanceof HumanMessage) {
                return `【用户】${msg.content}`;
              }
              if (msg instanceof AIMessage) {
                return `【AI】${msg.content}`;
              }
              return `【${msg.constructor.name}】${msg.content}`;
            })
            .join('\n\n');
        } catch (e) {
          return `加载记忆失败：${(e as Error).message}`;
        }
      },
      {
        name: 'recall_memory',
        description:
          '加载用户的长期记忆（用户画像）与对话历史，包括偏好、事实、决策等跨会话信息。输入用户ID，可选指定会话ID加载短期记忆',
        schema: z.object({
          userId: z.string().min(1).describe('用户ID'),
          sessionId: z
            .string()
            .optional()
            .describe('会话ID，指定后会同时加载该会话的短期记忆'),
        }),
      },
    );
  },
  inject: [MemoryService],
};