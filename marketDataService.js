import { CONFIG } from './config.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const BASE_URL = 'https://api.twelvedata.com/quote';
const DEFAULT_SYMBOLS = {
  ftse: 'INDEXFTSE:FSI',
  sp500: 'SPY',
  nasdaq: 'QQQ',
  dowJones: 'DIA',
  bitcoin: 'BTCUSD',
  gold: 'XAUUSD',
  silver: 'XAGUSD',
  brent: 'BZ=F',
  gbpUsd: 'GBPUSD',
  eurUsd: 'EURUSD'
};
const PRIORITY_SYMBOLS = ['AAPL'];
let LAST_ERROR = null;

const CACHE = new Map();
let lastFetchAt = 0;

function getApiKey() {
  const apiKey = typeof CONFIG?.TWELVE_DATA_API_KEY === 'string' ? CONFIG.TWELVE_DATA_API_KEY.trim() : '';
  return apiKey;
}

function formatNumber(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(digits));
}

function getDisplayValue(symbolKey, quote) {
  if (!quote) return null;
  const price = formatNumber(quote.close, symbolKey === 'gbpUsd' || symbolKey === 'eurUsd' ? 4 : 2);
  if (price == null) return null;

  if (symbolKey === 'bitcoin') return `£${price.toLocaleString('en-GB')}`;
  if (symbolKey === 'gold') return `£${price.toLocaleString('en-GB')}`;
  if (symbolKey === 'silver') return `£${price.toFixed(2)}`;
  if (symbolKey === 'brent') return `$${price.toFixed(2)}`;
  if (symbolKey === 'gbpUsd' || symbolKey === 'eurUsd') return price.toFixed(4);
  return price.toLocaleString('en-GB');
}

function getDisplayChange(quote) {
  if (!quote) return null;
  const change = formatNumber(quote.percent_change, 1);
  if (change == null) return null;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
  return { change: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`, direction };
}

function getStatusFromMeta(quote, fallbackStatus) {
  if (!quote) return fallbackStatus;
  const isSessionOpen = quote.is_market_open !== false;
  if (!isSessionOpen) return 'closed';
  return fallbackStatus;
}

async function fetchQuote(symbol, { logToConsole = true } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Missing Twelve Data API key');
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('interval', '1h');

  const requestUrl = url.toString().replace(apiKey, '[REDACTED]');
  if (logToConsole) {
    console.log('[Twelve Data] Request URL:', requestUrl);
  }

  let response;
  try {
    response = await fetch(url.toString(), { cache: 'no-store' });
  } catch (error) {
    if (logToConsole) {
      console.error('[Twelve Data] Network error:', error);
    }
    LAST_ERROR = { symbol, requestUrl, message: error.message };
    throw error;
  }

  const responseText = await response.text();
  if (logToConsole) {
    console.log('[Twelve Data] Response body:', responseText);
  }

  if (!response.ok) {
    const message = `Twelve Data request failed: ${response.status} ${response.statusText}\n${responseText}`;
    LAST_ERROR = { symbol, requestUrl, responseBody: responseText, message };
    throw new Error(message);
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    const message = `Invalid JSON response: ${responseText}`;
    LAST_ERROR = { symbol, requestUrl, responseBody: responseText, message };
    throw new Error(message);
  }

  if (!payload || payload.code) {
    const message = payload?.message || 'Invalid Twelve Data response';
    LAST_ERROR = { symbol, requestUrl, responseBody: responseText, message };
    throw new Error(message);
  }

  LAST_ERROR = null;
  return payload;
}

async function fetchAllQuotes() {
  const now = Date.now();
  const cached = CACHE.get('all');
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached;
  }

  const prioritySymbols = PRIORITY_SYMBOLS.map((symbol) => ['aapl', symbol]);
  const remainingSymbols = Object.entries(DEFAULT_SYMBOLS);
  const results = {};
  let hadSuccess = false;

  for (const [key, symbol] of prioritySymbols) {
    try {
      const quote = await fetchQuote(symbol);
      results[key] = {
        symbol,
        quote,
        status: getStatusFromMeta(quote, 'live'),
        value: getDisplayValue(key, quote),
        change: getDisplayChange(quote),
        lastUpdated: now
      };
      hadSuccess = true;
      console.log('[Twelve Data] Verified AAPL quote:', quote);
      break;
    } catch (error) {
      console.error(`Unable to load ${key} from Twelve Data`, error);
      throw error;
    }
  }

  if (!hadSuccess) {
    if (cached) {
      return cached;
    }
    throw new Error(LAST_ERROR?.message || 'No market data could be retrieved');
  }

  for (const [key, symbol] of remainingSymbols) {
    try {
      const quote = await fetchQuote(symbol);
      results[key] = {
        symbol,
        quote,
        status: getStatusFromMeta(quote, 'live'),
        value: getDisplayValue(key, quote),
        change: getDisplayChange(quote),
        lastUpdated: now
      };
      hadSuccess = true;
    } catch (error) {
      console.error(`Unable to load ${key} from Twelve Data`, error);
    }
  }

  const resolved = {
    timestamp: now,
    data: {
      ...(cached ? cached.data : {}),
      ...results
    },
    status: 'live'
  };
  CACHE.set('all', resolved);
  lastFetchAt = now;
  return resolved;
}

async function getMarketSnapshot() {
  try {
    return await fetchAllQuotes();
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
