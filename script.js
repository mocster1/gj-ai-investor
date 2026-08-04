const marketItems = [
  { id: 'ftse', name: 'FTSE 100', value: '—', change: '—', direction: 'neutral', status: 'delayed' },
  { id: 'sp500', name: 'S&P 500', value: '—', change: '—', direction: 'neutral', status: 'delayed' },
  { id: 'nasdaq', name: 'NASDAQ', value: '—', change: '—', direction: 'neutral', status: 'delayed' },
  { id: 'dowJones', name: 'Dow Jones', value: '—', change: '—', direction: 'neutral', status: 'delayed' },
  { id: 'bitcoin', name: 'Bitcoin', value: '—', change: '—', direction: 'neutral', status: 'delayed' },
  { id: 'gold', name: 'Gold', value: '—', change: '—', direction: 'neutral', status: 'delayed' },
  { id: 'silver', name: 'Silver', value: '—', change: '—', direction: 'neutral', status: 'delayed' },
  { id: 'brent', name: 'Brent Crude', value: '—', change: '—', direction: 'neutral', status: 'delayed' },
  { id: 'gbpUsd', name: 'GBP/USD', value: '—', change: '—', direction: 'neutral', status: 'delayed' },
  { id: 'eurUsd', name: 'EUR/USD', value: '—', change: '—', direction: 'neutral', status: 'delayed' }
];

const MARKET_STATUS_STORAGE_KEY = 'gj_market_status_v1';
let lastSuccessfulMarketSnapshot = null;
let marketDataStatus = 'delayed';

function persistMarketStatus(status) {
  try {
    localStorage.setItem(MARKET_STATUS_STORAGE_KEY, JSON.stringify({ status, timestamp: Date.now() }));
  } catch (error) {
    console.warn('Unable to save market status', error);
  }
}

function loadMarketStatus() {
  try {
    const raw = localStorage.getItem(MARKET_STATUS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to load market status', error);
    return null;
  }
}

function setDelayedMarketStatus(errorDetail = null) {
  marketDataStatus = 'delayed';
  marketItems.forEach((item) => {
    if (item.status !== 'closed') {
      item.status = 'delayed';
    }
  });
  persistMarketStatus(marketDataStatus);
  if (errorDetail) {
    console.error('[Market UI] Data refresh failed:', errorDetail);
  }
}

function applyMarketSnapshot(snapshot) {
  if (!snapshot || !snapshot.data) {
    return false;
  }

  const saved = loadMarketStatus();
  if (saved && Date.now() - saved.timestamp > 5 * 60 * 1000) {
    marketDataStatus = 'delayed';
  }

  const entries = Object.entries(snapshot.data);
  entries.forEach(([id, data]) => {
    if (!data) return;
    const item = marketItems.find((entry) => entry.id === id);
    if (!item) return;

    const nextStatus = data.status === 'closed' ? 'closed' : 'live';
    const nextValue = data.value || '—';
    const nextChange = data.change ? data.change.change : '—';
    const nextDirection = data.change ? data.change.direction : 'neutral';

    Object.assign(item, {
      value: nextValue,
      change: nextChange,
      direction: nextDirection,
      status: nextStatus
    });

    if (nextStatus === 'live') {
      lastSuccessfulMarketSnapshot = snapshot;
      marketDataStatus = 'live';
      persistMarketStatus(marketDataStatus);
    } else if (nextStatus === 'closed') {
      marketDataStatus = 'closed';
      persistMarketStatus(marketDataStatus);
    }
  });

  return true;
}

function renderMarkets() {
  marketGrid.innerHTML = '';
  marketItems.forEach((market, index) => {
    const item = document.createElement('article');
    item.className = 'market-item';
    item.style.animationDelay = `${index * 40}ms`;
    const statusLabel = market.status === 'live' ? 'LIVE' : market.status === 'closed' ? 'MARKET CLOSED' : 'DELAYED';
    item.innerHTML = `
      <div class="market-item-header">
        <span>${market.name}</span>
        <span class="market-item-status ${market.status === 'live' ? 'live' : market.status === 'closed' ? 'closed' : 'delayed'}">${statusLabel}</span>
      </div>
      <strong>${market.value}</strong>
      <span class="market-change ${market.direction === 'down' ? 'negative' : market.direction === 'up' ? 'positive' : 'neutral'}">${market.change || '—'}</span>
    `;
    marketGrid.appendChild(item);
  });
}

const liveState = {
  bitcoin: false,
  ethereum: false,
  gbpUsd: false,
  lastUpdate: null,
  gbpUsdSourceDate: null
};

const OIL_STORAGE_KEY = 'gj_oil_dashboard_v1';
const OIL_REFRESH_MS = 15 * 60 * 1000;
const OIL_SAMPLE_DATA_URL = './oil-data.json';
const OIL_REGION_LABELS = {
  ukAverage: 'UK Average',
  england: 'England',
  wales: 'Wales',
  scotland: 'Scotland'
};

let oilState = null;
let oilRefreshTimer = null;
let oilChartInstance = null;
let oilActiveRegion = 'ukAverage';

function loadOilStateFromStorage() {
  try {
    const raw = localStorage.getItem(OIL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.averagePencePerLitre !== 'number') return null;
    return parsed;
  } catch (error) {
    console.warn('Unable to read cached heating oil state', error);
    return null;
  }
}

function persistOilState(state) {
  try {
    localStorage.setItem(OIL_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Unable to save heating oil state', error);
  }
}

function formatPencePerLitre(value) {
  return `${Number(value).toFixed(1)} p/l`;
}

function formatSignedPence(value) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(1)} p`;
}

function getTrendDirection(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return '↑';
  if (numeric < 0) return '↓';
  return '→';
}

function getTrendLabel(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return 'rising';
  if (numeric < 0) return 'falling';
  return 'unchanged';
}

function createOilSummary(data, region = 'ukAverage') {
  const series = data.series?.[region] || [];
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  const weekAgo = series[series.length - 8] || series[0];
  const average = series.reduce((sum, point) => sum + point.value, 0) / Math.max(1, series.length);
  const lowest = Math.min(...series.map((point) => point.value));
  const highest = Math.max(...series.map((point) => point.value));
  const dailyChange = latest && previous ? latest.value - previous.value : 0;
  const weeklyChange = latest && weekAgo ? latest.value - weekAgo.value : 0;

  return {
    region,
    regionLabel: OIL_REGION_LABELS[region] || region,
    averagePencePerLitre: Number(average.toFixed(1)),
    lowestPencePerLitre: Number(lowest.toFixed(1)),
    highestPencePerLitre: Number(highest.toFixed(1)),
    dailyChangePence: Number(dailyChange.toFixed(1)),
    weeklyChangePence: Number(weeklyChange.toFixed(1)),
    currentPencePerLitre: Number((latest?.value || 0).toFixed(1)),
    updatedAt: data.updatedAt || Date.now(),
    source: data.source || 'sample',
    series,
    warning: false
  };
}

async function loadHeatingOilData() {
  try {
    const response = await fetch(OIL_SAMPLE_DATA_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Sample data request failed (${response.status})`);
    }
    const payload = await response.json();
    return payload;
  } catch (error) {
    console.warn('Falling back to built-in sample heating oil data', error);
    return {
      source: 'sample',
      updatedAt: Date.now(),
      summary: {
        averagePencePerLitre: 139.8,
        lowestPencePerLitre: 132.9,
        highestPencePerLitre: 145.6,
        dailyChangePence: 1.4,
        weeklyChangePence: 4.8
      },
      series: {
        ukAverage: [
          { date: '2026-07-05', value: 136.2 },
          { date: '2026-07-06', value: 136.5 },
          { date: '2026-07-07', value: 137.1 },
          { date: '2026-07-08', value: 137.6 },
          { date: '2026-07-09', value: 138.2 },
          { date: '2026-07-10', value: 138.7 },
          { date: '2026-07-11', value: 139.1 },
          { date: '2026-07-12', value: 139.6 },
          { date: '2026-07-13', value: 140.1 },
          { date: '2026-07-14', value: 140.8 },
          { date: '2026-07-15', value: 141.2 },
          { date: '2026-07-16', value: 141.7 },
          { date: '2026-07-17', value: 142.1 },
          { date: '2026-07-18', value: 142.4 },
          { date: '2026-07-19', value: 142.9 },
          { date: '2026-07-20', value: 143.2 },
          { date: '2026-07-21', value: 143.7 },
          { date: '2026-07-22', value: 144.0 },
          { date: '2026-07-23', value: 144.4 },
          { date: '2026-07-24', value: 144.8 },
          { date: '2026-07-25', value: 145.1 },
          { date: '2026-07-26', value: 145.3 },
          { date: '2026-07-27', value: 145.6 },
          { date: '2026-07-28', value: 145.2 },
          { date: '2026-07-29', value: 144.9 },
          { date: '2026-07-30', value: 144.4 },
          { date: '2026-07-31', value: 143.8 },
          { date: '2026-08-01', value: 142.9 },
          { date: '2026-08-02', value: 141.8 },
          { date: '2026-08-03', value: 140.7 },
          { date: '2026-08-04', value: 139.8 }
        ],
        england: [
          { date: '2026-07-05', value: 135.4 },
          { date: '2026-07-06', value: 135.8 },
          { date: '2026-07-07', value: 136.3 },
          { date: '2026-07-08', value: 136.9 },
          { date: '2026-07-09', value: 137.3 },
          { date: '2026-07-10', value: 137.9 },
          { date: '2026-07-11', value: 138.3 },
          { date: '2026-07-12', value: 138.9 },
          { date: '2026-07-13', value: 139.4 },
          { date: '2026-07-14', value: 139.9 },
          { date: '2026-07-15', value: 140.5 },
          { date: '2026-07-16', value: 140.9 },
          { date: '2026-07-17', value: 141.3 },
          { date: '2026-07-18', value: 141.7 },
          { date: '2026-07-19', value: 142.1 },
          { date: '2026-07-20', value: 142.6 },
          { date: '2026-07-21', value: 143.0 },
          { date: '2026-07-22', value: 143.4 },
          { date: '2026-07-23', value: 143.8 },
          { date: '2026-07-24', value: 144.1 },
          { date: '2026-07-25', value: 144.5 },
          { date: '2026-07-26', value: 144.8 },
          { date: '2026-07-27', value: 145.2 },
          { date: '2026-07-28', value: 144.8 },
          { date: '2026-07-29', value: 144.2 },
          { date: '2026-07-30', value: 143.7 },
          { date: '2026-07-31', value: 142.9 },
          { date: '2026-08-01', value: 142.0 },
          { date: '2026-08-02', value: 141.1 },
          { date: '2026-08-03', value: 140.2 },
          { date: '2026-08-04', value: 139.1 }
        ],
        wales: [
          { date: '2026-07-05', value: 138.8 },
          { date: '2026-07-06', value: 139.2 },
          { date: '2026-07-07', value: 139.7 },
          { date: '2026-07-08', value: 140.0 },
          { date: '2026-07-09', value: 140.4 },
          { date: '2026-07-10', value: 140.9 },
          { date: '2026-07-11', value: 141.3 },
          { date: '2026-07-12', value: 141.9 },
          { date: '2026-07-13', value: 142.3 },
          { date: '2026-07-14', value: 142.8 },
          { date: '2026-07-15', value: 143.2 },
          { date: '2026-07-16', value: 143.7 },
          { date: '2026-07-17', value: 144.1 },
          { date: '2026-07-18', value: 144.6 },
          { date: '2026-07-19', value: 145.0 },
          { date: '2026-07-20', value: 145.3 },
          { date: '2026-07-21', value: 145.9 },
          { date: '2026-07-22', value: 146.2 },
          { date: '2026-07-23', value: 146.7 },
          { date: '2026-07-24', value: 147.0 },
          { date: '2026-07-25', value: 147.4 },
          { date: '2026-07-26', value: 147.7 },
          { date: '2026-07-27', value: 148.1 },
          { date: '2026-07-28', value: 147.8 },
          { date: '2026-07-29', value: 147.4 },
          { date: '2026-07-30', value: 146.9 },
          { date: '2026-07-31', value: 146.3 },
          { date: '2026-08-01', value: 145.6 },
          { date: '2026-08-02', value: 144.9 },
          { date: '2026-08-03', value: 144.0 },
          { date: '2026-08-04', value: 143.0 }
        ],
        scotland: [
          { date: '2026-07-05', value: 137.6 },
          { date: '2026-07-06', value: 138.0 },
          { date: '2026-07-07', value: 138.4 },
          { date: '2026-07-08', value: 138.8 },
          { date: '2026-07-09', value: 139.2 },
          { date: '2026-07-10', value: 139.6 },
          { date: '2026-07-11', value: 140.0 },
          { date: '2026-07-12', value: 140.4 },
          { date: '2026-07-13', value: 141.0 },
          { date: '2026-07-14', value: 141.4 },
          { date: '2026-07-15', value: 141.8 },
          { date: '2026-07-16', value: 142.2 },
          { date: '2026-07-17', value: 142.6 },
          { date: '2026-07-18', value: 142.9 },
          { date: '2026-07-19', value: 143.3 },
          { date: '2026-07-20', value: 143.7 },
          { date: '2026-07-21', value: 144.1 },
          { date: '2026-07-22', value: 144.4 },
          { date: '2026-07-23', value: 144.8 },
          { date: '2026-07-24', value: 145.2 },
          { date: '2026-07-25', value: 145.6 },
          { date: '2026-07-26', value: 145.9 },
          { date: '2026-07-27', value: 146.3 },
          { date: '2026-07-28', value: 146.0 },
          { date: '2026-07-29', value: 145.6 },
          { date: '2026-07-30', value: 145.2 },
          { date: '2026-07-31', value: 144.7 },
          { date: '2026-08-01', value: 144.0 },
          { date: '2026-08-02', value: 143.3 },
          { date: '2026-08-03', value: 142.4 },
          { date: '2026-08-04', value: 141.2 }
        ]
      }
    };
  }
}

function renderOilDashboard(nextState = oilState, options = {}) {
  const state = { ...oilState, ...nextState };
  oilState = state;

  const badge = document.getElementById('oil-status-badge');
  const sourcePill = document.getElementById('oil-source-pill');
  const updatedEl = document.getElementById('oil-last-updated');
  const priceEl = document.getElementById('oil-price');
  const captionEl = document.getElementById('oil-price-caption');
  const warningEl = document.getElementById('oil-warning');
  const shellEl = document.getElementById('oil-card-shell');
  const oilCard = document.getElementById('oil');
  const averageEl = document.getElementById('oil-average');
  const lowestEl = document.getElementById('oil-lowest');
  const highestEl = document.getElementById('oil-highest');
  const dailyChangeEl = document.getElementById('oil-daily-change');
  const weeklyChangeEl = document.getElementById('oil-weekly-change');
  const trendEl = document.getElementById('oil-trend');

  if (options.isLoading) {
    if (shellEl) shellEl.classList.add('is-loading');
    if (captionEl) captionEl.textContent = 'Refreshing the latest UK heating oil snapshot…';
    if (badge) badge.textContent = 'Refreshing';
    return;
  }

  const dailyChangePence = Number(state.dailyChangePence || 0);
  const weeklyChangePence = Number(state.weeklyChangePence || 0);

  if (shellEl) shellEl.classList.remove('is-loading');
  if (priceEl) priceEl.innerHTML = `<span class="oil-price-value">${formatPencePerLitre(state.currentPencePerLitre || 0)}</span>`;
  if (captionEl) captionEl.textContent = `${state.regionLabel} • ${state.source === 'live' ? 'Live feed' : 'Sample data'} • updated ${new Date(state.updatedAt || Date.now()).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  if (averageEl) averageEl.textContent = formatPencePerLitre(state.averagePencePerLitre || 0);
  if (lowestEl) lowestEl.textContent = formatPencePerLitre(state.lowestPencePerLitre || 0);
  if (highestEl) highestEl.textContent = formatPencePerLitre(state.highestPencePerLitre || 0);
  if (dailyChangeEl) dailyChangeEl.textContent = `${dailyChangePence >= 0 ? '+' : ''}${dailyChangePence.toFixed(1)} p`;
  if (weeklyChangeEl) weeklyChangeEl.textContent = `${weeklyChangePence >= 0 ? '+' : ''}${weeklyChangePence.toFixed(1)} p`;
  if (trendEl) trendEl.textContent = `${getTrendDirection(dailyChangePence)} ${getTrendLabel(dailyChangePence)}`;
  if (updatedEl) updatedEl.textContent = `Last updated ${formatTimestamp(state.updatedAt || Date.now())}`;
  if (sourcePill) sourcePill.textContent = state.source === 'live' ? 'Live UK quote' : 'Local sample data';
  if (badge) {
    badge.textContent = state.source === 'live' ? 'Live' : 'Sample';
    badge.className = `status-pill ${state.source === 'live' ? 'status-live' : 'status-partial'}`;
  }
  if (warningEl) {
    warningEl.hidden = !state.warning;
    warningEl.textContent = state.warning ? 'Using cached pricing because the live feed is temporarily unavailable.' : '';
  }
  if (oilCard) {
    oilCard.classList.remove('is-visible');
    void oilCard.offsetWidth;
    oilCard.classList.add('is-visible');
  }
}

function drawOilChart(series, region) {
  const canvas = document.getElementById('oil-chart-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const labels = series.map((point) => point.date);
  const data = series.map((point) => point.value);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#4cc9f0';
  const isDark = getComputedStyle(document.documentElement).colorScheme === 'dark';

  if (oilChartInstance) {
    oilChartInstance.destroy();
  }

  oilChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${region} trend`,
        data,
        borderColor: color.trim(),
        backgroundColor: isDark ? 'rgba(76, 201, 240, 0.15)' : 'rgba(76, 201, 240, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: 'var(--muted)', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: 'var(--muted)' }, grid: { color: 'rgba(255,255,255,0.06)' } }
      }
    }
  });
}

function updateOilRegion(region) {
  oilActiveRegion = region;
  document.querySelectorAll('.oil-filter').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-oil-region') === region);
  });
  if (oilState && oilState.series) {
    drawOilChart(oilState.series[region] || [], OIL_REGION_LABELS[region] || region);
    renderOilDashboard({ region, regionLabel: OIL_REGION_LABELS[region] || region, currentPencePerLitre: oilState.series[region]?.slice(-1)[0]?.value || 0, averagePencePerLitre: oilState.averagePencePerLitre || oilState.summary?.averagePencePerLitre, lowestPencePerLitre: oilState.lowestPencePerLitre || oilState.summary?.lowestPencePerLitre, highestPencePerLitre: oilState.highestPencePerLitre || oilState.summary?.highestPencePerLitre, dailyChangePence: oilState.dailyChangePence || oilState.summary?.dailyChangePence, weeklyChangePence: oilState.weeklyChangePence || oilState.summary?.weeklyChangePence, updatedAt: oilState.updatedAt, source: oilState.source });
  }
}

async function refreshHeatingOilData() {
  renderOilDashboard({ ...oilState, warning: false }, { isLoading: true });

  try {
    const payload = await loadHeatingOilData();
    const summary = createOilSummary(payload, oilActiveRegion);
    const nextState = { ...payload, ...summary, summary: payload.summary || summary };
    oilState = nextState;
    persistOilState(nextState);
    renderOilDashboard(nextState);
    drawOilChart(nextState.series[oilActiveRegion] || [], OIL_REGION_LABELS[oilActiveRegion] || oilActiveRegion);
  } catch (error) {
    const previousState = { ...(oilState || {}), warning: true, updatedAt: (oilState && oilState.updatedAt) || Date.now() };
    oilState = previousState;
    persistOilState(previousState);
    renderOilDashboard(previousState);
  }
}

function startOilAutoRefresh() {
  if (oilRefreshTimer) {
    clearInterval(oilRefreshTimer);
  }
  oilRefreshTimer = setInterval(() => {
    refreshHeatingOilData();
  }, OIL_REFRESH_MS);
}

function setupLazySectionLoader(sectionId, callback) {
  const section = document.getElementById(sectionId);
  if (!section) {
    callback();
    return;
  }

  if (!('IntersectionObserver' in window)) {
    callback();
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        callback();
        obs.disconnect();
      }
    });
  }, { rootMargin: '220px' });

  observer.observe(section);
}

const wealthItems = [
  { title: 'Cash', metric: '£125.00', note: 'Liquidity buffer' },
  { title: 'Investments', metric: 'To model', note: 'Paper portfolio focus' },
  { title: 'Pensions', metric: 'To model', note: 'Long-term planning' },
  { title: 'Property', metric: 'To model', note: 'Legacy asset view' }
];

const WATCHLIST_STORAGE_KEY = 'gj_watchlist_v1';
const WATCHLIST_DEFAULTS = [
  { symbol: 'NVDA', name: 'NVIDIA', value: '+2.1%', direction: 'up' },
  { symbol: 'TSLA', name: 'Tesla', value: '-0.8%', direction: 'down' },
  { symbol: 'SHEL', name: 'Shell', value: '+1.4%', direction: 'up' }
];

let watchlistItems = loadWatchlist();

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return WATCHLIST_DEFAULTS.map((item) => ({ ...item }));
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : WATCHLIST_DEFAULTS.map((item) => ({ ...item }));
  } catch (error) {
    console.warn('Unable to load watchlist', error);
    return WATCHLIST_DEFAULTS.map((item) => ({ ...item }));
  }
}

function saveWatchlist() {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistItems));
  } catch (error) {
    console.warn('Unable to save watchlist', error);
  }
}

function renderWatchlist() {
  watchlistList.innerHTML = '';
  if (!watchlistItems.length) {
    watchlistList.innerHTML = '<div class="muted-text">No symbols yet. Add one above to monitor it.</div>';
    return;
  }
  watchlistItems.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'watchlist-item';
    row.innerHTML = `
      <div>
        <strong>${item.symbol || item.name}</strong>
        <span>${item.name || item.symbol}</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.6rem;">
        <span class="${item.direction === 'down' ? 'negative' : 'positive'}">${item.value || '—'}</span>
        <button class="ghost-btn" data-watchlist-remove="${item.symbol || item.name}" aria-label="Remove ${item.symbol || item.name}">Remove</button>
      </div>
    `;
    watchlistList.appendChild(row);
  });
}

function addWatchlistItem(symbol, name) {
  const trimmedSymbol = (symbol || '').trim().toUpperCase();
  const trimmedName = (name || trimmedSymbol).trim();
  if (!trimmedSymbol) return;
  if (watchlistItems.some((item) => (item.symbol || item.name).toUpperCase() === trimmedSymbol)) return;
  watchlistItems.unshift({ symbol: trimmedSymbol, name: trimmedName, value: '+0.0%', direction: 'up' });
  saveWatchlist();
  renderWatchlist();
}

function removeWatchlistItem(symbol) {
  watchlistItems = watchlistItems.filter((item) => (item.symbol || item.name).toUpperCase() !== symbol.toUpperCase());
  saveWatchlist();
  renderWatchlist();
}

const newsItems = [
  { title: 'Policy tone stays constructive', detail: 'Central banks signal patience while growth remains resilient.', source: 'Reuters', time: '08:15' },
  { title: 'Energy supply risk persists', detail: 'Oil volatility remains elevated ahead of the next supply update.', source: 'Bloomberg', time: '09:40' },
  { title: 'Risk appetite holds', detail: 'Quality names continue to lead as volatility stays under control.', source: 'FT', time: '10:05' }
];

// News state
const NEWS_REFRESH_MINUTES = 15;
let newsState = { lastUpdate: null, latest: [], sentiment: { label: 'Neutral', confidence: 50, explanation: '' }, available: false };

async function fetchRssFeed(url) {
  try {
    // route through a free CORS proxy to avoid cross-origin restrictions
    const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    const res = await fetch(proxy);
    if (!res.ok) throw new Error('Network error');
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    const items = Array.from(doc.querySelectorAll('item')).slice(0,10).map(i => ({
      title: i.querySelector('title')?.textContent || '',
      link: i.querySelector('link')?.textContent || i.querySelector('guid')?.textContent || '#',
      source: i.querySelector('source')?.textContent || '',
      pubDate: i.querySelector('pubDate')?.textContent || ''
    }));
    return items;
  } catch (error) {
    console.warn('fetchRssFeed failed', error);
    return null;
  }
}

function analyseHeadlineSentiment(headline) {
  const lower = headline.toLowerCase();
  const bullish = ['rally','rise','rises','up','gain','gains','positive','beat','beats','outperform','strong','bullish','soar','soars','surge','surges','growth','record high','record highs','recovery','rate cut','easing','approval'];
  const bearish = ['fall','falls','down','drop','drops','negative','miss','misses','weak','bearish','plunge','plunges','decline','declines','recession','inflation','rate hike','conflict','sanction','sanctions','warning','downgrade','sell-off','selloff'];

  // helper negation: simple check for 'not' or "n't" within 3 words before keyword
  function isNegated(h, idx) {
    const windowText = h.slice(Math.max(0, idx - 40), idx); // previous ~40 chars
    return /\b(not|no|never|n't)\b/.test(windowText);
  }

  let score = 0;
  bullish.forEach(k => {
    let pos = lower.indexOf(k);
    while (pos !== -1) {
      if (!isNegated(lower, pos)) score += 2; // bullish weight
      pos = lower.indexOf(k, pos + 1);
    }
  });
  bearish.forEach(k => {
    let pos = lower.indexOf(k);
    while (pos !== -1) {
      if (!isNegated(lower, pos)) score -= 2; // bearish weight
      pos = lower.indexOf(k, pos + 1);
    }
  });
  let label = 'Neutral';
  if (score > 1) label = 'Bullish';
  else if (score < -1) label = 'Bearish';
  return { score, label };
}

function calculateOverallNewsSentiment(headlines) {
  const per = headlines.map(h => {
    const res = analyseHeadlineSentiment(h || '');
    return { headline: h, score: res.score, label: res.label };
  });
  const totalScore = per.reduce((s, p) => s + p.score, 0);
  const maxPer = 2 * 3; // assume up to 3 keyword hits * weight 2 per headline
  const maxPossible = Math.max(1, per.length * maxPer);
  // map to -100..100
  const normalized = Math.round((totalScore / maxPossible) * 100);
  const confidence = Math.min(100, Math.round((Math.abs(totalScore) / maxPossible) * 100));
  const bullish = per.filter(p => p.label === 'Bullish').length;
  const bearish = per.filter(p => p.label === 'Bearish').length;
  const neutral = per.filter(p => p.label === 'Neutral').length;
  const label = normalized > 10 ? 'Bullish' : normalized < -10 ? 'Bearish' : 'Neutral';
  const explanation = `Headlines analysed: ${per.length}. Bullish ${bullish}, Neutral ${neutral}, Bearish ${bearish}.`;
  return { per, totalScore, normalized, confidence, bullish, neutral, bearish, label, explanation };
}

async function refreshMarketNews() {
  const listEl = document.getElementById('market-news-list');
  const loading = document.getElementById('news-loading');
  const lastUpdateEl = document.getElementById('news-last-update');
  const warning = document.getElementById('news-warning');
  const sentimentLabel = document.getElementById('news-sentiment-label');
  const sentimentConf = document.getElementById('news-sentiment-confidence');
  const explanationNews = document.getElementById('explanation-news-summary');

  if (loading) loading.style.display = 'inline';
  if (warning) warning.style.display = 'none';

  const feedUrl = 'https://feeds.bbci.co.uk/news/business/rss.xml';
  const items = await fetchRssFeed(feedUrl);
  if (!items) {
    newsState.available = false;
    if (loading) loading.style.display = 'none';
    if (warning) warning.style.display = 'block';
    return;
  }

  newsState.latest = items;
  newsState.lastUpdate = Date.now();
  newsState.available = true;

  // sentiment analysis per requirements
  const headlines = items.map(i => i.title || '');
  const overall = calculateOverallNewsSentiment(headlines);
  newsState.sentiment = overall;

  // render
  listEl.innerHTML = '';
  items.slice(0,8).forEach((it) => {
    const row = document.createElement('div');
    row.className = 'news-row';
    const date = it.pubDate ? new Date(it.pubDate).toLocaleString('en-GB') : '';
    const category = it.category || '';
    row.innerHTML = `<div><a href="${it.link}" target="_blank" rel="noopener noreferrer">${it.title}</a><div class="muted-text">${it.source || ''}${category? ' · '+category:''} · ${date}</div></div>`;
    listEl.appendChild(row);
  });

  if (loading) loading.style.display = 'none';
  if (lastUpdateEl) lastUpdateEl.textContent = new Date(newsState.lastUpdate).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
  if (sentimentLabel) sentimentLabel.textContent = overall.label;
  if (sentimentConf) sentimentConf.textContent = `${overall.confidence}%`;
  if (explanationNews) explanationNews.textContent = `Sentiment score: ${overall.normalized} · Confidence: ${overall.confidence}% · Adjustment: ${Math.round(((overall.normalized/100)*10))}`;

  // Integrate with AI recommendation by adjusting its confidence, capped to ±10
  try {
    const adjustment = Math.round((overall.normalized / 100) * 10);
    const capped = Math.max(-10, Math.min(10, adjustment));
    window.newsSentimentAdjustment = capped;
  } catch (e) {
    window.newsSentimentAdjustment = 0;
  }

  // create alerts for strong sentiment
  try {
    if (overall.confidence >= 70 && overall.label !== 'Neutral') {
      const key = `news:${overall.label}`;
      createAlert('news', `News: ${overall.label}`, `Overall news sentiment is ${overall.label} (${overall.confidence}%)`, 'Warning', key);
    }
  } catch (e) {}

  // recalc AI recommendation
  runAIRecommendation();
  // check alerts
  checkAlerts();
}

// Auto-refresh news every 15 minutes
refreshMarketNews();
setInterval(refreshMarketNews, NEWS_REFRESH_MINUTES * 60 * 1000);

// manual button
const refreshNewsBtn = document.getElementById('refresh-news-btn');
if (refreshNewsBtn) refreshNewsBtn.addEventListener('click', refreshMarketNews);

// ALERTS: in-app notification centre
const ALERTS_KEY = 'gj_alerts_v1';
const ALERT_PREFS_KEY = 'gj_alert_prefs_v1';
let alerts = [];
let alertPrefs = null;
let lastAlertStates = { priceAlerts: {}, aiRecommendation: null, portfolioFlag: null, liveDataAvailable: true, newsStrong: null };

function loadAlertPreferences() {
  try {
    const raw = localStorage.getItem(ALERT_PREFS_KEY);
    if (!raw) return saveAlertPreferences({ price: true, ai: true, portfolio: true, live: true, news: true });
    alertPrefs = JSON.parse(raw);
    return alertPrefs;
  } catch (e) {
    console.error('loadAlertPreferences', e);
    alertPrefs = { price: true, ai: true, portfolio: true, live: true, news: true };
    saveAlertPreferences(alertPrefs);
    return alertPrefs;
  }
}

function saveAlertPreferences(prefs) {
  try {
    localStorage.setItem(ALERT_PREFS_KEY, JSON.stringify(prefs));
    alertPrefs = prefs;
  } catch (e) {
    console.error('saveAlertPreferences', e);
  }
}

function loadAlerts() {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) { alerts = []; saveAlerts(); return alerts; }
    alerts = JSON.parse(raw) || [];
    return alerts;
  } catch (e) {
    console.error('loadAlerts', e);
    alerts = [];
    saveAlerts();
    return alerts;
  }
}

function saveAlerts() {
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    renderAlerts();
  } catch (e) {
    console.error('saveAlerts', e);
  }
}

function renderAlerts() {
  const panel = document.getElementById('alerts-panel');
  const list = document.getElementById('alerts-list');
  const countEl = document.getElementById('notification-count');
  if (!list) return;
  list.innerHTML = '';
  const unread = alerts.filter(a => !a.read).length;
  if (countEl) {
    if (unread > 0) { countEl.style.display = 'inline-block'; countEl.textContent = String(unread); } else { countEl.style.display = 'none'; }
  }
  alerts.slice(0,200).forEach((a) => {
    const el = document.createElement('div');
    el.style.padding = '0.55rem';
    el.style.borderRadius = '0.6rem';
    el.style.background = a.read ? 'rgba(255,255,255,0.02)' : 'linear-gradient(90deg, rgba(124,58,237,0.08), rgba(76,201,240,0.06))';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;gap:0.5rem"><div style="flex:1"><strong>${a.title}</strong><div class=\"muted-text\">${a.message}</div><div class=\"muted-text\">${new Date(a.timestamp).toLocaleString('en-GB')}</div></div><div style=\"margin-left:0.4rem;display:flex;flex-direction:column;gap:0.4rem\"><button class=\"ghost-btn mark-read-btn\" data-id=\"${a.id}\">${a.read? 'Mark unread':'Mark read'}</button></div></div>`;
    list.appendChild(el);
  });
}

function createAlert(type, title, message, severity = 'Info', dedupeKey = null) {
  if (!alertPrefs) loadAlertPreferences();
  // map type to pref key
  const typeMap = { price: 'price', ai: 'ai', portfolio: 'portfolio', live: 'live', news: 'news' };
  const prefKey = typeMap[type] || 'price';
  if (!alertPrefs[prefKey]) return null;
  // dedupe: if dedupeKey provided, skip if exists recent
  if (dedupeKey) {
    const exists = alerts.find(a => a.dedupe === dedupeKey);
    if (exists) return null;
  }
  const id = `${type}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
  const alert = { id, type, title, message, severity, timestamp: Date.now(), read: false, dedupe: dedupeKey };
  alerts.unshift(alert);
  saveAlerts();
  // show panel badge
  const btn = document.getElementById('notification-button');
  if (btn) btn.setAttribute('aria-expanded','true');
  return alert;
}

function markAlertRead(id) {
  const a = alerts.find(x => x.id === id);
  if (!a) return;
  a.read = !a.read;
  saveAlerts();
}

function markAllRead() {
  alerts.forEach(a => a.read = true);
  saveAlerts();
}

function clearAlerts() {
  alerts = [];
  saveAlerts();
}

// wire alert panel buttons
const notifBtn = document.getElementById('notification-button');
if (notifBtn) notifBtn.addEventListener('click', () => {
  const panel = document.getElementById('alerts-panel');
  if (!panel) return;
  const isOpen = panel.style.display === 'block';
  panel.style.display = isOpen ? 'none' : 'block';
  notifBtn.setAttribute('aria-expanded', String(!isOpen));
});
const markAllBtn = document.getElementById('mark-all-read');
if (markAllBtn) markAllBtn.addEventListener('click', () => { markAllRead(); });
const clearBtn = document.getElementById('clear-alerts');
if (clearBtn) clearBtn.addEventListener('click', () => { clearAlerts(); });

// delegate mark-read buttons
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('mark-read-btn')) {
    const id = e.target.getAttribute('data-id');
    markAlertRead(id);
  }
});

// initialise alerts & prefs
loadAlertPreferences();
loadAlerts();
renderAlerts();

// wire settings UI
function populateAlertSettings() {
  const pPrice = document.getElementById('pref-price');
  const pAi = document.getElementById('pref-ai');
  const pPort = document.getElementById('pref-portfolio');
  const pLive = document.getElementById('pref-live');
  const pNews = document.getElementById('pref-news');
  if (!alertPrefs) loadAlertPreferences();
  if (pPrice) pPrice.checked = !!alertPrefs.price;
  if (pAi) pAi.checked = !!alertPrefs.ai;
  if (pPort) pPort.checked = !!alertPrefs.portfolio;
  if (pLive) pLive.checked = !!alertPrefs.live;
  if (pNews) pNews.checked = !!alertPrefs.news;
}

populateAlertSettings();

const savePrefsBtn = document.getElementById('save-prefs');
if (savePrefsBtn) savePrefsBtn.addEventListener('click', () => {
  const pPrice = document.getElementById('pref-price');
  const pAi = document.getElementById('pref-ai');
  const pPort = document.getElementById('pref-portfolio');
  const pLive = document.getElementById('pref-live');
  const pNews = document.getElementById('pref-news');
  const prefs = {
    price: !!(pPrice && pPrice.checked),
    ai: !!(pAi && pAi.checked),
    portfolio: !!(pPort && pPort.checked),
    live: !!(pLive && pLive.checked),
    news: !!(pNews && pNews.checked),
  };
  saveAlertPreferences(prefs);
  renderAlerts();
});

const resetPrefsBtn = document.getElementById('reset-prefs');
if (resetPrefsBtn) resetPrefsBtn.addEventListener('click', () => {
  const defaults = { price: true, ai: true, portfolio: true, live: true, news: true };
  saveAlertPreferences(defaults);
  populateAlertSettings();
});

const marketGrid = document.getElementById('market-grid');
const tickerTrack = document.getElementById('ticker-track');
const mobileTickerTrack = document.getElementById('mobile-ticker-track');
const marketTicker = document.querySelector('.market-ticker');
const mobileMarketTicker = document.querySelector('.mobile-market-ticker');
const sidebar = document.querySelector('.sidebar');
const navToggle = document.querySelector('.mobile-nav-toggle');
const mobileDrawer = document.getElementById('mobile-drawer-nav');
const portfolioStats = document.getElementById('portfolio-stats');
const watchlistList = document.getElementById('watchlist-list');
const newsList = document.getElementById('news-list');
const refreshButton = document.querySelector('[data-refresh]');
const briefingRefreshButton = document.querySelector('[data-briefing-refresh]');
const briefingTime = document.getElementById('briefing-time');
const aiScoreValue = document.getElementById('ai-score-value');
const explanationToggle = document.querySelector('[data-explanation-toggle]');
const explanationPanel = document.getElementById('recommendation-explanation');
const explanationStorageKey = 'gj-ai-why-open';

function renderPortfolioStats() {
  portfolioStats.innerHTML = '';
  wealthItems.forEach((item) => {
    const stat = document.createElement('div');
    stat.className = 'portfolio-stat';
    stat.innerHTML = `
      <span>${item.title}</span>
      <strong>${item.metric}</strong>
    `;
    portfolioStats.appendChild(stat);
  });
}

function renderPortfolioInsight() {
  const portfolio = loadPortfolio();
  const values = calculatePortfolioValues(portfolio);
  const winners = Object.values(values.assets).filter((asset) => asset.profitLoss > 0).sort((a, b) => b.profitLoss - a.profitLoss);
  const losers = Object.values(values.assets).filter((asset) => asset.profitLoss < 0).sort((a, b) => a.profitLoss - b.profitLoss);
  const insight = document.getElementById('ai-insight');
  if (!insight) return;
  const topWinner = winners[0];
  const topLoser = losers[0];
  insight.innerHTML = `
    <div class="muted-text">Why markets moved today</div>
    <strong>${values.total > 0 ? 'Momentum remains constructive with rate-sensitive assets leading the move.' : 'Risk remains elevated as markets digest macro data.'}</strong>
    <div class="muted-text">Biggest winner: ${topWinner ? (topWinner.asset || '—') : '—'} · Biggest loser: ${topLoser ? (topLoser.asset || '—') : '—'}</div>
    <div class="muted-text">Risk level: ${values.returnPct < -5 ? 'High' : values.returnPct > 5 ? 'Moderate' : 'Balanced'} · AI confidence: ${Math.max(70, Math.min(95, 75 + (values.totalPL > 0 ? 5 : 0)))}%</div>
  `;
}

function renderNews() {
  newsList.innerHTML = '';
  newsItems.forEach((item) => {
    const listItem = document.createElement('li');
    listItem.className = 'news-item';
    listItem.innerHTML = `
      <h3>${item.title}</h3>
      <p>${item.detail}</p>
      <div class="muted-text">${item.source || 'Financial Times'} · ${item.time || 'Just now'}</div>
    `;
    newsList.appendChild(listItem);
  });
}

function formatGBP(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatGbpUsd(value) {
  return Number(value).toFixed(4);
}

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatMarketValue(id, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }
  if (id === 'bitcoin' || id === 'ethereum') {
    return `£${numeric.toLocaleString('en-GB')}`;
  }
  if (id === 'brent') {
    return `$${numeric.toFixed(1)}`;
  }
  if (id === 'gbpUsd' || id === 'eurUsd') {
    return numeric.toFixed(2);
  }
  if (id === 'gold') {
    return `£${numeric.toFixed(0)}`;
  }
  if (id === 'silver') {
    return `£${numeric.toFixed(2)}`;
  }
  return numeric.toLocaleString('en-GB');
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function updateMarketItem(id, updates) {
  const item = marketItems.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  Object.assign(item, updates);
}

async function loadSampleMarketData() {
  try {
    const response = await fetch('./market-data.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Market sample request failed (${response.status})`);
    }
    const payload = await response.json();
    return payload;
  } catch (error) {
    console.warn('Falling back to live market data sources', error);
    return null;
  }
}

function applySampleMarketData(payload) {
  const assets = Array.isArray(payload?.assets) ? payload.assets : [];
  if (!assets.length) {
    return false;
  }

  const map = new Map(assets.map((item) => [item.id, item]));
  marketItems.forEach((item) => {
    const match = map.get(item.id);
    if (!match) {
      return;
    }
    updateMarketItem(item.id, {
      value: formatMarketValue(match.id, match.value),
      change: formatPercent(Number(match.change)),
      direction: match.direction || 'neutral',
      status: 'demo'
    });
  });

  return true;
}

function parseNumeric(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return NaN;
  }
  return Number(value.replace(/[£$,%]/g, '').trim());
}

function getMarketHealthScore() {
  const healthElement = document.querySelector('.market-gauge strong');
  const raw = healthElement?.textContent || '';
  const value = parseNumeric(raw);
  return Number.isFinite(value) ? value : 0;
}

function computeAIRecommendation() {
  const bitcoin = marketItems.find((item) => item.id === 'bitcoin');
  const ethereum = marketItems.find((item) => item.id === 'ethereum');
  const gbpUsd = marketItems.find((item) => item.id === 'gbpUsd');
  const healthScore = getMarketHealthScore();

  const btcChange = parseNumeric(bitcoin?.change);
  const ethChange = parseNumeric(ethereum?.change);
  const gbpUsdValue = parseNumeric(gbpUsd?.value);
  const gbpUsdMovement = Number.isFinite(gbpUsdValue) ? ((gbpUsdValue - 1.27) / 1.27) * 100 : 0;

  const volatility = Math.max(Math.abs(btcChange || 0), Math.abs(ethChange || 0));
  const sentiment = (btcChange || 0) * 0.4 + (ethChange || 0) * 0.4 + gbpUsdMovement * 0.2 + (healthScore - 50) * 0.1;
  const allLive = liveState.bitcoin && liveState.ethereum && liveState.gbpUsd;
  const partialLive = [liveState.bitcoin, liveState.ethereum, liveState.gbpUsd].filter(Boolean).length > 0;

  let recommendation = 'HOLD';
  if (!allLive && !partialLive) {
    recommendation = 'DO NOTHING TODAY';
  } else if (sentiment >= 4 && healthScore >= 60 && volatility < 6) {
    recommendation = 'BUY';
  } else if (sentiment >= 0 && healthScore >= 50) {
    recommendation = 'HOLD';
  } else if (sentiment <= -4 || volatility >= 8) {
    recommendation = 'SELL';
  } else {
    recommendation = 'DO NOTHING TODAY';
  }

  let risk = 'Medium';
  if (volatility < 3 && healthScore >= 65 && sentiment >= 2) {
    risk = 'Low';
  } else if (volatility >= 6 || healthScore < 50) {
    risk = 'High';
  }

  let allocation = risk === 'Low' ? 'Up to 5%' : 'Up to 10%';
  let stopLoss = risk === 'Low' ? '3%' : risk === 'Medium' ? '6%' : '10%';
  let review = risk === 'Low' ? 'Next Week' : risk === 'Medium' ? 'This Week' : 'Tomorrow';

  let confidence = Math.round(Math.min(100, Math.max(20, 50 + sentiment * 4 - volatility * 2 + (healthScore - 50) * 0.5)));
  if (!Number.isFinite(confidence)) {
    confidence = 40;
  }

  // Apply small adjustment from news sentiment analysis if available
  try {
    const newsAdj = typeof window.newsSentimentAdjustment === 'number' ? window.newsSentimentAdjustment : 0;
    if (newsAdj !== 0) {
      confidence = Math.round(Math.min(100, Math.max(0, confidence + newsAdj)));
    }
  } catch (e) {
    // ignore
  }

  const explanationLines = [];
  if (allLive) {
    explanationLines.push(`Bitcoin moved ${btcChange >= 0 ? 'up' : 'down'} ${Math.abs(btcChange).toFixed(1)}% in the last 24h.`);
    explanationLines.push(`Ethereum moved ${ethChange >= 0 ? 'up' : 'down'} ${Math.abs(ethChange).toFixed(1)}% in the last 24h.`);
    explanationLines.push(`GBP/USD moved ${gbpUsdMovement >= 0 ? 'up' : 'down'} ${Math.abs(gbpUsdMovement).toFixed(2)}% relative to the baseline.`);
    explanationLines.push(`Market health is ${healthScore}%, which suggests ${healthScore >= 60 ? 'a positive' : 'a cautious'} environment.`);
    explanationLines.push(`Volatility is ${volatility.toFixed(1)}%, which is considered ${volatility < 4 ? 'low' : volatility < 7 ? 'moderate' : 'high'}.`);
  } else {
    explanationLines.push('Live market data is partially unavailable, so the engine is using fallback demo values.');
    if (partialLive) {
      explanationLines.push('Some live values are present, but the recommendation is still conservative.');
    }
    explanationLines.push(`Market health is ${healthScore}%.`);
    explanationLines.push(`Bitcoin change is ${Number.isFinite(btcChange) ? `${btcChange >= 0 ? 'up' : 'down'} ${Math.abs(btcChange).toFixed(1)}%` : 'unavailable'}.`);
    explanationLines.push(`Ethereum change is ${Number.isFinite(ethChange) ? `${ethChange >= 0 ? 'up' : 'down'} ${Math.abs(ethChange).toFixed(1)}%` : 'unavailable'}.`);
  }

  // add news sentiment to explanation when present
  try {
    if (newsState && newsState.available) {
      explanationLines.push(`News sentiment: ${newsState.sentiment.label} (${newsState.sentiment.confidence}%)`);
    } else {
      explanationLines.push('News analysis unavailable; relying on market data only.');
    }
  } catch (e) {
    // ignore
  }

  if (recommendation === 'DO NOTHING TODAY') {
    explanationLines.push('The engine prefers to wait for clearer live signals before taking action.');
  }

  // Determine which rules triggered for explainability
  const triggeredRules = [];
  if (sentiment >= 4 && healthScore >= 60 && volatility < 6) triggeredRules.push('Strong positive momentum with low volatility -> BUY');
  if (sentiment >= 0 && healthScore >= 50) triggeredRules.push('Neutral-to-positive signals -> HOLD');
  if (sentiment <= -4 || volatility >= 8) triggeredRules.push('Negative momentum or high volatility -> SELL/Reduce exposure');
  if (!allLive && partialLive) triggeredRules.push('Partial live data -> Reduced confidence');
  if (!allLive && !partialLive) triggeredRules.push('Fallback demo data -> Conservative stance');

  const dataQuality = allLive ? 'Live' : partialLive ? 'Partially Live' : 'Demo Fallback';
  const affectedAssets = (btcChange || ethChange) ? 'Bitcoin & Ethereum' : 'Market';

  return {
    recommendation,
    confidence,
    risk,
    allocation,
    stopLoss,
    review,
    reason: allLive ? 'The rule-based engine analyzed live price movement, FX flow and market health to set a recommendation.' : 'This recommendation is based on fallback demo values while live feed is unavailable.',
    explanationLines,
    liveData: allLive,
    partialLive,
    triggeredRules,
    dataQuality,
    affectedAssets
  };
}

// Public generator: returns a fully-formed recommendation object and protects against NaN/undefined
function generateInvestmentRecommendation() {
  try {
    const raw = computeAIRecommendation();
    // sanitize values
    const safe = Object.assign({}, raw);
    safe.confidence = Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(100, Math.round(raw.confidence))) : 40;
    safe.risk = raw.risk || 'Medium';
    safe.recommendation = raw.recommendation || 'DO NOTHING TODAY';
    safe.allocation = raw.allocation || 'Up to 5%';
    safe.stopLoss = raw.stopLoss || '5%';
    safe.review = raw.review || 'This Week';
    safe.reason = raw.reason || 'Rule-based AI analysis using available market feeds.';
    safe.explanationLines = Array.isArray(raw.explanationLines) ? raw.explanationLines : [];
    safe.triggeredRules = Array.isArray(raw.triggeredRules) ? raw.triggeredRules : [];
    safe.dataQuality = raw.dataQuality || (raw.liveData ? 'Live' : raw.partialLive ? 'Partially Live' : 'Demo Fallback');
    safe.affectedAssets = raw.affectedAssets || 'Market';
    return safe;
  } catch (error) {
    console.error('generateInvestmentRecommendation error', error);
    return {
      recommendation: 'DO NOTHING TODAY',
      confidence: 30,
      risk: 'High',
      allocation: 'Up to 5%',
      stopLoss: '10%',
      review: 'This Week',
      reason: 'Fallback rule triggered due to internal error.',
      explanationLines: [],
      triggeredRules: ['Internal error - fallback'],
      dataQuality: 'Demo Fallback',
      affectedAssets: 'Market'
    };
  }
}

function updateAIRecommendationUI() {
  const title = document.getElementById('recommendation-title');
  const confidence = document.getElementById('ai-confidence');
  const risk = document.getElementById('ai-risk');
  const allocation = document.getElementById('ai-allocation');
  const stopLoss = document.getElementById('ai-stop-loss');
  const review = document.getElementById('ai-review');
  const reason = document.getElementById('recommendation-reason');
  const updated = document.getElementById('recommendation-updated');
  const explanationTitle = document.getElementById('explanation-title');
  const explanationConfidence = document.getElementById('explanation-confidence');
  const explanationRisk = document.getElementById('explanation-risk');
  const explanationAllocation = document.getElementById('explanation-allocation');
  const explanationExit = document.getElementById('explanation-exit');
  const reasonList = document.getElementById('recommendation-reason-list');

  const results = generateInvestmentRecommendation();
  const now = new Date();

  if (title) title.textContent = results.recommendation;
  if (confidence) confidence.textContent = `${results.confidence}%`;
  if (risk) risk.textContent = results.risk;
  if (allocation) allocation.textContent = results.allocation;
  if (stopLoss) stopLoss.textContent = results.stopLoss;
  if (review) review.textContent = results.review;
  if (reason) reason.textContent = results.reason;
  if (updated) updated.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (explanationTitle) explanationTitle.textContent = results.recommendation;
  if (explanationConfidence) explanationConfidence.textContent = `${results.confidence}%`;
  if (explanationRisk) explanationRisk.textContent = results.risk;
  if (explanationAllocation) explanationAllocation.textContent = results.allocation;
  if (explanationExit) explanationExit.textContent = `Stop loss set at ${results.stopLoss}`;

  const dataQualityEl = document.getElementById('ai-data-quality');
  const assetEl = document.getElementById('recommendation-asset');
  const explanationRulesList = document.getElementById('explanation-rules-list');
  const explanationDataQuality = document.getElementById('explanation-data-quality');

  if (dataQualityEl) dataQualityEl.textContent = results.dataQuality;
  if (assetEl) assetEl.textContent = results.affectedAssets;
  if (explanationDataQuality) explanationDataQuality.textContent = results.dataQuality;

  if (explanationRulesList) {
    explanationRulesList.innerHTML = results.triggeredRules.map((r) => `<li>${r}</li>`).join('');
  }

  if (reasonList) {
    reasonList.innerHTML = results.explanationLines.map((line) => `<li>${line}</li>`).join('');
  }
}

function runAIRecommendation() {
  try {
    const prev = window.lastAIRecommendation || null;
    const results = generateInvestmentRecommendation();
    if (prev && prev !== results.recommendation) {
      createAlert('ai', 'AI recommendation changed', `Recommendation changed from ${prev} to ${results.recommendation}`, 'Info', `ai:${results.recommendation}`);
    }
    window.lastAIRecommendation = results.recommendation;
  } catch (e) {
    console.error('runAIRecommendation', e);
  }
  updateAIRecommendationUI();
}

function updateLiveStatusDisplay() {
  const liveStatusPill = document.getElementById('live-status-pill');
  const liveStatusCopy = document.getElementById('live-status-copy');
  let label = 'Delayed';
  let pillClass = 'status-offline';
  let extraCopy = 'No fresh market snapshot available';

  if (marketDataStatus === 'live') {
    label = 'Live data connected';
    pillClass = 'status-live';
    extraCopy = 'Twelve Data quotes refreshed successfully';
  } else if (marketDataStatus === 'closed') {
    label = 'Market closed';
    pillClass = 'status-partial';
    extraCopy = 'Markets are closed; showing latest available values';
  }

  if (liveStatusPill) {
    liveStatusPill.textContent = label;
    liveStatusPill.className = `status-pill ${pillClass}`;
  }

  if (liveStatusCopy) {
    const timeText = lastSuccessfulMarketSnapshot ? formatTimestamp(lastSuccessfulMarketSnapshot.timestamp || Date.now()) : 'never';
    liveStatusCopy.textContent = `Last update: ${timeText} · ${extraCopy}`;
  }
}

async function fetchCoinGeckoData() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=gbp&include_24hr_change=true&include_last_updated_at=true';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CoinGecko responded ${response.status}`);
    }

    const data = await response.json();

    ['bitcoin', 'ethereum'].forEach((id) => {
      const coin = data[id];
      if (!coin || typeof coin.gbp !== 'number') {
        console.warn(`Missing CoinGecko data for ${id}`);
        return;
      }

      const formattedPrice = formatGBP(coin.gbp);
      const formattedChange = formatPercent(coin.gbp_24h_change);
      const direction = coin.gbp_24h_change >= 0 ? 'up' : 'down';

      updateMarketItem(id, {
        value: formattedPrice,
        change: formattedChange,
        direction,
        status: 'live'
      });

      liveState[id] = true;
    });

    return true;
  } catch (error) {
    console.error('CoinGecko data fetch failed:', error);
    return false;
  }
}

async function fetchFrankfurterData() {
  const url = 'https://api.frankfurter.dev/v1/latest?base=GBP&symbols=USD';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Frankfurter responded ${response.status}`);
    }

    const data = await response.json();
    if (!data || typeof data.rates?.USD !== 'number') {
      throw new Error('Invalid Frankfurter response');
    }

    const formattedValue = formatGbpUsd(data.rates.USD);

    updateMarketItem('gbpUsd', {
      value: formattedValue,
      change: '',
      direction: 'neutral',
      status: 'live'
    });

    liveState.gbpUsd = true;
    liveState.gbpUsdSourceDate = data.date;
    return true;
  } catch (error) {
    console.error('Frankfurter data fetch failed:', error);
    return false;
  }
}

async function tryApplyOfflineFallback(errorDetail = null) {
  try {
    const payload = await loadSampleMarketData();
    const applied = applySampleMarketData(payload);
    if (applied) {
      if (errorDetail) {
        console.warn('[Market UI] Using offline fallback because live data failed:', errorDetail);
      }
      return true;
    }
  } catch (fallbackError) {
    console.error('[Market UI] Offline fallback failed:', fallbackError);
  }

  if (errorDetail) {
    console.error('[Market UI] Live data failed and no offline fallback was available:', errorDetail);
  }
  return false;
}

async function refreshMarketData() {
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = 'Updating...';
  }

  const snapshot = await marketDataService.getMarketSnapshot();
  let usedFallback = false;

  if (snapshot && snapshot.data) {
    const success = applyMarketSnapshot(snapshot);
    if (!success) {
      usedFallback = await tryApplyOfflineFallback(snapshot.error || null);
    }
  } else {
    usedFallback = await tryApplyOfflineFallback(snapshot?.error || null);
  }

  if (!usedFallback) {
    setDelayedMarketStatus(snapshot?.error || null);
  }

  renderMarkets();
  renderTicker();
  updateLiveStatusDisplay();
  runAIRecommendation();

  if (refreshButton) {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Refresh Markets';
  }
}

function renderTicker() {
  const repeatedItems = [...marketItems, ...marketItems];
  const tickerMarkup = repeatedItems.map((item) => {
    const badgeText = item.status === 'live' ? 'LIVE' : item.status === 'closed' ? 'CLOSED' : 'DELAYED';
    return `
      <div class="ticker-item">
        <span class="ticker-name">${item.name}</span>
        <span class="ticker-badge ${item.status === 'live' ? 'live' : item.status === 'closed' ? 'closed' : 'delayed'}">${badgeText}</span>
        <span class="ticker-value">${item.value}</span>
        <span class="ticker-change ${item.direction === 'down' ? 'negative' : item.direction === 'up' ? 'positive' : 'neutral'}">${item.change || '—'}</span>
      </div>
    `;
  }).join('');

  if (tickerTrack) {
    tickerTrack.innerHTML = tickerMarkup;
  }

  if (mobileTickerTrack) {
    mobileTickerTrack.innerHTML = tickerMarkup;
  }
}

function setupTickerInteraction(container) {
  if (!container) {
    return;
  }

  let isTouching = false;

  const stopAnimation = () => {
    const track = container.querySelector('.ticker-track');
    if (track) {
      track.classList.add('ticker-paused');
    }
  };

  const startAnimation = () => {
    const track = container.querySelector('.ticker-track');
    if (track) {
      track.classList.remove('ticker-paused');
    }
  };

  container.addEventListener('mouseenter', stopAnimation);
  container.addEventListener('mouseleave', () => {
    if (!isTouching) {
      startAnimation();
    }
  });

  container.addEventListener('touchstart', () => {
    isTouching = true;
    stopAnimation();
  }, { passive: true });

  container.addEventListener('touchend', () => {
    isTouching = false;
    startAnimation();
  });

  container.addEventListener('touchcancel', () => {
    isTouching = false;
    startAnimation();
  });
}

function updateBriefingTime() {
  if (briefingTime) {
    briefingTime.textContent = `Updated ${new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }
}

function animateAiScore() {
  if (!aiScoreValue) {
    return;
  }

  const target = 82;
  let current = 0;
  const step = () => {
    current += 1;
    aiScoreValue.textContent = current;
    if (current < target) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

function openMobileDrawer() {
  if (!sidebar || !navToggle || !mobileDrawer) {
    return;
  }

  sidebar.classList.add('is-open');
  navToggle.setAttribute('aria-expanded', 'true');
}

function closeMobileDrawer() {
  if (!sidebar || !navToggle || !mobileDrawer) {
    return;
  }

  sidebar.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
}

if (navToggle && sidebar && mobileDrawer) {
  navToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = sidebar.classList.contains('is-open');
    if (isOpen) {
      closeMobileDrawer();
    } else {
      openMobileDrawer();
    }
  });

  mobileDrawer.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      closeMobileDrawer();
    });
  });

  document.addEventListener('click', (event) => {
    const clickedInside = sidebar.contains(event.target);
    if (!clickedInside && sidebar.classList.contains('is-open')) {
      closeMobileDrawer();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMobileDrawer();
    }
  });
}

function setExplanationState(isOpen) {
  if (!explanationToggle || !explanationPanel) {
    return;
  }

  explanationToggle.setAttribute('aria-expanded', String(isOpen));
  explanationPanel.classList.toggle('is-open', isOpen);
  explanationPanel.setAttribute('aria-hidden', String(!isOpen));

  try {
    sessionStorage.setItem(explanationStorageKey, String(isOpen));
  } catch (error) {
    console.warn('Unable to persist explanation panel state', error);
  }
}

if (explanationToggle && explanationPanel) {
  explanationToggle.addEventListener('click', () => {
    const isOpen = explanationToggle.getAttribute('aria-expanded') !== 'true';
    setExplanationState(isOpen);
  });

  let storedState = null;
  try {
    storedState = sessionStorage.getItem(explanationStorageKey);
  } catch (error) {
    console.warn('Unable to read explanation panel state', error);
  }

  if (storedState === 'true') {
    setExplanationState(true);
  } else {
    setExplanationState(false);
  }
}

if (refreshButton) {
  refreshButton.addEventListener('click', async () => {
    await refreshMarketData();
  });
}

if (briefingRefreshButton) {
  briefingRefreshButton.addEventListener('click', () => {
    briefingRefreshButton.textContent = 'Briefing refreshed';
    updateBriefingTime();
    setTimeout(() => {
      briefingRefreshButton.textContent = 'Refresh briefing';
    }, 1200);
  });
}

renderMarkets();
renderPortfolioStats();
renderWatchlist();
renderNews();
renderTicker();
setupTickerInteraction(document.querySelector('.market-ticker'));
setupTickerInteraction(document.querySelector('.mobile-market-ticker'));
updateLiveStatusDisplay();
runAIRecommendation();
renderOilDashboard(oilState);
refreshHeatingOilData();
startOilAutoRefresh();
refreshMarketData();
setInterval(refreshMarketData, 300000);
updateBriefingTime();
animateAiScore();

/** Portfolio: paper trading simulation **/
const PORTFOLIO_KEY = 'gj_portfolio_v1';
const ANALYTICS_HISTORY_KEY = 'gj_portfolio_analytics_v1';
const ANALYTICS_GOAL_KEY = 'gj_portfolio_goal_v1';
const STARTING_CASH = 500;
let analyticsHistory = [];
let selectedGoal = 2500;
let portfolioValueChart = null;
let cumulativePlChart = null;
let allocationPieChart = null;
let monthlyPerformanceChart = null;

function defaultPortfolio() {
  return {
    cash: STARTING_CASH,
    holdings: {
      bitcoin: { quantity: 0, avgPrice: 0 },
      ethereum: { quantity: 0, avgPrice: 0 }
    },
    transactions: []
  };
}

function loadPortfolio() {
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    if (!raw) return defaultPortfolio();
    const data = JSON.parse(raw);
    // basic validation
    if (typeof data.cash !== 'number') return defaultPortfolio();
    data.holdings = data.holdings || defaultPortfolio().holdings;
    data.transactions = Array.isArray(data.transactions) ? data.transactions : [];
    return data;
  } catch (error) {
    console.error('loadPortfolio', error);
    return defaultPortfolio();
  }
}

function savePortfolio(portfolio) {
  try {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio));
  } catch (error) {
    console.error('savePortfolio', error);
  }
}

function resetPortfolio() {
  if (!confirm('Reset portfolio? This will clear holdings and history.')) return;
  const p = defaultPortfolio();
  savePortfolio(p);
  renderPortfolio();
}

function getPriceForAsset(id) {
  const item = marketItems.find(m => m.id === id);
  if (!item) return null;
  const num = parseNumeric(item.value);
  return Number.isFinite(num) ? num : null;
}

function calculatePortfolioValues(portfolio) {
  const btcPrice = getPriceForAsset('bitcoin');
  const ethPrice = getPriceForAsset('ethereum');
  const holdings = portfolio.holdings;
  let invested = 0;
  let costBasis = 0;
  const assets = {};

  Object.keys(holdings).forEach((key) => {
    const entry = holdings[key];
    const qty = Number(entry.quantity) || 0;
    const avg = Number(entry.avgPrice) || 0;
    const price = key === 'bitcoin' ? btcPrice : ethPrice;
    const marketValue = price && qty ? price * qty : 0;
    const pl = marketValue - (avg * qty);
    assets[key] = { qty, avg, price: price || null, marketValue, profitLoss: pl };
    invested += marketValue;
    costBasis += avg * qty;
  });

  const total = (portfolio.cash || 0) + invested;
  const totalPL = invested - costBasis;
  const returnPct = costBasis > 0 ? (totalPL / costBasis) * 100 : 0;

  return { assets, invested, total, totalPL, returnPct, costBasis };
}

function addTransaction(portfolio, type, asset, gbpAmount, qty, price) {
  portfolio.transactions.unshift({
    timestamp: Date.now(),
    type,
    asset,
    gbpAmount: Number(gbpAmount),
    quantity: Number(qty),
    price: Number(price)
  });
}

function buyAsset(amountGbp, asset) {
  const portfolio = loadPortfolio();
  const price = getPriceForAsset(asset);
  const validationEl = document.getElementById('trade-validation');
  if (!price) { if (validationEl) validationEl.textContent = 'Live price unavailable for selected asset.'; return false; }
  const amount = Number(amountGbp);
  if (!isFinite(amount) || amount <= 0) { if (validationEl) validationEl.textContent = 'Enter a valid positive amount.'; return false; }
  if (amount > portfolio.cash) { if (validationEl) validationEl.textContent = 'Insufficient cash.'; return false; }
  const qty = amount / price;
  if (!confirm(`Confirm buy ${formatGBP(amount)} of ${asset} at ${formatGBP(price)}?`)) return false;

  // update holdings
  const h = portfolio.holdings[asset] || { quantity: 0, avgPrice: 0 };
  const oldCost = h.quantity * h.avgPrice;
  const newQty = h.quantity + qty;
  const newAvg = newQty > 0 ? (oldCost + amount) / newQty : 0;
  portfolio.holdings[asset] = { quantity: newQty, avgPrice: newAvg };
  portfolio.cash = Math.round((portfolio.cash - amount) * 100) / 100;
  addTransaction(portfolio, 'BUY', asset, amount, qty, price);
  savePortfolio(portfolio);
  renderPortfolio();
  if (validationEl) validationEl.textContent = '';
  return true;
}

function sellAsset(amountGbp, asset) {
  const portfolio = loadPortfolio();
  const price = getPriceForAsset(asset);
  const validationEl = document.getElementById('trade-validation');
  if (!price) { if (validationEl) validationEl.textContent = 'Live price unavailable for selected asset.'; return false; }
  const amount = Number(amountGbp);
  if (!isFinite(amount) || amount <= 0) { if (validationEl) validationEl.textContent = 'Enter a valid positive amount.'; return false; }
  const qty = amount / price;
  const h = portfolio.holdings[asset] || { quantity: 0, avgPrice: 0 };
  if (qty > h.quantity + 1e-12) { if (validationEl) validationEl.textContent = 'Cannot sell more than your holding.'; return false; }
  if (!confirm(`Confirm sell ${qty.toFixed(8)} ${asset} for ${formatGBP(amount)} at ${formatGBP(price)}?`)) return false;

  const remainingQty = h.quantity - qty;
  if (remainingQty <= 1e-12) {
    portfolio.holdings[asset] = { quantity: 0, avgPrice: 0 };
  } else {
    portfolio.holdings[asset] = { quantity: remainingQty, avgPrice: h.avgPrice };
  }
  portfolio.cash = Math.round((portfolio.cash + amount) * 100) / 100;
  addTransaction(portfolio, 'SELL', asset, amount, qty, price);
  savePortfolio(portfolio);
  renderPortfolio();
  if (validationEl) validationEl.textContent = '';
  return true;
}

function renderPortfolio() {
  const portfolio = loadPortfolio();
  const vals = calculatePortfolioValues(portfolio);
  document.getElementById('pf-total').textContent = formatGBP(vals.total);
  document.getElementById('pf-cash').textContent = formatGBP(portfolio.cash);
  document.getElementById('pf-invested').textContent = formatGBP(vals.invested);
  document.getElementById('pf-pl').textContent = formatGBP(vals.totalPL);
  document.getElementById('pf-return').textContent = `${vals.returnPct.toFixed(2)}%`;
  document.getElementById('pf-count').textContent = Object.values(portfolio.holdings).filter(h=>h.quantity>0).length;

  // holdings list
  const holdingsList = document.getElementById('holdings-list');
  holdingsList.innerHTML = '';
  Object.keys(vals.assets).forEach((key) => {
    const a = vals.assets[key];
    const row = document.createElement('div');
    row.className = 'watchlist-item';
    const name = key === 'bitcoin' ? 'Bitcoin' : 'Ethereum';
    const qty = a.qty || 0;
    const avg = a.avg || 0;
    const price = a.price || 0;
    const marketValue = a.marketValue || 0;
    const pl = a.profitLoss || 0;
    row.innerHTML = `
      <div>
        <strong>${name}</strong>
        <div class="muted-text">Qty: ${qty.toFixed(8)} · Avg ${formatGBP(avg)}</div>
      </div>
      <div style="text-align:right">
        <div>${formatGBP(price || 0)}</div>
        <div class="muted-text">${formatGBP(marketValue)} · ${formatGBP(pl)}</div>
      </div>
    `;
    holdingsList.appendChild(row);
  });

  // transactions
  const txEl = document.getElementById('transaction-history');
  txEl.innerHTML = '';
  portfolio.transactions.slice(0,200).forEach((tx) => {
    const d = new Date(tx.timestamp);
    const row = document.createElement('div');
    row.className = 'tx-row';
    row.innerHTML = `
      <div style="min-width:180px">${d.toLocaleString('en-GB')}</div>
      <div style="flex:1">${tx.type} ${tx.asset}</div>
      <div style="min-width:140px;text-align:right">${formatGBP(tx.gbpAmount)} · ${tx.quantity.toFixed(8)} @ ${formatGBP(tx.price)}</div>
    `;
    txEl.appendChild(row);
  });
}

// Wire UI buttons
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'buy-btn') {
    const asset = document.getElementById('trade-asset').value;
    const amount = Number(document.getElementById('trade-amount').value);
    buyAsset(amount, asset);
  }
  if (e.target && e.target.id === 'sell-btn') {
    const asset = document.getElementById('trade-asset').value;
    const amount = Number(document.getElementById('trade-amount').value);
    sellAsset(amount, asset);
  }
  if (e.target && e.target.id === 'reset-portfolio') {
    resetPortfolio();
  }
  if (e.target && e.target.id === 'ai-fill-btn') {
    // Prefill based on latest AI recommendation
    const rec = generateInvestmentRecommendation();
    const assetSelect = document.getElementById('trade-asset');
    const amountField = document.getElementById('trade-amount');
    const portfolio = loadPortfolio();
    const vals = calculatePortfolioValues(portfolio);
    const totalValue = vals.total;
    // parse allocation like 'Up to 5%'
    const match = (rec.allocation || '').match(/(\d+)%/);
    const allocPct = match ? Number(match[1]) : (rec.risk === 'High' ? 10 : 5);
    const cap = Math.min(totalValue * (allocPct/100), portfolio.cash);
    if (rec.recommendation === 'BUY') {
      // choose asset based on which has stronger signal - simplistic: BTC if btc change > eth change
      const btc = marketItems.find(m=>m.id==='bitcoin');
      const eth = marketItems.find(m=>m.id==='ethereum');
      const btcChange = parseNumeric(btc?.change);
      const ethChange = parseNumeric(eth?.change);
      const pick = (btcChange || 0) >= (ethChange || 0) ? 'bitcoin' : 'ethereum';
      assetSelect.value = pick;
      amountField.value = cap > 0 ? cap.toFixed(2) : '';
    } else if (rec.recommendation === 'SELL') {
      // prefill amount as max sellable for selected asset
      const pick = assetSelect.value;
      const assetVals = vals.assets[pick] || { marketValue: 0 };
      amountField.value = assetVals.marketValue ? assetVals.marketValue.toFixed(2) : '';
    }
  }
});

const watchlistForm = document.getElementById('watchlist-form');
if (watchlistForm) {
  watchlistForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const symbolInput = document.getElementById('watchlist-symbol');
    const nameInput = document.getElementById('watchlist-name');
    if (symbolInput) addWatchlistItem(symbolInput.value, nameInput ? nameInput.value : '');
    if (symbolInput) symbolInput.value = '';
    if (nameInput) nameInput.value = '';
  });
}

// Ensure portfolio renders after market updates
function onMarketRefreshed() {
  renderPortfolio();
  // perform alerts check after market refresh
  try { checkAlerts(); } catch (e) { console.error('checkAlerts', e); }
}

// hook into the existing refresh path
const originalRefresh = refreshMarketData;
refreshMarketData = async function() {
  const result = await originalRefresh();
  onMarketRefreshed();
  return result;
};

// initial render
renderPortfolio();
renderPortfolioInsight();

// Alerts and monitoring
function checkAlerts() {
  try {
    // load prefs and alerts
    if (!alertPrefs) loadAlertPreferences();
    if (!alerts) loadAlerts();

    // 1) Price movement alerts (>=5% in 24h)
    ['bitcoin','ethereum'].forEach((asset)=>{
      const item = marketItems.find(m=>m.id===asset);
      const change = parseNumeric(item?.change);
      const triggered = Math.abs(change || 0) >= 5;
      if (triggered && !lastAlertStates.priceAlerts[asset]) {
        createAlert('price', `${item.name} moved ${change >=0? 'up':'down'} ${Math.abs(change).toFixed(1)}%`, `${item.name} moved ${change >=0? 'up':'down'} ${Math.abs(change).toFixed(1)}% in 24h`, 'Important', `price:${asset}`);
        lastAlertStates.priceAlerts[asset] = true;
      }
      if (!triggered && lastAlertStates.priceAlerts[asset]) {
        lastAlertStates.priceAlerts[asset] = false;
        // allow future alerts
        const existingIndex = alerts.findIndex(a=>a.dedupe===`price:${asset}`);
        // do not remove historical alerts
      }
    });

    // 2) AI recommendation change handled in runAIRecommendation

    // 3) Portfolio thresholds
    const portfolio = loadPortfolio();
    const vals = calculatePortfolioValues(portfolio);
    const ret = vals.returnPct || 0;
    if (ret <= -5 && lastAlertStates.portfolioFlag !== 'loss') {
      createAlert('portfolio','Portfolio loss alert', `Portfolio down ${ret.toFixed(2)}%`, 'Warning', 'portfolio:loss');
      lastAlertStates.portfolioFlag = 'loss';
    } else if (ret >= 10 && lastAlertStates.portfolioFlag !== 'gain') {
      createAlert('portfolio','Portfolio gain', `Portfolio up ${ret.toFixed(2)}%`, 'Info', 'portfolio:gain');
      lastAlertStates.portfolioFlag = 'gain';
    } else if (ret > -5 && ret < 10) {
      lastAlertStates.portfolioFlag = null;
    }

    // 4) Live data availability
    const allLive = [liveState.bitcoin, liveState.ethereum, liveState.gbpUsd].every(Boolean);
    if (!allLive && lastAlertStates.liveDataAvailable === true) {
      createAlert('live','Live data disconnected', 'Live market data is partially or fully unavailable.', 'Warning', 'live:down');
      lastAlertStates.liveDataAvailable = false;
    } else if (allLive && lastAlertStates.liveDataAvailable === false) {
      createAlert('live','Live data restored', 'Live market data is now connected.', 'Info', 'live:up');
      lastAlertStates.liveDataAvailable = true;
    }

    // 5) News strong sentiment alerts already created in refreshMarketNews, but ensure we manage state
    if (newsState && newsState.sentiment) {
      const s = newsState.sentiment;
      if (s.confidence >= 70 && s.label !== 'Neutral' && lastAlertStates.newsStrong !== s.label) {
        createAlert('news', `Strong news sentiment: ${s.label}`, `News sentiment ${s.label} (${s.confidence}%)`, s.label === 'Bullish' ? 'Info' : 'Important', `news:${s.label}`);
        lastAlertStates.newsStrong = s.label;
      }
      if (s.confidence < 70 && lastAlertStates.newsStrong) {
        lastAlertStates.newsStrong = null;
      }
    }

  } catch (e) {
    console.error('checkAlerts', e);
  }
}

/** Market Charts using CoinGecko + Chart.js **/
let chartInstance = null;
let chartState = { asset: 'bitcoin', days: 7, lastData: null };

async function loadChartData(asset, days) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${asset}/market_chart?vs_currency=gbp&days=${days}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('CoinGecko error');
    const data = await res.json();
    const prices = Array.isArray(data.prices) ? data.prices : [];
    const labels = prices.map((p) => new Date(p[0]));
    const vals = prices.map((p) => p[1]);
    chartState.lastData = { labels, vals };
    return { labels, vals };
  } catch (error) {
    try {
      const samplePayload = await loadSampleMarketData();
      const sampleSeries = samplePayload?.chartSeries?.[asset];
      if (sampleSeries && Array.isArray(sampleSeries)) {
        const samplePoints = sampleSeries.slice(-Math.max(7, Math.min(90, days <= 1 ? 7 : days <= 7 ? 7 : days <= 30 ? 30 : 90)));
        const labels = samplePoints.map((point) => new Date(point.date));
        const vals = samplePoints.map((point) => Number(point.value));
        chartState.lastData = { labels, vals };
        return { labels, vals };
      }
    } catch (fallbackError) {
      console.warn('Offline chart fallback failed', fallbackError);
    }

    console.warn('loadChartData failed', error);
    return null;
  }
}

function formatChartNumber(v) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function drawChart(labels, data) {
  const ctx = document.getElementById('market-chart-canvas');
  if (!ctx) return;
  const first = data[0];
  const last = data[data.length - 1];
  const overallChange = first ? ((last - first) / first) * 100 : 0;
  const positive = overallChange >= 0;
  const color = positive ? getComputedStyle(document.documentElement).getPropertyValue('--positive') || '#2dd4bf' : getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#fb7185';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const chartData = {
    labels: labels.map(l => l.toLocaleString()),
    datasets: [{
      label: chartState.asset,
      data,
      borderColor: color.trim(),
      backgroundColor: 'transparent',
      pointRadius: 0,
      tension: 0.3
    }]
  };

  const config = {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: prefersReduced ? false : { duration: 400 },
      scales: {
        x: { display: false },
        y: { ticks: { color: 'var(--muted)' }, grid: { color: 'rgba(255,255,255,0.03)' } }
      },
      plugins: { legend: { display: false } }
    }
  };

  try {
    if (chartInstance) {
      // update existing
      chartInstance.data = chartData;
      chartInstance.options = config.options;
      chartInstance.update();
    } else {
      chartInstance = new Chart(ctx.getContext('2d'), config);
    }
  } catch (e) {
    console.error('drawChart error', e);
  }

  // update meta
  document.getElementById('chart-current').textContent = formatChartNumber(last || 0);
  document.getElementById('chart-high').textContent = formatChartNumber(Math.max(...data));
  document.getElementById('chart-low').textContent = formatChartNumber(Math.min(...data));
  const changeEl = document.getElementById('chart-change');
  changeEl.textContent = `${overallChange >= 0 ? '+' : ''}${overallChange.toFixed(2)}%`;
  changeEl.style.color = positive ? 'var(--positive)' : 'var(--danger)';
}

async function refreshChart(force = false) {
  const errorEl = document.getElementById('chart-error');
  if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
  const data = await loadChartData(chartState.asset, chartState.days);
  if (!data) {
    // fail - keep previous if exists
    if (!chartState.lastData) {
      if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = 'Unable to load chart data.'; }
    }
    return;
  }
  drawChart(data.labels, data.vals);
}

// UI handlers
document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('chart-tab')) {
    document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    chartState.asset = e.target.getAttribute('data-asset');
    refreshChart();
  }
  if (e.target && e.target.classList.contains('tf-btn')) {
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    chartState.days = Number(e.target.getAttribute('data-days'));
    refreshChart();
  }
  if (e.target && e.target.id === 'refresh-chart-btn') {
    refreshChart(true);
  }
});

// Auto-refresh current chart every 5 minutes
setInterval(() => { refreshChart(); }, 5 * 60 * 1000);

// initial draw
setupLazySectionLoader('market-charts', () => refreshChart());
