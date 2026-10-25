# Gestione Trade

Le operazioni (trade) sono il cuore di TradeJournal. Ogni acquisto o vendita viene registrato come un trade con tutti i dettagli necessari all'analisi approfondita delle performance. Commissioni e tassazione delle plusvalenze sono configurate per broker e applicate automaticamente a ogni calcolo.

---

## Creare una Nuova Operazione

Clicca sul pulsante **+ Nuova operazione** nella barra laterale o nella schermata Trade. La finestra modale offre una barra a schede superiore per passare istantaneamente tra due modalità:

- **✨ Procedura guidata (Wizard)** — la modalità consigliata, articolata in 6 passi sequenziali con validazione
- **⚡ Inserimento Rapido (Quick Trade)** — un modulo compatto a schermata singola per inserire rapidamente un'operazione completa

---

### La Procedura Guidata in 6 Passi

| Passo | Titolo | Cosa imposti |
|---|---|---|
| **1** | **Conto & Ticker** | Selezione del conto di trading e ricerca simbolo con autocompletamento in tempo reale |
| **2** | **Entry & Quantità** | Prezzo di acquisto e quantità (espressa in **quote/azioni** oppure per **controvalore monetario €**) con stima automatica delle commissioni del broker |
| **3** | **Direzione** | Posizione **Long** (rialzista) o **Short** (ribassista) |
| **4** | **Take Profit** | Obiettivo di profitto impostabile come **prezzo target** o **variazione percentuale %** con slider interattivo |
| **5** | **Stop Loss & R:R** | Livello di stop loss (prezzo o %) con visualizzazione in tempo reale del **misuratore Risk/Reward (R:R)** |
| **6** | **Esecuzione & Riepilogo** | Scelta del tipo di esecuzione (`Apertura`, `Parziale`, `Chiusura`), note operative e verifica finale prima del salvataggio |

---

### Calcolatore Risk / Reward (R:R) Live

Durante l'inserimento o la modifica dei livelli di Take Profit e Stop Loss (sia nel Wizard che nell'Inserimento Rapido), l'applicazione calcola istantaneamente il rapporto di rischio/rendimento:

- **Indicatore R:R Dinamico**: visualizza la proporzione esatta (es. `1 : 2.50`).
- **Codifica Cromatica di Disciplina**:
  - 🟢 **Verde (R:R ≥ 2.0)**: profilo asimmetrico favorevole ideale.
  - 🟡 **Ambra (1.0 ≤ R:R < 2.0)**: profilo accettabile ma con margine ridotto.
  - 🔴 **Rosso (R:R < 1.0)**: allarme rischio sfavorevole (il rischio assunto è superiore al guadagno potenziale).
- **Proiezioni Monetarie**: stima immediata del guadagno potenziale (€) e del rischio monetario massimo (€) calcolati sul controvalore della posizione al netto dei costi stimati.

---

### Autocompletamento del Simbolo

Se hai popolato l'archivio titoli (vedi [Ticker](tickers.md)), il campo ticker suggerisce istantaneamente i titoli corrispondenti mostrando simbolo, denominazione aziendale, codice ISIN e borsa di quotazione. È sempre possibile digitare qualsiasi ticker non presente a catalogo.

---

## Tabella delle Operazioni

La sezione **Trade** offre una panoramica tabellare avanzata per consultare, filtrare e revisionare lo storico operativo.

### 1. Preset di Data e Filtri Rapidi

In cima alla tabella sono presenti comandi di filtraggio avanzati:

- **Preset Temporali con Un Clic**:
  - `Tutti` — storico integrale
  - `Oggi` — operazioni della sessione odierna
  - `7 gg` — ultima settimana di calendario
  - `Questo Mese` — mese corrente
  - `YTD (Anno)` — dall'inizio dell'anno in corso ad oggi
- **Intervallo di Date Personalizzato**: selettori `Da` e `A` per isolare qualsiasi arco temporale specifico.
- **Filtro Esito (Outcome)**: possibilità di isolare al volo le operazioni chiuse in guadagno (`Win`) o in perdita (`Loss`).
- **Filtro Stato Operativo**: selezione tra `Tutti`, `Aperti`, `Parziali` e `Chiusi`.
- **Ricerca Testuale**: filtro in tempo reale per simbolo o note.

### 2. Paginazione Tabellare

Per garantire massima fluidità e leggibilità anche con migliaia di trade registrati:

- **Selettore Elementi per Pagina**: puoi scegliere di visualizzare `10`, `25`, `50` o `100` righe per volta.
- **Pannello di Navigazione**: frecce precedente/successivo, pulsanti numerati per salto diretto alla pagina e contatore puntuale delle righe visualizzate (es. `1-25 di 142 operazioni`).

### 3. Personalizzazione delle Colonne

Attraverso il menu delle colonne opzionali puoi personalizzare la tabella attivando o disattivando le seguenti voci (la configurazione scelta viene memorizzata nel browser):

- Prezzo medio di carico (Entry media) ed uscita (Exit media)
- Controvalore totale di ingresso e di uscita
- Quantità ancora aperta
- Durata a mercato (Holding time)
- Rendimento monetario e percentuale netto
- Livelli TP e SL (prezzo, variazione % e valore assoluto monetario)

### 4. Azioni Rapide di Riga

Su ciascuna riga della tabella sono disponibili azioni immediate:

- **👁️ Visualizza** — apre la pagina di dettaglio del trade
- **✏️ Modifica** — aggiorna i parametri operativi o i livelli di TP/SL
- **⚡ Chiusura Rapida** — pannello scorrevole per liquidare la posizione con prezzo di uscita, motivo (`Manuale`, `Take profit`, `Stop loss`) e calcolo immediato di PnL e imposte
- **🖼️ Immagini** — gestore screenshot per allegare grafici di analisi
- **🗑️ Elimina** — cancellazione sicura con richiesta di conferma

---

## Dettaglio Trade

Selezionando un'operazione si accede al fascicolo completo organizzato in schede:

- **Panoramica** — scheda riassuntiva con direzione, orizzonte temporale, controvalore, livelli target/stop e metriche di rendimento.
- **Grafico** — integrazione del grafico interattivo TradingView centrato sul ticker negoziato.
- **Tecnico** — indicatore sintetico oscillatori/medie mobili TradingView.
- **Chiusura** — modulo avanzato per registrare parziali o l'uscita definitiva dal mercato.
- **Esecuzioni** — registro cronologico di tutti i parziali (fill) eseguiti, con calcolo automatico delle commissioni del broker di riferimento.
- **Immagini & Grafici** — galleria di screenshot allegati con visualizzatore a tutto schermo e zoom.

### Monitoraggio Posizioni Aperte (Prezzi Real-Time)

Per le operazioni ancora a mercato, la scheda interroga le quotazioni correnti (via Yahoo Finance) fornendo:
- Prezzo battuto in tempo reale
- Valore di liquidazione teorico della posizione
- PnL latente (unrealized profit/loss) e rendimento percentuale aggiornato minuto per minuto.

### Consuntivo Operazioni Chiuse

Per i trade conclusi, il riepilogo finanziario include:
- Data/ora esatta e causale della chiusura
- PnL lordo realizzato
- Incidenza complessiva delle commissioni di negoziazione
- **PnL netto operativo**
- Regime fiscale applicato (amministrato/dichiarativo con aliquota) e stima della ritenuta fiscale sulle plusvalenze.
