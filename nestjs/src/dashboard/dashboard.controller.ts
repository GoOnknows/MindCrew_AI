import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** 核心统计卡片 */
  @Get('stats')
  async getStats() {
    return this.dashboardService.getStats();
  }

  /** 问答趋势 */
  @Get('qa-trends')
  async getQATrends(@Query('range') range?: string) {
    return this.dashboardService.getQATrends(range ?? '7d');
  }

  /** 工具调用占比 */
  @Get('tool-usage')
  async getToolUsage() {
    return this.dashboardService.getToolUsage();
  }

  /** 热门问题排行 */
  @Get('hot-questions')
  async getHotQuestions() {
    return this.dashboardService.getHotQuestions();
  }

  /** 模型调用耗时 */
  @Get('model-latency')
  async getModelLatency(@Query('range') range?: string) {
    return this.dashboardService.getModelLatency(range ?? '7d');
  }

  /** 最近活动 */
  @Get('activities')
  async getActivities(@Query('limit') limit?: string) {
    return this.dashboardService.getActivities(
      limit ? parseInt(limit, 10) : 10,
    );
  }
}
