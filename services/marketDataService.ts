export type DataSource = 'NSE' | 'YAHOO';

export interface MarketQuote {
  symbol: string;
  price: number;
  change: number | null;
  percentChange: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  source: DataSource;
  timestamp: number;
}

export interface HistoricalBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();

const fetchNseQuote = async (symbol: string): Promise<MarketQuote> => {
  const res = await fetch(`/api/nse/quote?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) {
    throw new Error(`NSE quote request failed (${res.status})`);
  }
  const data = await res.json();
  const priceInfo = data?.priceInfo;
  if (!priceInfo || typeof priceInfo.lastPrice !== 'number') {
    throw new Error('NSE returned no price data');
  }
  return {
    symbol,
    price: priceInfo.lastPrice,
    change: priceInfo.change ?? null,
    percentChange: priceInfo.pChange ?? null,
    open: priceInfo.open ?? null,
    high: priceInfo.intraDayHighLow?.max ?? null,
    low: priceInfo.intraDayHighLow?.min ?? null,
    previousClose: priceInfo.previousClose ?? null,
    source: 'NSE',
    timestamp: Date.now(),
  };
};

const fetchYahooQuote = async (symbol: string): Promise<MarketQuote> => {
  const res = await fetch(`/api/yahoo/quote?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) {
    throw new Error(`Yahoo Finance quote request failed (${res.status})`);
  }
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    throw new Error('Yahoo Finance returned no price data');
  }
  const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
  const change = previousClose != null ? meta.regularMarketPrice - previousClose : null;
  return {
    symbol,
    price: meta.regularMarketPrice,
    change,
    percentChange: change != null && previousClose ? (change / previousClose) * 100 : null,
    open: meta.regularMarketDayLow != null ? result?.indicators?.quote?.[0]?.open?.at(-1) ?? null : null,
    high: meta.regularMarketDayHigh ?? null,
    low: meta.regularMarketDayLow ?? null,
    previousClose,
    source: 'YAHOO',
    timestamp: Date.now(),
  };
};

// Always tries the free NSE India API first; if it errors (down, blocked, or
// the symbol isn't NSE-listed) it transparently falls back to Yahoo Finance.
export const getQuote = async (rawSymbol: string): Promise<MarketQuote> => {
  const symbol = normalizeSymbol(rawSymbol);
  try {
    return await fetchNseQuote(symbol);
  } catch (nseError) {
    console.warn(`NSE quote failed for ${symbol}, falling back to Yahoo Finance:`, (nseError as Error).message);
    return await fetchYahooQuote(symbol);
  }
};

export const getQuotes = async (symbols: string[]): Promise<Record<string, MarketQuote | null>> => {
  const uniqueSymbols = [...new Set(symbols.map(normalizeSymbol))];
  const entries = await Promise.all(
    uniqueSymbols.map(async (symbol): Promise<[string, MarketQuote | null]> => {
      try {
        return [symbol, await getQuote(symbol)];
      } catch (error) {
        console.error(`Failed to fetch quote for ${symbol}:`, error);
        return [symbol, null];
      }
    }),
  );
  return Object.fromEntries(entries);
};

const formatDateForNse = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
};

const fetchNseHistorical = async (symbol: string, from: Date, to: Date): Promise<HistoricalBar[]> => {
  const url = `/api/nse/historical?symbol=${encodeURIComponent(symbol)}&from=${formatDateForNse(from)}&to=${formatDateForNse(to)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NSE historical request failed (${res.status})`);
  }
  const data = await res.json();
  const rows = data?.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('NSE returned no historical data');
  }
  return rows
    .map((row: Record<string, number | string>) => ({
      date: String(row.CH_TIMESTAMP),
      open: Number(row.CH_OPENING_PRICE),
      high: Number(row.CH_TRADE_HIGH_PRICE),
      low: Number(row.CH_TRADE_LOW_PRICE),
      close: Number(row.CH_CLOSING_PRICE),
      volume: Number(row.CH_TOT_TRADED_QTY),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

const rangeForDays = (days: number): string => {
  if (days <= 5) return '5d';
  if (days <= 30) return '1mo';
  if (days <= 90) return '3mo';
  if (days <= 365) return '1y';
  return '5y';
};

const fetchYahooHistorical = async (symbol: string, days: number): Promise<HistoricalBar[]> => {
  const url = `/api/yahoo/historical?symbol=${encodeURIComponent(symbol)}&range=${rangeForDays(days)}&interval=1d`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Yahoo Finance historical request failed (${res.status})`);
  }
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps.length || !quote) {
    throw new Error('Yahoo Finance returned no historical data');
  }
  return timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      volume: quote.volume[i],
    }))
    .filter((bar) => bar.close != null);
};

export const getHistoricalData = async (
  rawSymbol: string,
  days = 90,
): Promise<{ bars: HistoricalBar[]; source: DataSource }> => {
  const symbol = normalizeSymbol(rawSymbol);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  try {
    return { bars: await fetchNseHistorical(symbol, from, to), source: 'NSE' };
  } catch (nseError) {
    console.warn(`NSE historical data failed for ${symbol}, falling back to Yahoo Finance:`, (nseError as Error).message);
    return { bars: await fetchYahooHistorical(symbol, days), source: 'YAHOO' };
  }
};

// Fetches historical OHLCV data (NSE first, Yahoo Finance fallback) and
// triggers a browser download of it as a CSV file on demand.
export const downloadHistoricalCsv = async (rawSymbol: string, days = 90): Promise<DataSource> => {
  const symbol = normalizeSymbol(rawSymbol);
  const { bars, source } = await getHistoricalData(symbol, days);

  const header = 'Date,Open,High,Low,Close,Volume';
  const rows = bars.map((bar) => `${bar.date},${bar.open},${bar.high},${bar.low},${bar.close},${bar.volume}`);
  const csv = [header, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${symbol}_${source.toLowerCase()}_${days}d.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return source;
};
