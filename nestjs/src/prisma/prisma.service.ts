import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool | null = null;

  constructor(private readonly configService: ConfigService) {
    const dbUrl =
      configService.get<string>('DATABASE_URL') ??
      'postgresql://postgres:postgres@localhost:5432/mindcrew';

    try {
      const pool = new Pool({ connectionString: dbUrl, max: 10 });
      const adapter = new PrismaPg(pool);
      super({
        adapter,
        log:
          configService.get<string>('NODE_ENV') === 'development'
            ? ['info', 'warn', 'error']
            : ['error'],
      });
      this.pool = pool;
    } catch {
      // Fallback: create without adapter (won't connect to DB but allows module loading)
      super({});
    }
  }

  async onModuleInit() {
    if (this.pool) {
      try {
        await this.$connect();
      } catch {
        // DB unavailable, app can still start without it
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this.pool) {
      await this.pool.end();
    }
  }
}
