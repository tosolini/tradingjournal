# Calendar and Markets

The **Calendar** section combines visual performance management with real-time tracking of global financial markets.

The view is divided into two main tabs:

1. **Calendar** — monthly trading journal featuring daily PnL, weekly summary columns, and execution logs
2. **Markets** — real-time Gantt timeline showing trading session hours and market statuses worldwide

---

## Calendar Tab (Trading Journal)

The monthly calendar provides a clear, high-level overview of your trading activity day by day and week by week.

![Monthly Calendar](/docs/images/calendar/calendar-monthly.webp)
*Monthly Calendar view featuring KPI performance banner, Win Rate, and trading days.*
### 1. Monthly KPI Summary Banner

At the top of the calendar, an executive summary card highlights the key metrics for the selected month:

- **Total Month PnL** — net cumulative profit or loss of closed trades for the month
- **Win Rate %** — percentage of profitable trading days out of all active days
- **Win / Loss Days** — exact count of green (W) versus red (L) trading days
- **Total Executions** — total number of orders and fills executed during the month

### 2. Daily Cells & PnL Badges

Each cell in the monthly grid represents a specific trading day:

- **Prominent PnL Badge**: Displays net realized PnL (emerald green for gains, rose red for losses) along with daily percentage return.
- **Execution Chips**: Shows the first traded symbols of the day with action indicators (`BUY`, `SELL`, `OPEN`, `CLOSE`).
- **Journal Notes Indicator**: When reflection notes exist for that day, an icon displays the total note count.
- **Interactivity**: Clicking any active day immediately opens the **Day Detail Drawer**.

### 3. Weekly Summary Column (Weekly PnL)

Positioned on the right side of the calendar grid (or as a summary row on mobile devices), the **Weekly Summary Column** aggregates trading performance for each calendar week:

- **ISO Week Number** (e.g. `Week 42 · W42`)
- **Consolidated Weekly PnL** — algebraic sum of all net profits and losses realized during that week
- **Weekly W / L Ratio** — ratio of profitable days to losing days (e.g. `4W · 1L`)
- **Trade Count** — total number of trades completed throughout the week

### 4. Day Detail Drawer

Clicking on any calendar day opens a dedicated modal drawer with:

- Full date formatted with weekday name
- Net realized PnL and return percentage for the selected day
- Itemized list of executions (symbol, action, quantity, price, fee, time) with direct links to trade details
- Associated daily journal entries (with emotional mood and market tags), including quick shortcuts to read or record new reflections

---

## Markets Tab (Gantt)

The market Gantt shows a continuous **24-hour scrolling window** (starting from the current time) indicating which markets are open, preparing to open, or closed.

![Global Markets Gantt](/docs/images/calendar/markets-gantt.webp)
*Real-time Gantt timeline showing trading session windows and open/closed status for global exchanges.*
### How to Read the Gantt

Each row represents a market/exchange configured in your brokers. The colored horizontal bar indicates the **trading window**:

| Color | Meaning |
|---|---|
| **Green (teal)** | Market **open** right now |
| **Gray (slate)** | Market **closed** right now |
| **Pink / red** | Market **closed today** (weekend or scheduled holiday) |

The vertical red line indicates the **current time** in your configured timezone.

### Timezone and Holidays

- **Timezone**: Session hours are automatically synchronized with the timezone configured in your profile (**Settings → Profile → Timezone**).
- **Weekend Closures**: Markets with "Closed on weekends" enabled are automatically marked as closed on Saturday and Sunday.
- **Global Holidays**: New Year's Day (Jan 1), Ferragosto (Aug 15), and Christmas Day (Dec 25) are pre-configured as market holidays for equities.
- **Continuous Update**: Timeline bars advance smoothly in real time without requiring manual page reloads.

To configure or add new exchanges shown in the Gantt, refer to the [Accounts and Brokers](accounts.md) guide.
