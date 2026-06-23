# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## What this is

"Gemini Swing Trading Journal" — a client-side React app for logging swing
trades, getting AI trade/chart analysis from Gemini, tracking a watchlist
with live NSE/Yahoo Finance quotes, and (optionally) importing trades from a
broker or a Google Sheet. It was originally generated in Google AI Studio
(see the import map and Tailwind CDN script still present in `index.html`)
but is developed locally as a normal Vite project — `npm run dev`/`build`
bundle dependencies from `node_modules`, so the AI Studio import map and CDN
`<script>` tags in `index.html` are effectively inert in this workflow; don't
remove them without checking the app still works the same in the original AI
Studio preview, but don't treat them as the source of truth for dependency
versions either (`package.json` is).

## Stack

- React 19 + TypeScript, Vite 6
- Tailwind CSS via the CDN script in `index.html` (no Tailwind build step,
  no `tailwind.config.*`)
- `@google/genai` for Gemini calls (client-side, using `process.env.API_KEY`/
  `GEMINI_API_KEY` injected by Vite's `define`)
- `recharts` for charts
- No backend database — trade/profile data persists to `localStorage` only
  (keys `swing-trades`, `user-profile`)

## Repository layout

```
index.tsx, App.tsx           Entry point and root component (view switching, trade state)
types.ts                     Trade, ChatMessage, UserProfile, WatchlistItem, etc.
components/
  JournalView.tsx             Trade list + import actions (broker / Google Sheets)
  TradeModal.tsx / ExitTradeModal.tsx   Add/edit and close-trade forms
  AssistantView.tsx            Gemini chat assistant, chart-image analysis
  WatchlistView.tsx            Live quotes, historical CSV download, watchlist sync
  SettingsView.tsx             Broker API credentials, Google Sheets setup
  ProfileModal.tsx, Icon.tsx, Spinner.tsx
services/
  geminiService.ts            All Gemini API calls (chat, chart analysis, feature ideas, news)
  marketDataService.ts        getQuote/getQuotes/getHistoricalData — calls the dev-server proxy below
  brokerService.ts            Mock broker import (simulated; not a real broker integration)
  googleSheetsService.ts      Google Sheets OAuth + import (requires user's own GCP credentials)
server/
  marketDataProxy.ts           Vite plugin: NSE/Yahoo proxy + on-disk cache + background refresh job
```

## Market data: NSE with Yahoo Finance fallback

This is the most architecturally significant piece of the app — see the
"Market Data" section of `README.md` for the full user-facing explanation.
Key implementation facts an assistant should know before touching it:

- `services/marketDataService.ts` always tries NSE first
  (`/api/nse/quote`, `/api/nse/historical`) and falls back to Yahoo Finance
  (`/api/yahoo/quote`, `/api/yahoo/historical`) on any failure. Keep that
  ordering and fallback behavior when editing.
- Those `/api/nse/*` and `/api/yahoo/*` routes do **not exist** in a deployed
  static build — they're registered by `marketDataProxyPlugin()` in
  `server/marketDataProxy.ts` as a Vite plugin, so they only work under
  `vite dev` or `vite preview`. NSE rejects requests without a session
  cookie and blocks cross-origin browser calls, which is why this must be a
  server-side proxy and not a direct client fetch.
- Responses are cached to disk under `.cache/market-data/` (quotes 5 min,
  historical 24h; gitignored). `syncWatchlist()` posts the current watchlist
  to `/api/watchlist`, and a background `setInterval` job
  (`MARKET_DATA_REFRESH_MS`, default 5 min) keeps those symbols' quote cache
  warm even with no tab open.
- If you add a new market-data route, register it inside
  `handleMarketDataRequest` in `server/marketDataProxy.ts` and wire caching
  through `cachedFetchOrServe` rather than fetching ad hoc.

## Environment variables

- `GEMINI_API_KEY` in `.env.local` — read via `loadEnv` in `vite.config.ts`
  and exposed to client code as `process.env.API_KEY` /
  `process.env.GEMINI_API_KEY` (see the `define` block).
- `MARKET_DATA_REFRESH_MS` — optional, overrides the background watchlist
  refresh interval (ms).

## Known quirks worth knowing before editing

- `services/googleSheetsService.ts` has a hardcoded Google API key and OAuth
  Client ID at the top of the file instead of an env var. These are
  client-side-safe by design (referrer-restricted API key, public OAuth
  client ID), but if you add new Google API integrations, follow the
  existing `isGoogleApiConfigured` check pattern rather than assuming a
  fresh `.env` variable will be wired up automatically.
- `brokerService.ts` is a **mock** — `fetchTradesFromBroker` returns
  hardcoded sample trades regardless of the credentials passed in. Don't
  assume a real broker API is wired up.
- There is no test suite, linter config, or CI workflow in this repo.

## Development workflow

```bash
npm install
npm run dev       # vite — http://localhost:3000 (port set in vite.config.ts), includes the market-data proxy
npm run build     # vite build -> dist/
npm run preview   # vite preview — serves the built dist/, proxy plugin still active
```

There's no `lint`/`test` script; `tsc --noEmit` (via your editor or
`npx tsc --noEmit`) is the closest thing to a correctness check available.

## Conventions

- Path alias `@/*` resolves to the repo root.
- Trade/watchlist state lives in component state + `localStorage`, not a
  global store — new features should follow that pattern unless you're
  deliberately introducing shared state management.
- Market data types (`MarketQuote`, `HistoricalBar`) live in
  `services/marketDataService.ts` itself rather than `types.ts`; domain
  types (`Trade`, `UserProfile`, etc.) live in the top-level `types.ts`.
