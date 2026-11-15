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

---

## ⚙️ Configurazione Provider LLM & Credenziali

Non è necessario modificare file di sistema o riavviare Docker per abilitare l'AI. Puoi configurare il tuo modello preferito direttamente dall'interfaccia:

1. Vai in **Impostazioni (`/settings`) -> Motore AI & Coaching (LLM)**.
2. Scegli il tuo provider preferito tra le card interattive:
   - **Google Gemini** *(Consigliato)*: chiavi gratuite/a consumo su [Google AI Studio](https://aistudio.google.com/app/apikey). Modello consigliato: `gemini-2.5-flash` o `gemini-1.5-pro`.
   - **OpenAI**: chiavi su [OpenAI Platform](https://platform.openai.com/api-keys). Modello consigliato: `gpt-4o` o `gpt-4o-mini`.
   - **Anthropic Claude**: chiavi su [Anthropic Console](https://console.anthropic.com/). Modello consigliato: `claude-3-5-sonnet-20241022`.
   - **Ollama (Locale / Self-Hosted)**: 100% privato e gratuito sul tuo computer. Modello consigliato: `llama3.3` o `deepseek-r1:8b`. Endpoint: `http://localhost:11434/v1` (o `http://host.docker.internal:11434/v1` in Docker).
   - **Simulazione (Mock)**: modalità dimostrativa offline senza API key né costi.
3. Inserisci la tua API Key (con tasto di visibilità 👁️).
4. Clicca su **🔌 Testa Connessione** per validare in tempo reale le credenziali e verificare la latenza di rete (ms).
5. Clicca su **💾 Salva configurazione AI**: le credenziali vengono memorizzate nelle preferenze utente nel tuo database protetto.

> **Nota per amministratori di sistema**: Se desideri impostare credenziali predefinite per l'intera istanza, consulta il file `.env.example` alle voci `ANALYSIS_LLM_PROVIDER`, `ANALYSIS_LLM_MODEL`, `ANALYSIS_API_KEY` e `ANALYSIS_BASE_URL`. Le preferenze personali dell'utente hanno sempre la precedenza sul file `.env`.
