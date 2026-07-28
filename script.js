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

function simpleSentimentAnalysis(headlines) {
  // naive keyword-based sentiment: bullish words +1, bearish words -1
  const bullish = ['rise','rises','up','gain','gains','positive','beat','beats','outperform','strong','bullish','soars','surge','surges'];
  const bearish = ['fall','falls','down','drop','drops','negative','miss','misses','weak','bearish','plunge','plunges','decline','declines'];
  let score = 0;
  headlines.forEach(h => {
    const lower = h.toLowerCase();
    bullish.forEach(w => { if (lower.includes(w)) score += 1; });
    bearish.forEach(w => { if (lower.includes(w)) score -= 1; });
  });
  const maxPossible = headlines.length * 3 || 1;
  const norm = Math.max(-maxPossible, Math.min(maxPossible, score));
  const pct = Math.round((Math.abs(norm) / maxPossible) * 100);
  let label = 'Neutral';
  if (norm > 1) label = 'Bullish';
  else if (norm < -1) label = 'Bearish';
  const explanation = `Headline sentiment score ${norm}/${maxPossible}`;
  return { label, confidence: pct, explanation, score: norm };
}

async function refreshMarketNews() {
  const listEl = document.getElementById('market-news-list');
  const loading = document.getElementById('news-loading');
  const lastUpdateEl = document.getElementById('news-last-update');
  const warning = document.getElementById('news-warning');
  const sentimentLabel = document.getElementById('news-sentiment-label');
  const sentimentConf = document.getElementById('news-sentiment-confidence');

  if (loading) loading.style.display = 'inline';
  if (warning) warning.style.display = 'none';

  // Use a public RSS: Financial Times (rss feeds are CORS restricted often). Use ''https://feeds.bbci.co.uk/news/business/rss.xml' as a free CORS-friendly option.
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

  // sentiment
  const headlines = items.map(i => i.title || '');
  const sentiment = simpleSentimentAnalysis(headlines);
  newsState.sentiment = sentiment;

  // render
  listEl.innerHTML = '';
  items.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'news-row';
    const date = it.pubDate ? new Date(it.pubDate).toLocaleString('en-GB') : '';
    row.innerHTML = `<div><a href="${it.link}" target="_blank" rel="noopener noreferrer">${it.title}</a><div class="muted-text">${it.source || ''} · ${date}</div></div>`;
    listEl.appendChild(row);
  });

  if (loading) loading.style.display = 'none';
  if (lastUpdateEl) lastUpdateEl.textContent = new Date(newsState.lastUpdate).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
  if (sentimentLabel) sentimentLabel.textContent = sentiment.label;
  if (sentimentConf) sentimentConf.textContent = `${sentiment.confidence}%`;

  // Integrate with AI recommendation by slightly adjusting its confidence
  try {
    const aiAdjust = sentiment.score || 0;
    // apply a modest effect: +- up to 6 confidence points
    const adjustment = Math.max(-6, Math.min(6, aiAdjust * 2));
    // expose to global for computeAIRecommendation to read if desired
    window.newsSentimentAdjustment = adjustment;
  } catch (e) {
    window.newsSentimentAdjustment = 0;
  }
}

// Auto-refresh news every 15 minutes
refreshMarketNews();
setInterval(refreshMarketNews, NEWS_REFRESH_MINUTES * 60 * 1000);

// manual button
const refreshNewsBtn = document.getElementById('refresh-news-btn');
if (refreshNewsBtn) refreshNewsBtn.addEventListener('click', refreshMarketNews);

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
  updateAIRecommendationUI();
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
  runAIRecommendation();

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
runAIRecommendation();
refreshMarketData();
setInterval(refreshMarketData, 300000);
updateBriefingTime();
animateAiScore();

/** Portfolio: paper trading simulation **/
const PORTFOLIO_KEY = 'gj_portfolio_v1';
const STARTING_CASH = 500;

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

// Ensure portfolio renders after market updates
function onMarketRefreshed() {
  renderPortfolio();
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
