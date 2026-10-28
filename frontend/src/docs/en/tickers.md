# Tickers and Autocomplete

The ticker database lets you search and automatically select the correct symbol when creating a new trade, avoiding typing errors.

## Downloading or Importing Tickers

### 1. One-Click Automatic Sync (Recommended)

You can download and sync equity tickers directly from Euronext servers in real time without manually downloading files:

- **From Brokers $\rightarrow$ Markets**: in the markets table, for each supported Euronext market (e.g. *MTA Euronext Milan*, *Euronext Paris*, *Euronext Amsterdam*, *EuroTLX*), click the download icon in the **Actions** column.
- **From Tickers page**: in the **Download from Euronext** card, click **Sync Milan (Euronext)** or **Sync All Euronext Markets**.

The download and upsert happen in-memory in a few seconds, keeping all existing trades intact.

### 2. Manual CSV Import

Alternatively, you can manually upload a CSV file downloaded from [euronext.com](https://live.euronext.com/en/products/equities/list):
### Import Procedure

1. Go to **Tickers** in the sidebar (Settings section)
2. Click **Import CSV**
3. Select the `Euronext_Equities_*.csv` file
4. The import runs automatically — on completion it shows statistics:
   - **New** tickers inserted
   - **Updated** tickers (already present, data changed)
   - **Skipped** rows (incomplete or invalid)
   - **Total** in the database

> ⚠️ The Euronext CSV uses `;` (semicolon) as delimiter and contains 4 header/metadata rows before the actual data. The system handles these automatically.

## Search and Preview

After importing, on the same page you can search the inserted tickers:

- Type a symbol or name in the search bar
- The table shows: **Symbol**, **Name**, **ISIN**, **Market**, **Currency**

## Autocomplete in New Trade

With tickers imported, the **Symbol** field in the New Trade window shows real-time suggestions:

1. Start typing the ticker (e.g. `AAPL`)
2. A dropdown appears with matching results
3. Results show: symbol (highlighted) + name + market
4. Click to select

### Same Company on Multiple Markets

The same security can have different symbols on different markets:

| Symbol | Market | Description |
|---|---|---|
| `AAPL` | NASDAQ | Apple Inc. on NASDAQ |
| `1AAPL.MI` | Borsa Italiana | Apple Inc. on Borsa Italiana |

Autocomplete shows both options with their reference market.

## Updating the Database

Tickers are updated periodically by Euronext. To refresh the database:

1. Download the new CSV from Euronext
2. Re-import the file — existing tickers are updated (upsert), new ones added

To delete all tickers and start fresh, use the **Clear all** button on the Tickers page.
