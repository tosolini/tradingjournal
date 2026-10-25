# Calendario e Mercati

La sezione **Calendario** unisce la gestione visiva delle performance operative al monitoraggio in tempo reale dei mercati finanziari globali.

La vista si articola in due tab principali:

1. **Calendario** — il diario di trading mensile con PnL giornaliero, riepilogo settimanale ed esecuzioni
2. **Mercati** — diagramma di Gantt con lo stato di apertura e gli orari delle borse mondiali

---

## Tab Calendario (Diario di Trading)

Il calendario mensile offre una visualizzazione chiara e immediata dell'andamento operativo giorno per giorno e settimana per settimana.

### 1. Banner KPI Mensile

In cima al calendario, un pannello riepilogativo sintetizza le metriche del mese visualizzato:

- **PnL Totale Mese** — guadagno o perdita netta complessiva delle operazioni del mese
- **Win Rate %** — percentuale di giorni positivi rispetto al totale dei giorni con operatività
- **Giorni Win / Loss** — conteggio esatto dei giorni chiusi in profitto (W) e in perdita (L)
- **Esecuzioni Totali** — numero totale di ordini e riempimenti eseguiti nel mese

### 2. Celle Giornaliere & Badge PnL

Ciascuna casella del calendario rappresenta un giorno del mese:

- **Badge PnL prominente**: evidenzia il PnL netto realizzato nella giornata (sfondo verde smeraldo per guadagni, rosso per perdite) e la percentuale di rendimento giornaliero.
- **Chip Esecuzioni**: mostra i primi simboli negoziati nella giornata con etichetta dell'azione (`BUY`, `SELL`, `OPEN`, `CLOSE`).
- **Indicatore Note**: se nella giornata è presente una riflessione nel diario, viene mostrata l'icona con il numero di note registrate.
- **Interattività**: cliccando su una casella si apre istantaneamente il pannello **Dettaglio Giorno**.

### 3. Colonna Totale Settimana (PnL Settimanale)

Sulla destra del calendario (su schermi desktop) o come barra di riepilogo (su dispositivi mobili) è presente la **Colonna Settimanale**:

- **Numero Settimana ISO** (es. `Sett. 42 · W42`)
- **PnL Settimanale Consolidato** — somma algebrica di tutti i profitti e perdite registrati nella settimana
- **Rapporto W / L della Settimana** — giorni positivi e negativi (es. `4W · 1L`)
- **Conteggio Trade** — totale delle operazioni concluse nella settimana

### 4. Cassetto Dettaglio Giorno

Cliccando su un giorno qualsiasi, una finestra modale mostra:

- Data completa formattata con giorno della settimana
- PnL netto e percentuale della singola giornata
- Elenco dettagliato delle esecuzioni (simbolo, azione, quantità, prezzo, commissione, orario) con link al dettaglio del trade
- Elenco delle note giornaliere associate (con mood e tag di mercato), con pulsante rapido per aprire o aggiungere note

---

## Tab Mercati (Gantt)

Il Gantt dei mercati mostra in una finestra temporale scorrevole di **24 ore** (a partire dall'ora corrente) quali mercati sono aperti, stanno per aprire o sono chiusi.

### Come leggere il Gantt

Ogni riga rappresenta un mercato o exchange configurato nei tuoi broker. La barra orizzontale indica la **finestra di contrattazione**:

| Colore | Significato |
|---|---|
| **Verde (teal)** | Mercato **aperto** in questo momento |
| **Grigio (slate)** | Mercato **chiuso** in questo momento |
| **Rosa / rosso** | Mercato **chiuso oggi** (weekend o festività programmata) |

La linea verticale rossa indica l'**ora attuale** nel tuo fuso orario di riferimento.

### Fuso orario e Festività

- **Fuso orario**: gli orari vengono sincronizzati in base al fuso orario configurato nel tuo profilo (**Impostazioni → Account → Fuso orario**).
- **Chiusura weekend**: i mercati con l'opzione "Chiuso nel weekend" attiva vengono evidenziati come chiusi il sabato e la domenica.
- **Festivi globali**: Capodanno (1 gennaio), Ferragosto (15 agosto) e Natale (25 dicembre) sono gestiti automaticamente come festivi per i mercati azionari.
- **Aggiornamento continuo**: le barre avanzano in tempo reale senza dover ricaricare la pagina.

Per aggiungere o personalizzare gli exchange visualizzati nel Gantt, consulta la sezione [Conti e Broker](accounts.md).
