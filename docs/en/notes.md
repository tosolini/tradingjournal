# Journal Notes & Stock Scouting

The **Notes** module in TradeJournal is a dual-track tool designed to assist traders during both the **pre-trading** phase (stock scouting and setup idea generation) and the **post-trading** phase (psychological journal and discipline tracking).

The main interface is organized into two dedicated tabs:
- **🎯 Scouting & Trade Ideas**: monitor watchlist stocks identified during screening, set trigger price levels, and receive automated alerts.
- **📓 Daily Journal & Psychology**: record general market conditions, emotional states, and discipline compliance with a rich-text WYSIWYG editor.

---

## 1. Scouting & Trade Ideas (Pre-Trading Intelligence)

While screening charts or equity screeners, you often identify promising technical setups (e.g. volatility contractions, key level breakouts, or pullbacks under moving averages like EMA 60) that are not yet ready for immediate execution.

The **Scouting** section allows you to catalog these ideas and let the system automatically track the market price.

![Scouting Overview](/docs/images/notes/scouting-overview.webp)
*Overview of the Scouting dashboard with KPI counters, status filters, and active setup cards.*

### How to Create a New Scouting Idea

1. Click the **+ New Idea** button in the upper right.
2. Fill in the setup parameters:
   - **Symbol / Ticker**: type the stock symbol; an autocomplete dropdown will show verified market tickers (e.g., *STM*, *ENI*, *PST*).
   - **Market**: quotation exchange (e.g., *Euronext Milan*, *NYSE*, *NASDAQ*).
   - **Setup Direction**: select **LONG** (bullish) or **SHORT** (bearish).
   - **Trigger Condition**: choose between $\le$ (*Falls to or below*) or $\ge$ (*Rises to or above*).
   - **Trigger Price (€)**: the exact price level where you want to be notified of a potential entry (e.g. `20.03 €`).
   - **Current Price (€)**: optional; automatically fetched from live market data if omitted.
   - **Estimated Stop Loss & Take Profit**: pre-planned exit targets for disciplined risk management.
   - **Scouting Thesis & Technical Setup**: describe your rationale (e.g., *"Breakout of 25€ resistance with volume surge"* or *"Bearish trend under EMA 60, wait for pullback before shorting"*).
   - **Setup Tags**: customizable chips to categorize your setups (e.g., `#breakout`, `#ema60`, `#pullback`).

![New Scouting Idea](/docs/images/notes/new-scouting-idea.webp)
*Quick modal form for technical setups with trigger conditions and risk management parameters.*

### Expiration and Stale Settings (Configurable)

Expanding the **Expiration & Stale Settings (Optional)** section lets you customize the setup lifespan:
- **Mark as Stale after (default: 7 days)**: if the trigger price is not reached within this time, the idea is marked as *Stale*, reminding you to re-evaluate the technical thesis.
- **Auto-close after (default: 10 days)**: if not renewed after becoming *Stale*, the idea is automatically archived to prevent cluttering your workspace with outdated setups.

---

## 2. Setup Lifecycle & States

Every scouting idea follows a clear state transition flow:

```
[Watching] ───────(Price reaches trigger)───> [Trigger Reached] ──(Click)──> [Converted to Trade]
    │
(After 7 days)
    ▼
  [Stale] ────────────(Renew +7d)───────────> [Watching]
    │
(After 10 days)
    ▼
 [Closed]
```

| Status | Meaning | Available Actions |
|---|---|---|
| **Watching** | Active setup. The backend periodically polls market quotes and computes percentage distance to the trigger. | Edit setup, Open TradingView chart, Archive. |
| **Trigger Reached** | Market price touched or crossed the target level. Highlighted with an emerald border and notified in the topbar. | **⚡ Convert to Trade** (pre-fills wizard). |
| **Stale** | 7 days elapsed without reaching the trigger. Requires a trader review decision. | **Renew (+7d)** to extend observation, or **Archive**. |
| **Converted** | The idea became an executed trade recorded in your trading journal. | Historical review. |
| **Closed** | Setup was manually cancelled or automatically archived due to inactivity. | Permanent deletion. |

---

## 3. In-App Notifications & Topbar Alerts

When an actively watched stock hits your trigger price, the system generates an immediate notification:

1. **Bell Badge**: the bell icon in the global topbar (next to *+ Trade*) displays a pulsing red counter with the number of ready setups.
2. **Quick Alerts Dropdown**: clicking the bell opens a popover listing triggered ideas with detected prices and a direct **⚡ Trade** shortcut button.

![Alerts Dropdown](/docs/images/notes/alerts-dropdown.webp)
*In-app notification menu in the topbar with a quick preview of setups ready for market entry.*

---

## 4. One-Click Conversion into an Executed Trade

As soon as an idea reaches the **Trigger Reached** status:
1. Click the **⚡ Convert to Trade** button (from the card or topbar alert popover).
2. The **New Trade** wizard opens instantly with the following prefilled fields:
   - Stock symbol and exchange market
   - Trade direction (*Long* or *Short*)
   - Proposed entry price (the trigger price)
   - Stop Loss and Take Profit levels specified during scouting
3. Select your trading account, confirm share quantity, and submit.
4. Upon creation, the scouting idea automatically transitions to **Converted** and links to the newly opened trade.

---

## 5. Daily Journal & Psychology (Post-Trading Reflection)

The **Daily Journal** tab is dedicated to qualitative trade review and psychological discipline.

![Daily Notes Journal](/docs/images/notes/daily-notes-journal.webp)
*Daily Journal view with built-in rich-text WYSIWYG editor, mood indicators, and pre/post trade discipline checklist.*

### Integrated WYSIWYG Editor

The **Content & Reflections** field features a clean, responsive toolbar:
- **Text**: Bold (**B**), Italic (*I*), Underline (<u>U</u>), Strikethrough (~~S~~).
- **Headings**: Structure notes with **H3**, **H4** subheadings or regular paragraphs (**¶**).
- **Lists**: Bullet and numbered lists for operational checklists.
- **Blocks**: Quotes for lessons learned, or code blocks (`</>`).
- **Links**: Insert reference links to external charts or news articles.
- **Forced Line-Wrapping**: Long unbroken strings and links automatically break to fit (`overflow-wrap: anywhere`), preserving clean layout on all screens.

### Mood & Volatility Tracking

For each session note, you can capture:
- **Mood / Emotional State**:
  - 🟢 **Positive / Calm**: clear decisions, disciplined execution.
  - 🔴 **Anxious / Negative**: stress, frustration, risk of impulsive trades.
  - ⚪ **Neutral**: standard trading without strong emotional bias.
- **Market Volatility**: *Low*, *Medium*, *High*.

### Discipline Checklist & Behavioral Tags

Assign behavioral tags to track execution patterns over time:
- `Plan Followed`
- `Stop Loss Respected`
- `Target Reached`
- `FOMO` (Fear Of Missing Out)
- `Overtrading`
- `Revenge Trading`
- `Early Exit`

Top filters allow you to isolate sessions marked with specific discipline tags, facilitating monthly psychology audits.
