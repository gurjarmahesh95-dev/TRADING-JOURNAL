import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { promises as fs } from 'fs';
import path from 'path';

const NSE_BASE = 'https://www.nseindia.com';
const YAHOO_BASE = 'https://query1.finance.yahoo.com';

// NSE only serves its JSON API to clients holding a valid session cookie from
// a prior visit to the site; a bare API request without one is rejected.
const NSE_COOKIE_TTL_MS = 4 * 60 * 1000;

// How long a cached response is served before a fresh fetch is attempted again.
const QUOTE_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORICAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// How often the background job re-fetches quotes for every watchlisted symbol.
const AUTO_REFRESH_INTERVAL_MS = Number(process.env.MARKET_DATA_REFRESH_MS) || 5 * 60 * 1000;

const CACHE_DIR = path.join(process.cwd(), '.cache', 'market-data');
const WATCHLIST_FILE = path.join(CACHE_DIR, 'watchlist.json');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

let nseCookieJar = '';
let nseCookieFetchedAt = 0;

async function getNseCookies(): Promise<string> {
  if (nseCookieJar && Date.now() - nseCookieFetchedAt < NSE_COOKIE_TTL_MS) {
    return nseCookieJar;
  }
  const res = await fetch(`${NSE_BASE}/`, {
    headers: { ...BROWSER_HEADERS, Accept: 'text/html' },
  });
  nseCookieJar = res.headers.get('set-cookie') ?? '';
  nseCookieFetchedAt = Date.now();
  return nseCookieJar;
}

async function fetchNse(urlPath: string, referer: string): Promise<unknown> {
  const cookie = await getNseCookies();
  const res = await fetch(`${NSE_BASE}${urlPath}`, {
    headers: {
      ...BROWSER_HEADERS,
      Accept: 'application/json, text/plain, */*',
      Referer: referer,
      Cookie: cookie,
    },
  });
  if (!res.ok) {
    throw new Error(`NSE request failed with status ${res.status}`);
  }
  return res.json();
}

async function fetchYahoo(urlPath: string): Promise<unknown> {
  const res = await fetch(`${YAHOO_BASE}${urlPath}`, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    throw new Error(`Yahoo Finance request failed with status ${res.status}`);
  }
  return res.json();
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function toYahooSymbol(symbol: string): string {
  return symbol.includes('.') ? symbol : `${symbol}.NS`;
}

function sanitizeCacheKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, '_');
}

interface CacheEntry {
  fetchedAt: number;
  data: unknown;
}

async function readCache(key: string, ttlMs: number): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${sanitizeCacheKey(key)}.json`), 'utf-8');
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > ttlMs) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

async function writeCache(key: string, data: unknown): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = { fetchedAt: Date.now(), data };
  await fs.writeFile(path.join(CACHE_DIR, `${sanitizeCacheKey(key)}.json`), JSON.stringify(entry));
}

// Serves a fresh-enough cached response if one exists on disk; otherwise
// fetches live and persists the result so the next request (or a server
// restart) can be served from the cache instead of hitting NSE/Yahoo again.
async function cachedFetchOrServe(key: string, ttlMs: number, fetcher: () => Promise<unknown>): Promise<unknown> {
  const cached = await readCache(key, ttlMs);
  if (cached) {
    return cached.data;
  }
  const data = await fetcher();
  await writeCache(key, data);
  return data;
}

async function readWatchlist(): Promise<string[]> {
  try {
    const raw = await fs.readFile(WATCHLIST_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeWatchlist(tickers: string[]): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(WATCHLIST_FILE, JSON.stringify(tickers));
}

// Proactively refreshes the on-disk quote cache for one symbol, trying NSE
// first and falling back to Yahoo Finance, mirroring the on-demand fallback
// used when the browser asks for a quote directly.
async function refreshQuoteCache(symbol: string): Promise<void> {
  try {
    const data = await fetchNse(
      `/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
      `${NSE_BASE}/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
    );
    await writeCache(`nse_quote_${symbol}`, data);
    console.log(`[market-data] auto-refreshed NSE quote for ${symbol}`);
  } catch (nseError) {
    console.warn(`[market-data] NSE auto-refresh failed for ${symbol}, trying Yahoo Finance:`, (nseError as Error).message);
    try {
      const data = await fetchYahoo(`/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}?interval=1d&range=5d`);
      await writeCache(`yahoo_quote_${symbol}`, data);
      console.log(`[market-data] auto-refreshed Yahoo Finance quote for ${symbol}`);
    } catch (yahooError) {
      console.warn(`[market-data] Yahoo Finance auto-refresh also failed for ${symbol}:`, (yahooError as Error).message);
    }
  }
}

async function autoRefreshWatchlist(): Promise<void> {
  const tickers = await readWatchlist();
  for (const symbol of tickers) {
    await refreshQuoteCache(symbol);
  }
}

async function handleMarketDataRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost');

  if (url.pathname === '/api/watchlist' && req.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
    const tickers = Array.isArray(body.tickers) ? body.tickers.map((t: string) => t.trim().toUpperCase()).filter(Boolean) : [];
    await writeWatchlist(tickers);
    sendJson(res, 200, { ok: true, tickers });
    return;
  }

  const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  if (!symbol) {
    sendJson(res, 400, { error: 'symbol query parameter is required' });
    return;
  }

  if (url.pathname === '/api/nse/quote') {
    const data = await cachedFetchOrServe(`nse_quote_${symbol}`, QUOTE_CACHE_TTL_MS, () =>
      fetchNse(
        `/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
        `${NSE_BASE}/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
      ),
    );
    sendJson(res, 200, data);
    return;
  }

  if (url.pathname === '/api/nse/historical') {
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const data = await cachedFetchOrServe(`nse_historical_${symbol}_${from}_${to}`, HISTORICAL_CACHE_TTL_MS, () =>
      fetchNse(
        `/api/historical/cm/equity?symbol=${encodeURIComponent(symbol)}&series=[%22EQ%22]&from=${from}&to=${to}`,
        `${NSE_BASE}/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
      ),
    );
    sendJson(res, 200, data);
    return;
  }

  if (url.pathname === '/api/yahoo/quote' || url.pathname === '/api/yahoo/historical') {
    const range = url.searchParams.get('range') ?? '1mo';
    const interval = url.searchParams.get('interval') ?? '1d';
    const cacheTtl = url.pathname === '/api/yahoo/quote' ? QUOTE_CACHE_TTL_MS : HISTORICAL_CACHE_TTL_MS;
    const data = await cachedFetchOrServe(`yahoo_${symbol}_${range}_${interval}`, cacheTtl, () =>
      fetchYahoo(`/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}?interval=${interval}&range=${range}`),
    );
    sendJson(res, 200, data);
    return;
  }

  sendJson(res, 404, { error: 'Unknown market data route' });
}

function registerMarketDataRoutes(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((req, res, next) => {
    if (!req.url?.startsWith('/api/nse/') && !req.url?.startsWith('/api/yahoo/') && !req.url?.startsWith('/api/watchlist')) {
      next();
      return;
    }
    handleMarketDataRequest(req, res).catch((error: Error) => {
      sendJson(res, 502, { error: error.message });
    });
  });

  const intervalId = setInterval(() => {
    autoRefreshWatchlist().catch((error: Error) => {
      console.warn('[market-data] scheduled auto-refresh failed:', error.message);
    });
  }, AUTO_REFRESH_INTERVAL_MS);
  autoRefreshWatchlist().catch(() => {});

  server.httpServer?.once('close', () => clearInterval(intervalId));
}

// Proxies NSE India and Yahoo Finance from the Vite server process (not the
// browser) so neither CORS restrictions nor NSE's cookie/session requirement
// have to be handled client-side. Caches every response to disk under
// .cache/market-data so repeat requests (and a server restart) don't have to
// hit NSE/Yahoo again within the TTL, and runs a background job that keeps
// quotes for the synced watchlist warm on a fixed schedule. Only active when
// running `vite dev` or `vite preview`; a static deployment of the built app
// won't have this route.
export function marketDataProxyPlugin(): Plugin {
  return {
    name: 'market-data-proxy',
    configureServer: registerMarketDataRoutes,
    configurePreviewServer: registerMarketDataRoutes,
  };
}
