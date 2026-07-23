/**
 * 记忆模块类型定义
 *
 * 分层记忆架构：
 *   短期（当前对话原始消息）→ 中期（本日摘要聚合）→ 长期（跨会话用户画像）
 */

import { BaseMessage } from '@langchain/core/messages';

// ─── 短期记忆 ─────────────────────────────────────────────────────────────

/** 序列化的单条消息 */
export interface MemoryMessage {
  role: 'human' | 'ai';
  content: string;
  timestamp: number; // epoch ms
}

/** 短期会话元信息（摘要 + 重要信息） */
export interface SessionMemoryMeta {
  summary: string;
  compressedAt: number; // epoch ms
  importantInfos?: ImportantInfo[];
  messageCount: number;
}

// ─── 中期记忆（按天聚合） ──────────────────────────────────────────────────

export interface MidTermMemory {
  userId: string;
  date: string; // YYYY-MM-DD
  summary: string;
  topics: string[];
  keyDecisions: string[];
  userPreferences: string[];
  sessionCount: number;
  updatedAt: number;
}

// ─── 长期记忆（用户画像） ──────────────────────────────────────────────────

export interface LongTermMemory {
  userId: string;
  preferences: Record<string, string>; // 如 { "编程语言": "TypeScript", "框架": "NestJS" }
  facts: string[];                     // 如 ["用户在技术部工作"]
  topicInterests: Array<{ topic: string; count: number }>;
  decisions: string[];                 // 历史关键决策
  lastUpdated: number;
}

// ─── 重要信息 ──────────────────────────────────────────────────────────────

export interface ImportantInfo {
  type: 'preference' | 'decision' | 'fact' | 'topic';
  content: string;
  confidence: number; // 0-1
  extractedAt: number;
}

// ─── loadHistory 配置 ──────────────────────────────────────────────────────

export interface LoadHistoryOptions {
  sessionId: string;
  userId?: string;
  /** 最多保留多少轮对话（默认 10） */
  maxRounds?: number;
}

// ─── 常量 ──────────────────────────────────────────────────────────────────

export const MEMORY_CONSTANTS = {
  /** 短期记忆 Redis TTL（秒） */
  SHORT_TERM_TTL: 7 * 24 * 3600,
  /** 中期记忆 Redis TTL（秒） */
  MID_TERM_TTL: 30 * 24 * 3600,
  /** 触发压缩的消息数阈值 */
  MAX_MESSAGES_BEFORE_COMPRESS: 20,
  /** 压缩后保留的最近消息数 */
  RECENT_MESSAGES_KEEP: 6,
  /** Redis key 前缀 */
  REDIS_PREFIX: 'memory',
  /** JSON fallback 目录 */
  HISTORY_DIR: 'chat_histories',
} as const;

/**
 * 判断长期记忆是否为空（无有效内容）
 */
export function isLongTermEmpty(m: LongTermMemory): boolean {
  return (
    Object.keys(m.preferences).length === 0 &&
    m.facts.length === 0 &&
    m.topicInterests.length === 0 &&
    m.decisions.length === 0
  );
}

/**
 * 将长期记忆格式化为 SystemMessage 内容
 */
export function formatLongTerm(m: LongTermMemory): string {
  const parts: string[] = ['【用户画像（跨会话长期记忆）】'];
  const prefs = Object.entries(m.preferences);
  if (prefs.length > 0) {
    parts.push('用户偏好：' + prefs.map(([k, v]) => `${k}: ${v}`).join('；'));
  }
  if (m.facts.length > 0) {
    parts.push('已知信息：' + m.facts.join('；'));
  }
  if (m.topicInterests.length > 0) {
    parts.push(
      '关注话题：' +
        m.topicInterests
          .slice(0, 5)
          .map((t) => `${t.topic}（${t.count}次）`)
          .join('、'),
    );
  }
  if (m.decisions.length > 0) {
    parts.push('历史决策：' + m.decisions.slice(-3).join('；'));
  }
  return parts.join('\n');
}

/**
 * 将中期记忆格式化为 SystemMessage 内容
 */
export function formatMidTerm(m: MidTermMemory): string {
  const parts: string[] = ['【今日对话摘要】'];
  parts.push(`总结：${m.summary}`);
  if (m.topics.length > 0) parts.push('涉及主题：' + m.topics.join('、'));
  if (m.keyDecisions.length > 0)
    parts.push('今日决策：' + m.keyDecisions.join('；'));
  if (m.userPreferences.length > 0)
    parts.push('今日偏好：' + m.userPreferences.join('；'));
  return parts.join('\n');
}
