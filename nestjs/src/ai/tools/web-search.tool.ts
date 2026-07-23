import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import type { FactoryProvider } from '@nestjs/common';

export const WEB_SEARCH_TOOL = 'WEB_SEARCH_TOOL';

export const webSearchToolProvider: FactoryProvider = {
  provide: WEB_SEARCH_TOOL,
  useFactory: (configService: ConfigService) => {
    return tool(
      async ({ query, count }: { query: string; count?: number }) => {
        const apiKey = configService.get<string>('BOCHA_API_KEY');
        if (!apiKey) {
          return 'Bocha API 密钥未配置';
        }

        const url = 'https://api.bochaai.com/v1/web-search';
        const body = {
          query,
          freshness: 'noLimit',
          summary: true,
          count: count ?? 10,
        };
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return `搜索API请求失败，状态码：${response.status}，错误信息：${errorText}`;
        }

        let json: any;
        try {
          json = await response.json();
        } catch {
          return '搜索API返回数据解析失败';
        }

        if (json.code !== 200 || !json.data) {
          return `搜索API请求失败，原因：${json.msg ?? '未知错误'}`;
        }

        const webpages = json.data.webPages?.value ?? [];
        if (!webpages.length) {
          return '未找到相关结果。';
        }

        return webpages
          .map(
            (page: any, idx: number) =>
              `引用: ${idx + 1}\n标题: ${page.name}\nURL: ${page.url}\n摘要: ${page.summary ?? page.snippet}\n网站名称: ${page.siteName}\n发布时间: ${page.dateLastCrawled ?? '未知'}`,
          )
          .join('\n\n');
      },
      {
        name: 'web_search',
        description:
          '使用Bocha Web Search API搜索互联网网页。输入搜索关键词（可选count指定结果数量），返回包含标题、URL、摘要、网站名称和时间等信息的结果列表',
        schema: z.object({
          query: z.string().min(1).describe('搜索关键词'),
          count: z
            .number()
            .int()
            .min(1)
            .max(5)
            .optional()
            .describe('返回搜索结果数量，默认10条'),
        }),
      },
    );
  },
  inject: [ConfigService],
};
