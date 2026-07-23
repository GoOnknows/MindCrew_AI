import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') ?? 'localhost';
    const port = parseInt(
      this.configService.get<string>('REDIS_PORT') ?? '6379',
      10,
    );
    const password = this.configService.get<string>('REDIS_PASSWORD') ?? '';

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    try {
      await this.client.connect();
      this.logger.log(`Redis connected: ${host}:${port}`);
    } catch (err) {
      this.logger.warn(
        `Redis unavailable (${(err as Error).message}), running without cache`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  // ─── 公共 API ──────────────────────────────────────────────────────────

  get raw(): Redis {
    return this.client;
  }

  isReady(): boolean {
    return this.client?.status === 'ready';
  }

  // ─── 字符串操作 ───

  async get<T = string>(key: string): Promise<T | null> {
    if (!this.isReady()) return null;
    const val = await this.client.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!this.isReady()) return;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, str);
    } else {
      await this.client.set(key, str);
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (!this.isReady()) return 0;
    return this.client.del(...keys);
  }

  async ttl(key: string): Promise<number> {
    if (!this.isReady()) return -2;
    return this.client.ttl(key);
  }

  // ─── 对话记忆专用 ───

  async pushToList(key: string, ...values: string[]): Promise<void> {
    if (!this.isReady()) return;
    await this.client.rpush(key, ...values);
  }

  async getList(key: string, start = 0, end = -1): Promise<string[]> {
    if (!this.isReady()) return [];
    return this.client.lrange(key, start, end);
  }

  async trimList(key: string, maxLength: number): Promise<void> {
    if (!this.isReady()) return;
    const len = await this.client.llen(key);
    if (len > maxLength) {
      await this.client.ltrim(key, len - maxLength, -1);
    }
  }

  // ─── 配置热加载 ───

  async cacheConfig(key: string, value: unknown): Promise<void> {
    await this.set(`config:${key}`, value);
  }

  async getCachedConfig<T = string>(key: string): Promise<T | null> {
    return this.get<T>(`config:${key}`);
  }
}
