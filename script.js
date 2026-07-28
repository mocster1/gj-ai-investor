const marketItems = [
  { id: 'ftse', name: 'FTSE 100', value: '8,210', change: '+0.4%', direction: 'up', status: 'demo' },
  { id: 'sp500', name: 'S&P 500', value: '6,180', change: '+0.7%', direction: 'up', status: 'demo' },
  { id: 'nasdaq', name: 'NASDAQ', value: '20,340', change: '+1.1%', direction: 'up', status: 'demo' },
  { id: 'bitcoin', name: 'Bitcoin', value: '£91,420', change: '-1.8%', direction: 'down', status: 'demo' },
  { id: 'ethereum', name: 'Ethereum', value: '£3,240', change: '+0.6%', direction: 'up', status: 'demo' },
  { id: 'gold', name: 'Gold', value: '£2,640', change: '+0.1%', direction: 'up', status: 'demo' },
  { id: 'silver', name: 'Silver', value: '£29.40', change: '-0.3%', direction: 'down', status: 'demo' },
  { id: 'brent', name: 'Brent Oil', value: '$78.40', change: '+2.3%', direction: 'up', status: 'demo' },
  { id: 'gbpUsd', name: 'GBP/USD', value: '1.27', change: '', direction: 'neutral', status: 'demo' }
];

const liveState = {
  bitcoin: false,
  ethereum: false,
  gbpUsd: false,
  lastUpdate: null,
  gbpUsdSourceDate: null
};

const wealthItems = [
  { title: 'Cash', metric: '£125.00', note: 'Liquidity buffer' },
  { title: 'Investments', metric: 'To model', note: 'Paper portfolio focus' },
  { title: 'Pensions', metric: 'To model', note: 'Long-term planning' },
  { title: 'Property', metric: 'To add', note: 'Legacy asset view' }
];

const watchlistItems = [
  { name: 'NVIDIA', value: '+2.1%', direction: 'up' },
  { name: 'Tesla', value: '-0.8%', direction: 'down' },
  { name: 'Shell', value: '+1.4%', direction: 'up' }
];

const newsItems = [
  { title: 'Policy tone stays constructive', detail: 'Central banks signal patience while growth remains resilient.' },
  { title: 'Energy supply risk persists', detail: 'Oil volatility remains elevated ahead of the next supply update.' },
  { title: 'Risk appetite holds', detail: 'Quality names continue to lead as volatility stays under control.' }
];

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

function renderMarkets() {
  marketGrid.innerHTML = '';
  marketItems.forEach((market) => {
    const item = document.createElement('article');
    item.className = 'market-item';
    item.innerHTML = `
      <div class="market-item-header">
        <span>${market.name}</span>
        <span class="market-item-status ${market.status}">${market.status === 'live' ? 'Live' : 'Demo'}</span>
      </div>
      <strong>${market.value}</strong>
      <span class="market-change ${market.direction === 'down' ? 'negative' : market.direction === 'up' ? 'positive' : 'neutral'}">${market.change || '—'}</span>
    `;
    marketGrid.appendChild(item);
  });
}

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

function renderWatchlist() {
  watchlistList.innerHTML = '';
  watchlistItems.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'watchlist-item';
    row.innerHTML = `
      <div>
        <strong>${item.name}</strong>
        <span>Demo watchlist item</span>
      </div>
      <span class="${item.direction === 'down' ? 'negative' : 'positive'}">${item.value}</span>
    `;
    watchlistList.appendChild(row);
  });
}

function renderNews() {
  newsList.innerHTML = '';
  newsItems.forEach((item) => {
    const listItem = document.createElement('li');
    listItem.className = 'news-item';
    listItem.innerHTML = `
      <h3>${item.title}</h3>
      <p>${item.detail}</p>
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

function updateLiveStatusDisplay() {
  const liveStatusPill = document.getElementById('live-status-pill');
  const liveStatusCopy = document.getElementById('live-status-copy');
  const totalLive = [liveState.bitcoin, liveState.ethereum, liveState.gbpUsd].filter(Boolean).length;
  let label = 'Offline / using fallback data';
  let pillClass = 'status-offline';
  let extraCopy = '';

  if (totalLive === 3) {
    label = 'Live data connected';
    pillClass = 'status-live';
  } else if (totalLive > 0) {
    label = 'Partially live';
    pillClass = 'status-partial';
    extraCopy = 'Some live data unavailable';
  }

  if (liveStatusPill) {
    liveStatusPill.textContent = label;
    liveStatusPill.className = `status-pill ${pillClass}`;
  }

  if (liveStatusCopy) {
    const timeText = liveState.lastUpdate ? formatTimestamp(liveState.lastUpdate) : 'never';
    const sourceText = liveState.gbpUsdSourceDate ? ` | GBP/USD source ${liveState.gbpUsdSourceDate}` : '';
    liveStatusCopy.textContent = `Last update: ${timeText}${sourceText}${extraCopy ? ' · ' + extraCopy : ''}`;
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

async function refreshMarketData() {
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = 'Updating...';
  }

  const [coinResult, fxResult] = await Promise.allSettled([fetchCoinGeckoData(), fetchFrankfurterData()]);
  const anySuccess = [coinResult, fxResult].some((result) => result.status === 'fulfilled' && result.value === true);

  if (anySuccess) {
    liveState.lastUpdate = Date.now();
  }

  renderMarkets();
  renderTicker();
  updateLiveStatusDisplay();

  if (refreshButton) {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Refresh Markets';
  }
}

function renderTicker() {
  const repeatedItems = [...marketItems, ...marketItems];
  const tickerMarkup = repeatedItems.map((item) => `
    <div class="ticker-item">
      <span class="ticker-name">${item.name}</span>
      <span class="ticker-badge ${item.status}">${item.status === 'live' ? 'Live' : 'Demo'}</span>
      <span class="ticker-value">${item.value}</span>
      <span class="ticker-change ${item.direction === 'down' ? 'negative' : item.direction === 'up' ? 'positive' : 'neutral'}">${item.change || '—'}</span>
    </div>
  `).join('');

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
refreshMarketData();
setInterval(refreshMarketData, 300000);
updateBriefingTime();
animateAiScore();
