import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AppConfigService } from './config.service';
import { ModelConfigService } from '../ai/model-config';
import type { CreateModelDto, UpdateModelDto } from '../ai/model-config';
import { ModelRouterService } from '../ai/model-router';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/config')
export class ConfigController {
  constructor(
    private readonly configService: AppConfigService,
    private readonly modelConfigService: ModelConfigService,
    private readonly modelRouter: ModelRouterService,
  ) {}

  // ─── RAG 配置 ───

  @Get()
  async getAllConfig() {
    return this.configService.getAllConfig();
  }

  @Put()
  async updateConfig(@Body() body: any) {
    return this.configService.updateConfig(body);
  }

  // ─── 模型管理 ───

  @Get('models')
  async getModels() {
    return this.modelConfigService.findAll();
  }

  @Post('models')
  async createModel(@Body() dto: CreateModelDto) {
    return this.modelConfigService.create(dto);
  }

  @Put('models/:id')
  async updateModel(@Param('id') id: string, @Body() dto: UpdateModelDto) {
    const result = await this.modelConfigService.update(id, dto);
    this.modelRouter.invalidateCache(id);
    return result;
  }

  @Delete('models/:id')
  async deleteModel(@Param('id') id: string) {
    await this.modelConfigService.delete(id);
    this.modelRouter.invalidateCache(id);
    return { message: '模型已删除' };
  }
}