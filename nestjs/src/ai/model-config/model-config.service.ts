import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';


export interface ModelConfigDto {
  id: string;
  name: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  isDefault: boolean;
  order: number;
}

export interface CreateModelDto {
  name: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}

export interface UpdateModelDto {
  name?: string;
  modelName?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  isDefault?: boolean;
}

@Injectable()
export class ModelConfigService implements OnModuleInit {
  private readonly logger = new Logger(ModelConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // 启动时检查是否有默认模型，没有则从 .env 创建
    const count = await this.prisma.aiModel.count();
    if (count === 0) {
      await this.seedDefaultModel();
    }
  }

  private async seedDefaultModel() {
    const defaultModel = {
      name: 'qwen',
      modelName: this.configService.get<string>('MODEL_NAME') ?? 'qwen-turbo',
      baseUrl: this.configService.get<string>('BASE_URL') ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: this.configService.get<string>('API_KEY') ?? '',
      temperature: parseFloat(this.configService.get<string>('CLOUD_TEMPERATURE') ?? '0.7'),
      maxTokens: parseInt(this.configService.get<string>('CLOUD_MAX_TOKENS') ?? '4096', 10),
      isDefault: true,
      order: 0,
    };
    await this.prisma.aiModel.create({ data: defaultModel });
    this.logger.log(`已从 .env 创建默认模型: ${defaultModel.modelName}`);
  }

  async findAll(): Promise<ModelConfigDto[]> {
    return this.prisma.aiModel.findMany({
      orderBy: { order: 'asc' },
    });
  }

  async findById(id: string): Promise<ModelConfigDto | null> {
    return this.prisma.aiModel.findUnique({ where: { id } });
  }

  async findDefault(): Promise<ModelConfigDto | null> {
    return this.prisma.aiModel.findFirst({ where: { isDefault: true }, orderBy: { order: 'asc' } });
  }

  async create(dto: CreateModelDto): Promise<ModelConfigDto> {
    const maxOrder = await this.prisma.aiModel.aggregate({ _max: { order: true } });
    return this.prisma.aiModel.create({
      data: {
        name: dto.name,
        modelName: dto.modelName,
        baseUrl: dto.baseUrl,
        apiKey: dto.apiKey,
        temperature: dto.temperature ?? 0.7,
        maxTokens: dto.maxTokens ?? 4096,
        isDefault: false,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });
  }

  async update(id: string, dto: UpdateModelDto): Promise<ModelConfigDto> {
    // 如果要将某个模型设为默认，先取消其他模型的默认
    if (dto.isDefault) {
      await this.prisma.aiModel.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.aiModel.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string): Promise<void> {
    const model = await this.prisma.aiModel.findUnique({ where: { id } });
    if (!model) return;
    if (model.isDefault) {
      throw new Error('不能删除默认模型');
    }
    await this.prisma.aiModel.delete({ where: { id } });
  }
}