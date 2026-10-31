# Getting Started

Welcome to **TradeJournal**, your self-hosted advanced trading journal and portfolio tracking system designed to log trades, maintain behavioral discipline, and analyze financial performance across global markets.

---

## First Login

On first access you are prompted for your credentials. If the instance was just started, use the default credentials provided by the administrator (see below).

A welcome banner on **Settings** walks through the initial 4 steps:

1. **Change your credentials** — the instance initially uses the default admin account. Set your own email and a strong password.
2. **Link a broker** — create a broker and configure its markets before opening accounts.
3. **Create an account** — accounts represent the portfolios where you record trades and cash movements.
4. **Start journaling** — record your first trade with the **+ New Trade** wizard.

> ⚠️ **Default admin account.** At first startup the backend auto-creates an admin user (`admin` / `password123`, configurable via `SEED_ADMIN_*`). Always change these credentials outside local development. When `ENVIRONMENT=production` is set, the backend **refuses to start** with the default admin password or the default `JWT_SECRET_KEY`.

---

## Recommended Initial Setup

Follow these steps before recording your first trade.

### 1. Set Your Profile and Timezone

Go to **Settings → Account** and configure:

- **Timezone** — essential for accurate market hours in the calendar Gantt chart. Choose your region (e.g. `Europe/Rome`).
- **Email and password** — update the default credentials.

> ⚠️ Without a timezone configured, the market session hours will not calculate your local time properly.

### 2. Create a Broker

Go to **Broker** and create at least one broker you operate with (e.g. Directa SIM, DEGIRO, Interactive Brokers).

For each broker you can:

- Set name and website
- Configure the fee model (fixed fee or percentage per trade) and fee currency
- Set the **capital-gain tax mode** (`Immediate` at trade close or `Year end`) and default withholding tax rate (default 26%)
- Add the **markets/exchanges** enabled for that broker — an automatic one-click seed is available for Directa SIM

### 3. Create an Account

Go to **Accounts** and create a trading account linked to your configured broker. The account represents the live or paper portfolio where you execute trades.

Each account includes an integrated **cash ledger** for logging deposits, withdrawals, and dividend cash flows (see [Accounts and Brokers](accounts.md)).

### 4. Import Tickers

Go to **Tickers** and import the database of tradable instruments (e.g. downloadable from Euronext). This enables **real-time symbol autocomplete** when entering trades (see [Tickers](tickers.md)).

### 5. Create Your First Trade

Click **+ New Trade** in the sidebar or press `⌘K` to open the Command Palette and select "New Trade" (see [Managing Trades](trades.md)).

---

## Key Interface Features

### Global Command Palette (`⌘K` / `Ctrl+K`)

Press **⌘K** (macOS) or **Ctrl+K** (Windows/Linux) anywhere or click the search input in the topbar:

- Jump instantly to any page or feature in the app
- Open the trade creation modal from anywhere
- Search commands and pages with instant fuzzy filtering
- Toggle quickly between Dark and Light mode themes

### Topbar & Fast Account Switcher

The top navigation bar remains sticky across all screens:

- **Active Account Switcher**: Switch on the fly between individual trading accounts or select "All Accounts" for a consolidated portfolio view. Your available cash balance is displayed immediately.
- **Persistent New Trade Button**: Accessible with one click on every page.
- **Theme Switcher**: Instant Dark/Light mode toggle without page refresh.
- **User Profile Menu**: Fast access to preferences, account settings, author credits, and logout.

### Responsive Mobile Drawer

On smartphones and tablets, the interface dynamically adjusts:
- The sidebar collapses into a **slide-out drawer** accessible via the top-left menu icon.
- Charts, calendar grids, and tables support fluid horizontal scrolling with touch-optimized controls.

### Stock Scouting and Trading Discipline Checklist (Notes)

Within the **Notes** module, you can manage both **Scouting & Trade Ideas** (tracking watchlist stocks with automated price triggers and in-app alerts) and the **Daily Journal** with rich-text editor and **Psychological Checklist** to ensure you follow your trading plan and avoid FOMO or revenge trading.
---

## Application Structure

| Section | Description |
|---|---|
| **Dashboard** | Advanced analytics cockpit: Today/Week/Month/Total Net PnL, Win Rate, Expectancy, Payoff Ratio, Max Drawdown, Periodic PnL Bar Chart, Equity Curve, and Best vs Worst Trade comparison card |
| **Calendar** | Unified monthly journal calendar with daily color-coded PnL badges, consolidated weekly summary column, day-detail drawer, and real-time global market Gantt timeline |
| **Trades** | Comprehensive trade ledger featuring live Risk/Reward gauge, 6-step guided wizard, quick entry mode, table pagination, and date presets |
| **Notes** | Stock Scouting & Trade Ideas with automated price triggers, one-click trade conversion, and Daily Journal with rich-text editor and discipline checklist |
| **Portfolio** | Stock, ETF, and bond position tracking with live mark-to-market, multiple tranches, full/partial exits, maturity redemptions and percentage allocation |
| **Performance** | In-depth portfolio NAV growth, drawdown analysis, and cumulative equity curves |
| **Assets** | Financial instruments master registry (stocks, ETFs, bonds, crypto, commodities) |
| **Accounts** | Multi-currency trading accounts and cash ledger for cash movements |
| **Broker** | Broker management with commission models, tax regimes, and enabled exchanges |
| **Tickers** | Securities symbol database with CSV import for live autocomplete |
| **Settings** | User profile preferences, password management, language selector, JSON data export/import, and snapshot cutoff time |
| **Help** | This comprehensive in-app documentation guide in Italian and English |
