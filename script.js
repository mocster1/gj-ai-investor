const markets = [
  { name: 'FTSE', value: '8,210', change: '+0.4%', direction: 'up' },
  { name: 'S&P500', value: '6,180', change: '+0.7%', direction: 'up' },
  { name: 'NASDAQ', value: '20,340', change: '+1.1%', direction: 'up' },
  { name: 'Bitcoin', value: '£91,420', change: '-1.8%', direction: 'down' },
  { name: 'Ethereum', value: '£3,240', change: '+0.6%', direction: 'up' },
  { name: 'Gold', value: '£2,640', change: '+0.1%', direction: 'up' },
  { name: 'Silver', value: '£29.40', change: '-0.3%', direction: 'down' },
  { name: 'Brent', value: '$78.40', change: '+2.3%', direction: 'up' },
  { name: 'GBP/USD', value: '1.27', change: '+0.2%', direction: 'up' }
];

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

const tickerItems = [
  { name: 'FTSE 100', value: '8,210', change: '+0.4%', direction: 'up' },
  { name: 'S&P 500', value: '6,180', change: '+0.7%', direction: 'up' },
  { name: 'NASDAQ', value: '20,340', change: '+1.1%', direction: 'up' },
  { name: 'Bitcoin', value: '£91,420', change: '-1.8%', direction: 'down' },
  { name: 'Ethereum', value: '£3,240', change: '+0.6%', direction: 'up' },
  { name: 'Gold', value: '£2,640', change: '+0.1%', direction: 'up' },
  { name: 'Silver', value: '£29.40', change: '-0.3%', direction: 'down' },
  { name: 'Brent Oil', value: '$78.40', change: '+2.3%', direction: 'up' },
  { name: 'GBP/USD', value: '1.27', change: '+0.2%', direction: 'up' }
];

const marketGrid = document.getElementById('market-grid');
const tickerTrack = document.getElementById('ticker-track');
const portfolioStats = document.getElementById('portfolio-stats');
const watchlistList = document.getElementById('watchlist-list');
const newsList = document.getElementById('news-list');
const refreshButton = document.querySelector('[data-refresh]');
const briefingRefreshButton = document.querySelector('[data-briefing-refresh]');
const briefingTime = document.getElementById('briefing-time');
const aiScoreValue = document.getElementById('ai-score-value');

function renderMarkets() {
  marketGrid.innerHTML = '';
  markets.forEach((market) => {
    const item = document.createElement('article');
    item.className = 'market-item';
    item.innerHTML = `
      <span>${market.name}</span>
      <strong>${market.value}</strong>
      <span class="${market.direction === 'down' ? 'negative' : 'positive'}">${market.change}</span>
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

function renderTicker() {
  if (!tickerTrack) {
    return;
  }

  const repeatedItems = [...tickerItems, ...tickerItems];
  tickerTrack.innerHTML = repeatedItems.map((item) => `
    <div class="ticker-item">
      <span class="ticker-name">${item.name}</span>
      <span class="ticker-value">${item.value}</span>
      <span class="ticker-change ${item.direction === 'down' ? 'negative' : 'positive'}">${item.change}</span>
    </div>
  `).join('');
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

if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    refreshButton.textContent = 'Demo refreshed';
    updateBriefingTime();
    setTimeout(() => {
      refreshButton.textContent = 'Refresh demo';
    }, 1200);
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
updateBriefingTime();
animateAiScore();
