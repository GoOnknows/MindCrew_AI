import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Sse,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { from, Observable, of } from 'rxjs';
import { catchError, concatWith, map } from 'rxjs/operators';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('api/chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  /**
   * SSE 流式对话接口
   */
  @UseGuards(JwtAuthGuard)
  @Sse('/stream')
  chatStream(
    @Query('query') query: string,
    @Query('sessionId') sessionId?: string,
    @Query('model') model?: string,
    @Request() req?: any,
  ): Observable<MessageEvent<string>> {
    const stream = this.chatService.runChatStream(
      query,
      sessionId,
      model,
      req?.user?.id,
    );
    return from(stream).pipe(
      catchError((err) => {
        this.logger.error('Stream error:', err);
        return of(`[ERROR] ${err.message || 'Unknown error'}`);
      }),
      map((chunk) => ({ data: chunk })),
      concatWith(of({ data: '[DONE]' })),
    ) as Observable<MessageEvent<string>>;
  }

  /** 获取会话列表 */
  @UseGuards(JwtAuthGuard)
  @Get('/sessions')
  async getSessions(@Request() req: any) {
    return this.chatService.getSessions(req.user.id);
  }

  /** 创建新会话 */
  @UseGuards(JwtAuthGuard)
  @Post('/sessions')
  async createSession(@Request() req: any) {
    return this.chatService.createSession(req.user.id);
  }

  /** 删除会话 */
  @UseGuards(JwtAuthGuard)
  @Delete('/sessions/:id')
  async deleteSession(@Param('id') id: string) {
    return this.chatService.deleteSession(id);
  }

  /** 获取会话历史消息 */
  @UseGuards(JwtAuthGuard)
  @Get('/sessions/:id/messages')
  async getMessages(@Param('id') id: string) {
    return this.chatService.getMessages(id);
  }
}
