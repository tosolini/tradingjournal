#!/usr/bin/env bash
set -e

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || true)
if [ -z "$GIT_COMMON_DIR" ]; then
  echo "❌ Non siamo in un repository Git."
  exit 1
fi

MAIN_REPO_DIR=$(cd "$GIT_COMMON_DIR/.." && pwd)
WORKTREE_DIR="$ROOT_DIR"

if [ "$MAIN_REPO_DIR" = "$WORKTREE_DIR" ]; then
  echo "ℹ️  Ti trovi già nel repository principale ($MAIN_REPO_DIR)."
  exit 0
fi

ACTION="${1:-status}"

EXCLUDES=(
  --exclude=".git"
  --exclude="node_modules"
  --exclude="__pycache__"
  --exclude=".venv"
  --exclude="media"
  --exclude="dist"
  --exclude=".env"
)

case "$ACTION" in
  to-main)
    echo "📤 Sincronizzazione da worktree ($WORKTREE_DIR) -> main ($MAIN_REPO_DIR)..."
    rsync -av --update "${EXCLUDES[@]}" "$WORKTREE_DIR/frontend/src/" "$MAIN_REPO_DIR/frontend/src/"
    rsync -av --update "${EXCLUDES[@]}" "$WORKTREE_DIR/backend/app/" "$MAIN_REPO_DIR/backend/app/"
    echo "✅ Sincronizzazione completata."
    ;;
  from-main)
    echo "📥 Sincronizzazione da main ($MAIN_REPO_DIR) -> worktree ($WORKTREE_DIR)..."
    rsync -av --update "${EXCLUDES[@]}" "$MAIN_REPO_DIR/frontend/src/" "$WORKTREE_DIR/frontend/src/"
    rsync -av --update "${EXCLUDES[@]}" "$MAIN_REPO_DIR/backend/app/" "$WORKTREE_DIR/backend/app/"
    echo "✅ Sincronizzazione completata."
    ;;
  status)
    echo "🔍 Differenze tra worktree ($WORKTREE_DIR) e main ($MAIN_REPO_DIR):"
    rsync -avun "${EXCLUDES[@]}" "$WORKTREE_DIR/frontend/src/" "$MAIN_REPO_DIR/frontend/src/" | grep -v "/$" || true
    rsync -avun "${EXCLUDES[@]}" "$WORKTREE_DIR/backend/app/" "$MAIN_REPO_DIR/backend/app/" | grep -v "/$" || true
    echo ""
    echo "Usa:"
    echo "  $0 to-main    # Copia le modifiche del worktree nel main repo"
    echo "  $0 from-main  # Copia le modifiche del main repo nel worktree"
    ;;
  *)
    echo "Uso: $0 [to-main|from-main|status]"
    exit 1
    ;;
esac
