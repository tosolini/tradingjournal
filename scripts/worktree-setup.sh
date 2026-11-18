#!/usr/bin/env bash
set -e

# Trova la radice del repository principale
GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || true)
if [ -z "$GIT_COMMON_DIR" ]; then
  echo "❌ Non siamo all'interno di un repository Git."
  exit 1
fi

MAIN_REPO_DIR=$(cd "$GIT_COMMON_DIR/.." && pwd)
CURRENT_DIR=$(pwd)

echo "🔍 Cartella corrente: $CURRENT_DIR"
echo "🔍 Repository principale: $MAIN_REPO_DIR"

# 1. Gestione .env
if [ -f "$CURRENT_DIR/.env" ]; then
  echo "ℹ️  .env già presente in questa cartella."
elif [ -f "$MAIN_REPO_DIR/.env" ]; then
  echo "🔗 Creazione symlink a .env da $MAIN_REPO_DIR..."
  ln -s "$MAIN_REPO_DIR/.env" "$CURRENT_DIR/.env"
  echo "✅ .env collegato con successo."
elif [ -f "$CURRENT_DIR/.env.example" ]; then
  echo "⚠️  .env non trovato nel main repo. Creazione da .env.example..."
  cp "$CURRENT_DIR/.env.example" "$CURRENT_DIR/.env"
  echo "✅ .env creato da .env.example."
fi

# 2. Verifica file per Docker
if [ ! -f "$CURRENT_DIR/docker-compose.yml" ]; then
  echo "⚠️  Attenzione: docker-compose.yml non trovato in $CURRENT_DIR."
else
  echo "✅ docker-compose.yml pronto per l'uso."
fi
