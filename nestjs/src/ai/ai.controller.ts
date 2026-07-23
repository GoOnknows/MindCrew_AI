import { Controller, Get, Query, Sse } from '@nestjs/common';
import { AiService } from './ai.service';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * SSE 流式对话接口
   *
   * 参数：
   *   query     — 用户问题（必填）
   *   sessionId — 会话 ID（可选，用于多轮对话记忆）
   *   modelId   — 模型 ID（可选，不传则使用默认模型）
   */
  @Sse('/chat/stream')
  chatStream(
    @Query('query') query: string,
    @Query('sessionId') sessionId?: string,
    @Query('modelId') modelId?: string,
  ): Observable<MessageEvent<string>> {
    const stream = this.aiService.runChainStream(query, sessionId, modelId);
    return from(stream).pipe(
      map((chunk) => ({
        data: chunk,
      })),
    ) as Observable<MessageEvent<string>>;
  }
}