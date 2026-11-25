# Changelog

## [0.3.3] - 2026-11-24

- TradingView-Inspired Chart Annotation Studio (`/trades/:id/images`)
  - Redesigned `TradeImagesPage.tsx` and `ImageAnnotationEditor.tsx` with `react-konva` (`konva`) into a viewport-first Chart Annotation Studio.
  - Added a left vertical drawing toolbar with keyboard shortcuts (`V` Select/Move/Resize, `H` Pan / `Space+Drag`, `T` Trendline, `L` Horizontal Level with inline label, `A` Arrow, `R` Zone/Rectangle, `C` Ellipse, `P` Long/Short R:R Position Box, `M` Highlighter, `N` Inline Text Note without `window.prompt`).
  - Added non-destructive vector persistence (`annotations_json` on `TradeImage` via Alembic migration `20261124_0020`), lossless full-resolution PNG export, "Save as new" gallery snapshot creation, global clipboard screenshot paste (`⌘V`/`Ctrl+V`), drag-and-drop upload, explicit Zoom/Delete gallery controls, and `DELETE /api/uploads/trade-images/{image_id}` endpoint.
- Interactive Candlestick & Cyclical FFT Charts + Directional AI Coaching
  - Added interactive candlestick charts with cyclical FFT projection waves, turning windows, and SMA/EMA overlays (`AnalysisInteractiveChart.tsx`), plus directional bias (`long`/`short`/`auto`) for exploratory AI coaching.
  - Highlighted estimated wait time in the AI analysis loading screen (`AnalysisPage.tsx`, `AnalysisHistoryView.tsx`).
- Custom Local OpenAI-Compatible LLM Endpoints & Command+K Enhancements
  - Added support for custom local OpenAI-compatible endpoints with optional API keys in Settings.
  - Added AI analysis commands and dynamic search to the `Cmd+K` / `Ctrl+K` Command Palette.
- Dashboard Equity Curve & Chart Label Toggles
  - Switched Dashboard equity curve to a dual-tone `BaselineSeries` with dynamic per-point profit/loss colors against historical cost, and added persistent chart label visibility toggles (`useChartLabels.ts`).
- Development Workflow
  - Added `scripts/dev-worktree.sh`, `scripts/worktree-setup.sh`, and `scripts/worktree-sync.sh` for automated Docker/worktree alignment.
- Version bump to 0.3.3 (Backend 0.3.3 / Frontend 0.3.3)

## [0.3.2] - 2026-11-17

- Trade Detail Dossier & Execution Cockpit Redesign
  - Structured the trade dossier header into 3 focused financial cards:
    - `Posizione & Carico`: Average Entry Price (PMC) hero metric, multi-entry count badge, 1st Entry reference price, open quantity, cumulative invested capital, total commissions, and holding duration.
    - `Mercato & PnL`: live market quote with percentage delta vs Average Cost (PMC), unrealized PnL and current market value for open trades, or consolidated net and gross realized PnL for closed trades.
    - `Target & Rischio`: Take Profit and Stop Loss levels with percentage distances, Risk/Reward ratio with visual color-coded bar gauge, and a collapsible secondary metadata panel.
  - Overhauled the `Executions` tab with an executive summary strip (PMC, 1st Entry, Total Quantity, Cumulative Notional, Total Fees) and clear execution role badges (`★ 1° Ingresso`, `Incremento #N` with percentage variation vs 1st entry price, `Uscita`) with calculated line totals.
  - Introduced a conditional `🤖 Coaching AI` tab on the trade detail page that automatically loads the latest completed multi-agent coaching report matching the trade ticker and trade ID. If no coaching exists for that ticker, the tab remains hidden.
  - Added `trade_id` filtering to `GET /api/analysis/history` and included `trade_id` in `AnalysisReportSummary` schema with pytest coverage.
- Holding Detail Price Spread Baseline Series
  - Converted the market price vs purchase cost chart (`PriceSpreadChart` in `HoldingDetailPage.tsx`) from `AreaSeries` to a dual-tone `BaselineSeries` anchored to the average purchase cost (`avg_cost`).
  - Trading above PMC is filled in green/teal, while dips below PMC render in red, providing immediate visual feedback on position health.
- AI Analysis Navigation & History Default View
  - Reordered tabs on `AnalysisPage.tsx`: `📜 Archivio Analisi` is now the default first view, enabling instant review of generated reports, followed by `📁 Asset in Portafoglio / Trade` and `🔍 Ticker Personalizzato`.
  - Updated selection defaults, report counters, and context hints.
- Dashboard Equity Curve Timeframe & Resizing Fixes
  - Fixed monthly cutoff calculation in `DashboardPage.tsx` to anchor to the latest available historical data point instead of `new Date()`, correctly handling month-end boundaries (`setDate(0)`).
  - Added `fixLeftEdge: true`, `fixRightEdge: true`, and continuous `ResizeObserver` auto-fitting (`chart.timeScale().fitContent()`).
- Deployment & Development Workflow
  - Parameterized backend and frontend bind mounts with `${APP_DIR:-.}` in `docker-compose.yml` to support isolated worktrees.
- Version bump to 0.3.2 (Backend 0.3.2 / Frontend 0.3.2)

## [0.3.1] - 2026-11-16

- Unified Notifications & Alert Center
  - Live Take Profit & Stop Loss alerts for open trades (evaluating Long and Short positions against real-time market prices) with high-visibility badges in the topbar bell menu and an alert banner atop `TradesPage`.
  - Today's coupon distribution alerts for active bond and ETF holdings with estimated net cash flow amounts and direct navigation to the Portfolio / Bond Calendar.
  - Natural maturity alerts for BTPs and bonds maturing within a customizable threshold window (default: 30 days) displaying nominal values and remaining countdown.
  - Multi-category tabbed filtering (`Tutti`, `Trade`, `Cedole`, `Scadenze`, `Scouting`) with unified badge counting.
- Persistent Multi-Device Alert Acknowledgment
  - Single-alert acknowledgment ("✓") on each card to dismiss seen notifications without needing to close or modify positions immediately.
  - Global "Segna tutti come letti" action to zero active alerts simultaneously.
  - Server-side persistence in PostgreSQL user preferences JSONB (`user.preferences.acknowledged_alerts`), ensuring read state is synced across all devices and sessions.
  - Undo endpoint (`DELETE /api/alerts/acknowledge/{alert_key}`) and support for displaying already-acknowledged notifications.
- TradingView Layering & Frontend Design Overhaul
  - Fixed hardware-accelerated HTML5 `<canvas>` compositing bug where underlying TradingView lightweight-charts shone through the dropdown popover by removing `backdrop-blur` and replacing semi-transparent containers with 100% solid, opaque backgrounds.
  - Redesigned `AlertsBellMenu` popup with an uncluttered header, distinctive colored left-accent borders (`border-l-[3px]`) for instant category scanning, and a dedicated bottom action footer.
- Holding Price History & Dashboard KPI Aggregation Fixes
  - Integrated realistic historical market prices (Euronext/yfinance series) decoupled from pull-to-par amortization projections on holding detail charts.
  - Corrected dashboard KPI daily PnL and tax aggregation when no holding exits exist.
- Full Internationalization (i18n) Sweep across Frontend and Backend
  - Migrated all remaining hardcoded Italian UI copy to `react-i18next` keys (Holding detail, Brokers, Accounts, Calendar, Trades, rich text editor toolbar, analysis history/purge, notes, scouting, dashboard widgets).
  - Removed Italian default values from `t()` calls: the locale catalogs are now the single source of truth, preventing missing keys from leaking Italian into the English UI.
  - Added missing `common.*`, `assets.*`, `portfolio.*`, `trades.*`, `notes.*`, `dashboard.*`, `analysis.*`, and `trade_detail.*` keys; standardized i18next pluralization (`_one`/`_other`).
  - Replaced manual language-branching logic with regular translation keys.
  - Number and date formatting now follows the active UI language by default (`getActiveLocale()`), and `<html lang>` is kept in sync on language change.
  - Zod validation messages localized through schema factories.
  - Backend: added missing `localized_error` catalog entries, converted holding-exit service messages and warnings to translatable codes, localized Euronext sync/lookup errors, and aligned LLM connectivity tests and mock reports with the request language.
  - New automated `npm run i18n:check` guardrail in CI verifying key parity, placeholders, and absence of hardcoded literals.
- Dependency Upgrades & Security Updates
  - Upgraded backend core frameworks: `fastapi` to 0.162.5, `psycopg` to 3.3.9.
  - Upgraded frontend state management, charts, and forms: `@tanstack/react-query` to 5.107.1, `react-hook-form` to 7.92.0, `@hookform/resolvers` to 7.0.6, `lightweight-charts` to 5.3.0.
  - Upgraded internationalization stack: `i18next` to 27.1.1, `react-i18next` to 18.0.1.
  - Upgraded tooling and styling engines: `vite` to 8.3.8, `@vitejs/plugin-react` to 6.3.0, `tailwindcss` to 4.3.0, `@tailwindcss/postcss` to 4.3.5.
- Version bump to 0.3.1 (Backend 0.3.1 / Frontend 0.3.1)

## [0.3.0] - 2026-11-15

- Multi-Agent Asset Analysis & Coaching Engine
  - Institutional multi-agent dialectical architecture inspired by TradingAgents (TauricResearch), providing third-party perspective across Technical, Fundamental, and Cyclical dimensions.
  - Specialized Parallel Analysts:
    - `Technical Analyst`: Vectorized Wilder RSI, MACD (12, 26, 9), Bollinger Bands, ATR, SMAs (20/50/200), pivot support/resistance, and trend alignment.
    - `Fundamental & Fixed Income Analyst`: Equity valuation multiples (P/E, Forward P/E, PEG ratio), operating and gross margins, Free Cash Flow, analyst consensus recommendations, and Wall Street target prices (Mean/High/Low); bond yield to maturity, coupon schedule, and duration.
    - `Cyclical & Fractal Analyst`: Hurst Exponent ($H$) via Rescaled Range (R/S analysis) to categorize market regimes (persistent trending $>0.55$, mean-reverting $<0.45$, or random walk $0.45-0.55$), paired with Fast Fourier Transform (FFT) spectral decomposition to isolate dominant trading-day cycles and phase states.
  - Adversarial Dialectical Debate:
    - `Bull Researcher`: Formulates optimistic catalysts, valuation upside, and operational strengths.
    - `Bear Researcher`: Devil's advocate identifying bubble risks, margin contraction, macro headwinds, and overbought levels.
    - `Lead Researcher`: Committee synthesis weighing arguments into balanced institutional thesis.
    - `Personal Trading Coach`: Generates a 1-10 overall score, concrete operational suggestions (Stop Loss adjustment, profit-taking, sizing), and psychological risk alerts (FOMO, disposition effect, overtrading).
  - Open Position & Equity Specialization:
    - Direct coaching on active open trades (`trades` table) evaluating entry price, unrealized PnL, Stop Loss, Target Price, and Risk/Reward (R:R) ratio.
    - Arbitrary stock ticker search on-demand with live database autocomplete (`/api/tickers/search`) matching symbols and corporate names.
  - Analysis History 3rd Tab & Retention Purge Management:
    - Moved analysis history from cramped left sidebar into a dedicated 3rd tab (`Analysis History`), freeing 100% of horizontal space for full-width ReportViewer and TradingView charts.
    - Dedicated `AnalysisHistoryView` dashboard featuring 4 executive KPI metrics (Total, Average Score, Fresh <30d, Stale >30d), ticker search, status/timeframe filters, and pagination to prevent infinite scrolling.
    - Retention Purge API (`POST /api/analysis/purge`) and interactive modal supporting deletion of stale reports (>30 days), failed runs, or full history reset with confirmation.
    - Freshness warning banner and quick "Re-run with Today's Data" action for reports older than 30 days.
  - Smart Action Conversion Wizard:
    - Two-step micro-modal allowing one-click conversion of AI analyses into either a **Scouting Trade Idea** (with pre-filled triggers, SL, TP, and thesis) or a **Daily Journal Note** (with integrated native WYSIWYG editor, sentiment, and key bullet points).
  - Data & Infrastructure:
    - Unified agnostic LLM factory supporting Gemini, OpenAI, Anthropic, Ollama, and Mock.
    - New `analysis_reports` model and Alembic migration `20261115_0019_add_analysis_reports.py`.
    - REST endpoints under `/api/analysis` (`targets`, `run`, `history`, `detail`, `delete`).
    - LLM Setup Wizard & Per-User Configuration:
    - Interactive LLM Setup Wizard in Settings (`/settings`) allowing users to choose their preferred provider: Google Gemini, OpenAI, Anthropic Claude, Ollama (100% private local), or Mock simulation.
    - Real-time connection ping (`POST /api/analysis/test-llm`) validating API credentials and reporting network latency (ms) before saving.
    - Direct persistence in PostgreSQL user preferences (`user.preferences.llm_config`) with zero database schema migrations or Docker restarts required.
    - Automatic fallback hierarchy: User Preferences → Environment Variables (`.env`) → MockChatClient.
    - Comprehensive `.env.example` reference documenting every server setting and AI parameter.
    - In-app Mock mode banner in Analysis page offering a direct one-click link to Settings.
  - Periodic background portfolio coaching evaluator via APScheduler.
- Calendar & Dashboard Enhancements
  - Monthly calendar view now computes and displays daily realized PnL breakdown categorized by asset class (Stocks, ETFs, Bonds).
  - Added `DashboardSkeleton` animated loader component for smoother KPI loading transitions.
- Documentation & Guides
  - Added dedicated chapter for AI Analysis & Coaching in in-app user guide in both Italian and English (`docs/it/analysis.md`, `docs/en/analysis.md`, `frontend/src/docs/it/analysis.md`, `frontend/src/docs/en/analysis.md`).
- Version bump to 0.3.0 (Backend 0.3.0 / Frontend 0.3.0)

## [0.2.1] - 2026-11-02

- Version bump to 0.2.1 (Backend 0.2.1 / Frontend 0.2.1)

## [0.2.0] - 2026-10-30

- Bond Rate Healing & Euronext MOT Re-Sync
  - Added Alembic migration `20261030_0015_fix_periodic_bond_rates` to heal existing database records storing quarterly/semiannual periodic rates instead of annualized coupon rates. The heal is scoped to BTP Valore step-ups and bonds whose name carries the annual coupon, so legitimately low annual coupons are never inflated; migration `20261030_0016` repairs rows over-healed by the first revision. Both migrations snapshot the original values in `bond_rate_heal_backup`, so `alembic downgrade` can restore them.
  - Fixed BTP Valore step-up schedules and normalized coupons to the nearest 0.05% across factsheets.
  - Added Euronext sync endpoints (`POST /api/assets/{id}/sync-euronext` and `POST /api/portfolio/holdings/{id}/sync-euronext`) to re-fetch live characteristics and prices on demand; both now reject non-bond assets.
  - Frontend: added "Sincronizza Euronext" button on holding details, quick sync button in assets table, and enabled Euronext lookup during asset editing.
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
