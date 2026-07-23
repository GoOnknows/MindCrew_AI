import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { FactoryProvider } from '@nestjs/common';
import { RagService } from '../../rag/rag.service';

export const DOC_SEARCH_TOOL = 'DOC_SEARCH_TOOL';

export const docSearchToolProvider: FactoryProvider = {
  provide: DOC_SEARCH_TOOL,
  useFactory: (ragService: RagService) => {
    return tool(
      async ({ query, topK }: { query: string; topK?: number }) => {
        try {
          const results = await ragService.search(query, topK ?? 3);
          if (results.length === 0) {
            return '知识库中未找到相关信息。';
          }
          return results
            .map(
              (r, i) =>
                `[结果 ${i + 1}] 来自文档：${r.documentName}（片段 ${r.chunkIndex}，相似度 ${r.score.toFixed(4)}）\n${r.content}`,
            )
            .join('\n\n---\n\n');
        } catch (e) {
          return `知识库检索失败：${(e as Error).message}`;
        }
      },
      {
        name: 'doc_search',
        description:
          '语义检索知识库文档，返回最相关的文档片段。输入查询内容（可选topK指定返回数量），返回包含文档名称、片段内容和相似度分数的结果列表',
        schema: z.object({
          query: z.string().min(1).describe('搜索查询内容，如"公司考勤制度"'),
          topK: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe('返回结果数量，默认3条'),
        }),
      },
    );
  },
  inject: [RagService],
};