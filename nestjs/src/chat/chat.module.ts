import { Module, forwardRef } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { VoiceGateway } from './voice.gateway';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [forwardRef(() => AiModule)],
  controllers: [ChatController],
  providers: [ChatService, VoiceGateway],
  exports: [ChatService],
})
export class ChatModule {}
