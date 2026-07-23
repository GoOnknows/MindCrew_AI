import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QUERY_USER_TOOL } from '../ai/tools/query-user.tool';
import { SEND_EMAIL_TOOL } from '../ai/tools/send-email.tool';
import { WEB_SEARCH_TOOL } from '../ai/tools/web-search.tool';
import { DOC_SEARCH_TOOL } from '../ai/tools/doc-search.tool';
import { KEYWORD_SEARCH_TOOL } from '../ai/tools/keyword-search.tool';
import { RECALL_MEMORY_TOOL } from '../ai/tools/recall-memory.tool';
import { STORE_MEMORY_TOOL } from '../ai/tools/store-memory.tool';
import { StructuredTool } from '@langchain/core/tools';

export interface ToolDescriptor {
  name: string;
  desc: string;
  status: boolean;
  calls: number;
  avgMs: number;
  paramsExample: string;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  // 工具启用/禁用状态（内存）
  private readonly toolEnabled = new Map<string, boolean>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUERY_USER_TOOL) private readonly queryUserTool: StructuredTool,
    @Inject(SEND_EMAIL_TOOL) private readonly sendMailTool: StructuredTool,
    @Inject(WEB_SEARCH_TOOL) private readonly webSearchTool: StructuredTool,
    @Inject(DOC_SEARCH_TOOL) private readonly docSearchTool: StructuredTool,
    @Inject(KEYWORD_SEARCH_TOOL) private readonly keywordSearchTool: StructuredTool,
    @Inject(RECALL_MEMORY_TOOL) private readonly recallMemoryTool: StructuredTool,
    @Inject(STORE_MEMORY_TOOL) private readonly storeMemoryTool: StructuredTool,
  ) {
    // 默认全部启用
    this.toolEnabled.set('query_user', true);
    this.toolEnabled.set('send_mail', true);
    this.toolEnabled.set('web_search', true);
    this.toolEnabled.set('doc_search', true);
    this.toolEnabled.set('keyword_search', true);
    this.toolEnabled.set('recall_memory', true);
    this.toolEnabled.set('store_memory', true);
  }

  // ─── 工具列表 ──────────────────────────────────────────────────────────

  async getTools(): Promise<ToolDescriptor[]> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const usageStats = await this.prisma.toolUsage.findMany({
      where: { date: { gte: weekAgo } },
    });

    const statsMap = new Map<string, { calls: number; avgMs: number }>();
    for (const stat of usageStats) {
      statsMap.set(stat.toolName, {
        calls: stat.callCount,
        avgMs: stat.avgLatencyMs,
      });
    }

    const tools: ToolDescriptor[] = [
      {
        name: 'web_search',
        desc: 'Tavily 联网实时搜索，获取最新信息',
        status: this.toolEnabled.get('web_search') ?? true,
        calls: statsMap.get('web_search')?.calls ?? 0,
        avgMs: statsMap.get('web_search')?.avgMs ?? 0,
        paramsExample: '{ "query": "搜索内容", "maxResults": 3 }',
      },
      {
        name: 'doc_search',
        desc: '语义检索知识库文档，返回相关片段',
        status: this.toolEnabled.get('doc_search') ?? true,
        calls: statsMap.get('doc_search')?.calls ?? 0,
        avgMs: statsMap.get('doc_search')?.avgMs ?? 0,
        paramsExample: '{ "query": "搜索内容", "topK": 3 }',
      },
      {
        name: 'keyword_search',
        desc: 'BM25 关键词全文检索',
        status: this.toolEnabled.get('keyword_search') ?? true,
        calls: statsMap.get('keyword_search')?.calls ?? 0,
        avgMs: statsMap.get('keyword_search')?.avgMs ?? 0,
        paramsExample: '{ "keyword": "关键词", "limit": 10 }',
      },
      {
        name: 'query_user',
        desc: '查询数据库获取用户信息',
        status: this.toolEnabled.get('query_user') ?? true,
        calls: statsMap.get('query_user')?.calls ?? 0,
        avgMs: statsMap.get('query_user')?.avgMs ?? 0,
        paramsExample: '{ "userId": "001" }',
      },
      {
        name: 'recall_memory',
        desc: '加载用户长期记忆与对话历史',
        status: this.toolEnabled.get('recall_memory') ?? true,
        calls: statsMap.get('recall_memory')?.calls ?? 0,
        avgMs: statsMap.get('recall_memory')?.avgMs ?? 0,
        paramsExample: '{ "userId": "用户ID", "sessionId": "会话ID（可选）" }',
      },
      {
        name: 'send_mail',
        desc: '发送邮件通知',
        status: this.toolEnabled.get('send_mail') ?? true,
        calls: statsMap.get('send_mail')?.calls ?? 0,
        avgMs: statsMap.get('send_mail')?.avgMs ?? 0,
        paramsExample: '{ "to": "recipient@example.com", "subject": "标题", "body": "内容" }',
      },
      {
        name: 'store_memory',
        desc: '持久化对话摘要到长期记忆',
        status: this.toolEnabled.get('store_memory') ?? false,
        calls: statsMap.get('store_memory')?.calls ?? 0,
        avgMs: statsMap.get('store_memory')?.avgMs ?? 0,
        paramsExample: '{ "userId": "用户ID", "content": "信息内容", "type": "preference" }',
      },
    ];

    return tools;
  }

  // ─── 启停工具 ──────────────────────────────────────────────────────────

  async toggleTool(name: string, enabled: boolean) {
    this.toolEnabled.set(name, enabled);
    this.logger.log(`工具 ${name}: ${enabled ? '启用' : '禁用'}`);
    return { name, enabled };
  } 

  // ─── 测试工具 ──────────────────────────────────────────────────────────

  async testTool(toolName: string, params: any) {
    const startMs = Date.now();
    try {
      let result: string;
      switch (toolName) {
        case 'web_search':
          result = await this.webSearchTool.invoke(params);
          break;
        case 'query_user':
          result = await this.queryUserTool.invoke(params);
          break;
        case 'send_mail':
          result = await this.sendMailTool.invoke(params);
          break;
        case 'doc_search':
          result = await this.docSearchTool.invoke(params);
          break;
        case 'keyword_search':
          result = await this.keywordSearchTool.invoke(params);
          break;
        case 'recall_memory':
          result = await this.recallMemoryTool.invoke(params);
          break;
        case 'store_memory':
          result = await this.storeMemoryTool.invoke(params);
          break;
        default:
          throw new Error(`未知工具: ${toolName}`);
      }

      const elapsedMs = Date.now() - startMs;

      // 记录统计
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await this.prisma.toolUsage.upsert({
        where: { toolName_date: { toolName, date: today } },
        update: {
          callCount: { increment: 1 },
          avgLatencyMs: {
            set: Math.round(elapsedMs),
          },
        },
        create: {
          toolName,
          date: today,
          callCount: 1,
          avgLatencyMs: elapsedMs,
        },
      });

      return {
        success: true,
        tool: toolName,
        elapsed_ms: elapsedMs,
        result,
      };
    } catch (err) {
      return {
        success: false,
        tool: toolName,
        elapsed_ms: Date.now() - startMs,
        error: (err as Error).message,
      };
    }
  }

  // ─── 工具统计 ──────────────────────────────────────────────────────────

  async getToolStats() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const usages = await this.prisma.toolUsage.findMany({
      where: { date: { gte: weekAgo } },
    });

    return usages.map((u) => ({
      toolName: u.toolName,
      callCount: u.callCount,
      avgLatencyMs: u.avgLatencyMs,
    }));
  }
}
