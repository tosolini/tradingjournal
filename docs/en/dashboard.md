# Dashboard, Performance and Portfolio

This section covers the three analysis views: **Dashboard**, **Performance** and **Portfolio**.

---

## Dashboard

The home page provides a comprehensive, advanced operational summary of your whole trading journal, combining statistical metrics from closed trades, open positions, and investment portfolios.

![Dashboard Overview](/docs/images/dashboard/dashboard-overview.webp)
*Main analytical dashboard featuring profitability Hero KPIs, open positions, tax estimates, and portfolio equity curve.*
### Key figures (Hero KPIs)

- **Total PnL** — sum of realized profit/loss and mark-to-market of open positions
- **Realized PnL** — net profit/loss consolidated from all closed trades
- **This Week PnL** — cumulative profit/loss since Monday of the current calendar week
- **Unrealized PnL (MTM)** — real-time mark-to-market valuation of currently open positions
- **Win Rate** — percentage of winning closed trades over total closed trades, with wins and losses counts
- **Secondary cards:** Total Trades count, Open Positions, Capital-gain tax estimate, and Minus loss offsets

---

### Charts and Analytical Panels

| Panel | Content & Features |
|---|---|
| **Equity curve** | Portfolio value over time (area chart) with an optional dashed cost line and range selector (**1M / 3M / 6M / 1Y / ALL**). |
| **Outcome donut** | Visual breakdown of wins, losses, and breakeven trades with win rate % in the center; displays Profit Factor, average win, and average loss. |
| **Advanced Stats & Expectancy** | - **Expectancy**: mathematical expected monetary value per closed trade: $(P_w \times \text{Avg Win}) - (P_l \times \text{Avg Loss})$, featuring a dynamic **+ Edge** (green) or **- Edge** (red) indicator.<br>- **Payoff Ratio (W/L)**: ratio of average win to average loss.<br>- **Max Drawdown %**: peak-to-trough decline from the historical all-time high portfolio value.<br>- **Kelly Criterion**: estimated optimal capital allocation fraction based on statistical edge. |
| **Best & Worst Trades** | Side-by-side comparison card showing your all-time greatest winning trade (🏆) and deepest loss (⚠️), including symbol, direction (LONG/SHORT), return %, net PnL, and close date. |
| **Periodic PnL Bar Chart (Month / Week)** | Interactive bar chart with a **[ Month \| Week ]** period switcher:<br>- **Month**: Realized PnL of the last 12 calendar months with trade counts.<br>- **Week**: Realized PnL aggregated by ISO week (e.g., W40, W41, W42).<br>- Interactive mouse hover tooltip highlights exact dates, signed PnL, and executions with a glowing border. |
| **All-assets daily PnL** | Daily PnL for the last 30 days covering both trades and portfolio movements, featuring responsive hover details and cumulative total. |
| **Asset allocation** | Market value per holding with weight % progress bars and instrument class chips (Stocks, ETFs, Bonds, Funds). |
| **Top trades** | Table highlighting the most significant operations: symbol, side, status, close date, return %, and net PnL. |

The `Updated` timestamp reflects the date of the latest recorded portfolio snapshot. Currency formats follow your locale.

---

## Performance

In-depth analysis of portfolio capital evolution over time, powered by automated daily portfolio snapshots.

- **KPIs:** Portfolio Value, Cumulative PnL, Best Day, Worst Day
- **Equity curve** — portfolio value over time derived from daily snapshots (interactive area chart)
- **Daily PnL bars** — last 30 days of performance with winning day percentage
- **Monthly calendar grid** — color-coded days (green = profitable, red = loss); click any day to open the day drawer with total value, day PnL, and cumulative returns

> ℹ️ Performance data is populated by the **daily snapshot scheduler** (see Settings → Daily Snapshots). If no historical snapshots exist yet, use the manual recompute buttons (`POST /api/snapshots/recompute` and `/api/snapshots/portfolio/recompute`) to backfill past data.

---

## Portfolio

Track **ETF, bond, and fund** investments separately from active trades, with automated mark-to-market valuations.

![Portfolio and Fixed Income Management](/docs/images/dashboard/portfolio-holdings.webp)
*Portfolio module with Bonds & Fixed Income tab, net YTM calculations, estimated annual coupon income, and future cash flow calendar.*
- **KPIs:** Total Value, Total Cost, Total Return, Return %
- **Portfolio history** — valuation evolution chart over time
- **Holdings table:** symbol, name, instrument type, quantity, average cost, entry/exit dates, hold duration, **current price** (fetched via Yahoo Finance), market value, return ($) and return %; per-row **edit** and **delete** actions
- **Add / Edit Holding:** linked account, asset instrument, quantity, average cost, entry and exit dates

Holdings are automatically incorporated into daily snapshots, the equity curve, and the all-assets daily PnL panel on the Dashboard.
