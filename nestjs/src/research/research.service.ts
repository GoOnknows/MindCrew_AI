import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { Subject } from 'rxjs';

interface CreateTaskInput {
  topic: string;
  researcherCount?: number;
}

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);
  // 用于 SSE 事件推送的任务流
  private readonly taskStreams = new Map<string, Subject<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  // ─── 任务列表 ──────────────────────────────────────────────────────────

  async getTasks(params: { status?: string; page: number; pageSize: number }) {
    const { status, page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }
    
    const [tasks, total]  = await Promise.all([
      this.prisma.researchTask.findMany({                                           
        where,  
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          topic: true,
          status: true,
          progress: true,
          agents: true,
          researcherCount: true,
          sourcesFound: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.researchTask.count({ where }),
    ]);

    return { list: tasks, total, page, pageSize };
  }

  // ─── 创建任务 ──────────────────────────────────────────────────────────

  async createTask(input: CreateTaskInput, userId: string) {
    const researcherCount = input.researcherCount ?? 2;

    const task = await this.prisma.researchTask.create({
      data: {
        topic: input.topic,
        status: 'pending',
        agents: ['Planner', 'Researcher', 'Writer', 'Critic'],
        researcherCount,
        createdBy: userId,
      },
    });

    // 创建 SSE 推送流
    const subject = new Subject<string>();
    this.taskStreams.set(task.id, subject);

    // 异步启动 Agent 协同调研
    this.runAgentPipeline(task.id, input.topic, researcherCount, subject).catch(
      (err) => {
        this.logger.error(`调研任务 ${task.id} 失败: ${err.message}`);
        subject.next(
          JSON.stringify({ type: 'error', content: err.message }),
        );
        subject.complete();
        this.taskStreams.delete(task.id);
      },
    );

    return task;
  }

  // ─── 任务详情 ──────────────────────────────────────────────────────────

  async getTask(id: string) {
    const task = await this.prisma.researchTask.findUnique({
      where: { id },
      include: {
        agentLogs: {
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
      },
    });
    if (!task) throw new NotFoundException('调研任务不存在');

    return task;
  }

  // ─── 删除任务 ──────────────────────────────────────────────────────────

  async deleteTask(id: string) {
    await this.prisma.researchTask.delete({ where: { id } });
    // 清理 SSE 流
    const subject = this.taskStreams.get(id);
    if (subject) {
      subject.complete();
      this.taskStreams.delete(id);
    }
    return { message: '任务已删除' };
  }

  // ─── SSE 进度流 ────────────────────────────────────────────────────────

  async *streamTaskProgress(id: string): AsyncIterable<string> {
    const subject = this.taskStreams.get(id);
    if (!subject) {
      yield JSON.stringify({ type: 'error', content: '任务不存在或已结束' });
      return;
    }

    // 先发送已有的日志
    const existingLogs = await this.prisma.researchAgentLog.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });
    for (const log of existingLogs) {
      yield JSON.stringify({
        type: 'log',
        agent: log.agent,
        action: log.action,
        content: log.content,
      });
    }

    // 订阅实时更新
    const buffer: string[] = [];
    const subscription = subject.subscribe((data) => buffer.push(data));

    // 轮询推送（SSE 模式）
    let lastIndex = existingLogs.length;
    while (true) {
      // 检查新日志
      const newLogs = await this.prisma.researchAgentLog.findMany({
        where: { taskId: id },
        orderBy: { createdAt: 'asc' },
        skip: lastIndex,
      });
      for (const log of newLogs) {
        yield JSON.stringify({
          type: 'log',
          agent: log.agent,
          action: log.action,
          content: log.content,
        });
        lastIndex++;
      }

      // 检查任务是否完成
      const task = await this.prisma.researchTask.findUnique({
        where: { id },
        select: { status: true },
      });
      if (task && (task.status === 'completed' || task.status === 'failed')) {
        yield JSON.stringify({
          type: 'done',
          status: task.status,
        });
        subscription.unsubscribe();
        this.taskStreams.delete(id);
        return;
      }

      // 等待后再检查
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // ─── Agent 协同流程 ────────────────────────────────────────────────────

  private async runAgentPipeline(
    taskId: string,
    topic: string,
    researcherCount: number,
    subject: Subject<string>,
  ) {
    const push = async (
      agent: string,
      action: string,
      content: string,
    ) => {
      const log = await this.prisma.researchAgentLog.create({
        data: { taskId, agent, action, content },
      });
      const event = JSON.stringify({ type: 'log', agent, action, content });
      subject.next(event);
      return log;
    };

    // 更新状态为运行中
    await this.prisma.researchTask.update({
      where: { id: taskId },
      data: { status: 'running', progress: 5 },
    });

    try {
      // Phase 1: Planner 制定计划
      await push('Planner', 'thought', `开始分析调研主题: "${topic}"`);
      const planPrompt = `请为以下调研主题制定一个详细的调研计划，拆解为 ${researcherCount} 个子任务：\n\n${topic}\n\n请列出每个子任务的关键搜索词和调研方向。`;
      const planResult = await this.generateWithAI(planPrompt);
      await push('Planner', 'output', planResult);

      await this.prisma.researchTask.update({
        where: { id: taskId },
        data: { progress: 15 },
      });

      // Phase 2: Researcher 多路并行搜索
      let allSources = 0;
      const researchResults = await Promise.all(
        Array.from({ length: researcherCount }, async (_, i) => {
          const index = i + 1;
          await push(
            `Researcher-${index}`,
            'thought',
            `开始第 ${index} 路调研...`,
          );
          const researchPrompt = `基于以下调研计划，作为第 ${index}/${researcherCount} 路研究员，针对主题 "${topic}" 进行深度搜索和资料收集，请给出具体的数据、观点和来源：\n\n计划:\n${planResult}\n\n请给出第 ${index} 路的调研结果。`;
          const researchResult = await this.generateWithAI(researchPrompt);
          await push(`Researcher-${index}`, 'output', researchResult);
          allSources += 3; // 假设每路约3条来源
          return researchResult;
        }),
      );
      await this.prisma.researchTask.update({
        where: { id: taskId },
        data: { progress: 55, sourcesFound: allSources },
      });

      // Phase 3: Writer 汇总生成报告
      await push('Writer', 'thought', '正在汇总所有研究员的发现，撰写调研报告...');
      const researchSummary = researchResults
        .map((r, i) => `--- Researcher-${i + 1} ---\n${r}`)
        .join('\n\n');
      const writePrompt = `请综合以下调研计划和各路研究员的发现，针对调研主题 "${topic}" 撰写一份专业、结构化的调研报告（Markdown 格式），包含摘要、背景、核心发现、分析、建议和参考来源：\n\n调研计划：\n${planResult}\n\n各路研究员发现：\n${researchSummary}\n\n`;
      const report = await this.generateWithAI(writePrompt);
      await push('Writer', 'output', report.slice(0, 500) + '...(报告已生成)');

      await this.prisma.researchTask.update({
        where: { id: taskId },
        data: { progress: 80 },
      });

      // Phase 4: Critic 审阅
      await push('Critic', 'thought', '正在审阅报告，检查事实准确性和逻辑完整性...');
      const criticPrompt = `请审阅以下调研报告，指出其中存在的问题（事实错误、逻辑漏洞、缺失信息），并给出修改建议：\n\n${report.slice(0, 3000)}`;
      const criticFeedback = await this.generateWithAI(criticPrompt);
      await push('Critic', 'output', criticFeedback);

      // 完成
      await this.prisma.researchTask.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          progress: 100,
          report,
          sourcesFound: allSources,
        },
      });

      subject.next(JSON.stringify({ type: 'done', status: 'completed' }));
      subject.complete();
      this.taskStreams.delete(taskId);
    } catch (err) {
      await this.prisma.researchTask.update({
        where: { id: taskId },
        data: { status: 'failed' },
      });
      subject.next(
        JSON.stringify({ type: 'error', content: (err as Error).message }),
      );
      subject.complete();
      this.taskStreams.delete(taskId);
    }
  }

  private async generateWithAI(prompt: string): Promise<string> {
    // 使用现有的 AiService 进行文本生成
    const chunks: string[] = [];
    const stream = this.aiService.runChainStream(prompt, undefined, undefined);
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return chunks.join('');
  }
}
