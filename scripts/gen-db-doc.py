#!/usr/bin/env python3
"""
从 prisma/schema.prisma 生成数据库文档 docs/数据库文档.md。
用法：python3 scripts/gen-db-doc.py   （schema 变更后重跑即可，全量覆盖输出文件）
解析：model / enum、字段类型(@db.*)、可空、默认值、@map/@@map、唯一/索引、
     外键(@relation fields/references)、行尾 // 注释 → 字段说明。
"""

import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "prisma" / "schema.prisma"
OUT = ROOT / "docs" / "数据库文档.md"

# ── 模块分组与一句话用途（与侧边栏菜单同口径） ──────────────────────────────────
GROUPS = [
    ("组织与权限", ["User", "Department", "Group", "Role", "PermissionGroup",
                    "PermissionGroupMember", "DataGrant", "DepartmentHiddenResource"]),
    ("交付中心", ["Candidate", "CandidateGuaranteeCommunication", "CandidateRiskEvent",
                  "Requirement", "RequirementPositionProfile", "RequirementUrgentRecord",
                  "ClientSupplement", "SupplementDemandUpdate", "SupplementCustomerProfile",
                  "TalentPool", "WorkPlan", "WorkPlanItem", "WorkPlanAssignment"]),
    ("市场中心", ["Customer", "CustomerOfficeAddress", "CustomerContact", "CustomerContactPerson",
                  "Opportunity", "OpportunityProgress", "Contract", "ContractInvoice"]),
    ("公司通用", ["KnowledgeBase", "KnowledgeManagementRecord"]),
    ("系统配置", ["DictType", "DictItem", "AiPrompt"]),
]
DESC = {
    "User": "用户（登录账号、部门/组/角色归属、是否管理员）",
    "Department": "部门",
    "Group": "组（挂在部门之下，含组长；用于工作计划按组权限）",
    "Role": "角色（仅名称标签，功能权限走权限组）",
    "PermissionGroup": "权限组（资源 × 动作集 × 适用范围）",
    "PermissionGroupMember": "权限组成员（用户/部门/角色三选一挂接）",
    "DataGrant": "数据共享授权（用户/部门 → 用户/部门，查看或编辑）",
    "DepartmentHiddenResource": "部门数据定向隐藏（源部门 × 模块 × 目标部门 黑名单；默认全公司可见）",
    "Candidate": "候选人",
    "CandidateGuaranteeCommunication": "候选人-保证期沟通记录（子表）",
    "CandidateRiskEvent": "候选人-风险事件（子表）",
    "Requirement": "客户需求（招聘岗位）",
    "RequirementPositionProfile": "需求-岗位画像（子表）",
    "RequirementUrgentRecord": "需求-加急处理记录（子表）",
    "ClientSupplement": "客户补充信息",
    "SupplementDemandUpdate": "补充-需求更新（子表）",
    "SupplementCustomerProfile": "补充-客户画像（子表）",
    "TalentPool": "人才储备库",
    "WorkPlan": "周工作计划（组 × 周，每组每周一份）",
    "WorkPlanItem": "工作计划-明细行（按客户×岗位）",
    "WorkPlanAssignment": "工作计划-组员日期分配（矩阵格）",
    "Customer": "客户基本信息",
    "CustomerOfficeAddress": "客户-办公地址（子表）",
    "CustomerContact": "客户联系人信息（实例）",
    "CustomerContactPerson": "客户联系人-明细（子表）",
    "Opportunity": "商机",
    "OpportunityProgress": "商机-进度记录（子表）",
    "Contract": "销售合同",
    "ContractInvoice": "合同-发票（子表）",
    "KnowledgeBase": "公司知识库",
    "KnowledgeManagementRecord": "知识库-管理细则（子表）",
    "DictType": "字典类型（软枚举，菜单「字典管理」维护）",
    "DictItem": "字典项",
    "AiPrompt": "AI 提示词（按 key 存库，缺省回退内置默认值）",
}

# ── 解析 ──────────────────────────────────────────────────────────────────────
text = SCHEMA.read_text(encoding="utf-8")
lines = text.splitlines()

enums = {}   # name -> [values]
models = {}  # name -> dict(table, fields=[...], indexes=[...], note)
order = []   # model 出现顺序

i = 0
pending_comments = []
while i < len(lines):
    line = lines[i].strip()
    if line.startswith("//"):
        pending_comments.append(line.lstrip("/ "))
        i += 1
        continue
    m = re.match(r"^enum\s+(\w+)\s*\{", line)
    if m:
        name, vals = m.group(1), []
        i += 1
        while not lines[i].strip().startswith("}"):
            v = lines[i].strip()
            if v and not v.startswith("//"):
                vals.append(re.split(r"\s|//", v)[0])
            i += 1
        enums[name] = vals
        pending_comments = []
        i += 1
        continue
    m = re.match(r"^model\s+(\w+)\s*\{", line)
    if m:
        name = m.group(1)
        model = {"table": None, "fields": [], "indexes": [], "uniques": [],
                 "note": " ".join(pending_comments), "backrefs": []}
        pending_comments = []
        i += 1
        while not lines[i].strip().startswith("}"):
            raw = lines[i].rstrip()
            s = raw.strip()
            i += 1
            if not s or s.startswith("//"):
                continue
            mm = re.match(r"^@@map\(\"([^\"]+)\"\)", s)
            if mm:
                model["table"] = mm.group(1)
                continue
            if s.startswith("@@index"):
                model["indexes"].append(s)
                continue
            if s.startswith("@@unique"):
                model["uniques"].append(s)
                continue
            fm = re.match(r"^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$", s)
            if not fm:
                continue
            fname, ftype, is_list, opt, attrs = fm.groups()
            comment = ""
            if "//" in attrs:
                attrs, comment = attrs.split("//", 1)
                comment = comment.strip()
            model["fields"].append({
                "name": fname, "type": ftype, "list": bool(is_list),
                "optional": bool(opt), "attrs": attrs.strip(), "comment": comment,
            })
        models[name] = model
        order.append(name)
        i += 1
        continue
    pending_comments = []
    i += 1

SCALARS = {"String", "Int", "Float", "Decimal", "Boolean", "DateTime", "Json", "BigInt", "Bytes"}

def attr(field, name):
    m = re.search(name + r"\(((?:[^()]|\([^()]*\))*)\)", field["attrs"])
    return m.group(1) if m else None

def db_col(f):
    return attr(f, "@map").strip('"') if attr(f, "@map") else f["name"]

def db_type(f):
    t = f["type"]
    m = re.search(r"@db\.(\w+(?:\([^)]*\))?)", f["attrs"])
    if m:
        base = m.group(1)
        return base + "[]" if f["list"] else base
    if t in enums:
        return f"枚举 {t}"
    mapping = {"String": "Text", "Int": "Integer", "Boolean": "Boolean",
               "DateTime": "Timestamp", "Decimal": "Decimal", "Float": "Float", "Json": "Jsonb"}
    base = mapping.get(t, t)
    return f"{base.lower()}[]" if f["list"] else base

def fk_of(f):
    rel = attr(f, "@relation")
    if not rel:
        return None
    fm = re.search(r"fields:\s*\[(\w+)\]", rel)
    rm = re.search(r"references:\s*\[(\w+)\]", rel)
    if fm and rm:
        return (fm.group(1), f["type"], rm.group(1))  # (本表FK字段, 目标model, 目标列)
    return None

# 预收集：每个 model 的 FK 列说明 + 反向关系
fk_note = {}   # (model, fkfield) -> "外键 → 表.列"
for name, mo in models.items():
    for f in mo["fields"]:
        fk = fk_of(f)
        if fk:
            fkf, target, refcol = fk
            ttable = models[target]["table"] or target
            fk_note[(name, fkf)] = f"外键 → `{ttable}.{refcol}`"
            models[target]["backrefs"].append(f"{models[name]['table'] or name}.{fkf}")

# ── 输出 ──────────────────────────────────────────────────────────────────────
out = []
w = out.append
w("# BoosterPro 数据库文档")
w("")
w(f"> 由 `scripts/gen-db-doc.py` 从 `prisma/schema.prisma` 自动生成（{datetime.now().strftime('%Y-%m-%d %H:%M')}）。")
w("> schema 变更后重跑 `python3 scripts/gen-db-doc.py` 即可全量更新本文档；手写业务口径见 `docs/数据字典.md`。")
w("")
w("## 总览与约定")
w("")
w(f"- 共 **{len(models)} 张表**、**{len(enums)} 个数据库枚举**；仅使用 `public` schema（库内 `novel`/`真寻` 等为无关项目，勿动）。")
w("- 连接经 `@prisma/adapter-pg`（`src/lib/prisma.ts`）；结构变更走 `prisma db push` 或手工 `psql`（生产不自动迁移）。")
w("- 九大业务主表均含 `created_by_id`（数据行级归属 → `users`）与 `updated_by_id`；行级权限/部门可见性按 `created_by` 计算。")
w("- 软枚举（下拉可选值）不建数据库枚举，统一存 `dict_types`/`dict_items`，管理员在「字典管理」维护。")
w("")

w("## ER 关系图")
w("")
w("### 组织与权限")
w("")
ORG = set(GROUPS[0][1])
w("```mermaid")
w("erDiagram")
for name in order:
    if name not in ORG:
        continue
    for f in models[name]["fields"]:
        fk = fk_of(f)
        if fk and fk[1] in ORG:
            card = "}o--o|" if f["optional"] else "}o--||"
            w(f'  {name} {card} {fk[1]} : "{fk[0]}"')
w("```")
w("")
w("### 业务主表（省略 createdBy/updatedBy → users 的归属外键）")
w("")
BIZ = set(sum((g[1] for g in GROUPS[1:4]), []))
w("```mermaid")
w("erDiagram")
for name in order:
    if name not in BIZ:
        continue
    for f in models[name]["fields"]:
        fk = fk_of(f)
        if not fk:
            continue
        if fk[0] in ("createdById", "updatedById"):
            continue
        if fk[1] in BIZ or fk[1] in ("User", "Group", "Department"):
            card = "}o--o|" if f["optional"] else "}o--||"
            w(f'  {name} {card} {fk[1]} : "{fk[0]}"')
w("```")
w("")

w("## 数据库枚举")
w("")
w("| 枚举 | 取值 |")
w("| --- | --- |")
for name, vals in enums.items():
    w(f"| `{name}` | {' / '.join(vals)} |")
w("")

for gname, members in GROUPS:
    w(f"## {gname}")
    w("")
    for name in members:
        if name not in models:
            continue
        mo = models[name]
        table = mo["table"] or name
        w(f"### `{table}`（{name}）")
        w("")
        w(f"{DESC.get(name, '')}" + (f"　*{mo['note']}*" if mo["note"] else ""))
        w("")
        w("| 字段 | 数据库列 | 类型 | 可空 | 默认 | 说明 |")
        w("| --- | --- | --- | --- | --- | --- |")
        rel_lists = []
        for f in mo["fields"]:
            if f["type"] in models and not fk_of(f):
                rel_lists.append(f"`{f['name']}` → {models[f['type']]['table'] or f['type']}{'[]' if f['list'] else ''}")
                continue
            if f["type"] in models and fk_of(f):
                continue  # 关系对象本身不占列，FK 标量另列
            notes = []
            if "@id" in f["attrs"]:
                notes.append("主键")
            if "@unique" in f["attrs"]:
                notes.append("唯一")
            if "@updatedAt" in f["attrs"]:
                notes.append("保存时自动更新")
            if (name, f["name"]) in fk_note:
                notes.append(fk_note[(name, f["name"])])
            if f["comment"]:
                notes.append(f["comment"])
            default = attr(f, "@default") or ""
            default = {"autoincrement()": "自增", "now()": "当前时间"}.get(default, default)
            w(f"| `{f['name']}` | `{db_col(f)}` | {db_type(f)} | {'是' if f['optional'] else '否'} | {default} | {'；'.join(notes)} |")
        w("")
        extras = []
        if rel_lists:
            extras.append("**关联子表/反向关系**：" + "、".join(rel_lists))
        if mo["uniques"]:
            extras.append("**联合唯一**：`" + "`、`".join(mo["uniques"]) + "`")
        if mo["indexes"]:
            extras.append("**索引**：`" + "`、`".join(mo["indexes"]) + "`")
        for e in extras:
            w(e)
            w("")

OUT.write_text("\n".join(out), encoding="utf-8")
print(f"已生成 {OUT.relative_to(ROOT)}：{len(out)} 行，{len(models)} 表 / {len(enums)} 枚举")
