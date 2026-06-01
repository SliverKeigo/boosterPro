<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BoosterPro 项目约定

猎头 / 招聘 CRM。技术栈：Next.js 16 + daisyUI（**不要再引入 Ant Design**）+ Prisma 7 + PostgreSQL + ECharts + OpenAI 兼容 API。详见 `README.md`，通用组件用法见 `src/components/ui/GUIDE.md`。

## 数据库
- 本项目只用 `public` schema（约 23 张表）。数据库内的 `novel` / `真寻` schema 是**其他无关项目**，忽略、勿删。
- Prisma 7：连接走 `src/lib/prisma.ts` 的 `@prisma/adapter-pg`（`schema.prisma` 的 datasource **不写 url**）。改完 schema 跑 `npx prisma generate`，dev server 需重启才会加载新 client。
- 字段完整说明见 `docs/数据字典.md`。

## 通用约定
- 列表页一律用 `BoostTable`，列定义需**覆盖该模型所有字段**（不常用的设 `defaultVisible:false`）。
- 列表 API 的 GET 返回**全量数据** `{ data, total }`，搜索 / 排序 / 分页由前端 BoostTable 负责。
- 文件字段用 `FileUpload`（上传到 `UPLOAD_DIR`，经 `/api/files/[name]` 下载）；富文本字段用 `RichText`；表单内的"子表 / 表中表"用 `SubTable`。

## AI 功能
- 通过 OpenAI **Responses API** + `web_search` 工具联网：`(openai as any).responses.create({ tools: [{ type: 'web_search' }], input })`。
- 联网工具正式名是 `web_search`（GA），**不是** `web_search_preview`（旧预览名，会 upstream 失败）。
- `OPENAI_MODEL` 必须是该 API 实际支持的有效模型名。

## ⚠️ 重要经验教训（务必遵守）

1. **字段一律以需求文档截图为准，绝不按数据库字段名臆测。**
   曾因把 schema 的 `initialSource` 臆测成"初聘需求方"、给客户造出文档里没有的"AI 公司介绍/对标"字段而大幅返工。新增或核对字段前，先看 `docs/spec/` 的文档截图（图较长时用 Python PIL 切块放大读清），不要凭字段名脑补。

2. **调外部服务 / API 失败时，先排查自己的用法（工具名、参数、API 形态逐一尝试）再下结论，不要草率判定"不支持"。**
   曾因工具名用错（`web_search_preview` 而非 `web_search`）就误判"不支持联网"，还想让用户去开通额外搜索服务。当用户基于实际使用经验坚持某能力可用时，**优先假设是自己用错了**，穷举排查。

3. 单次报错（尤其 `upstream_error`）≠ 整体能力不支持——若错误返回里已包含正常的对象结构，往往说明端点是通的、只是某个参数/工具名有问题，应继续排查而非否定。
