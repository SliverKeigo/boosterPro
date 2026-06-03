#!/usr/bin/env bash
#
# BoosterPro 一键部署脚本
# ─────────────────────────────────────────────────────────────────────────────
# 作用：在一台「什么都没装」的新机器上一条命令完成部署——
#   1) 缺 Node(20) / PostgreSQL 就自动安装并启动
#   2) 自动建数据库角色与库、配好密码登录
#   3) 自动生成 .env（随机 DB 密码 + 随机 JWT_SECRET）
#   4) npm 安装依赖 → Prisma 建表 → 灌入默认管理员 + 字典 → 同步序列
#   5) 生产构建，并注册 systemd 服务、开机自启
#
# 支持系统：Ubuntu/Debian(apt)、CentOS/RHEL/Rocky/Alma(dnf/yum)、macOS(brew)
#          （macOS 无 systemd，最后一步降级为「如何常驻」的提示）
#
# 用法（在项目根目录，用一个有 sudo 权限的普通用户运行；勿直接用 root 跑）：
#   bash deploy.sh
#
# 可用环境变量覆盖默认值：
#   DB_NAME(boosterpro) DB_USER(boosterpro) DB_PASS(随机) DB_HOST(127.0.0.1)
#   DB_PORT(5432) APP_PORT(3000) NODE_MAJOR(20)
#
# 远程数据库（优先复用）：脚本会先探测一个预置的远程 PostgreSQL，若可连则直接使用，
# 跳过「本地安装 PostgreSQL + 建角色/库/改 pg_hba」。可用环境变量覆盖：
#   REMOTE_DB_HOST REMOTE_DB_PORT REMOTE_DB_USER REMOTE_DB_NAME REMOTE_DB_PASSWORD
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

APP_NAME="boosterpro"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="${DB_NAME:-boosterpro}"
DB_USER="${DB_USER:-boosterpro}"
DB_PASS="${DB_PASS:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
APP_PORT="${APP_PORT:-3000}"
NODE_MAJOR="${NODE_MAJOR:-20}"

# ── 预置远程数据库连接参数（脚本顶部默认值，可被同名环境变量覆盖）──
# ⚠️ 安全提示：以下默认值（尤其 REMOTE_DB_PASSWORD）属于敏感凭据，仅为开箱即用的便利而内置。
#    生产环境请务必改用环境变量注入（如 export REMOTE_DB_PASSWORD=...），不要把真实口令写死在脚本里、
#    更不要随脚本一起提交到代码仓库或对外泄露；如已外泄请立即在数据库侧轮换该口令。
REMOTE_DB_HOST="${REMOTE_DB_HOST:-192.168.31.225}"
REMOTE_DB_PORT="${REMOTE_DB_PORT:-5432}"
REMOTE_DB_USER="${REMOTE_DB_USER:-booster_pro_dba}"
REMOTE_DB_NAME="${REMOTE_DB_NAME:-booster_pro_db}"
REMOTE_DB_PASSWORD="${REMOTE_DB_PASSWORD:-1aac814363863b6480dc4353736b53fa58a532bee752d003}"
USE_REMOTE_DB=0

c_b=$'\033[1;36m'; c_g=$'\033[1;32m'; c_y=$'\033[1;33m'; c_r=$'\033[1;31m'; c_0=$'\033[0m'
log()  { printf '\n%s==>%s %s\n' "$c_b" "$c_0" "$*"; }
ok()   { printf '%s  ✓%s %s\n' "$c_g" "$c_0" "$*"; }
warn() { printf '%s  !%s %s\n' "$c_y" "$c_0" "$*"; }
die()  { printf '%s  ✗ %s%s\n' "$c_r" "$*" "$c_0" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
randhex() { if have openssl; then openssl rand -hex "$1"; else LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c "$(( $1 * 2 ))"; fi; }

[ -f "$ROOT_DIR/package.json" ] && grep -q '"boosterpro"' "$ROOT_DIR/package.json" || die "请在 BoosterPro 项目根目录运行本脚本"

SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
RUN_USER="${SUDO_USER:-$(id -un)}"
# npm / 构建等以「人类用户」身份执行：即使整脚本被 sudo 跑，产物也归该用户，systemd 服务才读得到
run_user() { if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then sudo -u "$SUDO_USER" -H "$@"; else "$@"; fi; }

# ── 识别系统 / 包管理器 ──
OS=""; PKG=""
if [ "$(uname)" = "Darwin" ]; then OS="mac"; PKG="brew"
elif [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case " ${ID:-} ${ID_LIKE:-} " in
    *" debian "*|*" ubuntu "*) OS="debian"; PKG="apt" ;;
    *" rhel "*|*" fedora "*|*" centos "*|*" rocky "*|*" almalinux "*) OS="rhel"; PKG="dnf"; have dnf || PKG="yum" ;;
    *) [ "$(uname)" = "Linux" ] && { OS="debian"; PKG="apt"; warn "未精确识别发行版，按 Debian/apt 尝试"; } ;;
  esac
fi
[ -n "$OS" ] || die "无法识别系统（仅支持 Ubuntu/Debian、RHEL 系、macOS）"
log "系统=$OS  包管理器=$PKG  运行用户=$RUN_USER  目录=$ROOT_DIR"

pkg_install() {
  case "$PKG" in
    apt)  $SUDO apt-get update -y -qq; $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" ;;
    dnf)  $SUDO dnf install -y -q "$@" ;;
    yum)  $SUDO yum install -y -q "$@" ;;
    brew) brew install "$@" ;;
  esac
}

# 基础工具（curl 装 NodeSource 用）
have curl || { [ "$OS" = "mac" ] || pkg_install curl ca-certificates; }

# ═══ 1. Node.js ═══
need_node=1
if have node; then
  major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
  [ "${major:-0}" -ge 18 ] 2>/dev/null && { need_node=0; ok "Node 已安装：$(node -v)"; }
fi
if [ "$need_node" -eq 1 ]; then
  log "安装 Node ${NODE_MAJOR} ..."
  case "$OS" in
    debian) curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | $SUDO -E bash - >/dev/null; pkg_install nodejs ;;
    rhel)   curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | $SUDO bash - >/dev/null; pkg_install nodejs ;;
    mac)    have brew || die "请先安装 Homebrew：/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            brew install "node@${NODE_MAJOR}" || brew install node
            brew link --overwrite --force "node@${NODE_MAJOR}" 2>/dev/null || true ;;
  esac
  have node || die "Node 安装失败"
  ok "Node：$(node -v) / npm：$(npm -v)"
fi

# ═══ 1.5 优先探测预置的远程数据库（可连则复用，跳过本地 PostgreSQL）═══
# 找一个可用的 psql 客户端：PATH 里的 psql 优先；macOS 上再退而求其次找 libpq 自带的 psql。
find_psql_client() {
  if have psql; then command -v psql; return 0; fi
  if [ "$OS" = "mac" ]; then
    if [ -x /opt/homebrew/opt/libpq/bin/psql ]; then echo /opt/homebrew/opt/libpq/bin/psql; return 0; fi
    local lp; lp="$(brew --prefix libpq 2>/dev/null)/bin/psql"
    if [ -n "$lp" ] && [ -x "$lp" ]; then echo "$lp"; return 0; fi
  fi
  return 1
}

log "探测预置远程数据库（${REMOTE_DB_HOST}:${REMOTE_DB_PORT}/${REMOTE_DB_NAME}）..."
REMOTE_PSQL="$(find_psql_client || true)"
if [ -z "$REMOTE_PSQL" ]; then
  warn "未找到 psql 客户端，跳过远程探测，按本地 PostgreSQL 流程继续。"
elif PGPASSWORD="$REMOTE_DB_PASSWORD" "$REMOTE_PSQL" -h "$REMOTE_DB_HOST" -p "$REMOTE_DB_PORT" \
       -U "$REMOTE_DB_USER" -d "$REMOTE_DB_NAME" -tAc 'SELECT 1' >/dev/null 2>&1; then
  USE_REMOTE_DB=1
  # 复用远程库：把 DB_* 指向远程，使后续 .env 生成与「本机才建库」判断自然走远程分支
  DB_HOST="$REMOTE_DB_HOST"; DB_PORT="$REMOTE_DB_PORT"
  DB_USER="$REMOTE_DB_USER"; DB_NAME="$REMOTE_DB_NAME"; DB_PASS="$REMOTE_DB_PASSWORD"
  ok "检测到远程数据库 ${REMOTE_DB_NAME}，直接使用，跳过本地 PostgreSQL 安装与本地建库/改 pg_hba。"
else
  warn "远程数据库不可连（${REMOTE_DB_HOST}:${REMOTE_DB_PORT}），回退到本地 PostgreSQL 流程。"
fi

# ═══ 2. PostgreSQL ═══
if [ "$USE_REMOTE_DB" -eq 1 ]; then
  ok "已复用远程数据库，跳过本地 PostgreSQL 安装。"
else
if [ "$OS" = "mac" ]; then
  PG_PREFIX="$(brew --prefix postgresql@16 2>/dev/null || brew --prefix postgresql@15 2>/dev/null || brew --prefix postgresql 2>/dev/null || true)"
  [ -n "$PG_PREFIX" ] && export PATH="$PG_PREFIX/bin:$PATH"
fi
psql_super() { if [ "$OS" = "mac" ]; then psql -d postgres -v ON_ERROR_STOP=1 "$@"; else $SUDO -u postgres psql -v ON_ERROR_STOP=1 "$@"; fi; }

if have psql && { pg_isready -q 2>/dev/null || $SUDO -u postgres pg_isready -q 2>/dev/null; }; then
  ok "PostgreSQL 已安装并运行"
else
  log "安装 PostgreSQL ..."
  case "$OS" in
    debian) pkg_install postgresql postgresql-contrib; $SUDO systemctl enable --now postgresql ;;
    rhel)   pkg_install postgresql-server postgresql-contrib
            [ -s /var/lib/pgsql/data/PG_VERSION ] || $SUDO postgresql-setup --initdb 2>/dev/null || $SUDO /usr/bin/postgresql-setup initdb
            $SUDO systemctl enable --now postgresql ;;
    mac)    brew install postgresql@16 || brew install postgresql
            (brew services start postgresql@16 || brew services start postgresql) 2>/dev/null || true
            PG_PREFIX="$(brew --prefix postgresql@16 2>/dev/null || brew --prefix postgresql 2>/dev/null || true)"
            [ -n "$PG_PREFIX" ] && export PATH="$PG_PREFIX/bin:$PATH" ;;
  esac
  sleep 3
  ok "PostgreSQL 安装完成"
fi
fi

# ═══ 3. .env（不存在则生成；存在则沿用并解析其 DATABASE_URL）═══
ENV_FILE="$ROOT_DIR/.env"
if [ -f "$ENV_FILE" ] && grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  ok ".env 已存在，沿用其中配置"
  url="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')"
  nop="${url#*://}"
  if [[ "$nop" == *"@"* ]]; then cr="${nop%@*}"; rest="${nop##*@}"; DB_USER="${cr%%:*}"; DB_PASS="${cr#*:}"; else rest="$nop"; fi
  hp="${rest%%/*}"; DB_HOST="${hp%%:*}"; pp="${hp##*:}"; [ "$pp" != "$hp" ] && DB_PORT="$pp"
  dbp="${rest#*/}"; DB_NAME="${dbp%%\?*}"
else
  [ -n "$DB_PASS" ] || DB_PASS="$(randhex 16)"
  JWT_SECRET_VAL="$(randhex 32)"
  cat > "$ENV_FILE" <<EOF
# 由 deploy.sh 自动生成
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
JWT_SECRET="${JWT_SECRET_VAL}"
NEXT_PUBLIC_APP_NAME="BoosterPro"
UPLOAD_DIR="./uploads"
NODE_ENV="production"
# AI 功能：填入下面的 key 后重启服务即可启用（留空则仅 AI 相关接口不可用，其余正常）
OPENAI_API_KEY=""
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4o"
EOF
  [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && chown "$SUDO_USER" "$ENV_FILE"
  ok "已生成 .env（DB 密码与 JWT_SECRET 已随机生成）"
fi

# ═══ 4. 建角色 + 建库（仅当库在本机、且未复用远程库时）═══
if [ "$USE_REMOTE_DB" -eq 1 ]; then
  ok "已复用远程数据库 ${DB_NAME}，跳过本地建角色/建库/改 pg_hba。"
elif [ "$DB_HOST" = "127.0.0.1" ] || [ "$DB_HOST" = "localhost" ]; then
  log "配置数据库角色与库（${DB_USER} / ${DB_NAME}）..."
  if psql_super -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
    psql_super -c "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASS}';"
  else
    psql_super -c "CREATE ROLE \"${DB_USER}\" LOGIN PASSWORD '${DB_PASS}';"
  fi
  psql_super -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
    || psql_super -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";"
  psql_super -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\";"
  # PG15+ 下 public schema 默认不可写，确保 owner 为应用角色
  psql_super -d "${DB_NAME}" -c "ALTER SCHEMA public OWNER TO \"${DB_USER}\"; GRANT ALL ON SCHEMA public TO \"${DB_USER}\";" 2>/dev/null || true

  # 确保应用角色能用「密码」走 TCP 登录（RHEL 默认 ident 会拒绝）——把规则插到 pg_hba 最前
  if [ "$OS" != "mac" ]; then
    HBA="$($SUDO -u postgres psql -tAc 'SHOW hba_file' 2>/dev/null | tr -d '[:space:]' || true)"
    if [ -n "$HBA" ] && ! $SUDO grep -Eq "^[[:space:]]*host[[:space:]]+${DB_NAME}[[:space:]]+${DB_USER}[[:space:]]+127.0.0.1/32" "$HBA"; then
      tmp="$(mktemp)"
      { printf 'host %s %s 127.0.0.1/32 scram-sha-256\n' "$DB_NAME" "$DB_USER"
        printf 'host %s %s ::1/128 scram-sha-256\n' "$DB_NAME" "$DB_USER"
        $SUDO cat "$HBA"; } > "$tmp"
      $SUDO cp "$tmp" "$HBA"; rm -f "$tmp"
      $SUDO systemctl reload postgresql 2>/dev/null || $SUDO -u postgres pg_ctl reload 2>/dev/null || true
    fi
  fi
  ok "数据库就绪"
else
  warn "DATABASE_URL 指向远程库（${DB_HOST}），跳过本地建库——请确保该库可连。"
fi

# ═══ 5. 依赖 / 建表 / 种子 / 构建 ═══
cd "$ROOT_DIR"
log "安装依赖 ..."
if [ -f package-lock.json ]; then run_user npm ci; else run_user npm install; fi
ok "依赖安装完成"

log "生成 Prisma Client 并建表 ..."
run_user npx prisma generate >/dev/null
run_user npx prisma db push
ok "数据库表结构就绪"

log "灌入默认管理员 + 字典 ..."
run_user npm run db:seed
run_user npm run db:fix-sequences >/dev/null 2>&1 || true
ok "种子完成（管理员 admin / Admin@123456）"

run_user mkdir -p "$ROOT_DIR/uploads"

log "生产构建（next build，可能需要 1~3 分钟）..."
run_user npm run build
ok "构建完成"

# ═══ 6. 常驻运行 ═══
if [ "$OS" = "mac" ]; then
  log "部署完成（macOS 无 systemd，按下面任一方式常驻）"
  echo "  前台：  cd \"$ROOT_DIR\" && PORT=${APP_PORT} npm run start"
  echo "  守护：  npx pm2 start npm --name ${APP_NAME} -- run start && npx pm2 save && npx pm2 startup"
else
  log "注册 systemd 服务并开机自启 ..."
  NPM_BIN="$(command -v npm)"; NODE_DIR="$(dirname "$(command -v node)")"
  $SUDO tee "/etc/systemd/system/${APP_NAME}.service" >/dev/null <<EOF
[Unit]
Description=BoosterPro (Next.js)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${ROOT_DIR}
EnvironmentFile=${ROOT_DIR}/.env
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin
ExecStart=${NPM_BIN} run start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "${APP_NAME}" >/dev/null 2>&1 || true
  $SUDO systemctl restart "${APP_NAME}"
  sleep 3
  if $SUDO systemctl is-active --quiet "${APP_NAME}"; then
    ok "服务 ${APP_NAME} 已启动并设为开机自启"
  else
    warn "服务未能启动，请看日志：sudo journalctl -u ${APP_NAME} --no-pager -n 50"
  fi
fi

log "部署完成 🎉"
echo "  访问：    http://<本机IP>:${APP_PORT}"
echo "  管理员：  账号 admin   密码 Admin@123456   （登录后请尽快改密）"
[ "$OS" != "mac" ] && echo "  日志：    sudo journalctl -u ${APP_NAME} -f"
[ "$OS" != "mac" ] && echo "  重启：    sudo systemctl restart ${APP_NAME}"
echo "  AI 功能： 在 .env 填好 OPENAI_API_KEY 后重启服务即可启用"
