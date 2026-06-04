# BoosterPro · 猎头 / 招聘管理系统

面向猎头与招聘交付团队的一站式管理系统，覆盖候选人挖猎、客户需求、客户联系人、商机销售、合同、知识库全流程，并集成 AI 联网辅助。

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

侧边栏一级分组：**交付中心 / 数据分析 / 市场中心 / 公司通用 / 系统管理**（工作台为登录落地页）。

**交付中心**
- 候选人管理：状态驱动表单（推荐状态联动显示流程字段、按状态显示「保证期内沟通记录」子表）、客户 → 招聘需求方 → 岗位三级级联（按岗位「在招」状态过滤）、保证期沟通 / 风险管理子表、文件上传
- 客户需求管理：JD 录入 + AI 岗位画像分析（联网、动态条目填入子表）；**岗位状态多选**
- 客户补充信息、人才储备库

**数据分析**
- 候选人推荐报表（`/reports/candidate-recommendation`）：ECharts 统计（推荐状态分布、按提交人统计等），受独立 REPORT 权限控制

**市场中心**
- 商机管理、客户基本信息（AI 智能填充：联网搜索自动补全行业 / 区域 / 对标企业等）
- 客户联系人信息管理（主表实例 + 联系人子表：姓名 / 职务 / 电话 / 邮箱 / 爱好）
- 销售合同（发票子表）

**公司通用**
- 公司知识库（富文本知识便条；按分类 / 标签条件显示培训提纲、内外部讲师、管理细则子表）

**系统管理**
- 用户 / 部门 / 角色管理、权限设置（权限组）、字典管理、JWT 登录鉴权
- 数据权限：行级所有权（谁创建谁可改）+ 功能权限组（按用户 / 部门 / 角色授权）+ 离职数据移交

## 通用组件（`src/components/ui`）

- **BoostTable**：通用表格——新增 / 导出、全字段模糊搜索、显示列控制（覆盖全部字段）、**多字段自定义排序**（叠加多条规则，覆盖默认序）、刷新、全屏、固定操作列、前端分页。导入功能当前下线（隐藏「导入」按钮）。
- **SubTable / SubTableCell**：表单内嵌子表（多行增 / 删 / 改）与列表内子表预览
- **YearSelect**：通用年份下拉（越界历史 / 未来年份可回显）
- **SearchSelect**：可搜索下拉（combobox）——静态选项走前端过滤；传 `fetchOptions` 则改异步后端过滤（配 `searchFetch('/api/<res>/options', map)` 调用轻量选项接口，按 `?q=` 过滤、`initialLabel` 回显已选）。表单里「引用别的实体」的下拉（选客户 / 岗位 / 用户等）统一用它
- **RegionCascade**：地区级联选择
- **Modal / Popconfirm / Dropdown / Field / FileUpload / RichText / Toast**

## 快速开始

### 方式 A：服务器部署（初始化 + 部署产物，两步）

构建产物（`.next` + 已 prune devDeps 的 `node_modules`）由 **GitHub CI**（`.github/workflows/build.yml`，ubuntu/x64）产出，**本机不再构建**——避免 macOS/arm64 与服务器 linux/x64 原生件（sharp/swc 等）不兼容。

```bash
# ① 初始化环境（一次性，在裸机上跑）
bash deploy.sh                        # = npm run deploy

# ② 部署 / 更新产物（每次发版跑；boosterpro-dist.tgz 来自 CI 构建产物）
bash update.sh boosterpro-dist.tgz    # = npm run update
```

- **`deploy.sh`（环境初始化）**：在「什么都没装」的新机器上自动安装 Node(≥18) / PostgreSQL → 建角色与库 → 生成 `.env`（随机 DB 密码 + JWT_SECRET）→ `prisma db push` 建表 → 灌入默认管理员 + 字典 → 注册 systemd 服务 + 看门狗并开机自启（**注册不启动、不再 `next build`**）。支持 Ubuntu/Debian、RHEL 系、macOS（macOS 无 systemd / update.sh，初始化后按提示本机 `npm run build && npm run start`）。
- **`update.sh`（部署/更新产物）**：停看门狗 + 主服务 → 备份旧 `.next`/`node_modules` → 解压新产物 → 重启 → `/api/health` 校验，**失败自动回滚**到旧产物；只换产物，**不动 `.env`/`uploads/`/数据库**。数据库结构变更走手工（`psql` 或 `npx prisma db execute`），update.sh 不自动迁移。

> `deploy.sh` 会**先探测一个预置远程 PostgreSQL**（`REMOTE_DB_*` 环境变量可覆盖），可连则直接复用、跳过本地建库。可用 `DB_NAME/DB_USER/DB_PASS/APP_PORT/NODE_MAJOR` 等覆盖默认值；`update.sh` 可用 `APP_DIR/SERVICE/APP_PORT/HEALTH_TIMEOUT/KEEP_BACKUP` 覆盖。AI 功能在 `.env` 填好 `OPENAI_API_KEY` 后重启服务即启用。

### 方式 B：手动开发启动

1. 环境变量 `.env`
```
DATABASE_URL="postgresql://用户:密码@localhost:5432/database"
OPENAI_API_KEY="你的key"
OPENAI_BASE_URL="https://api.openai.com/v1"   # 或兼容中转地址；豆包(火山方舟)填 https://ark.cn-beijing.volces.com/api/v3
OPENAI_MODEL="gpt-4o"                          # 有效模型名；豆包示例 doubao-seed-1-6-250615（需支持联网 web_search）
JWT_SECRET="自定义密钥"
UPLOAD_DIR="./uploads"                         # 文件上传本地存储路径
```

2. 安装与启动
```bash
npm install              # 含 tsx（db:seed 用它运行 TS 种子脚本）
npx prisma generate      # 生成 Prisma Client
npx prisma db push       # 应用表结构到数据库（需 .env 中已设 DATABASE_URL）
npm run db:seed          # 初始化默认管理员 / 部门 / 角色 + 字典（幂等，可重复执行）
npm run dev
```

> Prisma 7 通过 `prisma.config.ts` 读取 `DATABASE_URL`，因此执行 `prisma db push` 前务必在 `.env` 中配置好该变量。
> 若 `npm install` 未安装 `tsx`，可手动补装：`npm i -D tsx`。
> 升级既有库的 `requirements.status` 为多值数组：`npm run db:migrate-req-status`（幂等；全新库由 `db push` 直接建为 `text[]`）。
> 局域网其它设备访问 dev server 需把其 IP 加入 `next.config.ts` 的 `allowedDevOrigins`。

访问 http://localhost:3000 ，默认管理员账号 `admin@boosterpro.com`（用户名 `admin`）。**密码在首次 `db:seed` 时随机生成并打印到控制台**（仅显示一次，请登录后立即修改）；再次 seed 不会重置已有管理员密码。需指定固定口令（如本地开发 / e2e）可：`SEED_ADMIN_PASSWORD=你的密码 npm run db:seed`；忘记密码重置：`SEED_RESET_ADMIN_PASSWORD=1 npm run db:seed`。内网 HTTP 部署也可正常登录（鉴权 cookie 的 Secure 按请求协议自适应）。

## 项目结构
```
src/
  app/
    (dashboard)/        # 业务页面（带侧边栏布局；layout.tsx 定义菜单分组）
      page.tsx          # 工作台首页（登录后落地页）
      candidates/ requirements/ supplements/ talent-pool/   # 交付中心
      opportunities/ clients/ customer-contacts/ contracts/ # 市场中心
      knowledge/        # 公司通用（公司知识库）
      reports/candidate-recommendation/  # 数据分析（候选人推荐报表）
      settings/         # 系统管理：用户 / 部门 / 角色 / 权限设置 / 字典管理
    api/
      ai/               # AI 接口：job-profile（岗位画像）、company-info（公司信息），按资源 CREATE/EDIT 鉴权
      auth/             # 登录 / 登出 / me（me 返回 role + isAdmin；login cookie Secure 按协议自适应）
      candidates/ clients/ customer-contacts/ ...  # 各模块 CRUD（含功能权限校验 + 行级数据归属）
      clients/options requirements/options  # 表单下拉轻量选项接口（仅登录可取，不卡资源 VIEW）
      permissions/my    # 当前用户的权限映射（含 userId / departmentId，前端按它控制显隐与预填）
      permission-groups # 权限组 CRUD（仅管理员）
      dict-types/ dict-items/ dict/  # 数据字典 CRUD 与按 code 读取
      users/[id]/transfer  # 离职数据移交（仅管理员）
      reports/          # 报表聚合数据（REPORT 权限，按需 select 不含 PII）
      upload/ files/    # 文件上传 / 下载
    login/              # 登录页（成功后整页跳转进工作台）
  components/ui/        # 通用 UI 组件（BoostTable / SubTable / YearSelect / SearchSelect / RegionCascade …）
  lib/                  # prisma、openai、ai、apiError、industries、useDict、各模块 data helper
                        #   permissions.ts（服务端鉴权）、resources.ts（资源/动作常量）、usePermissions.ts（客户端权限 hook）
  types/models.ts       # Prisma 模型类型导出
  middleware.ts         # 登录鉴权中间件（所有非公开路由要求有效 JWT）
prisma/
  schema.prisma         # 数据模型
  seed.ts               # 默认管理员 / 部门 / 角色 + 字典种子（npm run db:seed）
  migrate-requirement-status-array.ts  # 把 requirements.status 升级为 text[]（npm run db:migrate-req-status）
  fix-sequences.ts      # 同步自增序列到 max(id)+1（npm run db:fix-sequences）
deploy.sh               # 环境初始化（装 Node/PostgreSQL → 建库 → db push → 灌种子 → 注册 systemd；不构建、不启动）
update.sh               # 部署/更新 CI 产物（停服务 → 解压 boosterpro-dist.tgz → 重启 → 健康校验，失败回滚）
scripts/healthcheck.sh  # 健康看门狗（探活 /api/health，连续失败 systemctl restart 主服务）
.github/workflows/      # CI：build.yml 在 ubuntu/x64 构建并打包 boosterpro-dist.tgz（linux 产物）
uploads/                # 上传文件（已 gitignore）
docs/                   # 数据字典 / 字段对照清单（已 gitignore，本地参考）
```

## AI 功能

两处联网 AI（**Responses API** + `web_search` 工具）：

1. **岗位画像分析**（需求模块）：输入 JD → 联网搜最新技术栈 → 生成**不定数量**画像条目，填入「岗位画像」子表，可改 / 删 / 加
2. **客户信息智能填充**（客户模块）：输入公司名 → 联网搜最新信息 → 自动填充**已有字段**（所属行业 / 区域 / 曾用名 / 企业文化 / 对标企业）

> 关键：联网工具用 GA 正式名 `web_search`（不是 `web_search_preview`）；模型名必须是该 API 实际支持的有效名称。
>
> **服务商可切**：实现与服务商无关（`src/lib/openai.ts` 只认 `OPENAI_*` 三个变量）。接入**字节跳动豆包（火山方舟 Ark）**只需改 `.env`——`OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3`、`OPENAI_API_KEY=<Ark Key>`、`OPENAI_MODEL=<支持联网的豆包模型，如 doubao-seed-1-6-250615>`，重启服务即可（Ark 的 Responses API 与 `web_search` 工具同 OpenAI 同形，无需改代码）。

## 权限系统

三层模型，前端控制显隐、后端独立强制：

1. **数据所有权（行级）**：九个业务模块每条记录带 `createdById`——谁创建谁可编辑 / 删除，他人只读；管理员（`isAdmin`）绕过。
2. **权限组（功能级）**：十个资源（候选人 / 客户需求 / 客户补充 / **客户联系人** / 人才库 / 商机 / 客户 / 合同 / 知识库 / 数据报表）各可配置多个权限组，每组授予「查看 / 新增 / 编辑 / 删除 / 导入 / 导出」中的若干动作（导入当前隐藏）；成员可选 **全部用户 / 指定用户 / 部门 / 角色**。在「系统管理 → 权限设置」配置。
3. **权限移交**：用户离职时，把其创建的全部数据一键移交给另一用户（用户管理页「移交权限」）。

实现要点：
- 资源 / 动作常量集中于 `src/lib/resources.ts`（前后端共享，单一事实源）。
- 后端 `src/lib/permissions.ts`：`getCurrentUser / requirePermission(resource,action) / requireAdmin / assertRowWritable / getPermissionMap`。业务 route 各方法校验功能权限，写操作再校验行级归属；系统管理接口用 `requireAdmin`，AI 接口按对应资源的 CREATE/EDIT 鉴权。错误统一抛 `HttpError`，由 `src/lib/apiError.ts` 的 `handleApiError` 转响应。
- 前端 `useMyPermissions()`（`src/lib/usePermissions.ts`，基于 `useSyncExternalStore` + 60s TTL、回前台自动刷新）：`can(resource,action)` / `isOwner(row)` 控制菜单与按钮显隐；侧边栏按 VIEW 过滤、系统管理组限管理员。
- 默认管理员由 seed 创建（`isAdmin=true`），登录后在权限设置中为其他用户分配权限组。

> **安全约定**：前端隐藏只是 UX，所有功能权限与数据归属都由后端 route 独立强制；新增任何业务接口都必须在服务端加权限校验。

## 数据库说明

`public` schema 为本项目（含九个业务主表及其子表、权限组 `permission_groups` / `permission_group_members`、字典 `dict_types` / `dict_items`；旧 `permissions` 表已废弃删除）。数据库内若另有 `novel` / `真寻` 等 schema，属**无关项目**，忽略即可（勿误删）。字段逐项说明、枚举与字典取值清单见 `docs/数据字典.md`。
```
