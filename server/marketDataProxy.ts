import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';

const NSE_BASE = 'https://www.nseindia.com';
const YAHOO_BASE = 'https://query1.finance.yahoo.com';

// NSE only serves its JSON API to clients holding a valid session cookie from
// a prior visit to the site; a bare API request without one is rejected.
const NSE_COOKIE_TTL_MS = 4 * 60 * 1000;

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

async function fetchNse(path: string, referer: string): Promise<unknown> {
  const cookie = await getNseCookies();
  const res = await fetch(`${NSE_BASE}${path}`, {
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

async function fetchYahoo(path: string): Promise<unknown> {
  const res = await fetch(`${YAHOO_BASE}${path}`, { headers: BROWSER_HEADERS });
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

async function handleMarketDataRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost');
  const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  if (!symbol) {
    sendJson(res, 400, { error: 'symbol query parameter is required' });
    return;
  }

  if (url.pathname === '/api/nse/quote') {
    const data = await fetchNse(
      `/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
      `${NSE_BASE}/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
    );
    sendJson(res, 200, data);
    return;
  }

  if (url.pathname === '/api/nse/historical') {
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const data = await fetchNse(
      `/api/historical/cm/equity?symbol=${encodeURIComponent(symbol)}&series=[%22EQ%22]&from=${from}&to=${to}`,
      `${NSE_BASE}/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
    );
    sendJson(res, 200, data);
    return;
  }

  if (url.pathname === '/api/yahoo/quote' || url.pathname === '/api/yahoo/historical') {
    const range = url.searchParams.get('range') ?? '1mo';
    const interval = url.searchParams.get('interval') ?? '1d';
    const data = await fetchYahoo(
      `/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}?interval=${interval}&range=${range}`,
    );
    sendJson(res, 200, data);
    return;
  }

  sendJson(res, 404, { error: 'Unknown market data route' });
}

function registerMarketDataRoutes(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((req, res, next) => {
    if (!req.url?.startsWith('/api/nse/') && !req.url?.startsWith('/api/yahoo/')) {
      next();
      return;
    }
    handleMarketDataRequest(req, res).catch((error: Error) => {
      sendJson(res, 502, { error: error.message });
    });
  });
}

// Proxies NSE India and Yahoo Finance from the Vite server process (not the
// browser) so neither CORS restrictions nor NSE's cookie/session requirement
// have to be handled client-side. Only active when running `vite dev` or
// `vite preview`; a static deployment of the built app won't have this route.
export function marketDataProxyPlugin(): Plugin {
  return {
    name: 'market-data-proxy',
    configureServer: registerMarketDataRoutes,
    configurePreviewServer: registerMarketDataRoutes,
  };
}
