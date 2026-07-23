import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { AppConfigService } from './config.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}