# Note di Diario & Scouting Azionario

Il modulo **Note** di TradeJournal è uno strumento a doppio binario progettato per accompagnare il trader sia nella fase di **pre-trading** (scouting e generazione di idee operative) sia nella fase di **post-trading** (diario psicologico e verifica della disciplina).

La schermata principale è suddivisa in due schede dedicate:
- **🎯 Scouting & Idee di Trading**: per monitorare titoli osservati durante lo screening, impostare livelli di prezzo trigger e ricevere alert automatici.
- **📓 Diario Giornaliero & Psicologia**: per registrare considerazioni generali di mercato, stati d'animo ed errori comportamentali tramite un editor rich-text WYSIWYG.

---

## 1. Scouting & Idee di Trading (Pre-Trading Intelligence)

Durante lo screening sui grafici o sui mercati azionari, capita spesso di individuare configurazioni tecniche promettenti (es. titoli con compressione di volatilità, rotture di livelli chiave o respinti da medie mobili come l'EMA 60) che non sono ancora pronte per un ingresso immediato.

La sezione **Scouting** consente di annotare queste idee e delegare al sistema il monitoraggio del prezzo.

![Panoramica Scouting](/docs/images/notes/scouting-overview.webp)
*Panoramica della dashboard di Scouting con i contatori KPI, filtri di stato e le card dei setup attivi.*

### Come creare una nuova Idea di Scouting

1. Clicca sul pulsante **+ Nuova Idea** in alto a destra.
2. Compila i parametri del setup:
   - **Simbolo / Ticker**: digita il simbolo dell'azione; un menu a discesa mostrerà i suggerimenti dei ticker ufficiali (es. *STM*, *ENI*, *PST*).
   - **Mercato**: mercato di quotazione (es. *Euronext Milan*, *NYSE*, *NASDAQ*).
   - **Direzione Setup**: seleziona **LONG** (rialzista) o **SHORT** (ribassista).
   - **Condizione Trigger**: scegli tra $\le$ (*Scende a o sotto*) o $\ge$ (*Sale a o sopra*).
   - **Prezzo Trigger (€)**: il prezzo esatto al quale vuoi essere avvisato del potenziale ingresso (es. `20.03 €`).
   - **Prezzo Attuale (€)**: opzionale; se lasciato vuoto, viene recuperato automaticamente dalle quotazioni in tempo reale.
   - **Stop Loss & Target Take Profit**: livelli stimati di uscita per il controllo preventivo del rischio.
   - **Tesi di Scouting & Setup Tecnico**: annota il razionale dell'analisi (es. *"Breakout della resistenza a 25€ con aumento dei volumi"* oppure *"Trend ribassista sotto EMA 60, attendere pullback prima dello short"*).
   - **Tag Setup**: etichette per filtrare i setup (es. `#breakout`, `#ema60`, `#pullback`).

![Nuova Idea di Scouting](/docs/images/notes/new-scouting-idea.webp)
*Finestra di inserimento rapido di un setup tecnico con condizioni di trigger e parametri di gestione del rischio.*

### Parametri di Scadenza e Stale (Configurabili)

Espandendo la sezione **Impostazioni Scadenza e Stale (Opzionali)** è possibile personalizzare la durata del setup:
- **Passa a Stale dopo (default: 7 giorni)**: se entro questo periodo il mercato non tocca il trigger, l'idea viene contrassegnata come *Stale*, ricordandoti di verificare se la tesi tecnica sia ancora valida.
- **Chiusura automatica dopo (default: 10 giorni)**: se dopo essere diventata *Stale* non viene rinnovata, l'idea viene archiviata automaticamente per non intasare l'area di lavoro con vecchie osservazioni.

---

## 2. Ciclo di Vita del Setup & Stati

Ogni idea di scouting segue un flusso di stati ben definito:

```
[In Osservazione] ──(Prezzo tocca soglia)──> [Trigger Raggiunto] ──(Click)──> [Convertito in Trade]
       │
 (Dopo 7 giorni)
       ▼
    [Stale] ───────(Rinnova +7gg)─────────> [In Osservazione]
       │
 (Dopo 10 giorni)
       ▼
   [Chiuso]
```

| Stato | Significato | Azioni Disponibili |
|---|---|---|
| **In Osservazione** | Il setup è attivo. Il backend confronta periodicamente il prezzo di mercato calcolando la distanza percentuale dal trigger. | Modifica setup, Visualizza grafico TradingView, Archivia. |
| **Trigger Raggiunto** | La quotazione ha toccato o oltrepassato il prezzo impostato. Viene evidenziato con bordo smeraldo e notificato nella barra superiore. | **⚡ Converti in Trade** (precompila il wizard). |
| **Stale** | Sono trascorsi 7 giorni senza che il trigger si sia attivato. Richiede una decisione da parte del trader. | **Rinnova (+7gg)** per prolungare l'osservazione, oppure **Archivia**. |
| **Convertito** | L'idea si è trasformata in un'operazione reale registrata nel journal. | Consultazione storico. |
| **Chiuso** | Il setup è stato annullato manualmente o rimosso automaticamente per inattività. | Eliminazione definitiva. |

---

## 3. Notifiche In-App & Alert Topbar

Quando un'azione in osservazione raggiunge il prezzo target, il sistema genera un avviso immediato:

1. **Badge Campanella**: l'icona della campanella presente nel Topbar (in alto a destra, accanto al pulsante *+ Trade*) mostra un badge numerico rosso lampeggiante con il conteggio dei setup pronti.
2. **Menu Alert Rapido**: cliccando sulla campanella, si apre un popover contenente la lista delle idee triggerate, con il prezzo rilevato e il pulsante rapido **⚡ Trade**.

![Menu Notifiche Alert](/docs/images/notes/alerts-dropdown.webp)
*Menu delle notifiche in-app nel Topbar con anteprima dei titoli pronti all'ingresso.*

---

## 4. Conversione One-Click in Trade Reale

Non appena un'idea raggiunge lo stato **Trigger Raggiunto**:
1. Clicca sul pulsante **⚡ Converti in Trade** (dalla card o dal menu della campanella).
2. Si apre immediatamente la finestra modale **Nuovo Trade** con i seguenti campi già compilati:
   - Simbolo del titolo e mercato
   - Direzione operativa (*Long* o *Short*)
   - Prezzo di ingresso stimato (il prezzo trigger)
   - Livelli di Stop Loss e Take Profit impostati durante lo scouting
3. È sufficiente selezionare il conto di trading desiderato, confermare la quantità ed eseguire.
4. Al completamento, l'idea di scouting passa automaticamente allo stato **Convertito** e viene collegata al trade creato.

---

## 5. Diario Giornaliero & Psicologia (Post-Trading Reflection)

La scheda **Diario Giornaliero** è lo spazio dedicato alla riflessione qualitativa e all'igiene psicologica del trader.

![Diario Giornaliero e Note](/docs/images/notes/daily-notes-journal.webp)
*Vista del Diario Giornaliero con editor rich-text WYSIWYG, indicatori di mood e tag di disciplina pre/post sessione.*

### Editor WYSIWYG integrato

Nel campo **Contenuto & Riflessioni**, la barra degli strumenti integrata consente di formattare il testo:
- **Testo**: Grassetto (**B**), Corsivo (*I*), Sottolineato (<u>U</u>), Barrato (~~S~~).
- **Titoli**: Struttura le note con sottotitoli **H3**, **H4** o paragrafi normali (**¶**).
- **Elenchi**: Liste puntate e numerate per checklist operative.
- **Blocchi Speciali**: Citazioni per massime ed errori da ricordare, o blocchi codice (`</>`).
- **Collegamenti**: Inserisci link a fonti esterne o grafici salvati.
- **A capo forzato**: Il testo lungo e i link complessi vanno a capo automaticamente (`overflow-wrap: anywhere`), garantendo che il layout rimanga ordinato e leggibile su qualsiasi schermo.

### Mood e Volatilità

Per ogni nota è possibile registrare:
- **Mood / Stato Emotivo**:
  - 🟢 **Positivo / Calmo**: decisioni lucide, rispetto dei piani.
  - 🔴 **Ansioso / Negativo**: stress, frustrazione, tendenza all'impulsività.
  - ⚪ **Neutro**: operatività standard senza particolari scossoni emotivi.
- **Volatilità di Mercato**: *Bassa*, *Media*, *Alta*.

### Checklist di Disciplina & Tag Comportamentali

Puoi assegnare rapidamente tag comportamentali per monitorare i tuoi pattern decisionali nel tempo:
- `Piano Rispettato`
- `Stop Loss Rispettato`
- `Target Raggiunto`
- `FOMO` (Fear Of Missing Out)
- `Overtrading`
- `Revenge Trading`
- `Uscita Anticipata`

I filtri in cima alla pagina permettono di isolare velocemente tutte le giornate contrassegnate da specifici tag comportamentali, facilitando le sessioni di revisione periodica.
