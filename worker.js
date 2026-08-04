const ALLOWED_SYMBOLS = new Set(['AAPL', 'SPY', 'QQQ', 'DIA', 'BTC/USD', 'ETH/USD', 'GBP/USD', 'EUR/USD']);
const ALLOWED_ORIGIN = 'https://mocster1.github.io';
const TWELVE_DATA_QUOTE_URL = 'https://api.twelvedata.com/quote';

function buildCorsHeaders(origin) {
  const allowedOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function sendJson(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  Object.entries(buildCorsHeaders(init.origin || '')).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(payload), { ...init, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin)
      });
    }

    if (request.method !== 'GET') {
      return sendJson({ error: 'Method not allowed' }, { status: 405, origin });
    }

    const symbol = String(url.searchParams.get('symbol') || '').trim().toUpperCase();
    if (!symbol || !ALLOWED_SYMBOLS.has(symbol)) {
      return sendJson({ error: 'Unsupported symbol' }, { status: 400, origin });
    }

    const apiKey = typeof env?.TWELVE_DATA_API_KEY === 'string' ? env.TWELVE_DATA_API_KEY.trim() : '';
    if (!apiKey) {
      return sendJson({ error: 'Missing Twelve Data API key' }, { status: 500, origin });
    }

    const quoteUrl = new URL(TWELVE_DATA_QUOTE_URL);
    quoteUrl.searchParams.set('symbol', symbol);
    quoteUrl.searchParams.set('apikey', apiKey);
    quoteUrl.searchParams.set('interval', '1h');

    try {
      const response = await fetch(quoteUrl.toString(), { headers: { Accept: 'application/json' } });
      const responseText = await response.text();

      if (!response.ok) {
        return sendJson({ error: 'Quote request failed' }, { status: response.status, origin });
      }

      let payload;
      try {
        payload = JSON.parse(responseText);
      } catch (error) {
        return sendJson({ error: 'Invalid quote payload' }, { status: 502, origin });
      }

      const quote = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
        ? payload.data
        : payload;

      const sanitized = {
        data: {
          symbol: quote?.symbol || symbol,
          close: quote?.close ?? null,
          change: quote?.change ?? null,
          percent_change: quote?.percent_change ?? null,
          previous_close: quote?.previous_close ?? null,
          datetime: quote?.datetime ?? null,
          is_market_open: quote?.is_market_open ?? null
        }
      };

      return sendJson(sanitized, { status: 200, origin });
    } catch (error) {
      return sendJson({ error: 'Unexpected quote error' }, { status: 502, origin });
    }
  }
};
