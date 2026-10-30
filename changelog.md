# Changelog

## [0.2.0] - 2026-10-30

- Dashboard Equity Chart Asset Filtering
  - Added dedicated asset class filtering on the Dashboard equity chart panel with three interactive modes:
    - `Cumulato` / `Combined`: shows total portfolio equity and nominal cost curves combining both long-term holdings (ETFs & bonds) and stock trading positions.
    - `Portafoglio` / `Portfolio`: isolates investment holdings (ETFs, bonds, and funds) with their own market value and nominal cost basis.
    - `Azionario` / `Equities`: isolates stock trading positions with their own market value and cost basis.
  - Dynamic KPI badges: Market Value, Nominal Cost, and Theoretical Return update instantaneously upon switching views and during hover crosshair tracking.
  - Automatic trimming of leading inactive dates: charts cleanly start from when the selected asset class was first active, avoiding misleading initial flatlines.
  - Backend breakdown support in `/api/dashboard/kpis`: `portfolio_history` entries now provide distinct `holdings_value`, `holdings_cost`, `holdings_return_pct`, `trades_value`, `trades_cost`, and `trades_return_pct` alongside cumulative totals.
- Dashboard Preferences & User Settings
  - New "Grafico Dashboard" / "Dashboard Chart" preferences section in Settings (`/settings`).
  - Allows users to configure their default visualization preference (`all`, `portfolio`, or `trades`) persisted in user profile preferences (`PATCH /api/auth/preferences`).
  - The Dashboard automatically initializes with the user's preferred default on load.
- Weekend & Market Closure Normalization (Sawtooth Fix)
  - Fixed an issue where stock positions dropped to zero on weekends and non-trading days when portfolio snapshots were recorded, producing sawtooth dips in the equity curve.
  - Implemented smart forward-fill: accounts with active open trades retain their last known valuation over weekends and market holidays instead of resetting to zero.
  - Real position liquidations on active trading days continue to properly drop to zero.
- Comprehensive Documentation & Guide Updates
  - Updated in-app help documentation and Markdown guides in both Italian and English (`docs/it`, `docs/en`, `frontend/src/docs/it`, `frontend/src/docs/en`).
  - Documented the asset filter controls, settings configuration, and weekend normalization behavior.
- Version bump to 0.2.0 (Backend 0.2.0 / Frontend 0.2.0)

## [0.1.9] - 2026-10-28

- Stock Scouting & Trade Ideas Engine
  - New `trade_ideas` model and Alembic migration (`20261028_0013_trade_ideas.py`) with support for setup direction (Long/Short), numeric trigger prices (`<=`, `>=`), initial price, stop loss, take profit, thesis notes, setup tags, and lifecycle states (`watching`, `triggered`, `stale`, `closed`, `converted`)
  - Configurable temporal lifecycle with customizable `stale_days` (default 7 days) and `expire_days` (default 10 days) per idea and in user preferences
  - Background evaluator job via APScheduler running every 15 minutes to poll live prices, check trigger conditions, and manage stale/closed transitions
  - New backend endpoints under `/api/trade-ideas`: CRUD, `renew`, `close`, `convert`, `refresh-prices`, and `alerts`
  - Frontend Scouting UI: KPI overview cards, status filters, interactive setup cards with live percentage distance delta, and autocomplete creation modal
  - Topbar in-app notification bell with live counter badge and quick action drawer
  - One-click trade conversion: pre-fills the New Trade wizard and automatically transitions the idea to `converted`
- Daily Notes & Psychology Journal Refactoring
  - Integrated lightweight, zero-dependency, zero-CVE native WYSIWYG editor for session reflections with comprehensive formatting toolbar
  - Enforced forced word-wrapping and line break safety (`overflow-wrap: anywhere; word-break: break-word`) to prevent horizontal card blowout
  - Dual-tab navigation on Notes page: `Scouting & Idee di Trading` and `Diario Giornaliero & Psicologia`
- Fixed Income & Bond Accounting Engine
  - New `bond_details` table with full fixed income parameters: `bond_type` (fixed, step_up, zero_coupon, inflation_linked), `maturity_date`, `issue_date`, `coupon_frequency`, `annual_coupon_rate`, `step_up_schedule` (JSONB), `final_bonus_rate`, `tax_rate`, `day_count_convention`
  - Extended `holdings` with `accrued_interest_in` (rateo passivo pagato all'acquisto) and `eligible_for_bonus` (CUM flag per collocamento primario)
  - Dedicated financial engine in `services/bonds.py`: day count conventions (ACT/ACT ICMA, ACT/360, 30/360), accrued interest (rateo), step-up schedule rates, cash flow generator, Newton-Raphson YTM solver (gross & net), and Holding Period Return (HPR) for secondary market exits
  - Portfolio valuation integration: base 100 percentage pricing ($Quantity \times Dirty\ Price / 100$) and cost basis ($Quantity \times (avg\_cost + accrued\_in) / 100$)
  - Cash ledger neutrality: added `coupon`, `bond_bonus`, `bond_redemption`, `dividend` entry types, ensuring internal coupon income is not penalized as an external deposit in daily P&L
  - Dedicated `/api/bonds/calendar` and `/api/bonds/metrics` endpoints
  - Euronext / MOT Live Automation:
    - New `services/euronext.py` scraper and AES quote decryptor: parses factsheet blocks and live traded price for any BTP, BOT or BTP Valore
    - Quick-import endpoint `POST /api/bonds/lookup` accepting either a Euronext URL or bare ISIN
    - Integrated live MOT price provider into `services/price_provider.py` for real-time Italian bond valuation
  - Frontend UI/UX:
    - Asset creation modal with automated Euronext/ISIN import bar, bond structure selector, coupon frequencies, tax rates, step-up progression table, and final loyalty bonus rate
    - Holding modals with nominal quantity (€), base 100 clean price, accrued interest on purchase, and CUM bonus eligibility
    - New "Obbligazioni & Rendite" tab in Portfolio with Bond KPI cards, bond holdings table with live dirty price / accrued / YTM, and interactive cash flow calendar
- Euronext Equities One-Click Sync
  - Added live one-click synchronization of equity tickers from Euronext markets (Milan/Borsa Italiana, Paris, Amsterdam, Brussels, Lisbon, Dublin, Oslo, or all markets)
  - New `sync_euronext_equities` service streaming official Euronext CSVs in memory with batched PostgreSQL upsert (`ON CONFLICT (symbol, market) DO UPDATE`) and exact insert/update statistics
  - New backend endpoints: `POST /api/tickers/sync-euronext`, `GET /api/tickers/euronext-markets`, and `POST /api/exchanges/{id}/sync-tickers`
  - Exposed `euronext_code` on `Exchange` models and API responses with automatic detection for supported markets
  - UI integration with direct sync button in Brokers page and Tickers page
- Illustrated In-App Manual & Guides (`/help`)
  - Added new comprehensive guide for `Note & Scouting` in Italian and English with live screenshots
  - Added high-resolution visual guides with screenshots for `Calendario e Mercati` and `Dashboard, Performance e Portfolio`
- Security & Dependency Hardening
  - Upgraded `dnspython` to 2.9.0 to resolve CVE-2026-114605 (GHSA-45c3-73f7-pv4m)
  - Extracted shared DOMPurify sanitization in `frontend/src/lib/sanitize.ts`
  - Restored missing `assets.title` translation in Italian locale
- Complete Italian and English i18n support
- Backend 0.1.9 / frontend 0.1.9
## [0.1.8] - 2026-10-09

- DB-backed user accounting (no more `.env` juggling)
  - `users`: `is_active`, `must_change_password`, `password_changed_at`,
    `last_login_at`, `created_by_id`; new `app_settings` table
  - First-login onboarding wizard (password → profile → broker → account)
    with server-side enforcement until the password is rotated
  - Public self-registration closed by default (DB toggle + admin UI)
  - One-time seed admin only on empty DB, forced password change included
  - Password policy configurable in DB (admin UI in Settings)
  - Admin users table: status, pending-change badge, last login,
    enable/disable, protected delete when the user owns data
  - API errors now carry machine-readable codes to the UI (`ApiError`)
- Backend 0.1.8 / frontend 0.1.8

## [0.1.4] - 2026-05-31

- Broker refactoring
- Market ticker page (TickersPage)
- Market Gantt chart
- Help guide

## [0.1.3] - 2026-05-31

- Rich text editor for notes
- Dark/light theme support via Tailwind `darkMode` selector
- Dark theme text color visibility fixes
- Various UI fixes
- README update
- Bug report template

## [0.1.2] - 2026-05-30

- ETF assets support
- UI/UX implementation improvements
- Vite configuration update

## [0.1.1] - 2026-05-25

- Italian/English language system (i18n) on frontend and backend
- Docker Alpine version fix
- opencode configuration

## [0.1.0] - 2026-05-24

- Initial release
