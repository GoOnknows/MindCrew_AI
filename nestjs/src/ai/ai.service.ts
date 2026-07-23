import { Injectable, Inject, Logger } from '@nestjs/common';
import { Runnable } from '@langchain/core/runnables';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { ConfigService } from '@nestjs/config';
import { MemoryService } from '../memory/memory.service';
import { RagService } from '../rag/rag.service';
import { ModelRouterService } from './model-router';
import { QUERY_USER_TOOL } from './tools/query-user.tool';
import { SEND_EMAIL_TOOL } from './tools/send-email.tool';
import { WEB_SEARCH_TOOL } from './tools/web-search.tool';
import { DOC_SEARCH_TOOL } from './tools/doc-search.tool';
import { KEYWORD_SEARCH_TOOL } from './tools/keyword-search.tool';
import { RECALL_MEMORY_TOOL } from './tools/recall-memory.tool';
import { STORE_MEMORY_TOOL } from './tools/store-memory.tool';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private cachedModels: Map<string, Runnable<BaseMessage[], any>> = new Map();

  constructor(
    @Inject(QUERY_USER_TOOL) private readonly queryUserTool: StructuredTool,
    @Inject(SEND_EMAIL_TOOL) private readonly sendMailTool: StructuredTool,
    @Inject(WEB_SEARCH_TOOL) private readonly webSearchTool: StructuredTool,
    @Inject(DOC_SEARCH_TOOL) private readonly docSearchTool: StructuredTool,
    @Inject(KEYWORD_SEARCH_TOOL) private readonly keywordSearchTool: StructuredTool,
    @Inject(RECALL_MEMORY_TOOL) private readonly recallMemoryTool: StructuredTool,
    @Inject(STORE_MEMORY_TOOL) private readonly storeMemoryTool: StructuredTool,
    private readonly memoryService: MemoryService,
    private readonly ragService: RagService,
    private readonly configService: ConfigService,
    private readonly modelRouter: ModelRouterService,
  ) {}

  private async getModelWithTools(modelId?: string): Promise<Runnable<BaseMessage[], any>> {
    const cacheKey = modelId ?? '__default__';

    if (!this.cachedModels.has(cacheKey)) {
      const model = await this.modelRouter.resolve(modelId);
      const modelWithTools = (model as any).bindTools([
        this.queryUserTool,
        this.sendMailTool,
        this.webSearchTool,
        this.docSearchTool,
        this.keywordSearchTool,
        this.recallMemoryTool,
        this.storeMemoryTool,
      ]) as Runnable<BaseMessage[], any>;

      this.cachedModels.set(cacheKey, modelWithTools);
    }

    return this.cachedModels.get(cacheKey)!;
  }

  async *runChainStream(
    query: string,
    sessionId?: string,
    modelId?: string,
    userId?: string,
  ): AsyncIterable<string> {
    const messages: BaseMessage[] = [];

    messages.push(
      new SystemMessage(
        `你是一个智能的助手，可在需要时调用工具来查询信息，再用结果回答用户的问题。可用工具：
        query_user（查询用户信息）、send_mail（发送邮件）、web_search（网络搜索）、
        doc_search（语义检索知识库）、keyword_search（关键词检索知识库）、store_memory（存储到长期记忆）。
        在对话中如果用户表达了偏好（如"我喜欢用XX"）、个人事实（如"我是XX部门的"）或重要决策（如"我决定用XX"），
        请调用 store_memory 工具将这些信息存储到用户的长期记忆中。`,
      ),
    );

    // RAG 知识库增强
    if (this.ragService.isInitialized()) {
      try {
        const ragResult = await this.ragService.answer(query);
        if (ragResult.sources.length > 0) {
          messages.push(
            new HumanMessage(
              `以下是知识库中的相关信息，请参考这些内容回答问题：\n${ragResult.answer}`,
            ),
          );
        }
      } catch (e) {
        console.error('RAG 知识库增强失败:', e);
      }
    }

    // 加载对话历史（分层记忆：长期画像 + 中期摘要 + 短期原始消息）
    if (sessionId) {
      const history = await this.memoryService.loadHistory(sessionId, userId);
      messages.push(...history);
    }

    messages.push(new HumanMessage(query));

    if (sessionId) {
      await this.memoryService.saveMessage(sessionId, 'human', query, userId);
    }

    let fullResponseContent = '';
    const modelWithTools = await this.getModelWithTools(modelId);

    // Tool Calling 循环
    while (true) {
      const stream = await modelWithTools.stream(messages);
      let fullAIMessage: AIMessageChunk | null = null;

      for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
        fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;
        const hasToolCallChunk =
          !!fullAIMessage.tool_call_chunks &&
          fullAIMessage.tool_call_chunks.length > 0;
        if (!hasToolCallChunk && chunk.content) {
          const content = chunk.content as string;
          fullResponseContent += content;
          yield content;
        }
      }

      if (!fullAIMessage) break;

      messages.push(fullAIMessage);

      const toolCalls = fullAIMessage.tool_calls ?? [];
      if (!toolCalls.length) break;

      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id || '';
        const toolName = toolCall.name;
        const toolMap: Record<string, StructuredTool> = {
          query_user: this.queryUserTool,
          send_mail: this.sendMailTool,
          web_search: this.webSearchTool,
          doc_search: this.docSearchTool,
          keyword_search: this.keywordSearchTool,
          recall_memory: this.recallMemoryTool,
          store_memory: this.storeMemoryTool,
        };

        const tool = toolMap[toolName];
        if (tool) {
          const result = await tool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({ content: result, name: toolName, tool_call_id: toolCallId }),
          );
        }
      }
    }

    // 持久化 AI 回复
    if (sessionId && fullResponseContent) {
      await this.memoryService.saveMessage(sessionId, 'ai', fullResponseContent, userId);
    }
  }
}