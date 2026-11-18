#!/usr/bin/env bash
set -e

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

cd "$ROOT_DIR"

# 1. Setup ambiente (.env)
"$SCRIPT_DIR/worktree-setup.sh"

CURRENT_DIR=$(pwd)
echo "🚀 Allineamento container Docker con il worktree attivo: $CURRENT_DIR"

# 2. Avvia DB se non attivo
if [ -z "$(docker compose ps -q db 2>/dev/null)" ] || [ -z "$(docker ps -q --filter "name=tradingjournal-db-1" 2>/dev/null)" ]; then
  echo "🐘 Avvio database PostgreSQL..."
  docker compose up -d db
fi

# 3. Ricollega i container frontend e backend al worktree corrente
echo "🔄 Re-binding volumi frontend e backend..."
APP_DIR="$CURRENT_DIR" docker compose up -d --no-deps frontend backend

echo "✨ Container allineati con successo al worktree!"
echo "🌐 Frontend: http://localhost:15173"
echo "🔌 Backend API: http://localhost:18000"
