#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# BoosterPro 健康检查看门狗
#
# 定时探活 /api/health，连续失败 N 次则自动重启服务，专治 systemd
# Restart=always 救不了的「进程还在、但卡死/无响应」场景。
#
# 判活口径（liveness）：连接被拒 / 超时 / 非 2xx 计为失败；
# DB 异常【不】计失败（健康接口此时仍返回 200），避免数据库抖动引发「重启风暴」。
#
# 两种模式：
#   bash healthcheck.sh        常驻循环（默认，供 systemd 服务 boosterpro-watchdog）
#   bash healthcheck.sh once   单次探活（供 cron / 手动；失败计数落在状态文件）
#
# 可用环境变量（含默认值）：
#   HEALTH_URL=http://127.0.0.1:3000/api/health   探活地址
#   APP_SERVICE=boosterpro                          被重启的服务名（systemctl / pm2）
#   INTERVAL=30                                      循环模式探活间隔（秒）
#   FAIL_THRESHOLD=3                                 连续失败多少次才重启
#   CURL_TIMEOUT=5                                   单次 curl 超时（秒）
#   BOOT_GRACE=25                                    重启后等待启动的宽限（秒）
#   STATE_FILE=/tmp/boosterpro-health.fails          once 模式的失败计数文件
# ─────────────────────────────────────────────────────────────────────────────
set -u

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
APP_SERVICE="${APP_SERVICE:-boosterpro}"
INTERVAL="${INTERVAL:-30}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"
CURL_TIMEOUT="${CURL_TIMEOUT:-5}"
BOOT_GRACE="${BOOT_GRACE:-25}"
STATE_FILE="${STATE_FILE:-/tmp/boosterpro-health.fails}"

SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

log() { printf '%s [healthcheck] %s\n' "$(date '+%F %T')" "$*"; }

# 探活：返回 0=存活(HTTP 2xx)，非 0=失败（连接失败/超时/非 2xx）
probe() {
  local code rc
  code="$(curl -sS -o /dev/null -m "$CURL_TIMEOUT" -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)"
  rc=$?
  [ "$rc" -ne 0 ] && return 1
  [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 300 ] 2>/dev/null
}

restart_app() {
  log "连续 ${FAIL_THRESHOLD} 次探活失败 → 重启 ${APP_SERVICE}"
  if command -v systemctl >/dev/null 2>&1; then
    if $SUDO systemctl restart "$APP_SERVICE"; then
      log "已发起 systemctl restart ${APP_SERVICE}"
    else
      log "systemctl restart 失败（看门狗是否有权限？建议以 root 运行）"
    fi
  elif command -v pm2 >/dev/null 2>&1; then
    if pm2 restart "$APP_SERVICE"; then
      log "已发起 pm2 restart ${APP_SERVICE}"
    else
      log "pm2 restart 失败"
    fi
  else
    log "未找到 systemctl / pm2，无法自动重启（请人工介入）"
  fi
}

# ── 单次模式：cron / 手动 ──
if [ "${1:-}" = "once" ]; then
  if probe; then
    echo 0 >"$STATE_FILE" 2>/dev/null || true
    log "OK ${HEALTH_URL}"
    exit 0
  fi
  n=$(( $(cat "$STATE_FILE" 2>/dev/null || echo 0) + 1 ))
  echo "$n" >"$STATE_FILE" 2>/dev/null || true
  log "探活失败（累计 ${n}/${FAIL_THRESHOLD}）"
  if [ "$n" -ge "$FAIL_THRESHOLD" ]; then
    restart_app
    echo 0 >"$STATE_FILE" 2>/dev/null || true
  fi
  exit 0
fi

# ── 常驻循环模式（默认）──
log "看门狗启动：URL=${HEALTH_URL} 服务=${APP_SERVICE} 间隔=${INTERVAL}s 阈值=${FAIL_THRESHOLD} 超时=${CURL_TIMEOUT}s"
fails=0
while true; do
  if probe; then
    [ "$fails" -ne 0 ] && log "已恢复正常（此前连续失败 ${fails} 次）"
    fails=0
  else
    fails=$((fails + 1))
    log "探活失败（连续 ${fails}/${FAIL_THRESHOLD}）"
    if [ "$fails" -ge "$FAIL_THRESHOLD" ]; then
      restart_app
      fails=0
      sleep "$BOOT_GRACE"
    fi
  fi
  sleep "$INTERVAL"
done
