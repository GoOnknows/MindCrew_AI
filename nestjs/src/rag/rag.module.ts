import { Module, forwardRef } from '@nestjs/common';
import { RagService } from './rag.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [forwardRef(() => AiModule)],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
