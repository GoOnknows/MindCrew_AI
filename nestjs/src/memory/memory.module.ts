import { Module, forwardRef } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { AiModule } from '../ai/ai.module';

/**
 * 记忆模块
 *
 * 提供 MemoryService，实现分层记忆架构（短期/中期/长期）。
 * forwardRef 解决 AiModule ↔ MemoryModule 循环依赖。
 */
@Module({
  imports: [forwardRef(() => AiModule)],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
