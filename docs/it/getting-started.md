# Guida introduttiva

Benvenuto in **TradeJournal**, il tuo diario di trading self-hosted avanzato per registrare operazioni, monitorare la disciplina operativa e analizzare le performance patrimoniali sui mercati finanziari.

---

## Primo accesso

Al primo accesso ti verranno richieste le credenziali. Se l'istanza è appena stata avviata, utilizza le credenziali predefinite fornite dall'amministratore (vedi sotto).

Un banner di benvenuto su **Impostazioni** ti guida nei 4 passi iniziali:

1. **Cambia le credenziali** — all'inizio l'istanza usa l'account amministratore predefinito. Imposta una tua email e una password robusta.
2. **Collega un broker** — crea il broker e i suoi mercati prima di aprire i conti.
3. **Crea un conto** — i conti rappresentano i portafogli in cui registri operazioni e movimenti di cassa.
4. **Inizia il diario** — registra la tua prima operazione con la procedura guidata **+ Nuova operazione**.

> ⚠️ **Account amministratore predefinito.** Al primo avvio il backend crea automaticamente un utente admin (`admin` / `password123`, configurabile con `SEED_ADMIN_*`). Cambia sempre queste credenziali al di fuori dello sviluppo locale. Con `ENVIRONMENT=production` il backend **rifiuta di avviarsi** con la password admin predefinita o con la `JWT_SECRET_KEY` di default.

---

## Configurazione iniziale consigliata

Segui questi passi prima di registrare la prima operazione.

### 1. Profilo e fuso orario

Vai su **Impostazioni → Account** e configura:

- **Fuso orario** — essenziale per il corretto funzionamento dell'orario di mercato nel calendario. Scegli la tua zona (es. `Europe/Rome` per l'Italia).
- **Email e password** — aggiorna le credenziali iniziali.

> ⚠️ Senza un fuso orario configurato, il calendario dei mercati non mostrerà correttamente gli orari delle sessioni.

### 2. Crea un Broker

Vai su **Broker** e crea almeno un broker con cui operi (es. Directa SIM, DEGIRO, Interactive Brokers).

Per ogni broker puoi:

- Impostare nome e sito web
- Configurare il piano commissionale (importo fisso o percentuale per ordine) e la valuta
- Impostare la **modalità di tassazione plusvalenze** (`Immediata` alla chiusura dell'operazione o `Fine anno`) e l'aliquota di ritenuta (default 26% per l'Italia)
- Aggiungere i **mercati/borse** abilitati per quel broker — per Directa SIM è disponibile un seed automatico con un clic

### 3. Crea un Conto

Vai su **Conti** e crea un conto di trading collegato al broker appena creato. Il conto rappresenta il portafoglio reale o simulato in cui registri le operazioni.

Ogni conto possiede un **libro cassa** integrato per registrare versamenti, prelievi e dividendi (vedi [Conti e Broker](accounts.md)).

### 4. Importa i Ticker

Vai su **Ticker** e importa il catalogo dei titoli negoziabili (ad es. scaricabile da Euronext). Questo abilita l'**autocompletamento istantaneo del simbolo** durante l'inserimento delle operazioni (vedi [Ticker](tickers.md)).

### 5. Crea la Prima Operazione

Clicca **+ Nuova operazione** nella barra laterale o premi `⌘K` per aprire la Command Palette e seleziona "Nuova Operazione" (vedi [Gestione Trade](trades.md)).

---

## Funzionalità Chiave dell'Interfaccia

### Command Palette Globale (`⌘K` / `Ctrl+K`)

In qualsiasi momento puoi premere la combinazione rapida **⌘K** (su Mac) o **Ctrl+K** (su Windows/Linux) oppure cliccare sul campo di ricerca nella barra superiore:

- Naviga istantaneamente verso qualunque sezione dell'applicazione
- Apri la modale per registrare una nuova operazione
- Cerca tra le pagine e i comandi con filtro in tempo reale
- Alterna rapidamente tra tema scuro (Dark) e tema chiaro (Light)

### Barra Superiore (Topbar) & Selettore Conto

La barra superiore è sempre visibile e include:

- **Selettore Conto Attivo**: passa al volo da un conto di trading all'altro o seleziona "Tutti i conti" per una vista globale. Il saldo disponibile del conto selezionato viene mostrato immediatamente.
- **Pulsante Nuova Operazione rapido**: accessibile ovunque.
- **Toggle Tema**: switch Dark/Light immediato senza ricaricare.
- **Menu Profilo**: accesso rapido a preferenze, impostazioni account, crediti dell'autore e logout.

### Navigazione Responsive Mobile

Su smartphone e tablet, l'interfaccia si adatta dinamicamente:
- La barra laterale si trasforma in un **drawer a scomparsa** azionabile dal pulsante menu in alto a sinistra.
- I grafici, il calendario e le tabelle supportano lo scorrimento orizzontale fluido e pulsanti compatti ottimizzati per il tocco.

### Scouting e Checklist di Disciplina Operativa (Note)

Nel modulo **Note** puoi gestire sia lo **Scouting & Idee di Trading** (monitorando azioni osservate con trigger automatici di prezzo e alert in-app) sia il **Diario Giornaliero** con editor rich-text e **Checklist Psicologica** pre/post-sessione per annotare se hai rispettato il piano di trading, prevenendo comportamenti dannosi come l'overtrading e il revenge trading.
---

## Struttura dell'Applicazione

| Sezione | Descrizione |
|---|---|
| **Dashboard** | Cruscotto analitico avanzato: PnL netto odierno/settimanale/mensile/totale, Win Rate, Expectancy, Payoff Ratio, Max Drawdown, Grafico a barre PnL periodico, Curva Equity e Card Best vs Worst Trade |
| **Calendario** | Calendario mensile unificato con PnL giornaliero color-coded, colonna PnL settimanale consolidato, cassetto dettaglio giorno e Gantt orari mercati globali in tempo reale |
| **Trade** | Registro storico operazioni con calcolatore Risk/Reward live, wizard guidato a 6 passi, inserimento rapido, paginazione tabellare e preset temporali |
| **Note** | Scouting & Idee di Trading con alert di prezzo automatici, conversione rapida in trade e Diario Giornaliero con editor rich-text e checklist psicologica |
| **Portfolio** | Monitoraggio posizioni azionarie, ETF e obbligazioni con mark-to-market e allocazione percentuale |
| **Performance** | Analisi avanzata del valore di portafoglio, drawdown e curva patrimoniale cumulata |
| **Assets** | Anagrafica strumenti finanziari gestiti (azioni, ETF, obbligazioni, crypto, materie prime) |
| **Conti** | Gestione conti di trading multi-valuta e libro cassa depositi/prelievi |
| **Broker** | Elenco broker con tariffe commissionali, regimi fiscali e borse collegate |
| **Ticker** | Archivio titoli e simboli con importazione CSV per autocompletamento |
| **Impostazioni** | Preferenze profilo utente, cambio password, selettore lingua, export/import JSON e orario snapshot di chiusura |
| **Guida** | Questo manuale interattivo completo in italiano e inglese |
