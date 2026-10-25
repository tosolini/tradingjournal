# Changelog

## [Unreleased]

- Notes / discipline tags hardening
  - Preset discipline tags are now persisted as canonical stable keys (`tag_*`)
    and localized only at render time
  - Added normalization for legacy Italian/English preset labels to prevent
    cross-language duplicates in filters/suggestions
- i18n cleanup
  - Removed unused command palette translation keys:
    `category_navigation`, `category_action`, `category_ticker`
- Package naming alignment
  - Renamed package identifiers from `tradejournal-*` to `tradingjournal-*`
    in frontend/backend manifests and lock files

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
