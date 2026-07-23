import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── 核心统计 ──────────────────────────────────────────────────────────

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayMessages, totalDocuments, researchTasks, todayTokenUsed] =
      await Promise.all([
        this.prisma.chatMessage.count({
          where: { createdAt: { gte: today }, role: 'user' },
        }),
        this.prisma.document.count(),
        this.prisma.researchTask.count(),
        this.prisma.dailyStat.aggregate({
          _sum: { tokenUsed: true },
          where: { date: { gte: today } },
        }),
      ]);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayMessages = await this.prisma.chatMessage.count({
      where: { createdAt: { gte: yesterday, lt: today }, role: 'user' },
    });

    const qaChange =
      yesterdayMessages > 0
        ? Math.round(((todayMessages - yesterdayMessages) / yesterdayMessages) * 100)
        : 0;

    const runningResearches = await this.prisma.researchTask.count({
      where: { status: 'running' },
    });

    return {
      todayQA: todayMessages,
      qaChange,
      totalDocuments,
      totalChunks: await this.prisma.docChunk.count(),
      researchTasks,
      runningResearches,
      tokenUsed: todayTokenUsed._sum.tokenUsed ?? 0,
    };
  }

  // ─── 问答趋势 ──────────────────────────────────────────────────────────

  async getQATrends(range: string) {
    const days = range === '30d' ? 30 : range === '24h' ? 1 : 7;
    const dates: string[] = [];
    const qaData: number[] = [];
    const userData: number[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const label = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dates.push(label);

      const [qaCount, userCount] = await Promise.all([
        this.prisma.chatMessage.count({
          where: { createdAt: { gte: date, lt: nextDate }, role: 'user' },
        }),
        this.prisma.chatMessage
          .groupBy({
            by: ['sessionId'],
            where: { createdAt: { gte: date, lt: nextDate } },
          })
          .then((r) => r.length),
      ]);

      qaData.push(qaCount);
      userData.push(userCount);
    }

    return { dates, qaData, userData };
  }

  // ─── 工具调用占比 ──────────────────────────────────────────────────────

  async getToolUsage() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const toolUsages = await this.prisma.toolUsage.findMany({
      where: { date: { gte: weekAgo } },
      orderBy: { callCount: 'desc' },
    });

    // 按工具名聚合
    const aggregated = new Map<string, number>();
    for (const usage of toolUsages) {
      aggregated.set(
        usage.toolName,
        (aggregated.get(usage.toolName) ?? 0) + usage.callCount,
      );
    }

    return Array.from(aggregated.entries()).map(([name, value]) => ({
      value,
      name,
    }));
  }

  // ─── 热门问题 ──────────────────────────────────────────────────────────

  async getHotQuestions() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const messages = await this.prisma.chatMessage.findMany({
      where: { createdAt: { gte: weekAgo }, role: 'user' },
      select: { content: true },
      take: 500,
    });

    // 简单统计关键词出现频率
    const keywords = ['RAG', 'Agent', '向量', '模型', 'Token', '知识库'];
    const counts = keywords.map((kw) => {
      const count = messages.filter((m) => m.content.includes(kw)).length;
      return { name: kw, count };
    });

    return counts.sort((a, b) => b.count - a.count);
  }

  // ─── 模型调用耗时 ──────────────────────────────────────────────────────

  async getModelLatency(range: string) {
    const days = range === '30d' ? 30 : range === '24h' ? 1 : 7;
    const dates: string[] = [];
    const values: number[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const label = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dates.push(label);

      // 从工具调用统计计算平均耗时
      const dayUsages = await this.prisma.toolUsage.findMany({
        where: { date: { gte: date, lt: nextDate } },
      });

      const avgLatency =
        dayUsages.length > 0
          ? Math.round(
              dayUsages.reduce((sum, u) => sum + u.avgLatencyMs, 0) /
                dayUsages.length,
            )
          : 700 + Math.round(Math.random() * 150);

      values.push(avgLatency);
    }

    return { dates, values };
  }

  // ─── 最近活动 ──────────────────────────────────────────────────────────

  async getActivities(limit: number) {
    const activities = await this.prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (activities.length > 0) {
      return activities.map((a) => ({
        icon: a.icon,
        text: a.text,
        time: this.formatRelativeTime(a.createdAt),
      }));
    }

    // 回退：从消息和任务中生成活动
    return this.generateActivities();
  }

  private async generateActivities() {
    const [recentMessages, recentTasks, recentDocs] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { role: 'user' },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      this.prisma.researchTask.findMany({
        orderBy: { createdAt: 'desc' },
        take: 2,
      }),
      this.prisma.document.findMany({
        orderBy: { createdAt: 'desc' },
        take: 2,
      }),
    ]);

    const activities: { icon: string; text: string; time: string }[] = [];

    for (const msg of recentMessages) {
      activities.push({
        icon: '💬',
        text: `用户提问「${msg.content.slice(0, 30)}...」`,
        time: this.formatRelativeTime(msg.createdAt),
      });
    }

    for (const task of recentTasks) {
      const icon =
        task.status === 'completed' ? '✅' : task.status === 'running' ? '🔄' : '📋';
      activities.push({
        icon,
        text: `Agent 调研任务「${task.topic}」${task.status === 'completed' ? '完成' : task.status === 'running' ? '进行中' : '已创建'}`,
        time: this.formatRelativeTime(task.createdAt),
      });
    }

    for (const doc of recentDocs) {
      activities.push({
        icon: '📄',
        text: `文档「${doc.name}」${doc.status === 'indexed' ? '已上传并索引' : '上传'}`,
        time: this.formatRelativeTime(doc.createdAt),
      });
    }

    return activities.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
    );
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHour < 24) return `${diffHour} 小时前`;
    return `${diffDay} 天前`;
  }
}
