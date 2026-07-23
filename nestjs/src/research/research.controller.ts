import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Sse,
  UseGuards,
  Request,
} from '@nestjs/common';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ResearchService } from './research.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('api/research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  /** 调研任务列表 */
  @UseGuards(JwtAuthGuard)
  @Get('tasks')
  async getTasks(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.researchService.getTasks({
      status,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  /** 创建调研任务 */
  @UseGuards(JwtAuthGuard)
  @Post('tasks')
  async createTask(
    @Body() body: { topic: string; researcherCount?: number },
    @Request() req: any,
  ) {
    return this.researchService.createTask(body, req.user.id);
  }

  /** 任务详情 */
  @UseGuards(JwtAuthGuard)
  @Get('tasks/:id')
  async getTask(@Param('id') id: string) {
    return this.researchService.getTask(id);
  }

  /** 删除任务 */
  @UseGuards(JwtAuthGuard)
  @Delete('tasks/:id')
  async deleteTask(@Param('id') id: string) {
    return this.researchService.deleteTask(id);
  }

  /** SSE 实时查看 Agent 执行过程 */
  @Sse('tasks/:id/stream')
  taskStream(@Param('id') id: string): Observable<MessageEvent<string>> {
    const stream = this.researchService.streamTaskProgress(id);
    return from(stream).pipe(
      map((chunk) => ({ data: chunk })),
    ) as Observable<MessageEvent<string>>;
  }
}
