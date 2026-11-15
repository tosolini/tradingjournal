# AI Analysis & Multi-Agent Coaching

The **AI Analysis** module introduces a sophisticated dialectical multi-agent framework inspired by institutional investment research and [TradingAgents](https://github.com/TauricResearch/TradingAgents).

The system does not execute live orders; instead, it acts as an **impartial third-party advisor and personal trading coach**, analyzing your positions from contradictory angles to challenge assumptions and neutralize cognitive biases.

---

## 🏛️ Multi-Agent Architecture & Adversarial Debate

When an analysis is triggered, specialized autonomous agents collaborate and debate in parallel:

```
                  ┌──────────────────────┐
                  │ Market Spot & Quotes │
                  │ OHLCV, Multiples, DB │
                  └──────────┬───────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Technical   │      │ Fundamental  │      │   Cyclical   │
│   Analyst    │      │ & Bond Analyst│     │   Analyst    │
│ (RSI, Trend) │      │ (PEG, Margin)│      │(Hurst, FFT)  │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       └─────────────────────┼─────────────────────┘
                             ▼
              ┌─────────────────────────────┐
              │     Adversarial Debate:     │
              │  Bull vs Bear Researcher    │
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │      Lead Researcher        │
              │   (Investment Synthesis)    │
              └──────────────┬──────────────┘
                             ▼
              ┌─────────────────────────────┐
              │    Personal Trading Coach   │
              │  Score (1-10), Actions, Bias│
              └─────────────────────────────┘
```

1. **Level-1 Domain Analysts**:
   - **Technical Analyst**: Computes moving averages (20, 50, 200), Wilder RSI, MACD, Bollinger Bands, ATR, key support, resistance, and trend alignment.
   - **Fundamental / Bond Analyst**: Evaluates equity valuation multiples (P/E, Forward P/E, PEG ratio), operating margins, Free Cash Flow, Wall Street consensus, and analyst price targets; for fixed income, evaluates yield to maturity, coupon schedule, and duration.
   - **Cyclical Analyst**: Calculates the **Hurst Exponent ($H$)** via R/S analysis to identify persistent trend regimes ($H > 0.55$) vs mean-reverting regimes ($H < 0.45$), complemented by FFT spectral harmonic extraction.
2. **Adversarial Debate (Bull vs Bear)**:
   - **Bull Researcher**: Pinpoints growth catalysts, earnings expansion, and operational edge.
   - **Bear Researcher**: Acts as devil's advocate, identifying overbought risks, valuation bubbles, and macroeconomic headwinds.
3. **Investment Committee Synthesis (Lead Researcher)**:
   - Synthesizes dialectical arguments into an impartial institutional thesis.
4. **Personal Trading Coach**:
   - Assigns a holistic score (**1 to 10**), highlights behavioral traps (FOMO, disposition effect, overtrading), and recommends actionable management steps (Stop Loss trailing, profit-taking, sizing).

---

## 🔍 How to Use AI Analysis

From the **Analisi AI** menu in the sidebar, choose between two modes:

### 1. Portfolio Assets & Active Trades
- Select from existing inventory:
  - ⚡ **Open Stock Positions (Trades)**: The AI coaches your live position (entry price, unrealized PnL, active Stop Loss, and Take Profit).
  - 📊 **Portfolio Holdings**: Monitor long-term ETFs and Bonds.
  - 💡 **Active Trade Ideas**: Validate setups before execution.

### 2. Arbitrary Stock Lookup (Free Ticker with Autocomplete)
- Search any global company or ticker (e.g., `NVDA`, `PLTR`, `Ferrari`, `ENI`).
- Integrated **real-time autocomplete** matches symbols and corporate names from the internal database.
- Select your primary exchange (`NASDAQ`, `NYSE`, `Euronext Milan`, `XETRA`, etc.) and start the analysis.

---

## ⚡ Transform into Action (Scouting Idea or Daily Note)

From the overview card of any analysis report, click **`⚡ Trasforma in Azione`**:
1. **Scouting Idea**: Save the stock to your Watchlist with pre-filled trigger prices, Stop Loss (technical support), Target Price (Wall Street consensus), and researcher thesis.
2. **Trading Note**: Add the reflection to your daily journal with emotion/mood sentiment and an integrated **WYSIWYG** rich text editor.

---

## ⚙️ LLM Provider & Credentials Setup

You do not need to edit system configuration files or restart Docker containers to enable AI coaching. Configure your preferred model directly from the UI:

1. Navigate to **Settings (`/settings`) -> AI Engine & Coaching (LLM)**.
2. Select your provider card:
   - **Google Gemini**: [Google AI Studio](https://aistudio.google.com/app/apikey).
   - **OpenAI**: [OpenAI Platform](https://platform.openai.com/api-keys).
   - **Anthropic Claude**: [Anthropic Console](https://console.anthropic.com/).
   - **OpenRouter**: unified gateway [OpenRouter.ai](https://openrouter.ai/keys) providing access to hundreds of AI models (DeepSeek, Llama, Claude, GPT, Gemini).
   - **Ollama (Local / Self-Hosted)**: 100% private and runs locally on your machine (default endpoint `http://localhost:11434/v1` or `http://host.docker.internal:11434/v1` in Docker).
   - **Simulation (Mock)**: Offline demonstration mode requiring no API key or costs.
3. Enter your exact model identifier (from your provider's documentation) and your API Key (with visibility toggle 👁️).
4. Click **🔌 Test Connection** to verify credentials and measure network latency (ms) in real-time.
5. Click **💾 Save AI Configuration**: Credentials are encrypted and stored in your user preferences in the local database.

> **System Administrators**: To configure server-wide fallback credentials, refer to `.env.example` under `ANALYSIS_LLM_PROVIDER`, `ANALYSIS_LLM_MODEL`, `ANALYSIS_API_KEY`, and `ANALYSIS_BASE_URL`. Personal user settings always take precedence over `.env` defaults.
