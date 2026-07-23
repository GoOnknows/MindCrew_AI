import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => AiService))
    private readonly aiService: AiService,
  ) {}

  // ─── 流式对话 ──────────────────────────────────────────────────────────

  async *runChatStream(
    query: string,
    sessionId?: string,
    model?: string,
    userId?: string,
  ): AsyncIterable<string> {
    // 如果没有 sessionId，创建一个新会话
    const sid =
      sessionId ??
      (
        await this.prisma.chatSession.create({
          data: {
            userId: userId ?? null,
            title: query.slice(0, 30),
          },
        })
      ).id;

    // 输出 sessionId 作为第一个 token（前端切换 URL）
    yield `__SESSION__:${sid}__`;

    // 保存用户消息
    await this.prisma.chatMessage.create({
      data: {
        sessionId: sid,
        role: 'user',
        content: query,
      },
    });

    // 用第一条消息更新默认标题（无论 session 是提前创建还是后端创建的）
    await this.prisma.chatSession.updateMany({
      where: { id: sid, title: '新对话' },
      data: { title: query.slice(0, 30) },
    });

    // 委托给现有的 AiService 流式生成（传入 userId 启用跨会话记忆）
    let fullContent = '';
    const stream = this.aiService.runChainStream(query, sid, model, userId);
    for await (const chunk of stream) {
      fullContent += chunk;
      yield chunk;
    }

    // 持久化 AI 回复
    if (fullContent) {
      await this.prisma.chatMessage.create({
        data: {
          sessionId: sid,
          role: 'assistant',
          content: fullContent,
        },
      });
    }

    // 更新会话时间
    await this.prisma.chatSession.update({
      where: { id: sid },
      data: { updatedAt: new Date() },
    });
  }

  // ─── 会话管理 ──────────────────────────────────────────────────────────

  async getSessions(userId: string) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        createdAt: true,
        _count: { select: { messages: true } },
      },
    });
  }

  async createSession(userId: string) {
    return this.prisma.chatSession.create({
      data: { userId, title: '新对话' },
      select: { id: true, title: true, createdAt: true },
    });
  }

  async deleteSession(id: string) {
    await this.prisma.chatSession.delete({ where: { id } });
    return { message: '会话已删除' };
  }

  async getMessages(sessionId: string) {
    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        role: true,
        content: true,
        toolCalls: true,
        createdAt: true,
      },
    });
  }
}
