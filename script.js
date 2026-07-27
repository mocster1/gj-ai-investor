const markets = [
  { name: 'FTSE 100', value: '8,210', change: '+0.4%', direction: 'up' },
  { name: 'S&P 500', value: '6,180', change: '+0.7%', direction: 'up' },
  { name: 'NASDAQ', value: '20,340', change: '+1.1%', direction: 'up' },
  { name: 'Bitcoin', value: '£91,420', change: '-1.8%', direction: 'down' },
  { name: 'Gold', value: '£2,640', change: '+0.1%', direction: 'up' },
  { name: 'Brent oil', value: '$78.40', change: '+2.3%', direction: 'up' }
];

const wealthItems = [
  { title: 'Cash', metric: '£125.00', note: 'Liquidity buffer' },
  { title: 'Investments', metric: 'To model', note: 'Paper portfolio focus' },
  { title: 'Pensions', metric: 'To model', note: 'Long-term planning' },
  { title: 'Property', metric: 'To add', note: 'Legacy asset view' }
];

const marketGrid = document.getElementById('market-grid');
const wealthGrid = document.getElementById('wealth-grid');
const refreshButton = document.querySelector('[data-refresh]');
const lastUpdated = document.getElementById('last-updated');
const todayLabel = document.getElementById('today');

function renderMarkets() {
  marketGrid.innerHTML = '';
  markets.forEach((market) => {
    const card = document.createElement('article');
    card.className = 'market-card';
    card.innerHTML = `
      <h3>${market.name}</h3>
      <div class="metric">${market.value}</div>
      <div class="change ${market.direction === 'down' ? 'negative' : ''}">${market.change}</div>
    `;
    marketGrid.appendChild(card);
  });
}

function renderWealth() {
  wealthGrid.innerHTML = '';
  wealthItems.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'wealth-card';
    card.innerHTML = `
      <h3>${item.title}</h3>
      <div class="metric">${item.metric}</div>
      <p class="meta">${item.note}</p>
    `;
    wealthGrid.appendChild(card);
  });
}

function updateClock() {
  if (todayLabel) {
    todayLabel.textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  if (lastUpdated) {
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }
}

if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    refreshButton.textContent = 'Demo refreshed';
    updateClock();
    setTimeout(() => {
      refreshButton.textContent = 'Refresh demo';
    }, 1200);
  });
}

renderMarkets();
renderWealth();
updateClock();
