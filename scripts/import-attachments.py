#!/usr/bin/env python3
"""
Extract attachment files from Jodoo resource zips into ./uploads/
and write a JSON mapping for the TSX DB-update script.

Usage: python3 scripts/import-attachments.py
Run from project root (or anywhere — uses absolute paths).
"""

import json
import os
import re
import zipfile
import shutil
import pandas as pd

# ── Paths ────────────────────────────────────────────────────────────────────
SRC_DIR = (
    "/Users/keigo/Library/Containers/com.tencent.xinWeChat"
    "/Data/Documents/xwechat_files"
    "/wxid_uzoxl2u9mj1m22_33ed/msg/file/2026-06/测试数据"
)
DATA_DIR = "/tmp/booster-testdata"
PROJECT_ROOT = "/Users/keigo/Projects/boosterPro"
UPLOAD_DIR = os.path.join(PROJECT_ROOT, "uploads")
OUT_JSON = "/tmp/booster-testdata/attachments.json"

ZIPS = {
    "customer":     os.path.join(SRC_DIR, "客户基本信息表_20260607211850_resources_1.zip"),
    "requirement":  os.path.join(SRC_DIR, "招聘需求信息表_20260607213416_resources_1.zip"),
    "candidate":    os.path.join(SRC_DIR, "候选人推荐信息表_20260607212458_resources_1.zip"),
}

XLSX = {
    "customer":    os.path.join(DATA_DIR, "客户基本信息表_20260607211850", "客户基本信息表_20260607211850.xlsx"),
    "requirement": os.path.join(DATA_DIR, "招聘需求信息表_20260607213416", "招聘需求信息表_20260607213416.xlsx"),
    "candidate":   os.path.join(DATA_DIR, "候选人推荐信息表_20260607212458", "候选人推荐信息表_20260607212500.xlsx"),
}

os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Helpers ──────────────────────────────────────────────────────────────────

def load_zip_index(zip_path):
    """Return dict: finst_id → list of zip entry names under that folder."""
    index = {}
    with zipfile.ZipFile(zip_path, "r") as z:
        for name in z.namelist():
            # name looks like: "FINST-XYZ/附件/xxx/file.ext"
            # skip pure-directory entries (end with /)
            if name.endswith("/"):
                continue
            parts = name.split("/")
            finst = parts[0]  # top-level folder == FINST id
            index.setdefault(finst, []).append(name)
    return index


def resolve_finst(cell_value, zip_index):
    """
    Given a cell like "FINST-ABC/附件/xxx/file.pptx" or "FINST-ABC/附件/客户附件资料",
    return (finst_id, chosen_entry_name) or None if not found.
    """
    if not isinstance(cell_value, str) or not cell_value.startswith("FINST-"):
        return None
    parts = cell_value.split("/")
    finst_id = parts[0]
    entries = zip_index.get(finst_id)
    if not entries:
        return None, None
    # If cell path ends with a filename (has extension), prefer matching entry
    last_part = parts[-1]
    if "." in last_part:
        preferred = [e for e in entries if e.endswith(last_part)]
        if preferred:
            return finst_id, preferred[0]
    # Otherwise take first real file entry under that finst
    return finst_id, entries[0]


def ext_of(entry_name):
    _, ext = os.path.splitext(entry_name)
    return ext.lower()


# Keep a cache: (zip_path, entry_name) → safe output filename
# So the same FINST file is only copied once.
_copy_cache = {}   # (zip_path, entry_name) → "/api/files/<safename>"
_finst_counter = {}  # finst_first10 → counter for collision avoidance


def ensure_copied(zip_path, finst_id, entry_name):
    """Copy entry from zip to uploads/ (once), return /api/files/<name> URL."""
    key = (zip_path, entry_name)
    if key in _copy_cache:
        return _copy_cache[key]

    first10 = re.sub(r"[^A-Za-z0-9]", "", finst_id)[:10]
    n = _finst_counter.get(first10, 0)
    _finst_counter[first10] = n + 1
    ext = ext_of(entry_name)
    safename = f"imp_{first10}_{n}{ext}"
    dest = os.path.join(UPLOAD_DIR, safename)

    with zipfile.ZipFile(zip_path, "r") as z:
        with z.open(entry_name) as src_f, open(dest, "wb") as dst_f:
            shutil.copyfileobj(src_f, dst_f)

    url = f"/api/files/{safename}"
    _copy_cache[key] = url
    print(f"  Copied: {entry_name!r}  →  {safename}")
    return url


def cell_str(v):
    s = str(v).strip()
    return None if s in ("nan", "", "None") else s


# ── Build zip indexes ─────────────────────────────────────────────────────────
print("Loading zip indexes …")
zip_index = {k: load_zip_index(v) for k, v in ZIPS.items()}

# ── Results list ─────────────────────────────────────────────────────────────
mappings = []
skipped_finst = []   # (reason, cell_value)
skipped_record = []  # (reason, info)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. CUSTOMER xlsx  (col 0 = fullName, col 6 = attachment)
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Processing customers ===")
df = pd.read_excel(XLSX["customer"], sheet_name="数据", header=None, dtype=str)
for _, row in df.iloc[2:].iterrows():
    full_name = cell_str(row.iloc[0])
    attach_cell = cell_str(row.iloc[6])
    if not attach_cell:
        continue

    finst_id, entry = resolve_finst(attach_cell, zip_index["customer"])
    if not finst_id or not entry:
        skipped_finst.append(("customer: FINST not in zip", attach_cell))
        print(f"  SKIP (no zip entry): {attach_cell!r}")
        continue

    url = ensure_copied(ZIPS["customer"], finst_id, entry)
    mappings.append({
        "model": "customer",
        "matchName": full_name,
        "field": "attachmentUrl",
        "url": url,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 2. REQUIREMENT xlsx  (col 1 = positionName, col 9 = customerName, col 11 = attach)
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Processing requirements ===")
df2 = pd.read_excel(XLSX["requirement"], sheet_name="数据", header=None, dtype=str)

# De-dup: same (positionName, customerName) → only one mapping entry
seen_req = {}  # (positionName, customerName) → url  (already emitted)

for _, row in df2.iloc[2:].iterrows():
    pos_name = cell_str(row.iloc[1])
    cust_raw = cell_str(row.iloc[9])
    attach_cell = cell_str(row.iloc[11])
    if not attach_cell:
        continue

    # Strip "[FINST-...]" suffix from customer name
    cust_name = re.sub(r"\[FINST-[^\]]+\]", "", cust_raw or "").strip() if cust_raw else None

    dedup_key = (pos_name, cust_name)
    if dedup_key in seen_req:
        # Already have this mapping — don't emit a duplicate
        continue

    finst_id, entry = resolve_finst(attach_cell, zip_index["requirement"])
    if not finst_id or not entry:
        skipped_finst.append(("requirement: FINST not in zip", attach_cell))
        print(f"  SKIP (no zip entry): {attach_cell!r}")
        continue

    url = ensure_copied(ZIPS["requirement"], finst_id, entry)
    seen_req[dedup_key] = url
    mappings.append({
        "model": "requirement",
        "matchPositionName": pos_name,
        "matchCustomerName": cust_name,
        "field": "attachmentUrl",
        "url": url,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 3. CANDIDATE xlsx  (col 2 = name, col 12 = offer, col 13 = background)
# ═══════════════════════════════════════════════════════════════════════════════
print("\n=== Processing candidates ===")
df3 = pd.read_excel(XLSX["candidate"], sheet_name="数据", header=None, dtype=str)
for _, row in df3.iloc[2:].iterrows():
    cand_name = cell_str(row.iloc[2])
    offer_cell = cell_str(row.iloc[12])
    bg_cell = cell_str(row.iloc[13])

    for cell, field in [(offer_cell, "offerFileUrl"), (bg_cell, "backgroundCheckReportUrl")]:
        if not cell:
            continue
        finst_id, entry = resolve_finst(cell, zip_index["candidate"])
        if not finst_id or not entry:
            skipped_finst.append((f"candidate/{field}: FINST not in zip", cell))
            print(f"  SKIP (no zip entry): {cell!r}")
            continue
        url = ensure_copied(ZIPS["candidate"], finst_id, entry)
        mappings.append({
            "model": "candidate",
            "matchName": cand_name,
            "field": field,
            "url": url,
        })


# ── Write output ──────────────────────────────────────────────────────────────
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(mappings, f, ensure_ascii=False, indent=2)

print(f"\n=== Done ===")
print(f"Total mappings written: {len(mappings)}")
print(f"Files copied to uploads/: {len(_copy_cache)}")
print(f"FINSTs not matched in zip: {len(skipped_finst)}")
for reason, val in skipped_finst:
    print(f"  [{reason}] {val}")
print(f"\nJSON written to: {OUT_JSON}")
print("\nMappings preview:")
for m in mappings:
    print(f"  {m}")
