---
description: Regola residente per allineare l'ambiente Docker locale con i git worktree di Antigravity
globs: ["**/*"]
---

# Allineamento Docker e Git Worktree

Nel progetto `tradingjournal`, lo sviluppo locale avviene tramite container Docker (`docker-compose.yml`):
* **Frontend**: `http://localhost:15173` (container `tradingjournal-frontend-1`, porta interna 5173)
* **Backend API**: `http://localhost:18000` (container `tradingjournal-backend-1`, porta interna 8000)
* **Database**: PostgreSQL (container `tradingjournal-db-1`)

## Regole di Esecuzione per gli Agenti

1. **Gestione del file `.env`**:
   I git worktree (`~/.gemini/antigravity/worktrees/...`) non includono i file untracked come `.env`.
   All'inizio di una sessione o prima di eseguire comandi Docker nel worktree, verificare sempre che `.env` esista oppure eseguire:
   ```bash
   ./scripts/worktree-setup.sh
   ```

2. **Visibilità delle modifiche nel container locale dell'utente**:
   I container Docker in background montano le cartelle del codice tramite bind mount.
   Dopo aver modificato codice frontend o backend e **prima** di chiedere all'utente di verificare il risultato visivo nel browser (`http://localhost:15173`), l'agente deve assicurarsi che il container stia puntando al worktree attivo eseguendo:
   ```bash
   ./scripts/dev-worktree.sh
   ```
   Questo comando ricollega `frontend` e `backend` al worktree corrente in 1-2 secondi, senza riavviare né cancellare i dati del database PostgreSQL.

3. **In alternativa**:
   Se necessario specchiare le modifiche direttamente nella directory principale (`/Users/tosolini/Sites/tradingjournal`), utilizzare:
   ```bash
   ./scripts/worktree-sync.sh to-main
   ```
