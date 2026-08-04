(function (global) {
  function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed === '—') {
        return null;
      }
      const numeric = Number(trimmed.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(numeric) ? numeric : null;
    }
    return null;
  }

  function formatGBP(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '£0.00';
    }
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function getAssetName(assetId) {
    const labels = { bitcoin: 'Bitcoin', ethereum: 'Ethereum' };
    return labels[assetId] || assetId;
  }

  function getMarketDirection(items) {
    const positive = items.filter((item) => toNumber(item?.change) > 0).length;
    const negative = items.filter((item) => toNumber(item?.change) < 0).length;
    if (positive > negative) return 'rising';
    if (negative > positive) return 'falling';
    return 'mixed';
  }

  function getMarketSummary(items) {
    const valid = items.filter((item) => toNumber(item?.change) != null);
    const ranked = [...valid].sort((a, b) => (toNumber(b?.change) || 0) - (toNumber(a?.change) || 0));
    const weakest = [...valid].sort((a, b) => (toNumber(a?.change) || 0) - (toNumber(b?.change) || 0))[0];
    const strongest = ranked[0];
    const direction = getMarketDirection(valid);
    const openCount = valid.filter((item) => item?.status !== 'closed').length;
    const isMarketClosed = openCount === 0;

    let text = 'Markets are looking '; 
    if (direction === 'rising') {
      text += 'broadly constructive, with more assets trading higher than lower.';
    } else if (direction === 'falling') {
      text += 'under pressure, with more assets trading lower than higher.';
    } else {
      text += 'mixed, with gains and losses balancing out.';
    }

    if (isMarketClosed) {
      text += ' The current snapshot points to a market closure, so the view is more about recent levels than fresh momentum.';
    }

    return {
      direction,
      text,
      strongestAsset: strongest ? strongest.name : '—',
      weakestAsset: weakest ? weakest.name : '—'
    };
  }

  function buildPortfolioState(portfolio, marketItems) {
    if (!portfolio || !portfolio.holdings || Object.keys(portfolio.holdings).length === 0) {
      return {
        hasData: false,
        totalValue: portfolio?.cash || 0,
        totalGainLoss: 0,
        largestHolding: '—',
        concentrationRisk: 'Low',
        bestPerformer: '—',
        worstPerformer: '—',
        cashBalance: portfolio?.cash || 0,
        emptyState: 'No portfolio data yet. Add a paper trade to get a personalised review.'
      };
    }

    const holdings = Object.entries(portfolio.holdings)
      .filter(([, entry]) => Number(entry?.quantity || 0) > 0)
      .map(([id, entry]) => {
        const marketItem = marketItems.find((item) => item.id === id);
        const price = toNumber(marketItem?.value);
        const avgPrice = Number(entry?.avgPrice || 0);
        const quantity = Number(entry?.quantity || 0);
        const marketValue = price && quantity ? price * quantity : 0;
        const gainLoss = marketValue - (avgPrice * quantity);
        const returnPct = avgPrice > 0 ? ((price - avgPrice) / avgPrice) * 100 : 0;
        return { id, name: getAssetName(id), qty: quantity, avgPrice, price, marketValue, gainLoss, returnPct };
      });

    const totalValue = (portfolio.cash || 0) + holdings.reduce((sum, item) => sum + item.marketValue, 0);
    const totalGainLoss = holdings.reduce((sum, item) => sum + item.gainLoss, 0);
    const largest = holdings.slice().sort((a, b) => b.marketValue - a.marketValue)[0];
    const concentration = largest && totalValue > 0 ? (largest.marketValue / totalValue) * 100 : 0;
    const best = holdings.slice().sort((a, b) => b.returnPct - a.returnPct)[0];
    const worst = holdings.slice().sort((a, b) => a.returnPct - b.returnPct)[0];

    let concentrationRisk = 'Low';
    if (concentration >= 70) concentrationRisk = 'Very High';
    else if (concentration >= 50) concentrationRisk = 'High';
    else if (concentration >= 30) concentrationRisk = 'Moderate';

    return {
      hasData: true,
      totalValue,
      totalGainLoss,
      largestHolding: largest ? `${largest.name} · ${formatGBP(largest.marketValue)}` : '—',
      concentrationRisk,
      bestPerformer: best ? `${best.name} · ${best.returnPct >= 0 ? '+' : ''}${best.returnPct.toFixed(1)}%` : '—',
      worstPerformer: worst ? `${worst.name} · ${worst.returnPct >= 0 ? '+' : ''}${worst.returnPct.toFixed(1)}%` : '—',
      cashBalance: portfolio?.cash || 0,
      emptyState: null
    };
  }

  function buildRiskAssessment(portfolioState, marketItems, watchlistItems) {
    const holdings = portfolioState.hasData ? (portfolioState.holdingBreakdown || []) : [];
    const cryptoExposure = holdings.filter((item) => item.id === 'bitcoin' || item.id === 'ethereum').reduce((sum, item) => sum + item.marketValue, 0);
    const totalValue = portfolioState.totalValue || 0;
    const cryptoPct = totalValue > 0 ? (cryptoExposure / totalValue) * 100 : 0;
    const singleStockPct = holdings.length > 0 && holdings[0] && totalValue > 0 ? (holdings[0].marketValue / totalValue) * 100 : 0;

    const reasons = [];
    let level = 'Low';

    if (!portfolioState.hasData) {
      return {
        level: 'Low',
        reasons: ['No portfolio positions are loaded yet, so the risk view is intentionally cautious.'],
        highlights: ['Portfolio data is still empty.']
      };
    }

    if (portfolioState.concentrationRisk === 'Very High' || portfolioState.concentrationRisk === 'High') {
      level = 'High';
      reasons.push('The portfolio is concentrated in a small number of positions.');
    } else if (portfolioState.concentrationRisk === 'Moderate') {
      level = 'Moderate';
      reasons.push('Position size is fairly concentrated, but not extreme.');
    } else {
      reasons.push('The portfolio is spread more evenly across the current holdings.');
    }

    if (cryptoPct >= 35) {
      level = level === 'High' ? 'Very High' : 'High';
      reasons.push('Crypto exposure is a meaningful share of the portfolio.');
    }

    if (singleStockPct >= 25) {
      level = level === 'High' || level === 'Very High' ? 'Very High' : 'High';
      reasons.push('One position is carrying a large share of capital.');
    }

    const watchlistCount = Array.isArray(watchlistItems) ? watchlistItems.length : 0;
    if (watchlistCount > 0) {
      reasons.push(`You are watching ${watchlistCount} assets, which can help you keep a closer eye on risk.`);
    }

    if (marketItems.some((item) => item?.status === 'closed')) {
      reasons.push('Some tracked assets are currently closed, so short-term moves may be less informative.');
    }

    const highlights = [];
    if (portfolioState.concentrationRisk !== 'Low') highlights.push('Concentration risk is elevated.');
    if (cryptoPct >= 35) highlights.push('Crypto exposure is above a cautious level.');
    if (singleStockPct >= 25) highlights.push('A single position is large.');

    return { level, reasons, highlights };
  }

  function buildSuggestedActions(portfolioState, marketItems, watchlistItems, marketSummary, riskAssessment) {
    const actions = [];

    if (!portfolioState.hasData) {
      return [
        'Add a small paper trade to start building a personalised review.',
        'Keep the portfolio simple while watching market conditions.',
        'Use the watchlist to track a few assets you are monitoring.'
      ];
    }

    if (portfolioState.concentrationRisk !== 'Low') {
      actions.push('Review an oversized holding and consider trimming if the position has grown too large.');
    }

    if (riskAssessment.level === 'High' || riskAssessment.level === 'Very High') {
      actions.push('Consider diversification by spreading risk across a wider mix of holdings.');
    } else {
      actions.push('Hold and monitor the current mix while watching for a clearer trend.');
    }

    if (Array.isArray(watchlistItems) && watchlistItems.length > 0) {
      actions.push('Keep an eye on your watchlist for any new confirmation signals.');
    } else {
      actions.push('Add one asset to the watchlist to track opportunities without overreacting.');
    }

    if (marketSummary.direction === 'falling') {
      actions.push('Avoid reacting to short-term volatility and wait for a steadier signal.');
    }

    return actions.slice(0, 3);
  }

  function generateAdvisorAnalysis({ marketItems = [], portfolio = null, watchlistItems = [] }) {
    const marketSummary = getMarketSummary(marketItems);
    const portfolioState = buildPortfolioState(portfolio, marketItems);
    portfolioState.holdingBreakdown = Object.entries(portfolio?.holdings || {})
      .filter(([, entry]) => Number(entry?.quantity || 0) > 0)
      .map(([id, entry]) => {
        const marketItem = marketItems.find((item) => item.id === id);
        const price = toNumber(marketItem?.value);
        const avgPrice = Number(entry?.avgPrice || 0);
        const quantity = Number(entry?.quantity || 0);
        const marketValue = price && quantity ? price * quantity : 0;
        return { id, name: getAssetName(id), marketValue };
      });

    const riskAssessment = buildRiskAssessment(portfolioState, marketItems, watchlistItems);
    const confidence = !portfolioState.hasData || marketItems.length === 0 ? 'Low' : marketItems.some((item) => item?.status === 'live') ? 'High' : 'Medium';

    return {
      marketSummary,
      portfolio: portfolioState,
      riskAssessment,
      actions: buildSuggestedActions(portfolioState, marketItems, watchlistItems, marketSummary, riskAssessment),
      confidence,
      disclaimer: 'For personal research and information only. Not financial advice.'
    };
  }

  global.aiAdvisorService = {
    generateAdvisorAnalysis
  };
})(window);
