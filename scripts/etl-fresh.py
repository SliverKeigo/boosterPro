#!/usr/bin/env python3
"""
全新环境迁移 ETL（一次性）：四模块 excel → 清洗 JSON + 附件解包到 uploads/。

输出（DATA_DIR=/tmp/booster-testdata）：
  customers.json / requirements.json / candidates.json  —— 在旧版基础上补 submitter + createdAt
  knowledge.json  —— 知识库（按 关键词+创建时间 分组；管理细则子表；内/外部讲师）
  attachments.json —— 四模块 FINST → /api/files/<name> 映射（文件已拷入项目 uploads/）

时间一律带 +08:00 后缀（excel 为北京时间，避免目标机时区漂移）。
"""

import glob
import json
import os
import re
import shutil
import zipfile

import pandas as pd

WX = (
    "/Users/keigo/Library/Containers/com.tencent.xinWeChat"
    "/Data/Documents/xwechat_files/wxid_uzoxl2u9mj1m22_33ed/msg/file/2026-06"
)
SRC_DIR = os.path.join(WX, "测试数据")
KB_OUTER_ZIP = os.path.join(WX, "公司知识库_20260529133954_resources_1 (2).zip")
DATA_DIR = "/tmp/booster-testdata"
KB_DIR = "/tmp/booster-kb"
UPLOAD_DIR = "/Users/keigo/Projects/boosterPro/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# ── 通用 ──────────────────────────────────────────────────────────────────────

def cell(row, i):
    if i >= len(row):
        return None
    v = row[i]
    if v is None or isinstance(v, float):
        return None
    s = str(v).strip()
    return s if s and s.lower() != "nan" else None

strip_finst = lambda s: re.sub(r"\s*\[FINST-[^\]]*\]", "", s).strip() if s else s

def dt8(s):
    """'2026-04-10 10:29:20' → '2026-04-10T10:29:20+08:00'（北京时区显式化）"""
    if not s:
        return None
    s = s.strip().replace("/", "-")
    if len(s) >= 19:
        return s[:19].replace(" ", "T") + "+08:00"
    if len(s) >= 10:
        return s[:10] + "T00:00:00+08:00"
    return None

def dateonly(s):
    if not s:
        return None
    s = s.strip().replace("/", "-")
    return s[:10] if len(s) >= 10 else None

EDU = {"本科": "BACHELOR", "硕士": "MASTER", "博士": "DOCTOR", "大专": "ASSOCIATE", "其他": "OTHER"}
TIER = {"985/211": "T985_211", "双一流": "GENERAL_FIRST", "普通": "GENERAL", "海外留学": "OVERSEAS"}
GENDER = {"男": "MALE", "女": "FEMALE", "不限": "ANY"}
RSTATUS = {"简历失败": "RESUME_FAILED", "简历(内推)失败": "INTERNAL_RESUME_FAILED",
           "约面失败": "INTERVIEW_SCHEDULE_FAILED", "面试失败": "INTERVIEW_FAILED",
           "谈薪失败": "SALARY_NEGO_FAILED", "offer失败": "OFFER_FAILED", "入职失败": "ONBOARD_FAILED",
           "未过保": "NOT_PASSED_GUARANTEE", "简历挂起（已面）": "RESIGNED_POST_GUARANTEE",
           "简历挂起（未面）": "RESIGNED_LOCAL", "已推荐，待反馈": "PENDING", "面试中": "INTERVIEWING",
           "谈薪中": "SALARY_NEGO", "Offer中": "OFFERING", "入职中": "ONBOARDING",
           "保证期": "GUARANTEE", "过保关闭": "POST_GUARANTEE_CLOSED"}

def addr_split(s):
    if not s:
        return ("其他", "—")
    p = [x for x in re.split(r"[/／]", s) if x]
    region = "/".join(p[:3]) if len(p) >= 1 else s
    detail = "/".join(p[3:]) if len(p) > 3 else (p[-1] if p else s)
    return (region or "其他", detail or region or "—")

def load(pat):
    f = sorted(glob.glob(os.path.join(DATA_DIR, pat)))[0]
    return pd.read_excel(f, sheet_name="数据", header=None, dtype=str)

# ── 附件：zip 索引 / FINST 解析 / 拷贝（沿用旧 import-attachments.py 的命名规则）──

ZIPS = {
    "customer": os.path.join(SRC_DIR, "客户基本信息表_20260607211850_resources_1.zip"),
    "requirement": os.path.join(SRC_DIR, "招聘需求信息表_20260607213416_resources_1.zip"),
    "candidate": os.path.join(SRC_DIR, "候选人推荐信息表_20260607212458_resources_1.zip"),
}

def load_zip_index(zip_path):
    index = {}
    with zipfile.ZipFile(zip_path, "r") as z:
        for name in z.namelist():
            if name.endswith("/"):
                continue
            index.setdefault(name.split("/")[0], []).append(name)
    return index

def resolve_finst(cell_value, zidx):
    if not isinstance(cell_value, str) or not cell_value.startswith("FINST-"):
        return None, None
    parts = cell_value.split("/")
    finst_id = parts[0]
    entries = zidx.get(finst_id)
    if not entries:
        return None, None
    last = parts[-1]
    if "." in last:
        preferred = [e for e in entries if e.endswith(last)]
        if preferred:
            return finst_id, preferred[0]
    return finst_id, entries[0]

_copy_cache = {}
_finst_counter = {}

def ensure_copied(zip_path, finst_id, entry_name):
    key = (zip_path, entry_name)
    if key in _copy_cache:
        return _copy_cache[key]
    first10 = re.sub(r"[^A-Za-z0-9]", "", finst_id)[:10]
    n = _finst_counter.get(first10, 0)
    _finst_counter[first10] = n + 1
    ext = os.path.splitext(entry_name)[1].lower()
    safename = f"imp_{first10}_{n}{ext}"
    dest = os.path.join(UPLOAD_DIR, safename)
    with zipfile.ZipFile(zip_path, "r") as z, z.open(entry_name) as s, open(dest, "wb") as d:
        shutil.copyfileobj(s, d)
    url = f"/api/files/{safename}"
    _copy_cache[key] = url
    return url

mappings = []
skipped = []

def attach_url(model, zip_path, zidx, cell_value):
    """FINST 单元格 → uploads URL；解析失败记 skipped 并返回 None。"""
    if not cell_value:
        return None
    finst, entry = resolve_finst(cell_value, zidx)
    if not finst or not entry:
        skipped.append((model, cell_value[:60]))
        return None
    return ensure_copied(zip_path, finst, entry)

# ═══ 1. 客户 ═════════════════════════════════════════════════════════════════
zidx_c = load_zip_index(ZIPS["customer"])
df = load("客户基本信息表*/*.xlsx")
cust = []
for _, r in df.iloc[2:].iterrows():
    r = list(r)
    name = cell(r, 0)
    if not name:
        continue
    region, detail = addr_split(cell(r, 4))
    ind = cell(r, 3)
    ind = ind.split(",")[0].split("，")[0] if ind else None
    url = attach_url("customer", ZIPS["customer"], zidx_c, cell(r, 6))
    cust.append({
        "fullName": name, "shortName": cell(r, 1) or name[:20], "industry": ind,
        "region": region, "detailedAddress": detail, "formerName": cell(r, 13),
        "openingSpeech": cell(r, 12), "benchmarkCompanies": cell(r, 8),
        "submitter": cell(r, 9), "createdAt": dt8(cell(r, 2)),
        "attachmentUrl": url,
    })
    if url:
        mappings.append({"model": "customer", "match": name, "url": url})

# ═══ 2. 需求 ═════════════════════════════════════════════════════════════════
zidx_r = load_zip_index(ZIPS["requirement"])
df = load("招聘需求信息表*/*.xlsx")
reqs, seen_req = [], set()
for _, r in df.iloc[2:].iterrows():
    r = list(r)
    pos = cell(r, 1)
    cusn = strip_finst(cell(r, 9))
    if not pos or not cusn:
        continue
    key = (cusn, pos)
    if key in seen_req:  # 子表展开的重复行只取首行
        continue
    seen_req.add(key)
    st = cell(r, 2)
    status = [x for x in re.split(r"[,，/、]", st) if x] if st else []
    hc = cell(r, 12)
    try:
        hc = int(float(hc)) if hc else 1
    except ValueError:
        hc = 1
    url = attach_url("requirement", ZIPS["requirement"], zidx_r, cell(r, 11))
    reqs.append({
        "customerName": cusn, "recruiter": strip_finst(cell(r, 0)), "positionName": pos,
        "headcount": hc, "monthlySalary": cell(r, 3), "annualSalary": cell(r, 13),
        "ageRange": cell(r, 14), "baseCity": cell(r, 4),
        "genderRequirement": GENDER.get(cell(r, 15)), "educationRequirement": cell(r, 31),
        "languageRequirement": cell(r, 32), "status": status, "jobDescription": cell(r, 16),
        "talentProfile": cell(r, 17), "projectExperience": cell(r, 24), "closeReason": cell(r, 27),
        "notes": cell(r, 18), "industry": (cell(r, 19) or "").split(",")[0] or None,
        "latestUpdate": cell(r, 10), "deadline": dateonly(cell(r, 33)),
        "submitter": cell(r, 5), "createdAt": dt8(cell(r, 7)),
        "attachmentUrl": url,
    })
    if url:
        mappings.append({"model": "requirement", "match": f"{cusn}|{pos}", "url": url})

# ═══ 3. 候选人 ═══════════════════════════════════════════════════════════════
zidx_k = load_zip_index(ZIPS["candidate"])
df = load("候选人推荐信息表*/*.xlsx")
cands, seen_cand = [], set()
for _, r in df.iloc[2:].iterrows():
    r = list(r)
    name = cell(r, 2)
    if not name:
        continue
    ck = (name, strip_finst(cell(r, 0)), strip_finst(cell(r, 1)))
    if ck in seen_cand:  # 保证期沟通/风险子表展开行
        continue
    seen_cand.add(ck)
    by = cell(r, 21)
    by = int(by[:4]) if by and re.match(r"^\d{4}", by) else None  # schema birthYear 为 Int(年份)
    offer = attach_url("candidate", ZIPS["candidate"], zidx_k, cell(r, 12))
    bg = attach_url("candidate", ZIPS["candidate"], zidx_k, cell(r, 13))
    cands.append({
        "customerShortName": strip_finst(cell(r, 0)), "positionName": strip_finst(cell(r, 1)),
        "name": name, "recommendationTime": dt8(cell(r, 3)),
        "recommendationStatus": RSTATUS.get(cell(r, 4), "PENDING"),
        "interviewProgress": cell(r, 6), "education": EDU.get(cell(r, 9)), "phone": cell(r, 10),
        "tags": cell(r, 11),
        # schoolTier 现为 String[]（院校层次多选）；excel 多选导出可能逗号分隔
        "schoolTier": [TIER[x.strip()] for x in re.split(r"[,，、/]", cell(r, 16) or "") if x.strip() in TIER],
        "guaranteePeriodEnd": dateonly(cell(r, 17)), "recruitmentParty": strip_finst(cell(r, 18)),
        "email": cell(r, 19), "notes": cell(r, 20), "birthYear": by, "salaryPlan": cell(r, 25),
        "recommendationReason": cell(r, 26), "failureReason": cell(r, 27),
        "submitter": cell(r, 5), "createdAt": dt8(cell(r, 7)),
        "offerFileUrl": offer, "backgroundCheckReportUrl": bg,
    })

# ═══ 4. 知识库 ═══════════════════════════════════════════════════════════════
# 外层 zip 内含 excel.zip + resources.zip，先解到 /tmp/booster-kb
os.makedirs(KB_DIR, exist_ok=True)
with zipfile.ZipFile(KB_OUTER_ZIP, "r") as z:
    z.extractall(KB_DIR)
kb_res_zip = glob.glob(os.path.join(KB_DIR, "*resources*.zip"))[0]
kb_xlsx_zip = glob.glob(os.path.join(KB_DIR, "*excel*.zip"))[0]
with zipfile.ZipFile(kb_xlsx_zip, "r") as z:
    z.extractall(os.path.join(KB_DIR, "excel"))
kb_xlsx = glob.glob(os.path.join(KB_DIR, "excel", "**", "*.xlsx"), recursive=True)[0]
zidx_kb = load_zip_index(kb_res_zip)

df = pd.read_excel(kb_xlsx, sheet_name="数据", header=None, dtype=str)
groups = {}  # (关键词, 创建时间) → 实例（保持首见顺序）
order = []
for _, r in df.iloc[2:].iterrows():
    r = list(r)
    kw = cell(r, 0)
    created = cell(r, 9)
    if not kw:
        continue
    gk = (kw, created)
    if gk not in groups:
        tags_raw = cell(r, 3)
        url = attach_url("knowledge", kb_res_zip, zidx_kb, cell(r, 4))
        groups[gk] = {
            "keywords": kw,
            "category": cell(r, 2) or "案例分享",
            "tags": [x for x in re.split(r"[,，/、;；\s]+", tags_raw) if x] if tags_raw else [],
            "fileUrl": url,
            "internalLecturer": cell(r, 5),
            "externalLecturer": cell(r, 6),
            "submitter": cell(r, 7),
            "createdAt": dt8(created),
            "trainingOutline": cell(r, 11),
            "records": [],
        }
        order.append(gk)
        if url:
            mappings.append({"model": "knowledge", "match": kw, "url": url})
    # 子表行（同组每行一条管理细则；主行子表列可能为空）
    sub_sub, sub_det, sub_date = cell(r, 12), cell(r, 13), cell(r, 14)
    if sub_sub or sub_det or sub_date:
        groups[gk]["records"].append({
            "submitter": sub_sub, "details": sub_det, "date": dateonly(sub_date),
        })
knowledge = [groups[k] for k in order]

# ── 输出 ──────────────────────────────────────────────────────────────────────
def dump(name, obj):
    with open(os.path.join(DATA_DIR, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)

dump("customers.json", cust)
dump("requirements.json", reqs)
dump("candidates.json", cands)
dump("knowledge.json", knowledge)
dump("attachments.json", mappings)

n_rec = sum(len(k["records"]) for k in knowledge)
print(f"客户={len(cust)}  需求={len(reqs)}  候选人={len(cands)}  知识库实例={len(knowledge)}(管理细则{n_rec}条)")
print(f"附件拷贝={len(_copy_cache)} 个文件 → uploads/   FINST 解析失败={len(skipped)}")
for m, v in skipped:
    print(f"  SKIP[{m}] {v}")
subs = sorted({x.get("submitter") for x in cust + reqs + cands + knowledge if x.get("submitter")})
print("提交人去重:", subs)
