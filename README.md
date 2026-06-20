<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1WNWg5SaiTLwF5-I2cMBLueexU9cIF5Mn

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Market Data (NSE, with Yahoo Finance fallback)

The Watchlist view, trade entry price lookup, and live P/L tracking pull real
quotes from the free, public NSE India API. If NSE is unreachable, rate-limited,
or the symbol isn't NSE-listed, the app automatically falls back to Yahoo
Finance's free chart API.

- Enter plain NSE symbols (e.g. `RELIANCE`, `TCS`, `INFY`) in the Watchlist or
  when logging a trade — `getQuote`/`getQuotes` in
  [`services/marketDataService.ts`](services/marketDataService.ts) fetch the
  latest price, and `downloadHistoricalCsv` downloads OHLCV history as a CSV
  whenever you click the download icon next to a watchlist ticker.
- NSE requires a session cookie from a prior visit to nseindia.com and blocks
  direct cross-origin browser requests, so the integration runs through a
  small server-side proxy ([`server/marketDataProxy.ts`](server/marketDataProxy.ts))
  registered as a Vite plugin. This means the market data routes
  (`/api/nse/*`, `/api/yahoo/*`) are only available while running `npm run dev`
  or `npm run preview` — they won't exist if you deploy the static `dist/`
  build elsewhere without an equivalent backend.
- Every quote/historical response fetched through the proxy is cached to disk
  under `.cache/market-data/` (quotes for 5 minutes, historical data for 24
  hours), so repeat requests — and even a dev server restart — are served
  from the cache instead of hitting NSE/Yahoo again within that window. This
  directory is local-only and gitignored.
- Whatever tickers are on your Watchlist are automatically synced to the dev
  server (`POST /api/watchlist`) and kept warm in the background: a scheduled
  job re-fetches each one (NSE first, Yahoo Finance fallback) every 5 minutes
  by default, even if no one has the Watchlist tab open. Override the
  interval with the `MARKET_DATA_REFRESH_MS` environment variable.
