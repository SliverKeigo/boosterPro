<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BoosterPro 项目约定

猎头 / 招聘管理系统（产品名 **BoosterPro**，界面不再出现 "CRM" 字眼）。技术栈：Next.js 16 + daisyUI（**不要再引入 Ant Design**）+ Prisma 7 + PostgreSQL + ECharts + OpenAI 兼容 API。详见 `README.md`，通用组件用法见 `src/components/ui/GUIDE.md`。

## 菜单分组（`src/app/(dashboard)/layout.tsx` 的 `GROUPS`）
一级分组：**交付中心**（候选人 / 客户需求 / 客户补充 / 人才储备库）、**数据分析**（候选人推荐报表）、**市场中心**（商机 / 客户基本信息 / 客户联系人信息 / 销售合同）、**公司通用**（公司知识库）、**系统管理**（用户 / 部门 / 角色 / 权限设置 / 字典管理）。工作台为登录落地页。改菜单只动这里的 `GROUPS`；子路由（如 `/reports/candidate-recommendation`）按首段路径继承父级资源的 VIEW 权限，系统管理组限管理员。

## 数据库
- 本项目只用 `public` schema。数据库内的 `novel` / `真寻` schema 是**其他无关项目**，忽略、勿删。
- Prisma 7：连接走 `src/lib/prisma.ts` 的 `@prisma/adapter-pg`（`schema.prisma` 的 datasource **不写 url**）。改完 schema 跑 `npx prisma generate`，dev server 需重启才会加载新 client。CLI（`prisma db push` 等）经 `prisma.config.ts` 读 `.env` 的 `DATABASE_URL`；本机改库结构也可直接用 `psql` 跑 `ALTER`/`CREATE INDEX`（adapter 模式下 db push 受限时的备选）。
- 九个业务主表（`candidates` / `requirements` / `client_supplements` / `customer_contacts` / `talent_pool` / `opportunities` / `customers` / `contracts` / `knowledge_base`）均有 `created_by_id`（数据所有权外键 → `users`），`users` 有 `is_admin`；权限组在 `permission_groups` / `permission_group_members`。**旧 `permissions` 表已废弃删除，勿再使用。**
- 软枚举下拉集中在字典表 `dict_types` / `dict_items`（菜单「字典管理」维护），种子见 `prisma/seed.ts` 的 `DICT_SEEDS`。注意 `industry`（客户信息所属行业，16 项）与 `talent_industry`（人才库所属行业，15 项）是**两套不同列表**（取值见 `src/lib/industries.ts` 的 `INDUSTRIES` / `TALENT_INDUSTRIES`），勿合并。`opportunity_status` 客户**仅给「线索阶段」一项**，勿臆造其它阶段。
- `requirements.status`（岗位状态）是**多值** `text[]`（Prisma `String[]`，一个岗位可同时多状态，如「新增/加急/正常」）。升级既有库用 `npm run db:migrate-req-status`（幂等；全新库由 `prisma db push` 直接建为 `text[]`）。候选人选岗位时按「含任一非『关闭/暂停』状态」过滤（OR，见 `candidates/page.tsx` 的 `isRecruitingReq`）。
- 字段完整说明见 `docs/数据字典.md`。

## 通用约定
- 列表页一律用 `BoostTable`，列定义需**覆盖该模型所有字段**（不常用的设 `defaultVisible:false`）。
- 列表 API 的 GET 返回**全量数据** `{ data, total }`，搜索 / 排序 / 分页由前端 BoostTable 负责；返回的每行需含 `createdById`，前端据此判断行级归属。
- `BoostTable` 支持**多字段自定义排序**：排序面板里可叠加多条规则（按顺序主排序 → 依次 tie-break，稳定排序），配了规则即覆盖列表默认序；表头点击与排序面板共享同一份 `sortRules`。
- 列表默认排序：业务列表按 `updatedAt desc`；**系统管理菜单（users/roles/departments/permission-groups）按 `createdAt asc`**（稳定、不随编辑跳动）；字典管理维持原序（`dict-types` 按 `code`、`dict-items` 按 `sort`，勿改成时间）。
- **导入功能暂下线**：`BoostTable` 顶部 `IMPORT_ENABLED = false`，所有列表都不渲染「导入」按钮；权限项 `IMPORT` 仍在 `resources.ts` 保留但已隐藏（恢复时改回 `true`）。**导出保留**。
- 字典下拉用 `useDict(code)`：每次挂载会后台 revalidate（无 TTL 卡死），管理员改字典后无需整页刷新即可在一个导航周期内更新。
- 年份字段用通用组件 `YearSelect`（合同签订年份、候选人/人才出生年份）：范围 `[minYear, 今年+maxFuture]` 降序，**越界的已存值会自动补进选项可正常回显**，不丢历史/未来年份。列筛选用配套的 `yearOptions()`，与表单同口径。
- 文件字段用 `FileUpload`（上传到 `UPLOAD_DIR`，经 `/api/files/[name]` 下载）；富文本字段用 `RichText`；表单内的"子表 / 表中表"用 `SubTable`。
- **表单里"引用别的实体"的下拉**（选客户 / 选岗位 / 选用户等）一律走轻量选项接口 `/api/<resource>/options`（仅返回 `id` + 名称等下拉必要字段，**只要求登录、不要求该资源 VIEW**），不要复用会 `requirePermission(...,'VIEW')` 的列表 GET——否则"有新增权限、无目标资源只读权限"的用户会拿到空下拉。已建 `clients/options`、`requirements/options`；用户 / 部门的 GET 本就登录可取。
- **"提交人 / 负责人"类字段默认填当前登录用户**：前端打开新增弹窗时预填（仍可在下拉改），后端候选人 POST 再对 `submitterId/submitDepartmentId` 做"为空则归当前用户"兜底。`useMyPermissions()` 暴露 `userId` / `departmentId` 供预填。

## 权限系统
- 资源 / 动作常量在 `src/lib/resources.ts`（前后端共享，**单一事实源**；新增资源/动作只改这里 + schema `created_by_id` + route 守卫）。十资源：CANDIDATE/REQUIREMENT/CLIENT_SUPPLEMENT/**CUSTOMER_CONTACT**/TALENT_POOL/OPPORTUNITY/CUSTOMER/CONTRACT/KNOWLEDGE/REPORT；六动作：VIEW/CREATE/EDIT/DELETE/IMPORT/EXPORT（IMPORT 当前隐藏，见上）。
- 后端守卫（`src/lib/permissions.ts`）：业务 route 用 `await requirePermission(resource, action)`（GET=VIEW、POST=CREATE、PUT=EDIT、DELETE=DELETE）；**写操作（PUT/DELETE）再 `assertRowWritable(user, existing)`** 校验行级归属（非本人创建且非 admin 拒绝）；POST 写库时设 `createdById = user.id`。系统管理接口（users/roles/departments/permission-groups/work-plans 的写操作）用 `requireAdmin()`。AI 接口按对应资源的 CREATE/EDIT 鉴权。
- 错误一律 `throw new HttpError(status, msg)`（`src/lib/apiError.ts`），由各 route 的 `catch(e){ return handleApiError(e) }` 统一转响应——**不要在 catch 里硬编码 status**（会把 HttpError 的 401/403/404/502 吞成 500）。
- GET 的特例：`users` / `departments` 的 GET 对**非管理员返回精简字段**（候选人页下拉依赖，不能整体 requireAdmin）；`roles` 的 GET 仅管理员。表单下拉另走 `/api/<resource>/options`（如 `clients/options`、`requirements/options`）——**仅登录即可取**、只返回下拉必要字段、不卡该资源 VIEW（避免下拉被只读权限卡空）。
- 前端：`useMyPermissions()`（`src/lib/usePermissions.ts`）的 `can(resource,action)` / `isOwner(row)` 控制按钮 / 菜单显隐。
- 种子：`npm run db:seed`（`tsx --env-file=.env prisma/seed.ts`，独立脚本须 `--env-file` 才能加载 `.env`）创建默认部门「总部」/ 角色「超级管理员」/ 管理员 `admin@boosterpro.com`（用户名 `admin`、`isAdmin=true`），并幂等灌入全部字典（`DICT_SEEDS`，仅当某类型一条项都没有时才插入，不覆盖已有）。
- **管理员密码**：**首次创建随机生成**并打印到控制台（不再硬编码）；**再次 seed 不重置**已有管理员密码（旧 `upsert` 每次重写 `passwordHash` 会把管理员改过的密码覆盖回默认值＝提权风险，已改为 create/update 分流）。可用 `SEED_ADMIN_PASSWORD` 指定口令、`SEED_RESET_ADMIN_PASSWORD=1` 强制重置；seed 末尾打印 `SEED_ADMIN_RESULT=created|reset|unchanged` 供 `deploy.sh` 解析是否展示初始密码。**e2e 依赖固定口令**：跑前先 `SEED_RESET_ADMIN_PASSWORD=1 SEED_ADMIN_PASSWORD=Admin@123456 npm run db:seed`（e2e 默认仍读 `Admin@123456`，可被 `SEED_ADMIN_PASSWORD` 覆盖）。`deploy.sh` 部署时随机生成管理员口令经 `env` 透传给 seed，并在末尾摘要回显「初始管理员密码」与「本地新建 DB 的随机口令」（远程/复用库只给连接信息，口令见 `.env`）。

## 登录 / 部署
- 登录成功后**整页跳转**进工作台（`window.location.replace('/')`）——生产构建下 `router.push+refresh` 跨布局（login→dashboard）偶发卡在登录页，故用整页跳转。
- 鉴权 cookie 的 `Secure` **按请求实际协议自适应**（`isSecureRequest(req)`，见 `src/lib/auth.ts`），**不是按 `NODE_ENV`**：内网 HTTP 部署（生产）不能加 Secure，否则 cookie 被浏览器丢弃登不上。
- 部署分两步（脚本已拆分）：**① 初始化环境** `bash deploy.sh`（= `npm run deploy`）——「裸机」上自动装 Node(≥18)/PostgreSQL、建角色与库、生成 `.env`（随机 DB 密码 + JWT_SECRET）、`prisma db push` 建表、灌入 admin+字典、注册 systemd 服务+看门狗并开机自启；**注册不启动、不再 `next build`**（先探测预置远程库 `REMOTE_DB_*`，可连则复用、跳过本地建库）。**② 部署/更新产物** `bash update.sh boosterpro-dist.tgz`（= `npm run update`）——构建产物（`.next` + 已 prune devDeps 的 linux `node_modules`）由 GitHub CI（`.github/workflows/build.yml`，ubuntu/x64）产出；update.sh 停服务→备份→解压→重启→`/api/health` 校验，**失败自动回滚**，只换产物、不动 `.env`/`uploads/`/数据库。**拆开的原因**：本机 macOS/arm64 与服务器 linux/x64 原生件（sharp/swc 等）不兼容，构建统一交给 CI 的 linux 产物。**DB 结构变更走手工**（`psql` 或 `npx prisma db execute`），update.sh 不自动迁移（避免生产误删列/丢数据）。macOS 无 systemd/update.sh：deploy.sh 初始化后按提示本机 `npm run build && npm run start`。
- **健康检查与自愈**：`/api/health` 是免登录的**存活探测**（已在 middleware `PUBLIC_PATHS` 放行）——进程能响应即返 `200 {status:'ok', db}`；DB 异常只在 body 标 `db:'down'`、**不改状态码**（重启 Node 修不好挂掉的 DB，避免「重启风暴」）。Next.js **不自带**进程守护：① 主服务 systemd `Restart=always`（崩溃/被 kill/退出都拉起）；② 卡死它救不了，故再加**看门狗** `boosterpro-watchdog`（`scripts/healthcheck.sh` 循环 curl 健康接口，连续失败即 `systemctl restart` 主服务，以 root 跑才有权限）。两者均由 `deploy.sh` 注册。macOS 降级：pm2 自愈 + cron 跑 `healthcheck.sh once`。看门狗据「无响应/超时/5xx」判活，不据 DB。
- `next.config.ts` 配 `allowedDevOrigins`（`192.168.31.208` + `192.168.31.*`）放行局域网设备访问 dev server 的 HMR；换网段需把对应 IP 加进去。`proxyClientMaxBodySize: '60mb'` 给大文件上传留余量。

## AI 功能
- 通过 OpenAI **Responses API** + `web_search` 工具联网：`(openai as any).responses.create({ tools: [{ type: 'web_search' }], input })`（已封装为 `src/lib/ai.ts` 的 `runWebSearchJson`）。
- 联网工具正式名是 `web_search`（GA），**不是** `web_search_preview`（旧预览名，会 upstream 失败）。
- `OPENAI_MODEL` 必须是该 API 实际支持的有效模型名。

## ⚠️ 重要经验教训（务必遵守）

1. **字段一律以需求文档截图为准，绝不按数据库字段名臆测。**
   曾因把 schema 的 `initialSource` 臆测成"初聘需求方"、给客户造出文档里没有的"AI 公司介绍/对标"字段而大幅返工。新增或核对字段前，先看 `docs/spec/` 的文档截图（图较长时用 Python PIL 切块放大读清），不要凭字段名脑补。

2. **调外部服务 / API 失败时，先排查自己的用法（工具名、参数、API 形态逐一尝试）再下结论，不要草率判定"不支持"。**
   曾因工具名用错（`web_search_preview` 而非 `web_search`）就误判"不支持联网"，还想让用户去开通额外搜索服务。当用户基于实际使用经验坚持某能力可用时，**优先假设是自己用错了**，穷举排查。

3. 单次报错（尤其 `upstream_error`）≠ 整体能力不支持——若错误返回里已包含正常的对象结构，往往说明端点是通的、只是某个参数/工具名有问题，应继续排查而非否定。

4. **任何业务接口都必须后端独立鉴权，前端按权限隐藏入口只是 UX、不是安全边界。**
   code review 曾发现：用户/角色/部门管理接口只靠 middleware 登录态、缺 `requireAdmin`，任意登录用户可重置管理员密码提权；AI 接口、报表接口也一度只前端隐藏。新增接口先想"谁能调、能否越权拿到不该看的数据"再写守卫。新建跨资源聚合接口（如 reports）要显式 `select` 必要字段，别用裸 `findMany` 把 PII 全量返回。
