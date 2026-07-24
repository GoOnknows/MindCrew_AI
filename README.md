# MindCrew AI

AI 智能知识库助手，整合多模型对话、RAG 知识库、联网搜索、多 Agent 调研等功能。

## 项目结构

```
MindCrew AI/
├── nestjs/         # 后端 - NestJS API 服务
├── mindcrew-web/   # 前端 - Vue 3 客户端
└── README.md
```

## 环境要求

- **Node.js** >= 18
- **pnpm** >= 8（推荐使用 corepack 启用：`corepack enable`）
- **Docker & Docker Compose**（用于启动 PostgreSQL、Redis、Milvus 等基础设施）
- **NestJS CLI**（可选，`pnpm add -g @nestjs/cli`）

## 快速启动

### 1. 启动基础设施（Docker）

在 `nestjs` 目录下执行：

```bash
cd nestjs
docker compose up -d
```

这将启动以下服务：

| 服务 | 端口 | 用途 |
|------|------|------|
| PostgreSQL | 5432 | 主数据库 |
| Redis | 6379 | 缓存 |
| Milvus | 19530 | 向量数据库 |
| MinIO | 9000 | Milvus 依赖的对象存储 |
| etcd | 2379 | Milvus 依赖的元数据存储 |

### 2. 配置环境变量

```bash
cd nestjs
cp .env.example .env   # 如果不存在 .env 文件
```

编辑 `.env` 文件，至少需要配置以下关键项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://postgres:postgres@localhost:5432/mindcrew?schema=public` |
| `API_KEY` | LLM API 密钥 | - |
| `BASE_URL` | LLM API 地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `MODEL_NAME` | 默认模型名 | `qwen-turbo` |
| `JWT_SECRET` | JWT 加密密钥 | `mindcrew-jwt-secret-change-in-production` |

### 3. 安装依赖

```bash
# 安装后端依赖
cd nestjs
pnpm install

# 安装前端依赖
cd ../mindcrew-web
pnpm install
```

### 4. 初始化数据库

```bash
cd nestjs
pnpm prisma db push
```

### 5. 启动服务

在两个终端分别启动后端和前端：

```bash
# 终端 1 - 启动后端（默认 http://localhost:3000）
cd nestjs
pnpm start:dev

# 终端 2 - 启动前端（默认 http://localhost:5173）
cd mindcrew-web
pnpm dev
```

### 6. 访问

打开浏览器访问 `http://localhost:5173`

默认管理员账号（首次启动时自动创建）：

- 用户名：`admin`
- 密码：`admin123`

## 常用命令

### 后端（nestjs）

| 命令 | 说明 |
|------|------|
| `pnpm start:dev` | 开发模式启动（热重载） |
| `pnpm build` | 构建 |
| `pnpm start:prod` | 生产模式启动 |
| `pnpm prisma db push` | 同步数据库 Schema |
| `pnpm prisma studio` | 打开 Prisma 数据库管理界面 |

### 前端（mindcrew-web）

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发模式启动（热重载） |
| `pnpm build` | 构建 |
| `pnpm preview` | 预览构建产物 |
