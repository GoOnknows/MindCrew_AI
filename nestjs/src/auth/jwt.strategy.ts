import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // SSE (EventSource) 不支持自定义请求头，从 query 参数取 token 作为 fallback
        (req: any) => (req?.query?.token as string) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ?? 'mindcrew-jwt-secret',
    });
  }

  async validate(payload: { sub: string; username: string }) {
    // 校验用户是否真实存在于数据库（数据库重置后旧 token 会失效）
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在，请重新登录');
    }
    return { id: payload.sub, username: payload.username };
  }
}
