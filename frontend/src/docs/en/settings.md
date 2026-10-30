# Settings and Profile

Go to **Settings** in the sidebar to manage your profile and application preferences.

## Onboarding

After the first login, a dismissible banner guides you through the initial setup: change your credentials, link a broker, create an account, and start journaling. It also warns about the default admin account when it is still in use.

## Account

### Timezone

The **Timezone** field is essential for the correct functioning of the market calendar.

- Select your geographic zone (e.g. `Europe/Rome` for Italy)
- The market calendar automatically converts all times to your timezone
- If not configured, the browser's timezone is used (may differ)

**Common timezones:**

| Timezone | Description |
|---|---|
| `Europe/Rome` | Italy (CET/CEST) |
| `Europe/London` | United Kingdom (GMT/BST) |
| `America/New_York` | US Eastern (EST/EDT) |
| `America/Chicago` | US Central (CST/CDT) |
| `Asia/Tokyo` | Japan (JST) |

### Email, Username and Password

Changing email or password requires confirmation of your **current password**.

1. Enter your **current password** in the dedicated field
2. Enter the new email or new password
3. Click **Save changes**

Your role is shown read-only.

## Admin Users (admin only)

If your account has the `admin` role, the **Admin Users** section lets you:

- List all users with their role
- Create users (username, email, optional password, role `user` or `admin`)
- Edit users (email, username, password, role)
- Delete users — you cannot delete yourself or revoke your own admin role

## Language

The application supports:

- 🇮🇹 **Italian**
- 🇬🇧 **English** (default)

The language is auto-detected from the browser and can be changed here; the in-app manual follows the selection.

## Data Export / Import

- **Export all** — downloads a complete JSON backup (`tradejournal-export-<date>.json`) of all your data: exchanges, brokers, accounts, tickers, trades, executions, trade images, daily notes, assets, holdings, daily snapshots, cash ledger and portfolio snapshots
- **Import all** — restores a JSON backup created with Export

> ⚠️ Import is **additive/upsert**: matching records are updated by their natural keys, new ones are created; nothing is deleted by an import.

## Snapshot Time

Sets the time (default `23:55`) at which the backend runs the **daily snapshot job**:

- **Position snapshots** — for every open trade, fetch the closing price and store quantity, market value, realized and unrealized P&L
- **Portfolio snapshots** — per account, total value, cost, return and return % (used by the Performance page and equity curves)

The job runs once per day, in the server timezone configured via `APP_TIMEZONE`. In this section you can also run manual recomputes to backfill a date.


## Dashboard Chart

Customize the default behavior for the equity curve chart in your Dashboard:

- **Default chart visualization**: select which view to automatically display when opening the Dashboard:
  - **Combined (Portfolio & Equities)** — displays the combined total of all holdings and stock trades (default)
  - **Portfolio (ETFs & Bonds)** — isolates long-term investment holdings and funds
  - **Equities (Stocks & Trading)** — isolates open stock trading positions and allocated trading capital
- Click **Save preferences** to store your choice in your user profile.
## Session

- **Logout** — ends the current session and returns to the login page

---

## Security

- Authentication uses JWT tokens with a limited lifetime; when the token expires you are redirected to the login page
- Registration always creates a standard `user` account — the `admin` role is granted only by an administrator
- Never share your credentials
- Use a strong password of at least 8 characters
- Uploaded trade images are limited to PNG/JPEG/GIF/WebP; other files are rejected

## Version and Info

The current application version is shown at the bottom of the sidebar. Include this information when reporting issues.
