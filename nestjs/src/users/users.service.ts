import { Injectable, NotFoundException, ConflictException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';

const ROLES = [
  {
    name: '管理员',
    key: 'admin',
    permissions: '全部权限：用户管理、知识库读写、配置修改、API 调用',
  },
  {
    name: '管理者',
    key: 'manager',
    permissions: '知识库读写、调研创建、查看分析、用户只读',
  },
  {
    name: '编辑者',
    key: 'editor',
    permissions: '知识库读写、调研创建、AI 对话',
  },
  {
    name: '查看者',
    key: 'viewer',
    permissions: '知识库只读、AI 对话',
  },
  {
    name: '拥有者',
    key: 'owner',
    permissions: '全部权限 + 系统所有权',
  },
];

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const count = await this.prisma.user.count();
    if (count === 0) {
      await this.seedDefaultAdmin();
    }
  }

  private async seedDefaultAdmin() {
    const username = this.configService.get<string>('ADMIN_USERNAME') ?? 'admin';
    const password = this.configService.get<string>('ADMIN_PASSWORD') ?? 'admin123';
    const email = this.configService.get<string>('ADMIN_EMAIL') ?? 'admin@example.com';

    const hashedPassword = await bcrypt.hash(password, 10);

    await this.prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: 'admin',
        dept: '技术部',
        status: 'active',
      },
    });

    this.logger.log(`默认管理员账号已创建: ${username} / ${password}`);
  }

  async findAll(params: {
    search?: string;
    role?: string;
    page: number;
    pageSize: number;
  }) {
    const { search, role, page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (role && role !== '全部') {
      // Map Chinese role name to key
      const roleMap: Record<string, string> = {
        '管理员': 'admin',
        '管理者': 'manager',
        '编辑者': 'editor',
        '查看者': 'viewer',
        '拥有者': 'owner',
      };
      where.role = roleMap[role] ?? role;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          dept: true,
          status: true,
          avatar: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      list: users.map((u) => ({
        ...u,
        role: this.roleLabel(u.role),
      })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        dept: true,
        status: true,
        avatar: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return { ...user, role: this.roleLabel(user.role) };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (existing) throw new ConflictException('用户名或邮箱已存在');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password: hashedPassword,
        role: dto.role ?? 'viewer',
        dept: dto.dept ?? '技术部',
        status: dto.status ?? 'active',
      },
    });

    const { password: _, ...result } = user;
    return { ...result, role: this.roleLabel(result.role) };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id); // ensure exists

    const data: any = {};
    if (dto.username) data.username = dto.username;
    if (dto.email) data.email = dto.email;
    if (dto.role) data.role = dto.role;
    if (dto.dept) data.dept = dto.dept;
    if (dto.status) data.status = dto.status;

    const user = await this.prisma.user.update({ where: { id }, data });
    const { password: _, ...result } = user;
    return { ...result, role: this.roleLabel(result.role) };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: '用户已删除' };
  }

  async updatePermissions(id: string, role: string) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: { role } });
    return { message: '权限已更新' };
  }

  getRoles() {
    return ROLES;
  }

  private roleLabel(key: string): string {
    const map: Record<string, string> = {
      admin: '管理员',
      manager: '管理者',
      editor: '编辑者',
      viewer: '查看者',
      owner: '拥有者',
    };
    return map[key] ?? key;
  }
}
