import { Module, Global } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { AppConfigService } from './config.service';
import { AiModule } from '../ai/ai.module';

@Global()
@Module({
  imports: [AiModule],
  controllers: [ConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}