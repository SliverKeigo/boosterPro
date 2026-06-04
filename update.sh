#!/usr/bin/env bash
#
# BoosterPro 更新脚本（部署 CI 构建产物）
# ─────────────────────────────────────────────────────────────────────────────
# 作用：把 GitHub CI 构建好的产物（boosterpro-dist.tgz）部署到一台「已用 deploy.sh
#       初始化好环境」的服务器上——只做产物替换 + 重启，不装环境、不 build、不动数据库。
#
#   1) 停掉看门狗与主服务（避免替换产物时被看门狗拉起）
#   2) 备份当前 .next / node_modules（失败时自动回滚）
#   3) 解压新产物（覆盖 .next/node_modules/package.json/prisma/public/next.config.ts）
#      —— 不在归档内的文件一律不动：.env、uploads/ 等运行期数据完整保留
#   4) 重启服务 + 看门狗，轮询 /api/health 校验；启动失败自动回滚到旧产物
#
# 不做的事（与 deploy.sh 分工）：
#   · 不装 Node / PostgreSQL、不建库、不生成 .env —— 这些是 deploy.sh（初始化）的职责
#   · 不跑 next build —— 产物已由 CI 构建（本机/服务器架构差异由 CI 的 linux 产物消除）
#   · 不跑 prisma db push / seed —— CI 产物已 prune 掉 devDeps(tsx 等)，无法跑 seed；
#     数据库结构变更请在更新前/后手工执行（用 psql 或 npx prisma db execute）
#
# 用法（在服务器上，以 root 运行）：
#   bash update.sh /path/to/boosterpro-dist.tgz
#
# 可用环境变量覆盖默认值：
#   APP_DIR(/root/boosterPro) SERVICE(boosterpro) WATCHDOG(boosterpro-watchdog)
#   APP_PORT(3100) HEALTH_TIMEOUT(60) KEEP_BACKUP(0：成功后是否保留 .bak 备份)
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/boosterPro}"
SERVICE="${SERVICE:-boosterpro}"
WATCHDOG="${WATCHDOG:-${SERVICE}-watchdog}"
APP_PORT="${APP_PORT:-3100}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${APP_PORT}/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"   # 重启后等健康就绪的最长秒数
KEEP_BACKUP="${KEEP_BACKUP:-0}"          # 1=成功后保留 .bak 备份（默认清理）

c_b=$'\033[1;36m'; c_g=$'\033[1;32m'; c_y=$'\033[1;33m'; c_r=$'\033[1;31m'; c_0=$'\033[0m'
log()  { printf '\n%s==>%s %s\n' "$c_b" "$c_0" "$*"; }
ok()   { printf '%s  ✓%s %s\n' "$c_g" "$c_0" "$*"; }
warn() { printf '%s  !%s %s\n' "$c_y" "$c_0" "$*"; }
die()  { printf '%s  ✗ %s%s\n' "$c_r" "$*" "$c_0" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ── 参数：产物路径 ──
DIST="${1:-${DIST:-}}"
[ -n "$DIST" ] || die "用法：bash update.sh <boosterpro-dist.tgz>"
[ -f "$DIST" ] || die "产物文件不存在：$DIST"
DIST="$(cd "$(dirname "$DIST")" && pwd)/$(basename "$DIST")"   # 转绝对路径（后面会 cd）

# ── 前置校验 ──
have tar  || die "缺少 tar"
have curl || die "缺少 curl"
have systemctl || die "未找到 systemctl（update.sh 仅用于 systemd 部署；macOS 开发机请用 deploy.sh 的常驻方式）"
[ "$(id -u)" -eq 0 ] || die "请以 root 运行（需要停/启 systemd 服务并写入 $APP_DIR）"
[ -d "$APP_DIR" ] || die "应用目录不存在：$APP_DIR（请先用 deploy.sh 初始化环境）"

# 校验产物结构：必须含 .next / node_modules / package.json（容忍可选的 ./ 前缀）
log "校验产物 $DIST ..."
LIST="$(tar tzf "$DIST" 2>/dev/null | sed -E 's#^\./##' | cut -d/ -f1 | sort -u)" || die "产物不是合法的 .tgz"
for need in .next node_modules package.json; do
  printf '%s\n' "$LIST" | grep -qx "$need" || die "产物缺少 $need，疑似不是 BoosterPro CI 构建产物"
done
ok "产物结构校验通过（含 .next / node_modules / package.json）"

cd "$APP_DIR"
[ -f .env ] || die "$APP_DIR/.env 不存在（环境未初始化？请先跑 deploy.sh）"
OLD_BUILD_ID="$( [ -f .next/BUILD_ID ] && cat .next/BUILD_ID 2>/dev/null || echo '(无)' )"

# ── 健康轮询：HTTP 200 且 body 含 "status":"ok" 视为就绪 ──
wait_healthy() {
  local deadline=$(( SECONDS + HEALTH_TIMEOUT )) body
  while [ "$SECONDS" -lt "$deadline" ]; do
    body="$(curl -fsS -m 5 "$HEALTH_URL" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -q '"status":"ok"'; then
      printf '%s' "$body"; return 0
    fi
    sleep 2
  done
  return 1
}

# ── 回滚：删掉新产物、还原备份、重启 ──
BACKED_UP=0
rollback() {
  trap - ERR; set +e          # 关掉 set -e/ERR，避免回滚过程中再次触发自身
  warn "部署失败，开始回滚到旧产物 ..."
  systemctl stop "$SERVICE" 2>/dev/null
  rm -rf "$APP_DIR/.next" "$APP_DIR/node_modules"
  [ -d "$APP_DIR/.next.bak" ]        && mv "$APP_DIR/.next.bak"        "$APP_DIR/.next"
  [ -d "$APP_DIR/node_modules.bak" ] && mv "$APP_DIR/node_modules.bak" "$APP_DIR/node_modules"
  systemctl start "$SERVICE" 2>/dev/null
  systemctl start "$WATCHDOG" 2>/dev/null
  if [ -d "$APP_DIR/.next" ] && wait_healthy >/dev/null; then
    warn "已回滚到旧产物（BUILD_ID=$OLD_BUILD_ID），服务恢复。请排查新产物后重试。"
  else
    printf '%s  ✗ 回滚后服务仍未恢复，请手工排查：journalctl -u %s -n 80 --no-pager%s\n' "$c_r" "$SERVICE" "$c_0" >&2
  fi
  exit 1
}
fail_rollback() { warn "$*"; rollback; }   # 备份之后出错：报错并回滚

# ── 1) 停看门狗 + 主服务 ──
log "停止看门狗与主服务 ..."
systemctl stop "$WATCHDOG" 2>/dev/null || true   # 先停看门狗，否则替换产物期间它会把主服务拉起
systemctl stop "$SERVICE"  2>/dev/null || true
ok "已停止 $SERVICE / $WATCHDOG"

# 备份开始后，任何未预期的 set -e 失败都触发回滚
trap 'rc=$?; if [ "$rc" -ne 0 ] && [ "$BACKED_UP" -eq 1 ]; then rollback; fi' ERR

# ── 2) 备份旧产物 ──
log "备份当前 .next / node_modules ..."
rm -rf "$APP_DIR/.next.bak" "$APP_DIR/node_modules.bak"
if [ -d "$APP_DIR/.next" ];        then mv "$APP_DIR/.next"        "$APP_DIR/.next.bak"; fi
if [ -d "$APP_DIR/node_modules" ]; then mv "$APP_DIR/node_modules" "$APP_DIR/node_modules.bak"; fi
BACKED_UP=1
ok "已备份（.next.bak / node_modules.bak）"

# ── 3) 解压新产物 ──
log "解压新产物到 $APP_DIR ..."
tar xzf "$DIST" -C "$APP_DIR"
# 解压后基本结构校验（缺失则回滚）
[ -d "$APP_DIR/.next" ] && [ -f "$APP_DIR/.next/BUILD_ID" ] || fail_rollback "解压后缺少 .next/BUILD_ID"
[ -d "$APP_DIR/node_modules" ] || fail_rollback "解压后缺少 node_modules"
[ -f "$APP_DIR/.env" ] || fail_rollback "解压后 .env 丢失（异常）"
NEW_BUILD_ID="$(cat "$APP_DIR/.next/BUILD_ID" 2>/dev/null || echo '(无)')"
ok "解压完成（BUILD_ID：$OLD_BUILD_ID → $NEW_BUILD_ID）"

# ── 4) 重启 + 健康校验 ──
log "重启服务 ..."
systemctl start "$SERVICE"
if ! HEALTH_BODY="$(wait_healthy)"; then
  fail_rollback "服务在 ${HEALTH_TIMEOUT}s 内未通过健康检查"
fi
systemctl start "$WATCHDOG" 2>/dev/null || true
ok "服务已就绪：$HEALTH_BODY"

# 走到这里＝成功，撤掉 ERR 回滚陷阱
trap - ERR

# ── 5) 清理备份 ──
if [ "$KEEP_BACKUP" = "1" ]; then
  warn "已保留备份：$APP_DIR/.next.bak、$APP_DIR/node_modules.bak（KEEP_BACKUP=1）"
else
  rm -rf "$APP_DIR/.next.bak" "$APP_DIR/node_modules.bak"
  ok "已清理备份"
fi

log "更新完成 🎉"
echo "  产物：    $(basename "$DIST")"
echo "  BUILD_ID：$OLD_BUILD_ID → $NEW_BUILD_ID"
echo "  健康：    $HEALTH_BODY"
echo "  日志：    journalctl -u $SERVICE -f"
echo "  看门狗：  journalctl -u $WATCHDOG -f"
