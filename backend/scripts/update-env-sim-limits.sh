#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Обновление .env: новые sim-лимиты + Free=2
# Идемпотентно — можно запускать многократно.
#
# Использование (на сервере):
#   bash backend/scripts/update-env-sim-limits.sh
# ═══════════════════════════════════════════════════════════════
set -e
ENV_FILE=/home/cupidon/cupidon/backend/.env

if [ ! -f "$ENV_FILE" ]; then
  echo "[error] $ENV_FILE не найден"
  exit 1
fi

add_if_missing() {
  local key=$1
  local val=$2
  if ! grep -q "^${key}=" "$ENV_FILE"; then
    echo "${key}=${val}" >> "$ENV_FILE"
    echo "  + ${key}=${val}"
  else
    echo "  = ${key} уже задан"
  fi
}

echo "[1/3] Добавляю sim-лимиты..."
add_if_missing FREE_DAILY_SIM_LIMIT 5
add_if_missing BASIC_DAILY_SIM_LIMIT 30
add_if_missing PREMIUM_DAILY_SIM_LIMIT 60
add_if_missing DAY_PASS_SIM_BONUS 50

echo ""
echo "[2/3] Снижаю Free до 2/день..."
sed -i 's/^FREE_DAILY_LIMIT=.*/FREE_DAILY_LIMIT=2/' "$ENV_FILE"
echo "  ok"

echo ""
echo "[3/3] Рестарт cupidon..."
systemctl restart cupidon
sleep 2
systemctl is-active cupidon && echo "  cupidon: active"

echo ""
echo "── Итоговая конфигурация ──"
grep -E '^(LIMITS_ENABLED|FREE_DAILY_LIMIT|BASIC_DAILY_LIMIT|PREMIUM_DAILY_LIMIT|FREE_DAILY_SIM_LIMIT|BASIC_DAILY_SIM_LIMIT|PREMIUM_DAILY_SIM_LIMIT|DAY_PASS_SIM_BONUS)=' "$ENV_FILE"

echo ""
echo "── Health ──"
curl -s https://cupidonai.ru/health
echo ""
