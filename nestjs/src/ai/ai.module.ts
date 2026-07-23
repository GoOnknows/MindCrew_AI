import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { UserService } from './user.service';
import { MemoryModule } from '../memory/memory.module';
import { RagService } from '../rag/rag.service';
import { ModelRouterService } from './model-router';
import { ModelConfigService } from './model-config';
import { queryUserToolProvider } from './tools/query-user.tool';
import { sendEmailToolProvider } from './tools/send-email.tool';
import { webSearchToolProvider } from './tools/web-search.tool';
import { docSearchToolProvider } from './tools/doc-search.tool';
import { keywordSearchToolProvider } from './tools/keyword-search.tool';
import { recallMemoryToolProvider } from './tools/recall-memory.tool';
import { storeMemoryToolProvider } from './tools/store-memory.tool';

@Module({
  imports: [forwardRef(() => MemoryModule)],
  controllers: [AiController],
  providers: [
    AiService,
    UserService,
    RagService,
    ModelRouterService,
    ModelConfigService,
    queryUserToolProvider,
    sendEmailToolProvider,
    webSearchToolProvider,
    docSearchToolProvider,
    keywordSearchToolProvider,
    recallMemoryToolProvider,
    storeMemoryToolProvider,
  ],
  exports: [
    AiService,
    ModelRouterService,
    ModelConfigService,
    RagService,
    MemoryModule,
    UserService,
    queryUserToolProvider,
    sendEmailToolProvider,
    webSearchToolProvider,
    docSearchToolProvider,
    keywordSearchToolProvider,
    recallMemoryToolProvider,
    storeMemoryToolProvider,
  ],
})
export class AiModule {}
