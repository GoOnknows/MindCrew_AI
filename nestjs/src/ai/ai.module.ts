import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { UserService } from './user.service';
import { MemoryModule } from '../memory/memory.module';
import { RagModule } from '../rag/rag.module';
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
  //forwardRef 是为了在模块加载时避免循环依赖
  //本质是延迟模块初始化时机，先注册引用，等两边都加载完再绑定
  imports: [forwardRef(() => MemoryModule), forwardRef(() => RagModule)],
  controllers: [AiController],
  providers: [
    AiService,
    UserService,
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
