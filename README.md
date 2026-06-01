# BoosterPro · 猎头 / 招聘 CRM 管理系统

面向猎头与招聘交付团队的一站式 CRM，覆盖候选人挖猎、客户需求、商机销售、合同、知识库全流程，并集成 AI 联网辅助。

## 技术栈

| 领域 | 选型 |
|------|------|
| 框架 | Next.js 16（App Router）+ TypeScript |
| UI | Tailwind CSS v4 + daisyUI 5 + Lucide 图标 |
| ORM / 数据库 | Prisma 7 + PostgreSQL（`@prisma/adapter-pg` 连接） |
| 图表 | ECharts（echarts-for-react） |
| 富文本 | react-quill-new |
| AI | OpenAI 兼容 API（Responses API + `web_search` 联网工具） |
| 鉴权 | JWT（jose）+ httpOnly Cookie |

## 功能模块

**招聘交付**
- 候选人管理：状态驱动表单（推荐状态联动显示流程字段）、客户 → 招聘需求方 → 岗位三级级联、保证期沟通 / 风险管理子表、文件上传
- 客户需求管理：JD 录入 + AI 岗位画像分析（联网、动态条目填入子表）
- 客户补充信息、人才储备库

**销售客户**
- 商机管理、客户基本信息（AI 智能填充：联网搜索自动补全行业 / 区域 / 对标企业等）
- 销售合同（发票子表）、公司知识库（富文本知识便条）

**系统 & 分析**
- 数据报表：ECharts 统计（推荐状态分布、按提交人统计、对标占比等），受独立 REPORT 权限控制
- 用户 / 部门 / 角色管理、权限设置（权限组）、JWT 登录鉴权、工作台首页
- 数据权限：行级所有权（谁创建谁可改）+ 功能权限组（按用户 / 部门 / 角色授权）+ 离职数据移交

## 通用组件（`src/components/ui`）

- **BoostTable**：通用表格——新增 / 导入 / 导出、全字段模糊搜索、显示列控制（覆盖全部字段）、排序、刷新、全屏、固定操作列、前端分页
- **SubTable**：表单内嵌子表（多行增 / 删 / 改）
- **Modal / Popconfirm / Dropdown / Field / FileUpload / RichText / Toast**

## 快速开始

### 1. 环境变量 `.env`
```
DATABASE_URL="postgresql://用户:密码@localhost:5432/database"
OPENAI_API_KEY="你的key"
OPENAI_BASE_URL="https://api.openai.com/v1"   # 或兼容中转地址
OPENAI_MODEL="gpt-4o"                          # 必须是 API 实际支持的有效模型名
JWT_SECRET="自定义密钥"
UPLOAD_DIR="./uploads"                         # 文件上传本地存储路径
```

### 2. 安装与启动
```bash
npm install              # 含 tsx（db:seed 用它运行 TS 种子脚本）
npx prisma generate      # 生成 Prisma Client
npx prisma db push       # 应用表结构到数据库（需 .env 中已设 DATABASE_URL）
npm run db:seed          # 初始化默认管理员 / 部门 / 角色（幂等，可重复执行）
npm run dev
```

> Prisma 7 通过 `prisma.config.ts` 读取 `DATABASE_URL`，因此执行 `prisma db push` 前务必在 `.env` 中配置好该变量。
> 若 `npm install` 未安装 `tsx`，可手动补装：`npm i -D tsx`。

访问 http://localhost:3000 ，默认管理员账号：`admin@boosterpro.com` / `Admin@123456`

## 项目结构
```
src/
  app/
    (dashboard)/        # 业务页面（带侧边栏布局）
      page.tsx          # 工作台首页（登录后落地页）
      candidates/ clients/ requirements/ opportunities/ ...
      reports/          # 数据报表
      settings/         # 用户 / 部门 / 角色 / 权限
    api/
      ai/               # AI 接口：job-profile（岗位画像）、company-info（公司信息），按资源 CREATE/EDIT 鉴权
      auth/             # 登录 / 登出 / me（me 返回 role + isAdmin）
      candidates/ clients/ ...  # 各模块 CRUD（含功能权限校验 + 行级数据归属）
      permissions/my    # 当前用户的权限映射（前端按它控制显隐）
      permission-groups # 权限组 CRUD（仅管理员）
      users/[id]/transfer  # 离职数据移交（仅管理员）
      reports/          # 报表聚合数据（REPORT 权限，按需 select 不含 PII）
      upload/ files/    # 文件上传 / 下载
    login/              # 登录页
  components/ui/        # 通用 UI 组件
  lib/                  # prisma、openai、ai、apiError、各模块 data helper
                        #   permissions.ts（服务端鉴权）、resources.ts（资源/动作常量）、usePermissions.ts（客户端权限 hook）
  types/models.ts       # Prisma 模型类型导出
  middleware.ts         # 登录鉴权中间件（所有非公开路由要求有效 JWT）
prisma/
  schema.prisma         # 数据模型
  seed.ts               # 默认管理员 / 部门 / 角色种子（npm run db:seed）
uploads/                # 上传文件（已 gitignore）
docs/                   # 数据字典 / 字段对照清单（已 gitignore，本地参考）
```

## AI 功能

两处联网 AI（OpenAI **Responses API** + `web_search` 工具）：

1. **岗位画像分析**（需求模块）：输入 JD → 联网搜最新技术栈 → 生成**不定数量**画像条目，填入「岗位画像」子表，可改 / 删 / 加
2. **客户信息智能填充**（客户模块）：输入公司名 → 联网搜最新信息 → 自动填充**已有字段**（所属行业 / 区域 / 曾用名 / 企业文化 / 对标企业）

> 关键：联网工具用 GA 正式名 `web_search`（不是 `web_search_preview`）；模型名必须是该 API 实际支持的有效名称。

## 权限系统

三层模型，前端控制显隐、后端独立强制：

1. **数据所有权（行级）**：八个业务模块每条记录带 `createdById`——谁创建谁可编辑 / 删除，他人只读；管理员（`isAdmin`）绕过。
2. **权限组（功能级）**：九个资源（候选人 / 客户需求 / 客户补充 / 人才库 / 商机 / 客户 / 合同 / 知识库 / 数据报表）各可配置多个权限组，每组授予「查看 / 新增 / 编辑 / 删除 / 导入 / 导出」中的若干动作；成员可选 **全部用户 / 指定用户 / 部门 / 角色**。在「系统管理 → 权限设置」配置。
3. **权限移交**：用户离职时，把其创建的全部数据一键移交给另一用户（用户管理页「移交权限」）。

实现要点：
- 资源 / 动作常量集中于 `src/lib/resources.ts`（前后端共享，单一事实源）。
- 后端 `src/lib/permissions.ts`：`getCurrentUser / requirePermission(resource,action) / requireAdmin / assertRowWritable / getPermissionMap`。业务 route 各方法校验功能权限，写操作再校验行级归属；系统管理接口用 `requireAdmin`，AI 接口按对应资源的 CREATE/EDIT 鉴权。错误统一抛 `HttpError`，由 `src/lib/apiError.ts` 的 `handleApiError` 转响应。
- 前端 `useMyPermissions()`（`src/lib/usePermissions.ts`，基于 `useSyncExternalStore` + 60s TTL、回前台自动刷新）：`can(resource,action)` / `isOwner(row)` 控制菜单与按钮显隐；侧边栏按 VIEW 过滤、系统管理组限管理员。
- 默认管理员由 seed 创建（`isAdmin=true`），登录后在权限设置中为其他用户分配权限组。

> **安全约定**：前端隐藏只是 UX，所有功能权限与数据归属都由后端 route 独立强制；新增任何业务接口都必须在服务端加权限校验。

## 数据库说明

`public` schema 为本项目（约 24 张表，含权限组 `permission_groups` / `permission_group_members`；旧 `permissions` 表已废弃删除）。数据库内若另有 `novel` / `真寻` 等 schema，属**无关项目**，忽略即可（勿误删）。字段逐项说明见 `docs/数据字典.md`。
```
