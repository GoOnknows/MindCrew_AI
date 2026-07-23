import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import * as bcrypt from 'bcryptjs';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  // ─── 登录 ──────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (user.status === 'inactive') {
      throw new UnauthorizedException('账户已被禁用');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const token = this.jwtService.sign({ sub: user.id, username: user.username });

    // 记录登录会话到 Redis (7天过期)
    await this.redis.set(
      `session:${user.id}`,
      {
        token,
        username: user.username,
        role: user.role,
      },
      7 * 24 * 3600,
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        dept: user.dept,
        avatar: user.avatar,
      },
    };
  }

  // ─── 注册 ──────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.email }],
      },
    });

    if (existing) {
      throw new ConflictException('用户名或邮箱已存在');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password: hashedPassword,
        role: 'viewer',
        dept: '',
      },
    });

    const token = this.jwtService.sign({ sub: user.id, username: user.username });

    await this.redis.set(
      `session:${user.id}`,
      { token, username: user.username, role: user.role },
      7 * 24 * 3600,
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        dept: user.dept,
      },
    };
  }

  // ─── 个人信息 ──────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const { password: _, ...profile } = user;
    return profile;
  }

  // ─── 退出 ──────────────────────────────────────────────────────────────

  async logout(userId: string) {
    await this.redis.del(`session:${userId}`);
    return { message: '已退出登录' };
  }

  // ─── 验证 Token（供守卫使用）──────────────────────────────────────────

  async validateToken(token: string): Promise<{ id: string; username: string; role: string } | null> {
    try {
      const payload = this.jwtService.verify<{ sub: string; username: string }>(token);
      const cached = await this.redis.get<{ token: string; username: string; role: string }>(
        `session:${payload.sub}`,
      );
      if (!cached || cached.token !== token) return null;
      return { id: payload.sub, username: payload.username, role: cached.role };
    } catch {
      return null;
    }
  }
}
