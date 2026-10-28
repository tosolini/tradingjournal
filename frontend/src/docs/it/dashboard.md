# Dashboard, Performance e Portfolio

Questa sezione copre le tre viste di analisi: **Dashboard**, **Performance** e **Portfolio**.

---

## Dashboard

La pagina principale offre una sintesi operativa completa e avanzata dell'intero diario di trading, combinando le metriche statistiche dei trade chiusi, le posizioni aperte e il portafoglio investimenti.

![Panoramica Dashboard](/docs/images/dashboard/dashboard-overview.webp)
*Cruscotto analitico principale con Hero KPI di redditività, posizioni aperte, regime fiscale e curva del valore di portafoglio.*
### Dati principali (Hero KPI)

- **P&L Totale** — somma di P&L realizzato e mark-to-market delle posizioni aperte
- **P&L Realizzato** — guadagno/perdita netto consolidato da tutti i trade chiusi
- **P&L Questa Settimana** — profitto o perdita cumulato dal lunedì della settimana corrente
- **P&L Non Realizzato (MTM)** — stima in tempo reale del valore delle posizioni attualmente aperte
- **Win Rate** — percentuale di operazioni vincenti sul totale delle operazioni chiuse con indicazione del numero di vincite e perdite
- **Schede secondarie:** Trade totali, Posizioni aperte, Stima imposta plusvalenze e Compensazione minusvalenze

---

### Grafici e Pannelli Analitici

| Pannello | Contenuto e Funzionalità |
|---|---|
| **Curva patrimoniale** | Evoluzione del valore di portafoglio nel tempo (grafico ad area) con linea dei costi tratteggiata opzionale e selettore di intervallo temporale (**1M / 3M / 6M / 1A / TUTTO**). |
| **Grafico a ciambella (Outcomes)** | Distribuzione visiva tra vincite, perdite e pareggi con win rate % al centro; include Profit Factor, vincita media e perdita media. |
| **Statistiche Avanzate & Expectancy** | - **Expectancy**: valore atteso matematico per singolo trade: $(P_w \times \text{Avg Win}) - (P_l \times \text{Avg Loss})$, con indicatore dinamico **+ Edge** (verde) o **- Edge** (rosso).<br>- **Payoff Ratio (W/L)**: rapporto tra vincita media e perdita media.<br>- **Max Drawdown %**: perdita percentuale massima subita rispetto al picco storico (All-Time High).<br>- **Criterio di Kelly**: stima della frazione ottimale di allocazione del capitale per trade. |
| **Miglior e Peggior Trade** | Confronto visivo affiancato tra il trade più profittevole di sempre (🏆) e la peggiore perdita registrata (⚠️), con simbolo, direzione (LONG/SHORT), rendimento %, PnL netto e data di chiusura. |
| **P&L Periodico a Barre (Mese / Settimana)** | Grafico a barre interattivo con selettore **[ Mese \| Settimana ]**:<br>- **Mese**: P&L realizzato degli ultimi 12 mesi con conteggio trade.<br>- **Settimana**: P&L realizzato settimanale (es. S40, S41, S42) aggregato per settimana ISO.<br>- Passando il mouse su ogni barra, un hover tooltip evidenzia la data, il PnL e il numero di esecuzioni con contorno luminoso. |
| **P&L giornaliero complessivo** | P&L giornaliero degli ultimi 30 giorni che copre sia i trade che i movimenti di portafoglio, con hover tooltip reattivo e totale cumulato. |
| **Allocazione asset** | Valore di mercato per singolo simbolo con barre % di peso sul portafoglio e suddivisione per classe di strumento (Azioni, ETF, Obbligazioni, Fondi). |
| **Top trade** | Tabella con le operazioni più rilevanti: simbolo, direzione, stato, data di chiusura, rendimento % e P&L netto. |

Il timestamp `Aggiornato` in alto riflette la data dell'ultimo snapshot registrato. La valuta segue le impostazioni di lingua e conto.

---

## Performance

Analisi approfondita dell'evoluzione del capitale nel tempo, basata sugli snapshot giornalieri storicizzati dal sistema.

- **KPI:** Valore del portafoglio, P&L cumulato, Miglior giorno, Peggior giorno
- **Curva patrimoniale** — valore del portafoglio dagli snapshot giornalieri (grafico ad area interattivo)
- **Barre P&L giornaliero** — ultimi 30 giorni, con indicazione della percentuale di giorni positivi
- **Griglia calendario mensile** — giorni colorati (verde = positivo, rosso = negativo); clicca su qualsiasi giorno per aprire il cassetto di dettaglio con valore totale, P&L giornaliero e P&L cumulato

> ℹ️ I dati di Performance provengono dal **job di snapshot giornaliero** (vedi Impostazioni → Snapshot Giornalieri). Se non esistono ancora snapshot, puoi utilizzare il ricalcolo manuale (`POST /api/snapshots/recompute` e `/api/snapshots/portfolio/recompute`) per ripopolare le date passate.

---

## Portfolio

Monitora le posizioni in **ETF, obbligazioni e fondi** separatamente dai trade speculativi, con valutazione mark-to-market automatica.

![Gestione Portafoglio e Obbligazioni](/docs/images/dashboard/portfolio-holdings.webp)
*Modulo Portfolio con sezione Obbligazioni & Rendite, indicatori di YTM netto, stima cedole annue e scadenziario flussi futuri.*
- **KPI:** Valore totale, Costo totale, Rendimento totale, Rendimento %
- **Storico portafoglio** — grafico dell'evoluzione del valore nel tempo
- **Tabella posizioni:** simbolo, nome, tipo strumento, quantità, costo medio, date di ingresso/uscita, durata di detenzione, **prezzo corrente** (aggiornato via Yahoo Finance), valore di mercato, rendimento monetario e rendimento percentuale; opzioni di **modifica** ed **eliminazione** per ciascuna riga
- **Aggiungi / Modifica posizione:** conto associato, strumento (asset), quantità, costo medio, date di ingresso ed eventuale uscita

Le posizioni sono automaticamente incluse negli snapshot giornalieri di portafoglio, nella curva patrimoniale e nel calcolo del P&L complessivo della Dashboard.
