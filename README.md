# BoosterPro · 猎头 / 招聘管理系统

面向猎头与招聘交付团队的一站式管理系统——候选人挖猎、客户需求、商机销售、合同、知识库全流程，集成 AI 联网辅助，三层权限控制（行级所有权 + 功能权限组 + 离职数据移交）。

## 技术栈

Next.js 16（App Router）· TypeScript · Tailwind CSS v4 + daisyUI 5 · Prisma 7 + PostgreSQL · ECharts · JWT 鉴权 · OpenAI 兼容 API（Responses API + `web_search` 联网）

## 功能模块

侧边栏五大分组（工作台为登录落地页）：

- **交付中心** — 候选人管理、客户需求管理（AI 岗位画像）、客户补充信息、人才储备库
- **数据分析** — 候选人推荐报表（ECharts）
- **市场中心** — 商机管理、客户基本信息（AI 智能填充）、客户联系人、销售合同
- **公司通用** — 公司知识库（富文本）
- **系统管理** — 用户 / 部门 / 角色 / 权限设置 / 字典管理

## 快速开始

### 环境要求

- Node.js ≥ 18
- PostgreSQL（本地或远程）

### 环境变量（`.env`）

```bash
DATABASE_URL="postgresql://用户:密码@localhost:5432/库名"
JWT_SECRET="自定义密钥"
UPLOAD_DIR="./uploads"                        # 文件上传本地存储路径
OPENAI_API_KEY="..."                          # AI 功能用
OPENAI_BASE_URL="https://api.openai.com/v1"   # 或兼容中转地址
OPENAI_MODEL="gpt-4o"                         # 有效模型名（需支持 web_search 联网）
```

> AI 服务商可切换（OpenAI / 豆包 / DeepSeek），详见 [AGENTS.md](AGENTS.md)。

### 安装与启动

```bash
npm install
npx prisma generate          # 生成 Prisma Client
npx prisma db push           # 按 schema 建表（需 .env 已配 DATABASE_URL）
npm run db:seed              # 初始化默认管理员 / 部门 / 角色 / 字典（幂等，可重复跑）
npm run dev                  # → http://localhost:3000
```

**默认管理员**：用户名 `admin`（邮箱 `admin@boosterpro.com`）。密码在首次 `db:seed` 时**随机生成并打印到控制台**（仅显示一次，登录后请立即修改）。

- 指定固定口令：`SEED_ADMIN_PASSWORD=你的密码 npm run db:seed`
- 忘记密码重置：`SEED_RESET_ADMIN_PASSWORD=1 npm run db:seed`

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm test` | 单元测试（Vitest） |
| `npm run test:e2e` | 端到端测试 |
| `npm run lint` | ESLint |
| `npm run db:seed` | 初始化管理员 / 字典（幂等） |
| `npm run db:migrate-req-status` | 升级 `requirements.status` 为多值数组 `text[]` |
| `npm run db:fix-sequences` | 同步自增序列到 `max(id)+1` |

## 部署

构建产物（`.next` + prune 后的 linux `node_modules`）由 GitHub CI（ubuntu/x64）产出，**本机不构建**（避免 macOS/arm64 与服务器 linux/x64 原生件不兼容）。服务器两步：

```bash
bash deploy.sh                       # ① 初始化环境：装 Node/PostgreSQL → 建库 → db push → seed → 注册 systemd + 看门狗
bash update.sh boosterpro-dist.tgz   # ② 部署 / 更新 CI 产物：停服务 → 解压 → 重启 → /api/health 校验，失败自动回滚
```

> 只换产物、不动 `.env` / `uploads/` / 数据库；**DB 结构变更走手工**（`psql` 或 `npx prisma db execute`），`update.sh` 不自动迁移。部署细节见 [AGENTS.md](AGENTS.md)。

## 文档

| 文档 | 内容 |
|------|------|
| [AGENTS.md](AGENTS.md) | 开发约定、架构、权限系统、AI、数据库、部署细节 |
| [src/components/ui/GUIDE.md](src/components/ui/GUIDE.md) | 通用组件（BoostTable / Modal / SearchSelect …）用法 |
| [docs/数据字典.md](docs/数据字典.md) | 字段逐项说明、枚举与字典取值 |
