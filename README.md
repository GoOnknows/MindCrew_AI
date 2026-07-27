# MindCrew AI

AI 智能知识库助手，整合多模型对话、RAG 知识库、联网搜索、多 Agent 协作调研、长期记忆、邮件工具与 MCP 扩展能力。

## 项目结构

```
MindCrew AI/
├── nestjs/              # 后端 - NestJS API 服务
│   ├── prisma/          # Prisma 数据模型与迁移
│   ├── scripts/         # 数据维护脚本
│   └── src/             # 业务模块源码
├── mindcrew-web/        # 前端 - Vue 3 客户端
└── README.md
```

## 功能模块

- **AI 多模型对话**：基于 OpenAI 兼容协议接入多种云端大模型（如通义千问、DeepSeek、OpenAI 等），内置模型路由、健康检查与熔断降级，首次启动时自动从 `.env` 导入默认模型配置。
- **RAG 知识库**：支持 PDF / Word / Markdown / TXT 文档上传、文本分块、向量 Embedding 与语义检索，结合 LLM 生成带引用的回答。
- **多 Agent 调研**：基于 Planner / Researcher / Writer / Critic 多 Agent 协作，自动拆解调研主题、并行收集资料、生成结构化报告，并通过 SSE 实时推送进度。
- **长期记忆**：分层记忆机制（长期画像 + 中期摘要 + 短期对话历史），AI 可主动调用 `store_memory` / `recall_memory` 记住用户偏好与关键事实。
- **工具生态**：内置联网搜索（博查 AI）、知识库检索、关键词检索、用户信息查询、邮件发送等工具，支持 Tool Calling 自动决策调用。
- **MCP 扩展**：提供 MCP 接入能力，便于外部服务或 Agent 扩展。
- **用户与权限**：基于 JWT + Passport 认证，支持 admin / manager / editor / viewer / owner 五种角色。
- **数据看板**：ECharts 可视化展示问答量、Token 消耗、工具调用等核心指标。

## 环境要求

- **Node.js** >= 18
- **pnpm** >= 8（推荐使用 11.x）
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
| Redis | 6379 | 缓存与会话状态 |
| Milvus | 19530 | 向量数据库 |
| MinIO | 9000 | Milvus 依赖的对象存储 |
| etcd | 2379 | Milvus 依赖的元数据存储 |

### 2. 配置环境变量

```bash
cd nestjs
# 手动创建 .env 文件
```

`.env` 示例：

```ini
# ==================== 云端 LLM（默认模型，首次启动时自动导入数据库） ====================
MODEL_NAME=qwen-turbo
API_KEY=your-api-key
BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# ==================== 默认管理员账号（首次启动时自动创建） ====================
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_EMAIL=admin@example.com

# ==================== 博查 AI 联网搜索 ====================
BOCHA_API_KEY=your-bocha-api-key

# ==================== 邮件服务 ====================
MAIL_HOST=smtp.qq.com
MAIL_PORT=465
MAIL_SECURE=true
MAIL_USER=your-email@qq.com
MAIL_PASS=your-email-password
MAIL_FORM="No Reply <your-email@qq.com>"

# ==================== RAG 向量化 ====================
EMBEDDING_MODEL_NAME=text-embedding-v4
MILVUS_ADDRESS=http://localhost:19530
MILVUS_TOKEN=

# ==================== 对话记忆 ====================
MAX_HISTORY_ROUNDS=10

# ==================== 模型缓存与健康检查 ====================
MODEL_CACHE_TTL_MS=300000
HEALTH_CHECK_TIMEOUT_MS=5000

# ==================== 数据库 ====================
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mindcrew?schema=public

# ==================== Redis ====================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ==================== JWT ====================
JWT_SECRET=your-jwt-secret-change-in-production
JWT_EXPIRES_IN=7d

# ==================== 服务端口 ====================
PORT=3000
```

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

默认管理员账号在首次启动时自动创建，具体以 `.env` 中的配置为准：

- 用户名：`${ADMIN_USERNAME}`（默认 `admin`）
- 密码：`${ADMIN_PASSWORD}`（默认 `admin123`）

## 环境变量说明

| 变量 | 说明 | 默认值 / 示例 |
|------|------|---------------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://postgres:postgres@localhost:5432/mindcrew?schema=public` |
| `API_KEY` | 默认 LLM API 密钥 | - |
| `MODEL_NAME` | 默认模型名称 | `qwen-turbo` |
| `BASE_URL` | LLM API 基础地址 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `ADMIN_USERNAME` | 默认管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 默认管理员密码 | `admin123` |
| `ADMIN_EMAIL` | 默认管理员邮箱 | `admin@example.com` |
| `BOCHA_API_KEY` | 博查 AI 联网搜索 API Key | - |
| `MAIL_HOST` | SMTP 服务器地址 | `smtp.qq.com` |
| `MAIL_PORT` | SMTP 端口 | `465` |
| `MAIL_SECURE` | 是否使用 SSL | `true` |
| `MAIL_USER` | 发件人邮箱账号 | - |
| `MAIL_PASS` | 发件人邮箱授权码/密码 | - |
| `MAIL_FROM` | 邮件发件人显示名称 | `"No Reply <your-email@qq.com>"` |
| `EMBEDDING_MODEL_NAME` | Embedding 模型名称 | `text-embedding-v4` |
| `MILVUS_ADDRESS` | Milvus 向量数据库地址 | `http://localhost:19530` |
| `MILVUS_TOKEN` | Milvus 访问 Token（云端需要） | - |
| `MAX_HISTORY_ROUNDS` | 对话历史保留轮数 | `10` |
| `MODEL_CACHE_TTL_MS` | 模型实例缓存时间（毫秒） | `300000` |
| `HEALTH_CHECK_TIMEOUT_MS` | 模型健康检查超时时间（毫秒） | `5000` |
| `REDIS_HOST` | Redis 主机 | `localhost` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `REDIS_PASSWORD` | Redis 密码 | - |
| `JWT_SECRET` | JWT 签名密钥 | `mindcrew-jwt-secret-change-in-production` |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `PORT` | 后端服务端口 | `3000` |

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
