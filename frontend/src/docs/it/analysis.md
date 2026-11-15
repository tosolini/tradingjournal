# Analisi AI & Coaching Multi-Agente

Il modulo **Analisi AI** introduce un sistema avanzato di intelligenza artificiale dialettica e multi-agente ispirato alla metodologia di ricerca istituzionale di [TradingAgents](https://github.com/TauricResearch/TradingAgents).

Il sistema non esegue ordini a mercato, ma agisce come **consulente terzo imparziale e coach personale**, valutando ogni asset da più angolazioni contrapposte per eliminare bias emotivi, conferme premature o timori ingiustificati.

---

## 🏛️ L'Architettura del Dibattito Multi-Agente

Quando avvii un'analisi, diversi agenti specializzati collaborano e dibattono in parallelo:

```
                  ┌──────────────────────┐
                  │ Dati di Mercato Spot │
                  │ OHLCV, Multipli, DB  │
                  └──────────┬───────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Technical   │      │ Fundamental  │      │   Cyclical   │
│   Analyst    │      │ & Bond Analyst│     │   Analyst    │
│ (RSI, Trend) │      │ (PEG, Multipli)     │(Hurst, FFT)  │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       └─────────────────────┼─────────────────────┘
                             ▼
              ┌─────────────────────────────┐
              │  Dibattito Adversariale:    │
              │  Bull vs Bear Researcher    │
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │      Lead Researcher        │
              │  (Sintesi Istituzionale)    │
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │    Personal Trading Coach   │
              │  Score (1-10), Azioni, Bias │
              └─────────────────────────────┘
```

1. **Analisti di Primo Livello**:
   - **Technical Analyst**: calcola medie mobili (20, 50, 200), RSI, MACD, Bande di Bollinger, ATR, supporti e resistenze chiave.
   - **Fundamental / Bond Analyst**: analizza multipli azionari (P/E, Forward P/E, PEG ratio), margini, Free Cash Flow, consensus e target degli analisti di Wall Street; per i bond valuta rendimento a scadenza, cedole e durata residua.
   - **Cyclical Analyst**: calcola il **Hurst Exponent ($H$)** per determinare se il mercato è in trend persistente ($H > 0.55$) o mean-reverting ($H < 0.45$), e scompone i cicli temporali con FFT.
2. **Dibattito Adversariale (Bull vs Bear)**:
   - Il **Bull Researcher** evidenzia i catalizzatori di crescita e le ragioni per mantenere o incrementare.
   - Il **Bear Researcher** agisce da "avvocato del diavolo", scovando rischi nascosti, ipercomprato o debolezza di fondo.
3. **Sintesi della Commissione (Lead Researcher)**:
   - Pesa i due punti di vista formulando una raccomandazione ponderata.
4. **Personal Trading Coach**:
   - Assegna un punteggio sintetico da **1 a 10** e genera suggerimenti operativi concreti (revisione Stop Loss, trailing stop, take profit) e alert su bias emotivi (FOMO, overconfidence, panic selling).

---

## 🔍 Come Utilizzare l'Analisi AI

Nella sezione **Analisi AI** della barra laterale puoi operare in due modalità:

### 1. I Miei Asset & Trade
- Seleziona dal menu a tendina qualsiasi asset già presente nel tuo giornale:
  - ⚡ **Posizioni Azionarie Aperte (Trades)**: l'AI analizza la tua posizione specifica (prezzo medio di carico, PnL non realizzato, livello di Stop Loss e Take Profit impostato).
  - 📊 **Holdings di Portafoglio**: per monitorare ETF e Obbligazioni in portafoglio.
  - 💡 **Trade Ideas & Scouting**: per verificare la validità di un setup prima di entrare.

### 2. Cerca Qualsiasi Azione (Ticker Libero con Autocomplete)
- Inserisci un ticker o una denominazione aziendale (es. `NVDA`, `PLTR`, `Ferrari`, `ENI`).
- Il campo ricerca offre l'**autocomplete in tempo reale** collegato al database interno di borsa.
- Seleziona il mercato principale (`NASDAQ`, `NYSE`, `Euronext Milan`, `XETRA`, ecc.) e premi **🚀 Avvia Analisi Azionaria**.

---

## ⚡ Trasforma in Azione (Scouting o Nota)

Dall'intestazione del report generato, puoi convertire immediatamente le conclusioni dell'AI con il pulsante **`⚡ Trasforma in Azione`**:
1. **Idea di Scouting**: salva il titolo nella tua Watchlist con il prezzo trigger, lo Stop Loss (supporto tecnico) e il Target Price (consensus Wall Street) pre-compilati dall'AI.
2. **Nota di Trading**: registra le riflessioni nel diario giornaliero; include un editor **WYSIWYG** per rifinire il testo prima del salvataggio.
