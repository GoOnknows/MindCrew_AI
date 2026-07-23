/**
 * 记忆服务 — 分层记忆架构
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  loadHistory() 返回给 LLM 的组合上下文                         │
 * │                                                              │
 * │  [SystemMessage] 长期记忆（用户画像）                           │
 * │  [SystemMessage] 中期记忆（本日摘要）                           │
 * │  [HumanMessage]  ...短期原始消息（最近 N 条）...               │
 * │  [AIMessage]     ...短期原始消息...                            │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 存储策略（双引擎自动切换）：
 *   Redis 可用 → 使用 Redis List / String（高性能、带 TTL）
 *   Redis 不可用 → 降级到 JSON 文件（兼容原方案）
 *
 * 考点：
 *   - Write-Through: 每次 saveMessage 同步写存储，异步触发压缩
 *   - 三层记忆 TTL 不同：短期 7d / 中期 30d / 长期持久
 *   - 压缩阈值 + 滑动窗口：旧消息被摘要替代，释放 LLM 上下文窗口
 *   - 异步压缩不阻塞用户响应
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { RedisService } from '../common/redis.service';
import { ModelRouterService } from '../ai/model-router';
import { ImportanceScorer } from './importance-scorer';
import {
  MemoryMessage,
  SessionMemoryMeta,
  MidTermMemory,
  LongTermMemory,
  ImportantInfo,
  MEMORY_CONSTANTS,
  isLongTermEmpty,
  formatLongTerm,
  formatMidTerm,
} from './interfaces/memory.interface';
import * as fs from 'fs';
import * as path from 'path';

const C = MEMORY_CONSTANTS;

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly maxRounds: number;
  private readonly historyDir: string;
  /** 内存缓存：sessionId → InMemoryChatMessageHistory 的简易模拟 */
  private shortTermCache = new Map<string, MemoryMessage[]>();

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly modelRouter: ModelRouterService,
  ) {
    this.maxRounds = parseInt(
      this.configService.get<string>('MAX_HISTORY_ROUNDS') ?? '10',
      10,
    );
    this.historyDir = path.join(process.cwd(), C.HISTORY_DIR);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  公开 API（保持与旧版签名兼容）
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 加载对话历史（组合长期 + 中期 + 短期）
   *
   * @param sessionId  会话 ID
   * @param userId     用户 ID（传此参数才启用跨会话记忆）
   */
  async loadHistory(sessionId: string, userId?: string): Promise<BaseMessage[]> {
    const messages: BaseMessage[] = [];
 
    // 1. 长期记忆（用户画像）
    if (userId) {
      try {
        const longTerm = await this.getLongTermMemory(userId);
        if (longTerm && !isLongTermEmpty(longTerm)) {
          messages.push(new SystemMessage(formatLongTerm(longTerm)));
        }
      } catch (e) {
        this.logger.warn(`加载长期记忆失败: ${(e as Error).message}`);
      }
    }

    // 2. 中期记忆（本日摘要）
    if (userId) {
      try {
        const today = this.todayStr();
        const midTerm = await this.getMidTermMemory(userId, today);
        if (midTerm && midTerm.summary) {
          messages.push(new SystemMessage(formatMidTerm(midTerm)));
        }
      } catch (e) {
        this.logger.warn(`加载中期记忆失败: ${(e as Error).message}`);
      }
    }

    // 3. 短期记忆（当前会话原始消息）
    const shortTerm = await this.loadShortTerm(sessionId);
    const maxMsgs = this.maxRounds * 2;
    const sliced = shortTerm.slice(-maxMsgs);

    // 尝试加载摘要（如果有压缩过的部分，放在原始消息前面）
    const meta = await this.getSessionMeta(sessionId);
    if (meta && meta.summary) {
      messages.push(new SystemMessage(`【当前对话历史摘要】\n${meta.summary}`));
    }

    for (const msg of sliced) {
      if (msg.role === 'human') {
        messages.push(new HumanMessage(msg.content));
      } else {
        messages.push(new AIMessage(msg.content));
      }
    }

    return messages;
  }

  /**
   * 保存消息到短期记忆，异步触发压缩检查
   */
  async saveMessage(
    sessionId: string,
    type: 'human' | 'ai',
    content: string,
    userId?: string,
  ): Promise<void> {
    const msg: MemoryMessage = {
      role: type,
      content,
      timestamp: Date.now(),
    };

    // 写入短期记忆
    await this.pushShortTerm(sessionId, msg);

    // 异步检查是否触发压缩（不 await，不阻塞响应）
    if (userId) {
      this.checkAndCompress(sessionId, userId).catch((e) =>
        this.logger.error(`记忆压缩失败: ${(e as Error).message}`),
      );
    }
  }

  /**
   * 主动存储信息到长期记忆（供 store_memory 工具调用）
   */
  async storeToLongTermMemory(
    userId: string,
    content: string,
    type: 'preference' | 'fact' | 'decision',
    confidence?: number,
  ): Promise<string> {
    const info: ImportantInfo = {
      type,
      content,
      confidence: confidence ?? 0.8,
      extractedAt: Date.now(),
    };

    await this.updateLongTermMemory(userId, [info]);
    this.logger.log(`主动存储到长期记忆: userId=${userId}, type=${type}, content=${content}`);
    return `已将${type === 'preference' ? '偏好' : type === 'fact' ? '事实' : '决策'}信息存储到长期记忆: ${content}`;
  }

  /**
   * 清除指定会话的所有记忆
   */
  async clearHistory(sessionId: string): Promise<void> {
    this.shortTermCache.delete(sessionId);

    if (this.redisService.isReady()) {
      await this.redisService.del(
        this.redisKey('short', sessionId, 'msgs'),
        this.redisKey('short', sessionId, 'meta'),
      );
    }

    // JSON fallback 清理
    const filePath = this.jsonPath(sessionId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const metaPath = this.jsonMetaPath(sessionId);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  短期记忆操作
  // ═══════════════════════════════════════════════════════════════════

  private async loadShortTerm(sessionId: string): Promise<MemoryMessage[]> {
    // 优先内存缓存
    const cached = this.shortTermCache.get(sessionId);
    if (cached) return cached;

    // Redis 读取
    if (this.redisService.isReady()) {
      const rawList = await this.redisService.getList(
        this.redisKey('short', sessionId, 'msgs'),
      );
      if (rawList.length > 0) {
        const msgs = rawList.map((s) => JSON.parse(s) as MemoryMessage);
        this.shortTermCache.set(sessionId, msgs);
        return msgs;
      }
    }

    // JSON fallback
    const filePath = this.jsonPath(sessionId);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        // 兼容旧格式 [{type, content}] 和 MemoryMessage 格式
        const parsed = JSON.parse(raw);
        const msgs: MemoryMessage[] = parsed.map((item: any) => ({
          role: item.role ?? item.type,
          content: item.content,
          timestamp: item.timestamp ?? 0,
        }));
        this.shortTermCache.set(sessionId, msgs);
        return msgs;
      } catch {
        // 文件损坏，返回空
      }
    }

    return [];
  }

  private async pushShortTerm(
    sessionId: string,
    msg: MemoryMessage,
  ): Promise<void> {
    const serialized = JSON.stringify(msg);

    // 写内存缓存
    const cached = this.shortTermCache.get(sessionId) ?? [];
    cached.push(msg);
    this.shortTermCache.set(sessionId, cached);

    // 写 Redis
    if (this.redisService.isReady()) {
      await this.redisService.pushToList(
        this.redisKey('short', sessionId, 'msgs'),
        serialized,
      );
      // 首次写入时设置 TTL（EXPIRE 命令，不覆盖 List）
      const len = await this.rawLlen(this.redisKey('short', sessionId, 'msgs'));
      if (len === 1) {
        await (this.redisService as any).raw.expire(
          this.redisKey('short', sessionId, 'msgs'),
          C.SHORT_TERM_TTL,
        );
      }
      return;
    }

    // JSON fallback：全量覆写
    await this.persistJson(sessionId, cached);
  }

  private async rawLlen(key: string): Promise<number> {
    try {
      const redis = (this.redisService as any).raw as import('ioredis').Redis;
      if (redis?.status === 'ready') {
        return await redis.llen(key);
      }
    } catch {
      // ignore
    }
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  会话元信息（摘要 / 压缩状态）
  // ═══════════════════════════════════════════════════════════════════

  private async getSessionMeta(sessionId: string): Promise<SessionMemoryMeta | null> {
    if (this.redisService.isReady()) {
      return this.redisService.get<SessionMemoryMeta>(
        this.redisKey('short', sessionId, 'meta'),
      );
    }
    const metaPath = this.jsonMetaPath(sessionId);
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    }
    return null;
  }

  private async saveSessionMeta(
    sessionId: string,
    meta: SessionMemoryMeta,
  ): Promise<void> {
    if (this.redisService.isReady()) {
      await this.redisService.set(
        this.redisKey('short', sessionId, 'meta'),
        meta,
      );
    }
    const metaPath = this.jsonMetaPath(sessionId);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  中期记忆（按天聚合）
  // ═══════════════════════════════════════════════════════════════════

  private async getMidTermMemory(
    userId: string,
    date: string,
  ): Promise<MidTermMemory | null> {
    if (this.redisService.isReady()) {
      return this.redisService.get<MidTermMemory>(
        this.redisKey('mid', userId, date),
      );
    }
    const filePath = this.jsonMidPath(userId, date);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
  }

  private async saveMidTermMemory(mid: MidTermMemory): Promise<void> {
    if (this.redisService.isReady()) {
      await this.redisService.set(
        this.redisKey('mid', mid.userId, mid.date),
        mid,
        C.MID_TERM_TTL,
      );
    }
    const dir = path.join(this.historyDir, 'mid');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `mid_${mid.userId}_${mid.date}.json`),
      JSON.stringify(mid, null, 2),
      'utf-8',
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  长期记忆（用户画像）
  // ═══════════════════════════════════════════════════════════════════

  private async getLongTermMemory(userId: string): Promise<LongTermMemory | null> {
    if (this.redisService.isReady()) {
      return this.redisService.get<LongTermMemory>(
        this.redisKey('long', userId),
      );
    }
    const filePath = this.jsonLongPath(userId);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
  }

  private async saveLongTermMemory(long: LongTermMemory): Promise<void> {
    if (this.redisService.isReady()) {
      await this.redisService.set(this.redisKey('long', long.userId), long);
    }
    const dir = path.join(this.historyDir, 'long');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `long_${long.userId}.json`),
      JSON.stringify(long, null, 2),
      'utf-8',
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  压缩 + 摘要（异步，不阻塞用户）
  // ═══════════════════════════════════════════════════════════════════

  private async checkAndCompress(
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const msgs = await this.loadShortTerm(sessionId);
    if (msgs.length < C.MAX_MESSAGES_BEFORE_COMPRESS) return;

    // 标记正在压缩，防止并发
    const meta = await this.getSessionMeta(sessionId);
    if (meta?.compressedAt && Date.now() - meta.compressedAt < 60000) {
      return; // 每分钟最多压缩一次
    }

    this.logger.log(`触发记忆压缩: session=${sessionId}, user=${userId}, msgs=${msgs.length}`);

    // 分为"待压缩部分"（旧消息）和"保留部分"（最近消息）
    const compressEnd = msgs.length - C.RECENT_MESSAGES_KEEP;
    const toCompress = msgs.slice(0, compressEnd);
    const toKeep = msgs.slice(compressEnd);

    // 调用 LLM 生成摘要
    const summary = await this.summarizeMessages(toCompress);

    // 保存会话元信息
    await this.saveSessionMeta(sessionId, {
      summary,
      compressedAt: Date.now(),
      messageCount: msgs.length,
    });

    // 更新短期存储：只保留最近消息 + 摘要
    this.shortTermCache.set(sessionId, toKeep);
    await this.replaceShortTermStorage(sessionId, toKeep);

    // 更新中期记忆（仅摘要，重要信息由 LLM 自调用 store_memory 处理）
    await this.updateMidTermMemory(userId, summary, []);

    this.logger.log(`记忆压缩完成: session=${sessionId}, 摘要长度=${summary.length}`);
  }

  /**
   * 替换短期存储的内容（压缩后用 keep 部分替代）
   */
  private async replaceShortTermStorage(
    sessionId: string,
    msgs: MemoryMessage[],
  ): Promise<void> {
    if (this.redisService.isReady()) {
      const key = this.redisKey('short', sessionId, 'msgs');
      const redis = (this.redisService as any).raw as import('ioredis').Redis;
      if (redis?.status === 'ready') {
        await redis.del(key);
        if (msgs.length > 0) {
          await redis.rpush(key, ...msgs.map((m) => JSON.stringify(m)));
        }
      }
      return;
    }
    // JSON fallback
    await this.persistJson(sessionId, msgs);
  }

  /**
   * 调用 LLM 生成对话摘要
   */
  private async summarizeMessages(msgs: MemoryMessage[]): Promise<string> {
    try {
      const model = await this.modelRouter.resolve();
      const dialog = msgs
        .map((m) => `${m.role === 'human' ? '用户' : 'AI'}：${m.content}`)
        .join('\n');

      const response = await model.invoke([
        new HumanMessage(
          `请对以下对话进行简洁总结（100字以内），概括用户的问题和AI的回应要点：\n\n${dialog}`,
        ),
      ]);

      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      return content.slice(0, 500);
    } catch (e) {
      this.logger.warn(`LLM 摘要生成失败，使用截断替代: ${(e as Error).message}`);
      // LLM 不可用时，直接取最近一条用户消息作为摘要
      const lastHuman = [...msgs].reverse().find((m) => m.role === 'human');
      return lastHuman ? `用户最近问题：${lastHuman.content.slice(0, 100)}` : '对话摘要生成失败';
    }
  }

  /**
   * 合并到中期记忆
   */
  private async updateMidTermMemory(
    userId: string,
    summary: string,
    infos: import('./interfaces/memory.interface').ImportantInfo[],
  ): Promise<void> {
    const today = this.todayStr();
    const existing = await this.getMidTermMemory(userId, today);

    const prefs = infos.filter((i) => i.type === 'preference').map((i) => i.content);
    const decisions = infos.filter((i) => i.type === 'decision').map((i) => i.content);
    const topics = infos.filter((i) => i.type === 'topic').map((i) => i.content);

    const merged: MidTermMemory = {
      userId,
      date: today,
      summary: existing
        ? `${existing.summary}\n${summary}`
        : summary,
      topics: [...new Set([...(existing?.topics ?? []), ...topics])],
      keyDecisions: [...new Set([...(existing?.keyDecisions ?? []), ...decisions])],
      userPreferences: [...new Set([...(existing?.userPreferences ?? []), ...prefs])],
      sessionCount: (existing?.sessionCount ?? 0) + 1,
      updatedAt: Date.now(),
    };

    // 中期摘要限制长度，防止过长
    if (merged.summary.length > 1000) {
      merged.summary = merged.summary.slice(-1000);
    }

    await this.saveMidTermMemory(merged);
  }

  /**
   * 合并到长期记忆
   */
  private async updateLongTermMemory(
    userId: string,
    infos: import('./interfaces/memory.interface').ImportantInfo[],
  ): Promise<void> {
    const existing = (await this.getLongTermMemory(userId)) ?? {
      userId,
      preferences: {},
      facts: [],
      topicInterests: [],
      decisions: [],
      lastUpdated: 0,
    };

    ImportanceScorer.mergeIntoProfile(existing, infos);
    existing.lastUpdated = Date.now();

    await this.saveLongTermMemory(existing);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  JSON fallback 工具
  // ═══════════════════════════════════════════════════════════════════

  private async persistJson(
    sessionId: string,
    msgs: MemoryMessage[],
  ): Promise<void> {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
    fs.writeFileSync(
      this.jsonPath(sessionId),
      JSON.stringify(msgs, null, 2),
      'utf-8',
    );
  }

  private jsonPath(sessionId: string): string {
    return path.join(this.historyDir, `chat_history_${sessionId}.json`);
  }

  private jsonMetaPath(sessionId: string): string {
    return path.join(this.historyDir, `chat_history_${sessionId}_meta.json`);
  }

  private jsonMidPath(userId: string, date: string): string {
    const dir = path.join(this.historyDir, 'mid');
    return path.join(dir, `mid_${userId}_${date}.json`);
  }

  private jsonLongPath(userId: string): string {
    const dir = path.join(this.historyDir, 'long');
    return path.join(dir, `long_${userId}.json`);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  工具方法
  // ═══════════════════════════════════════════════════════════════════

  private redisKey(level: 'short' | 'mid' | 'long', ...parts: string[]): string {
    return `${C.REDIS_PREFIX}:${level}:${parts.join(':')}`;
  }

  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
