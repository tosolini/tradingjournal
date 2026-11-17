# Managing Trades

Trades are the core of TradeJournal. Every buy or sell operation is recorded as a trade with all the details needed for in-depth performance analysis. Broker commissions and capital-gain tax rules are configured per broker and automatically applied to every calculation.

---

## Creating a New Trade

Click **+ New Trade** in the sidebar or in the Trades view. The modal provides a segmented top tab bar to switch instantly between two input modes:

- **✨ Wizard Mode** — the recommended 6-step guided workflow with input validation
- **⚡ Quick Trade** — a single compact form for lightning-fast order entry

---

### The 6-Step Wizard

| Step | Title | What you configure |
|---|---|---|
| **1** | **Account & Ticker** | Select the trading account and search for the symbol with real-time autocomplete suggestions |
| **2** | **Entry & Size** | Entry price and position size (specified either in **shares/units** or by **notional currency value €**) with automatic broker fee estimation |
| **3** | **Direction** | **Long** (bullish) or **Short** (bearish) order orientation |
| **4** | **Take Profit** | Profit target specified as a **target price** or **percentage offset %** with interactive slider controls |
| **5** | **Stop Loss & R:R** | Stop loss level (price or %) featuring a real-time **Risk/Reward (R:R) Gauge** |
| **6** | **Execution & Summary** | Execution type (`Open`, `Partial`, `Close`), strategy notes, and complete verification before saving |

---

### Live Risk / Reward (R:R) Calculator

While setting or adjusting your Take Profit and Stop Loss levels (in both Wizard and Quick Trade modes), the application dynamically calculates your risk/reward ratio:

- **Dynamic R:R Ratio Badge**: Displays the exact risk-to-reward ratio (e.g. `1 : 2.50`).
- **Discipline Color-Coding**:
  - 🟢 **Emerald Green (R:R ≥ 2.0)**: Ideal asymmetric risk/reward profile.
  - 🟡 **Amber (1.0 ≤ R:R < 2.0)**: Acceptable profile with reduced safety margin.
  - 🔴 **Rose Red (R:R < 1.0)**: Negative risk warning (potential risk exceeds projected gain).
- **Monetary Projections**: Instant projections of potential profit (€) and maximum financial risk (€) calculated on position notional value net of estimated trading costs.

---

### Symbol Autocomplete

When the ticker database is populated (see [Tickers](tickers.md)), the symbol input suggests matches instantly showing ticker symbol, company name, ISIN code, and exchange. You can always type any ticker manually even if it is not in the database.

---

## Trades Table

The **Trades** section provides an advanced tabular view for exploring, filtering, and auditing your trading history.

### Exit Target Price Alerts (Take Profit & Stop Loss Hit)

When an active open trade touches or crosses its configured Take Profit or Stop Loss price level:
- **Prominent Top Alert Banner**: an alert banner appears at the top of the page detailing the number of triggered positions, complete with quick-filter pills to immediately isolate the symbol in the table.
- **Pulsing Row Badges**: the symbol column displays an animated pulsing badge (`🎯 TP` or `🛑 SL`), immediately highlighting positions requiring management (e.g. partial exit, stop trailing, or full close).

### 1. Date Presets and Fast Filtering

At the top of the table, quick filter controls let you zero in on specific trades:

- **One-Click Date Presets**:
  - `All` — complete trading ledger
  - `Today` — current trading session
  - `7 Days` — past calendar week
  - `This Month` — current calendar month
  - `YTD (Year-to-Date)` — from January 1st of the current year to today
- **Custom Date Range**: `From` and `To` date pickers for custom timeframes.
- **Outcome Filter**: Filter closed trades instantly between profitable (`Win`) and losing (`Loss`) trades.
- **Trade Status Filter**: Filter between `All`, `Open`, `Partial`, and `Closed`.
- **Search Query**: Real-time keyword search across symbols, notes, and brokers.

### 2. Table Pagination

To ensure snappy performance and readability when managing large portfolios:

- **Page Size Selector**: Switch between `10`, `25`, `50`, or `100` trades per page.
- **Navigation Controls**: Previous/next page buttons, direct page jump buttons, and active record range indicator (e.g. `1-25 of 142 trades`).

### 3. Column Visibility Customization

Through the optional columns menu, you can toggle columns on or off (your configuration is automatically saved in browser storage):

- Weighted average entry price and exit price
- Total entry notional value and total exit notional value
- Open quantity remaining
- Holding duration
- Net monetary return and percentage return
- Target (TP) and Stop (SL) levels (price, percentage, and absolute monetary risk/reward)

### 4. Row Action Shortcuts

Each table row offers one-click action icons:

- **👁️ View** — opens the full trade dossier and analytics
- **✏️ Edit** — update trade parameters or TP/SL levels
- **⚡ Quick Close** — slide-out drawer to liquidate the position with exit price, exit reason (`Manual`, `Take profit`, `Stop loss`), and instant PnL & tax estimation
- **🖼️ Images** — screenshot gallery manager to attach charts and trade annotations
- **🗑️ Delete** — secure deletion with confirmation dialog

---

## Trade Detail Dossier

Selecting any trade opens a comprehensive dossier organized into a three-pillar financial header and dedicated operational tabs:

### 3-Card Financial Cockpit
The trade card header is structured into three high-visibility functional cards:
1. **Position & Basis**:
   - **Average Entry Price / Cost Basis (PMC)** prominently featured as the hero metric, accompanied by a multi-entry count badge (e.g., `2 entries`).
   - Reference **1st Entry** price to easily benchmark subsequent scale-in tranches against the initial fill.
   - Open quantity, total invested capital, cumulative commissions incurred, and holding duration.
2. **Market & PnL**:
   - Real-time market quote with **percentage delta vs Average Cost**.
   - Unrealized PnL and current market value for open positions, or consolidated net and gross realized PnL for closed trades.
3. **Target & Risk**:
   - Take Profit and Stop Loss levels with percentage distances.
   - Realized/potential **Risk/Reward ratio** with a visual color-coded bar gauge.
   - Collapsible panel to inspect secondary metadata (trading account, broker, operational notes, timeframe).

---

### Operational Tabs

- **Overview** — executive summary with direction, holding duration, position value, target/stop levels, and return metrics.
- **Chart** — interactive TradingView charting container centered on the traded instrument.
- **Technical** — TradingView technical analysis summary widget (oscillators and moving averages).
- **Close** — advanced close form to log partial scale-outs or final market exit.
- **Executions** — chronological ledger of all order fills:
  - **Summary Strip**: immediately displays total PMC, 1st Entry price, Total Quantity, Cumulative Notional, and Total Commissions.
  - **Execution Role Badges**: clearly marks `★ 1st Entry`, scale-in orders (`Increment #1`, `Increment #2` displaying price percentage delta relative to the first entry), and `Exits`, including line item notional (`Quantity × Price`).
- **🤖 AI Coaching (Conditional)** — if a multi-agent AI coaching report exists for this trade or matching ticker, this tab appears automatically featuring:
  - Synthetic 1-to-10 discipline score and Personal Trading Coach verdict.
  - Institutional debate synthesis (Bull vs Bear), catalysts, valuation multiples, and behavioral bias checklist.
  - Actionable advice and a quick button to re-run coaching with today's session data.
- **Images & Attachments** — full-screen zoomable screenshot gallery for trade review.

### Open Positions: Real-Time Market Valuation

For active trades, the page connects to real-time market data (via Yahoo Finance) showing:
- Real-time market price
- Theoretical liquidation market value
- Unrealized PnL and percentage return updated continuously.

### Closed Positions: Post-Trade Audit

For closed trades, the financial summary includes:
- Exact close timestamp and close trigger reason
- Gross realized PnL
- Total trading commissions deducted
- **Net realized PnL**
- Broker capital-gain tax regime and estimated tax liability on profits.
