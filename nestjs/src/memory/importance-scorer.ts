/**
 * 重要性评分器 — 规则提取
 *
 * 从用户消息中自动提取偏好、决策、事实等关键信息。
 * 纯规则引擎（正则），不依赖 LLM 调用，速度快、成本低。
 *
 * 考点：
 *   规则引擎 vs ML 方案：规则引擎确定性强、零成本，适合常见的结构化表达；
 *   但对于隐含的、间接的偏好表达（如"昨天那家火锅不错"隐含偏好）需要 LLM 介入。
 */

import { ImportantInfo, MemoryMessage } from './interfaces/memory.interface';

// ─── 中文偏好表达模式 ────────────────────────────────────────────────────

const PREFERENCE_PATTERNS: { regex: RegExp; weight: number }[] = [
  // 直接偏好
  { regex: /我(?:比较|更|最)?喜欢(.+?)(?:[。，！？]|$)/, weight: 0.9 },
  { regex: /我喜欢(.+?)(?:[。，！？]|$)/, weight: 0.9 },
  { regex: /我(?:比较|挺|很)?(?:想|希望|愿意)(.+?)(?:[。，！？]|$)/, weight: 0.7 },
  { regex: /我(?:不|不太)?喜欢(.+?)(?:[。，！？]|$)/, weight: 0.8 },
  // 推荐/建议
  { regex: /推荐(.+?)(?:[。，！？]|$)/, weight: 0.6 },
  { regex: /建议(.+?)(?:[。，！？]|$)/, weight: 0.6 },
  // 工具使用偏好
  { regex: /我(?:一般|通常|平时)(?:用|使用|看|读)(.+?)(?:[。，！？]|$)/, weight: 0.7 },
  { regex: /(?:常用|习惯用|主要用)(.+?)(?:[。，！？]|$)/, weight: 0.7 },
];

// ─── 决策表达模式 ────────────────────────────────────────────────────────

const DECISION_PATTERNS: { regex: RegExp; weight: number }[] = [
  { regex: /我(?:决定|选择|选用|采用|打算)(.+?)(?:[。，！？]|$)/, weight: 0.9 },
  { regex: /就(?:用|选|定|按)(.+?)(?:[。，！？]|$)/, weight: 0.7 },
  { regex: /(?:好|行|可以|同意|就这么办)(?:[。，！？]|$)/, weight: 0.5 },
  { regex: /我(?:已|已经)(?:决定|确定|选好)(.+?)(?:[。，！？]|$)/, weight: 0.8 },
];

// ─── 事实表达模式 ────────────────────────────────────────────────────────

const FACT_PATTERNS: { regex: RegExp; weight: number }[] = [
  { regex: /我是(.+?)(?:[。，！？]|$)/, weight: 0.8 },
  { regex: /我在(.+?)(?:[。，！？]|$)/, weight: 0.7 },
  { regex: /我(?:做过|做过|学过|用过)(.+?)(?:[。，！？]|$)/, weight: 0.7 },
  { regex: /我有(.+?)(?:[。，！？]|$)/, weight: 0.6 },
  { regex: /我(?:从事|负责|担任)(.+?)(?:[。，！？]|$)/, weight: 0.8 },
];

export class ImportanceScorer {
  /**
   * 从一条消息中提取重要信息
   */
  static extract(msg: MemoryMessage): ImportantInfo[] {
    if (msg.role !== 'human') return []; // 只从用户消息提取

    const results: ImportantInfo[] = [];
    const now = msg.timestamp;

    for (const { regex, weight } of PREFERENCE_PATTERNS) {
      const match = msg.content.match(regex);
      if (match && match[1]?.trim()) {
        results.push({
          type: 'preference',
          content: match[1].trim(),
          confidence: weight,
          extractedAt: now,
        });
      }
    }

    for (const { regex, weight } of DECISION_PATTERNS) {
      const match = msg.content.match(regex);
      if (match && match[1]?.trim()) {
        results.push({
          type: 'decision',
          content: match[1].trim(),
          confidence: weight,
          extractedAt: now,
        });
      }
    }

    for (const { regex, weight } of FACT_PATTERNS) {
      const match = msg.content.match(regex);
      if (match && match[1]?.trim()) {
        results.push({
          type: 'fact',
          content: match[1].trim(),
          confidence: weight,
          extractedAt: now,
        });
      }
    }

    return results;
  }

  /**
   * 从多条消息批量提取，去重
   */
  static extractBatch(msgs: MemoryMessage[]): ImportantInfo[] {
    const seen = new Set<string>();
    const all: ImportantInfo[] = [];

    for (const msg of msgs) {
      const items = this.extract(msg);
      for (const item of items) {
        const key = `${item.type}:${item.content}`;
        if (!seen.has(key)) {
          seen.add(key);
          all.push(item);
        }
      }
    }

    return all;
  }

  /**
   * 将提取的重要信息合并到用户画像中
   */
  static mergeIntoProfile(
    current: { preferences: Record<string, string>; facts: string[]; decisions: string[]; topicInterests: Array<{ topic: string; count: number }> },
    newInfos: ImportantInfo[],
  ): void {
    for (const info of newInfos) {
      switch (info.type) {
        case 'preference': {
          // 尝试以"键：值"格式提取，否则用原内容
          const colonIdx = info.content.indexOf('：');
          if (colonIdx > 0 && colonIdx < info.content.length - 1) {
            const key = info.content.slice(0, colonIdx).trim();
            const val = info.content.slice(colonIdx + 1).trim();
            current.preferences[key] = val;
          } else {
            // 作为自由文本偏好
            const key = `pref_${Object.keys(current.preferences).length + 1}`;
            current.preferences[key] = info.content;
          }
          break;
        }
        case 'fact': {
          if (!current.facts.includes(info.content)) {
            current.facts.push(info.content);
          }
          break;
        }
        case 'decision': {
          if (!current.decisions.includes(info.content)) {
            current.decisions.push(info.content);
          }
          break;
        }
        case 'topic': {
          const existing = current.topicInterests.find(
            (t) => t.topic === info.content,
          );
          if (existing) {
            existing.count++;
          } else {
            current.topicInterests.push({ topic: info.content, count: 1 });
          }
          break;
        }
      }
    }
  }
}
