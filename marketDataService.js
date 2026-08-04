const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 8;
const REQUEST_HISTORY = [];
const TWELVE_DATA_QUOTE_URL = 'https://api.twelvedata.com/quote';
const SECURE_PROXY_URL = 'https://gjwealth-market-proxy.gerallt-jones.workers.dev/quote';
const ENABLED_SYMBOLS = [
  { id: 'aapl', name: 'Apple', symbol: 'AAPL', kind: 'stock' },
  { id: 'sp500', name: 'S&P 500', symbol: 'SPY', kind: 'etf', note: 'ETF proxy' },
  { id: 'nasdaq', name: 'NASDAQ 100', symbol: 'QQQ', kind: 'etf', note: 'ETF proxy' },
  { id: 'dowJones', name: 'Dow Jones', symbol: 'DIA', kind: 'etf', note: 'ETF proxy' },
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC/USD', kind: 'crypto' },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH/USD', kind: 'crypto' },
  { id: 'gbpUsd', name: 'GBP/USD', symbol: 'GBP/USD', kind: 'forex' },
  { id: 'eurUsd', name: 'EUR/USD', symbol: 'EUR/USD', kind: 'forex' }
];
const DEFAULT_SYMBOLS = Object.fromEntries(ENABLED_SYMBOLS.map((item) => [item.id, item.symbol]));
const PRIORITY_SYMBOLS = ['AAPL'];
let LAST_ERROR = null;
const CACHE = new Map();
let lastFetchAt = 0;
let localConfig = null;
let localConfigLoadAttempted = false;

function isLocalhostEnvironment() {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

async function loadLocalConfig() {
  if (!isLocalhostEnvironment()) {
    return null;
  }

  if (localConfigLoadAttempted) {
    return localConfig;
  }

  localConfigLoadAttempted = true;

  try {
    const module = await import('./config.js');
    localConfig = module?.CONFIG || null;
  } catch (error) {
    localConfig = null;
  }

  return localConfig;
}

async function getApiKey() {
  const config = await loadLocalConfig();
  const apiKey = typeof config?.TWELVE_DATA_API_KEY === 'string' ? config.TWELVE_DATA_API_KEY.trim() : '';
  return apiKey;
}

async function getQuoteEndpointUrl(symbol) {
  if (isLocalhostEnvironment()) {
    const apiKey = await getApiKey();
    if (apiKey) {
      const url = new URL(TWELVE_DATA_QUOTE_URL);
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('interval', '1h');
      url.searchParams.set('apikey', apiKey);
      return url.toString();
    }
  }

  const url = new URL(SECURE_PROXY_URL);
  url.searchParams.set('symbol', symbol);
  return url.toString();
}

function redactUrl(url) {
  return url.replace(/apikey=[^&]+/i, 'apikey=[REDACTED]');
}

function sanitizeErrorResponse(responseText) {
  const trimmed = typeof responseText === 'string' ? responseText.trim() : '';
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.error === 'string') {
        return parsed.error;
      }
      if (typeof parsed.message === 'string') {
        return parsed.message;
      }
      return parsed;
    }
  } catch (error) {
    // Ignore JSON parse errors and fall back to the original text.
  }

  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function formatPrice(value, kind) {
  const numeric = toNumber(value);
  if (numeric == null) {
    return null;
  }
  if (kind === 'forex') {
    return Number(numeric.toFixed(4)).toFixed(4);
  }
  return Number(numeric.toFixed(2)).toFixed(2);
}

function formatChange(changeValue, percentValue) {
  const numericValue = percentValue != null ? percentValue : changeValue;
  if (numericValue == null) {
    return null;
  }
  const rounded = Number(numericValue.toFixed(1));
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}

function getDirection(changeValue, percentValue) {
  const numericValue = percentValue != null ? percentValue : changeValue;
  if (numericValue == null) {
    return 'neutral';
  }
  if (numericValue > 0) {
    return 'up';
  }
  if (numericValue < 0) {
    return 'down';
  }
  return 'neutral';
}

async function waitForRateLimit() {
  let now = Date.now();
  while (REQUEST_HISTORY.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = REQUEST_HISTORY[0];
    const waitMs = REQUEST_WINDOW_MS - (now - oldest);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs + 50));
      now = Date.now();
      continue;
    }
    REQUEST_HISTORY.shift();
  }

  REQUEST_HISTORY.push(now);
}

async function requestJson(url, { symbol, label }) {
  await waitForRateLimit();
  const requestUrl = redactUrl(url);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const responseText = await response.text();
    if (response.status === 429) {
      const message = `Twelve Data rate limited for ${symbol}`;
      LAST_ERROR = { symbol, requestUrl, message };
      throw Object.assign(new Error(message), { status: 429, responseText });
    }

    if (!response.ok) {
      const message = `Twelve Data request failed for ${symbol}: ${response.status}`;
      const responseBody = sanitizeErrorResponse(responseText);
      console.error('[Market data] request failed', {
        status: response.status,
        url: requestUrl,
        response: responseBody
      });
      LAST_ERROR = { symbol, requestUrl, message, response: responseBody };
      throw new Error(message);
    }

    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch (error) {
      const message = `Invalid Twelve Data response for ${symbol}`;
      LAST_ERROR = { symbol, requestUrl, message, response: sanitizeErrorResponse(responseText) };
      throw new Error(message);
    }

    LAST_ERROR = null;
    return { payload, requestUrl, responseText };
  } catch (error) {
    if (error?.status === 429) {
      throw error;
    }
    if (label) {
      console.error(`[Market data] ${label} error for ${symbol}:`, error);
    }
    LAST_ERROR = { symbol, requestUrl, message: error?.message || 'Unknown Twelve Data error' };
    throw error;
  }
}

async function fetchQuote(symbol) {
  const endpointUrl = await getQuoteEndpointUrl(symbol);
  const { payload } = await requestJson(endpointUrl, { symbol, label: 'quote' });

  if (!payload || payload.error) {
    const message = payload?.error || 'Invalid quote payload';
    LAST_ERROR = { symbol, message };
    throw new Error(message);
  }

  const quote = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : payload;

  return quote;
}

function buildSnapshotEntry(item, result) {
  const numericPrice = toNumber(result?.quote?.close);
  const changeValue = toNumber(result?.quote?.change);
  const percentValue = toNumber(result?.quote?.percent_change);
  const status = numericPrice == null
    ? result?.errorStatus || 'unavailable'
    : result?.cached
      ? 'delayed'
      : (result?.quote?.is_market_open === false ? 'market-closed' : 'live');
  const value = numericPrice == null ? '—' : formatPrice(numericPrice, item.kind);
  const changeText = numericPrice == null ? '—' : formatChange(changeValue, percentValue) || '—';
  const direction = numericPrice == null ? 'neutral' : getDirection(changeValue, percentValue);

  return {
    id: item.id,
    name: item.name,
    symbol: item.symbol,
    note: item.note || null,
    value,
    change: changeText,
    direction,
    status,
    datetime: result?.quote?.datetime || null,
    previousClose: result?.quote?.previous_close || null,
    lastUpdated: result?.timestamp || Date.now(),
    cached: !!result?.cached
  };
}

async function resolveSymbol(item, { allowCached = true, forceRefresh = false } = {}) {
  const cacheKey = `quote:${item.symbol}`;
  const cached = CACHE.get(cacheKey);
  const now = Date.now();

  if (!forceRefresh && allowCached && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return {
      ...cached,
      cached: true,
      errorStatus: 'delayed'
    };
  }

  try {
    const quote = await fetchQuote(item.symbol);
    const numericPrice = toNumber(quote?.close);
    if (numericPrice == null) {
      if (allowCached && cached) {
        return {
          ...cached,
          cached: true,
          errorStatus: 'delayed'
        };
      }
      return {
        quote: null,
        errorStatus: 'unavailable'
      };
    }

    const resolved = {
      timestamp: now,
      quote,
      cached: false
    };
    CACHE.set(cacheKey, resolved);
    return resolved;
  } catch (error) {
    if (error?.status === 429) {
      if (allowCached && cached) {
        return {
          ...cached,
          cached: true,
          errorStatus: 'delayed'
        };
      }
      return {
        quote: null,
        errorStatus: 'rate-limited'
      };
    }

    if (allowCached && cached) {
      return {
        ...cached,
        cached: true,
        errorStatus: 'delayed'
      };
    }

    return {
      quote: null,
      errorStatus: 'unavailable'
    };
  }
}

async function fetchAllQuotes({ forceRefresh = false } = {}) {
  const now = Date.now();
  const cachedSnapshot = CACHE.get('snapshot');
  const hasUsableCachedSnapshot = !forceRefresh && cachedSnapshot && typeof cachedSnapshot === 'object' && cachedSnapshot.data && Object.keys(cachedSnapshot.data).length > 0 && now - cachedSnapshot.timestamp < CACHE_TTL_MS;
  if (hasUsableCachedSnapshot) {
    return {
      ...cachedSnapshot,
      status: 'delayed'
    };
  }

  const results = {};

  for (const item of ENABLED_SYMBOLS) {
    const resolved = await resolveSymbol(item, { forceRefresh });
    const entry = buildSnapshotEntry(item, resolved);
    results[item.id] = entry;

    if (item.id === 'aapl') {
      if (entry.status !== 'live' && entry.status !== 'market-closed') {
        break;
      }
    }
  }

  const hasLiveValues = Object.values(results).some((item) => item.status === 'live');
  const hasClosedValues = Object.values(results).some((item) => item.status === 'market-closed');
  const snapshot = {
    timestamp: now,
    data: results,
    status: hasLiveValues ? 'live' : hasClosedValues ? 'closed' : 'delayed'
  };
  CACHE.set('snapshot', snapshot);
  lastFetchAt = now;
  return snapshot;
}

async function getMarketSnapshot(forceRefresh = false) {
  try {
    return await fetchAllQuotes({ forceRefresh });
  } catch (error) {
    console.error('Market data service error', error);
    return {
      data: null,
      error: LAST_ERROR || { message: error?.message || 'Unknown market data error' }
    };
  }
}

globalThis.marketDataService = {
  getMarketSnapshot,
  CACHE_TTL_MS,
  DEFAULT_SYMBOLS
};
