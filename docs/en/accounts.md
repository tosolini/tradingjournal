# Accounts and Brokers

## Brokers

Brokers represent the financial intermediaries through which you operate on markets. You must configure at least one broker before creating an account.

### Quick Presets and Broker Profiles

When creating or editing a broker, you can pick a **one-click preset profile**:

- **Fineco - Trading Account**: variable fee of 0.19% of trade value, with a **minimum of 2.95 €** and a **maximum of 19.00 €** per execution. Monthly account fee: 0 €.
- **Fineco - Under 30**: discounted flat fee of **2.95 €** per order on Italian and European stocks/ETFs and **3.95 $** on US markets. Monthly account fee: 0 €.
- **Fineco - One / Classic / Max Accounts (Tiered Volume)**: commissions decreasing based on monthly commission volume:
  - **Tier 1** (< 99 €/month): 19.00 € (or 12.95 $ on US markets)
  - **Tier 2** (100 € – 1,499.99 €/month): 9.95 € (or 9.95 $ on US markets)
  - **Tier 3** (1,500 € – 2,499.99 €/month): 6.95 € (or 8.95 $ on US markets)
  - **Tier 4** (≥ 2,500 €/month): 2.95 € (or 3.95 $ on US markets)
  - **Monthly account fee**: One = 0 €/month, Classic = 3.95 €/month, Max = 29.95 €/month.
  - *Automatic calculation or Override*: the platform automatically determines your current monthly tier from executed trade fees, while allowing a manual tier override (1-4).
- **Directa - Simple Profile**: flat 5.00 € per execution. Zero monthly fee.
- **Directa - Variable Profile**: 0.19% of trade value (min 1.50 € / max 18.00 €). Zero monthly fee.
- **Custom**: freely configure any commission structure.

### Broker Configuration Fields

| Field | Description |
|---|---|
| **Name** | Descriptive broker name (e.g. "Fineco Trading", "Directa SIM") |
| **Profile** | Preset profile or custom setup |
| **Commission mode** | `Fixed`, `Percentage`, `Percentage with Min/Max`, `Under 30` (Fineco), `Tiered volume` |
| **Commission value** | Numerical fee (fixed € amount or percentage rate) |
| **Min / Max fee** | Lower and upper boundaries for capped percentage fees (e.g. 2.95 € / 19.00 €) |
| **US order fee** | Fixed fee applied to orders traded in USD (e.g. 3.95 $ for Fineco Under 30) |
| **Monthly account fee** | Fixed monthly maintenance fee charged by the broker |
| **Tier override** | Force a specific volume tier (1, 2, 3 or 4) for tiered accounts |
| **Standard tax rate** | Capital gain tax rate for equities, ETFs, commodities, derivatives and corporate bonds (default 26%) |
| **Government bond tax rate** | Preferential tax rate for whitelist sovereign bonds (default 12.50%) |

---

## Taxation & Sovereign Government Bonds (DLgs 461/97)

The platform automatically applies differential taxation based on instrument type:

1. **Standard Rate (26%)**: applied to realized capital gains on stocks, ETFs, commodities, derivatives and corporate bonds.
2. **Government Bond Rate (12.50%)**: applied to Italian government bonds (BTP, BOT, CCT, CTZ) and foreign sovereign bonds in the whitelist (US Treasuries, German Bunds, French OATs, Spanish Bonos).
3. **Weighted Loss Compensation (Circolare AdE 19/E)**:
   - A capital loss on a government bond (taxed at 12.50%) cannot offset on a 1:1 basis a capital gain taxed at 26%.
   - In accordance with Italian tax law, government bond capital losses (minusvalenze) enter the tax basket weighted at **48.08%** (exact ratio $12.5 / 26 = 0.480769...$).
   - The dashboard and trade summary cards display both the nominal loss and the effective weighted tax offset.

### Instrument Selection & Detection

When adding or editing a trade, you can select the instrument type (`Stock`, `ETF`, `Government Bond / Sovereign Debt`, `Corporate Bond`, `Crypto`, `Forex`, `Commodity`).

If you enter an Italian ISIN starting with `IT0005` (BTP, BOT) or select the `MOT` exchange, the platform automatically detects it as a Government Bond and applies the 12.50% rate.

---

## Markets / Exchanges

Each broker can have one or more **markets** (exchanges) enabled. Markets define:

- Which exchanges you can trade through that broker
- Opening and closing hours
- Reference timezone
- Whether the market is closed on weekends

### Adding a Market

In the broker card, click **+ Add Market** (Markets tab).

> 💡 For Directa SIM, an automatic **seed** is available that imports all markets from the official [directa.it/mercati](https://www.directa.it/mercati) page. Click **Import Directa Markets** to populate the list automatically.

**Exchange fields:**

| Field | Description |
|---|---|
| **Name** | Market name (e.g. "Borsa Italiana", "MOT", "MTA") |
| **MIC** | ISO 10383 Market Identifier Code (e.g. `XMIL`) |
| **Suffix** | Yahoo Finance/ticker suffix (e.g. `.MI` for Milan) |
| **Country** | Exchange country |
| **Currency** | Trading currency |
| **Timezone** | Exchange timezone (e.g. `Europe/Rome`) |
| **Open / Close** | Local trading hours |
| **Closed on weekends** | If `Yes`, the market is considered closed on Saturday and Sunday |

---

## Accounts

Accounts represent individual trading portfolios, linked to a broker.

### Adding an Account

Go to **Accounts** and click **+ New Account**.

| Field | Description |
|---|---|
| **Name** | Identifying name (e.g. "Fineco Trading Account", "Directa Main") |
| **Broker** | Reference broker for this account |
| **Currency** | Account denomination currency |
| **Starting balance** | Initial account capital |
| **Description** | Optional notes |

### Broker-Account Link

An account is always associated with a single broker. This association:

- Automatically applies the estimated commissions (including volume tiers and caps)
- Uses the standard or government bond tax rate for net P&L and capital gain estimates
- Limits symbol autocomplete to the broker's enabled markets

### Cash Ledger

Select an account to manage its **cash ledger** (deposits and withdrawals):

- Record a **deposit** or **withdrawal** with date, amount and optional description
- The ledger shows totals **In / Out / Net** for the account
- Entries can be edited or deleted; the account's cash balance reflects the movements
