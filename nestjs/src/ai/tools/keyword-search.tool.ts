import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { FactoryProvider } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const KEYWORD_SEARCH_TOOL = 'KEYWORD_SEARCH_TOOL';

/**
 * BM25 参数
 * k1: 控制 TF 饱和度的参数，标准值 1.2~2.0
 * b:  控制文档长度归一化的参数，标准值 0.75
 */
const K1 = 1.5;
const B = 0.75;

export const keywordSearchToolProvider: FactoryProvider = {
  provide: KEYWORD_SEARCH_TOOL,
  useFactory: (prisma: PrismaService) => {
    return tool(
      async ({ keyword, limit }: { keyword: string; limit?: number }) => {
        try {
          // 1. 获取所有 chunk 用于计算 avgdl 和 IDF
          const allChunks = await prisma.docChunk.findMany({
            select: { id: true, content: true },
          });

          if (allChunks.length === 0) {
            return '知识库中暂无文档内容。';
          }

          const totalDocs = allChunks.length;
          const avgdl =
            allChunks.reduce((sum, c) => sum + c.content.length, 0) / totalDocs;

          const keywordLower = keyword.toLowerCase();
          const topK = limit ?? 10;

          // 2. 过滤包含关键词的 chunk
          const matchingChunks = allChunks.filter((c) =>
            c.content.toLowerCase().includes(keywordLower),
          );

          if (matchingChunks.length === 0) {
            return `未找到包含"${keyword}"相关内容的文档片段。`;
          }

          // 3. 计算 BM25 分数
          const idf = Math.log(
            1 +
              (totalDocs - matchingChunks.length + 0.5) /
                (matchingChunks.length + 0.5),
          );

          const scored = matchingChunks.map((chunk) => {
            const tf = (
              chunk.content.toLowerCase().match(new RegExp(keywordLower, 'g')) ||
              []
            ).length;
            const docLen = chunk.content.length;
            const score =
              idf *
              ((tf * (K1 + 1)) /
                (tf + K1 * (1 - B + B * (docLen / avgdl))));
            return { id: chunk.id, content: chunk.content, score };
          });

          // 4. 按分数降序排列，取 topK
          scored.sort((a, b) => b.score - a.score);
          const topResults = scored.slice(0, topK);

          return topResults
            .map(
              (r, i) =>
                `[结果 ${i + 1}] 相关度：${r.score.toFixed(4)}\n${r.content.slice(0, 500)}${r.content.length > 500 ? '...' : ''}`,
            )
            .join('\n\n---\n\n');
        } catch (e) {
          return `关键词检索失败：${(e as Error).message}`;
        }
      },
      {
        name: 'keyword_search',
        description:
          'BM25 关键词全文检索知识库文档。输入关键词（可选limit指定返回数量），返回按 BM25 相关度排序的文档片段列表',
        schema: z.object({
          keyword: z.string().min(1).describe('搜索关键词，如"请假制度"'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .describe('返回结果数量，默认10条'),
        }),
      },
    );
  },
  inject: [PrismaService],
};