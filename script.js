const API_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false";
const REFRESH_INTERVAL_MS = 20000;
const HISTORY_DAYS = 7;
const PORTFOLIO_STORAGE_KEY = "cryptoTrackerPortfolio";
const MARKET_CACHE_KEY = "cryptoTrackerMarketCache";
const FX_CACHE_KEY = "cryptoTrackerFxCache";
const AFFILIATE_URL = "https://invite.coindcx.com/61707419";
const FX_CACHE_TTL_MS = 20 * 60 * 1000;
const RETRY_DELAYS_MS = [5000, 10000, 20000];
const FALLBACK_RATES_TO_USD = {
  USD: 1,
  INR: 1 / 83,
  EUR: 1 / 0.92,
  GBP: 1 / 0.79,
  JPY: 1 / 150,
};

const tableBody = document.getElementById("cryptoTableBody");
const searchInput = document.getElementById("searchInput");
const statusBadge = document.getElementById("statusBadge");
const lastUpdated = document.getElementById("lastUpdated");
const chartTitle = document.getElementById("chartTitle");
const chartStatus = document.getElementById("chartStatus");
const priceChartCanvas = document.getElementById("priceChart");
const chartWrap = document.getElementById("chartWrap");
const portfolioTableBody = document.getElementById("portfolioTableBody");
const portfolioTotal = document.getElementById("portfolioTotal");
const portfolioInvested = document.getElementById("portfolioInvested");
const portfolioProfitLoss = document.getElementById("portfolioProfitLoss");
const investmentAmountInput = document.getElementById("investmentInput");
const recommendButton = document.getElementById("recommendButton");
const bestCoinName = document.getElementById("bestCoinName");
const bestCoinReason = document.getElementById("bestCoinReason");
const bestCoinConfidence = document.getElementById("bestCoinConfidence");
const bestCoinAllocation = document.getElementById("bestCoinAllocation");
const recommendationSummary = document.getElementById("recommendationSummary");
const topRecommendationsList = document.getElementById("topRecommendationsList");
const distributionSuggestion = document.getElementById("distributionSuggestion");
const marketTip = document.getElementById("marketTip");
const portfolioTip = document.getElementById("portfolioTip");
const notificationsPanel = document.getElementById("notificationsPanel");
const recommendAffiliateLink = document.getElementById("recommendAffiliateLink");
const chartAffiliateLink = document.getElementById("chartAffiliateLink");
const portfolioAffiliateLink = document.getElementById("portfolioAffiliateLink");
const MAX_CHART_POINTS = 20;
const ALERT_THRESHOLD_PERCENT = 2;
const ALERT_LIFETIME_MS = 5000;

let allCoins = [];
let refreshTimerId = null;
const priceHistory = new Map();
let selectedCoinId = null;
let selectedCoinName = "";
let priceChart = null;
let portfolio = loadPortfolio();
const chartHistoryCache = new Map();
let hasLoadedChartOnce = false;
let recommendationCache = [];
let lastAnalyzedAmount = 0;
let lastAnalyzedCurrency = "USD";
let lastRecommendationMode = "general";
const previousCoinPrices = new Map();
const lastAlertDirection = new Map();
let marketRequestInFlight = false;
let marketRetryIndex = 0;
let fxRequestInFlight = false;
let cachedRatesState = loadFxCache();
let usingApproximateConversion = false;

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 6,
  }).format(value);
}

function formatPercent(value) {
  if (typeof value !== "number") {
    return "N/A";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatAmount(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatInvestmentAmount(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAmountInCurrency(value, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function saveMarketCache(rawCoins, timestamp = new Date().toISOString()) {
  localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({
    timestamp,
    coins: rawCoins,
  }));
}

function loadMarketCache() {
  try {
    const rawCache = localStorage.getItem(MARKET_CACHE_KEY);
    return rawCache ? JSON.parse(rawCache) : null;
  } catch (error) {
    console.error("Failed to load market cache:", error);
    return null;
  }
}

function loadFxCache() {
  try {
    const rawCache = localStorage.getItem(FX_CACHE_KEY);
    return rawCache ? JSON.parse(rawCache) : null;
  } catch (error) {
    console.error("Failed to load fx cache:", error);
    return null;
  }
}

function saveFxCache(baseCurrency, usdRate, approximate = false) {
  const payload = {
    baseCurrency,
    usdRate,
    approximate,
    timestamp: Date.now(),
  };

  cachedRatesState = payload;
  localStorage.setItem(FX_CACHE_KEY, JSON.stringify(payload));
}

function loadPortfolio() {
  try {
    const storedPortfolio = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!storedPortfolio) {
      return {};
    }

    const parsedPortfolio = JSON.parse(storedPortfolio);
    const migratedPortfolio = {};

    Object.entries(parsedPortfolio).forEach(([coinId, entry]) => {
      if (typeof entry === "number") {
        migratedPortfolio[coinId] = {
          amount: entry,
          buyPrice: 0,
        };
        return;
      }

      migratedPortfolio[coinId] = {
        amount: Number(entry.amount) || 0,
        buyPrice: Number(entry.buyPrice) || 0,
      };
    });

    return migratedPortfolio;
  } catch (error) {
    console.error("Failed to load portfolio:", error);
    return {};
  }
}

function savePortfolio() {
  localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(portfolio));
}

function updateStatus(text, isError = false) {
  statusBadge.textContent = text;
  statusBadge.style.color = isError ? "#ffd0d9" : "#8fa6c4";
  statusBadge.style.borderColor = isError ? "rgba(255, 108, 140, 0.28)" : "rgba(127, 213, 255, 0.14)";
}

function updateChartStatus(text, isError = false) {
  chartStatus.textContent = text;
  chartStatus.style.color = isError ? "#ffd0d9" : "";
}

function setMarketLoading(isLoading) {
  tableBody.classList.toggle("loading-table", isLoading);
}

function setChartLoading(isLoading) {
  chartWrap.classList.toggle("loading-chart", isLoading);
}

function scheduleNextFetch(delay = REFRESH_INTERVAL_MS) {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
  }

  refreshTimerId = window.setTimeout(fetchCoins, delay);
}

function calculateAverage(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function buildInitialHistory(coin) {
  const currentPrice = coin.current_price;
  const changePercent = coin.price_change_percentage_24h ?? 0;
  const baselinePrice = currentPrice / (1 + changePercent / 100 || 1);

  return [
    baselinePrice * 0.985,
    baselinePrice,
    baselinePrice * 1.015,
    currentPrice * 0.995,
    currentPrice,
  ];
}

function updateCoinSignal(coin) {
  const history = priceHistory.get(coin.id) ?? buildInitialHistory(coin);
  history.push(coin.current_price);

  if (history.length > 6) {
    history.shift();
  }

  priceHistory.set(coin.id, history);

  const sma = calculateAverage(history);
  const signal = coin.current_price < sma ? "BUY" : "SELL";

  return {
    ...coin,
    signal,
    sma,
  };
}

function renderTable(coins) {
  if (!coins.length) {
    tableBody.innerHTML =
      '<tr><td colspan="6" class="empty-state">No coins match your search.</td></tr>';
    return;
  }

  tableBody.innerHTML = coins
    .map((coin) => {
      const change = coin.price_change_percentage_24h;
      const changeClass = change >= 0 ? "positive" : "negative";
      const signalClass = coin.signal === "BUY" ? "signal-buy" : "signal-sell";

      return `
        <tr class="${coin.id === selectedCoinId ? "selected-row" : ""}" data-coin-id="${coin.id}" data-coin-name="${coin.name}">
          <td class="coin-name">${coin.name}</td>
          <td class="coin-symbol">${coin.symbol}</td>
          <td class="price">${formatCurrency(coin.current_price)}</td>
          <td class="change ${changeClass}">${formatPercent(change)}</td>
          <td class="signal-cell">
            <span class="signal-badge ${signalClass}">${coin.signal}</span>
          </td>
          <td class="action-cell">
            <button class="portfolio-button" type="button" data-add-portfolio="true" data-coin-id="${coin.id}">
              Add to Portfolio
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderPortfolio() {
  const portfolioEntries = Object.entries(portfolio)
    .map(([coinId, entry]) => {
      const coin = allCoins.find((item) => item.id === coinId);

      if (!coin || !entry || entry.amount <= 0) {
        return null;
      }

      const amount = Number(entry.amount) || 0;
      const buyPrice = Number(entry.buyPrice) || 0;
      const currentValue = amount * coin.current_price;
      const investedValue = amount * buyPrice;
      const profitLoss = currentValue - investedValue;
      const profitLossPercent = investedValue > 0 ? (profitLoss / investedValue) * 100 : 0;

      return {
        name: coin.name,
        amount,
        buyPrice,
        investedValue,
        currentValue,
        profitLoss,
        profitLossPercent,
      };
    })
    .filter(Boolean);

  const totalValue = portfolioEntries.reduce((sum, entry) => sum + entry.currentValue, 0);
  const totalInvested = portfolioEntries.reduce((sum, entry) => sum + entry.investedValue, 0);
  const totalProfitLoss = totalValue - totalInvested;
  const totalProfitLossPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

  portfolioTotal.textContent = formatCurrency(totalValue);
  portfolioInvested.textContent = formatCurrency(totalInvested);
  portfolioProfitLoss.textContent = `${formatCurrency(totalProfitLoss)} (${formatPercent(totalProfitLossPercent)})`;
  portfolioProfitLoss.className = totalProfitLoss >= 0 ? "positive" : "negative";

  if (!portfolioEntries.length) {
    portfolioTableBody.innerHTML =
      '<tr><td colspan="6" class="empty-state">Your portfolio is empty. Add coins from the table above.</td></tr>';
    portfolioInvested.textContent = formatCurrency(0);
    portfolioProfitLoss.textContent = `${formatCurrency(0)} (0.00%)`;
    portfolioProfitLoss.className = "";
    return;
  }

  portfolioTableBody.innerHTML = portfolioEntries
    .map((entry) => {
      const profitLossClass = entry.profitLoss >= 0 ? "positive" : "negative";

      return `
        <tr>
          <td class="coin-name">${entry.name}</td>
          <td class="price">${entry.buyPrice > 0 ? formatCurrency(entry.buyPrice) : "--"}</td>
          <td>${formatAmount(entry.amount)}</td>
          <td class="price">${formatCurrency(entry.investedValue)}</td>
          <td class="price">${formatCurrency(entry.currentValue)}</td>
          <td class="${profitLossClass}">
            ${formatCurrency(entry.profitLoss)} (${formatPercent(entry.profitLossPercent)})
          </td>
        </tr>
      `;
    })
    .join("");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizePriceChange(change) {
  if (typeof change !== "number") {
    return 0;
  }

  return clamp((change + 20) / 40, 0, 1);
}

function buildRecommendationReason(coin) {
  const reasons = [];

  if ((coin.price_change_percentage_24h ?? 0) > 4) {
    reasons.push("high momentum");
  } else if ((coin.price_change_percentage_24h ?? 0) > 0) {
    reasons.push("uptrend");
  }

  if (coin.signal === "BUY") {
    reasons.push("BUY signal");
  }

  if (coin.current_price < coin.sma) {
    reasons.push("good entry below moving average");
  }

  if (!reasons.length) {
    reasons.push("mixed market signals");
  }

  return reasons.join(" + ");
}

function scoreCoin(coin) {
  const trendScore = coin.current_price >= coin.sma
    ? clamp((coin.current_price - coin.sma) / coin.sma, 0, 0.12) / 0.12
    : 0;
  const momentumScore = normalizePriceChange(coin.price_change_percentage_24h);
  const dayRange = Math.max((coin.high_24h ?? coin.current_price) - (coin.low_24h ?? coin.current_price), 0);
  const volatility = coin.current_price > 0 ? dayRange / coin.current_price : 1;
  const stabilityScore = 1 - clamp(volatility / 0.18, 0, 1);
  const signalScore = coin.signal === "BUY" ? 1 : 0.2;
  const maxVolume = Math.max(...allCoins.map((item) => item.total_volume || 0), 1);
  const volumeScore = clamp((coin.total_volume || 0) / maxVolume, 0, 1);
  const totalScore = (trendScore * 0.35)
    + (momentumScore * 0.25)
    + (stabilityScore * 0.2)
    + (signalScore * 0.1)
    + (volumeScore * 0.1);
  const confidence = Math.round(clamp(totalScore, 0, 1) * 100);
  const label = confidence >= 78 ? "Strong Buy 🔥" : confidence >= 58 ? "Moderate 📊" : "Avoid ⚠️";

  return {
    ...coin,
    recommendationScore: totalScore,
    confidence,
    reason: buildRecommendationReason(coin),
    label,
    hasStrongSignal: confidence >= 58,
  };
}

function analyzeRecommendations() {
  recommendationCache = allCoins
    .filter((coin) => {
      const negativeTrend = coin.current_price < coin.sma && (coin.price_change_percentage_24h ?? 0) < 0;
      const suddenSpike = (coin.price_change_percentage_24h ?? 0) > 18;
      return !negativeTrend && !suddenSpike;
    })
    .map(scoreCoin)
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, 3);
}

function analyzeGeneralRecommendations() {
  const maxMarketCap = Math.max(...allCoins.map((coin) => coin.market_cap || 0), 1);

  return allCoins
    .map((coin) => {
      const marketCapScore = clamp((coin.market_cap || 0) / maxMarketCap, 0, 1);
      const momentumScore = clamp((coin.price_change_percentage_24h || 0) / 12, 0, 1);
      const dayRange = Math.max((coin.high_24h ?? coin.current_price) - (coin.low_24h ?? coin.current_price), 0);
      const volatility = coin.current_price > 0 ? dayRange / coin.current_price : 1;
      const stabilityScore = 1 - clamp(volatility / 0.18, 0, 1);
      const score = (marketCapScore * 0.45) + (momentumScore * 0.3) + (stabilityScore * 0.25);

      return {
        ...coin,
        confidence: Math.round(clamp(score, 0, 1) * 100),
        generalScore: score,
        label: score >= 0.72 ? "Strong Buy 🔥" : score >= 0.5 ? "Moderate 📊" : "Avoid ⚠️",
        reason: "market cap + positive 24h change + stability",
      };
    })
    .filter((coin) => (coin.price_change_percentage_24h ?? 0) > 0)
    .sort((a, b) => b.generalScore - a.generalScore)
    .slice(0, 3);
}

function buildAllocationSuggestion(amount, count, currency = lastAnalyzedCurrency) {
  if (!amount || count === 0) {
    return "--";
  }

  const splitAmount = amount / count;
  return `${formatAmountInCurrency(splitAmount, currency)} each across ${count} coins`;
}

function renderTopRecommendations(recommendations) {
  if (!recommendations.length) {
    topRecommendationsList.innerHTML =
      '<p class="empty-state recommendation-empty">No recommendations available yet.</p>';
    return;
  }

  topRecommendationsList.innerHTML = recommendations
    .map((coin, index) => {
      return `
        <article class="recommendation-item">
          <span class="recommendation-rank">${index + 1}</span>
          <div>
            <div class="recommendation-item-name">${coin.name}</div>
            <div class="recommendation-item-meta">${coin.label} · ${coin.reason}</div>
          </div>
          <div class="recommendation-item-score">
            <strong>${coin.confidence}%</strong>
            <span>Confidence</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRecommendations(amount = lastAnalyzedAmount, currency = lastAnalyzedCurrency, mode = lastRecommendationMode) {
  lastAnalyzedAmount = amount;
  lastAnalyzedCurrency = currency;
  lastRecommendationMode = mode;

  if (!recommendationCache.length) {
    bestCoinName.textContent = "Waiting for market data";
    bestCoinReason.textContent = "Live prices have not loaded yet, so the recommendation engine is standing by.";
    bestCoinConfidence.textContent = "--";
    bestCoinAllocation.textContent = "--";
    recommendationSummary.textContent = "No analysis available yet.";
    distributionSuggestion.textContent = "Distribution suggestion will appear here.";
    renderTopRecommendations([]);
    return;
  }

  if (mode === "general") {
    const generalRecommendations = analyzeGeneralRecommendations();

    if (!generalRecommendations.length) {
      bestCoinName.textContent = "Top coins unavailable";
      bestCoinReason.textContent = "Market conditions do not currently support a strong general recommendation.";
      bestCoinConfidence.textContent = "--";
      bestCoinAllocation.textContent = "--";
      recommendationSummary.textContent = "Top coins right now are unavailable.";
      distributionSuggestion.textContent = "Check back after the next refresh.";
      renderTopRecommendations([]);
      return;
    }

    const topCoin = generalRecommendations[0];
    bestCoinName.textContent = "Top coins right now";
    bestCoinReason.textContent = `${topCoin.name} leads on market cap, positive momentum, and relative stability.`;
    bestCoinConfidence.textContent = `${topCoin.confidence}% confidence`;
    bestCoinAllocation.textContent = "--";
    recommendationSummary.textContent = "General mode active: showing the strongest coins right now based on market cap, positive 24h change, and stability.";
    distributionSuggestion.textContent = "Add a valid amount to switch into investment mode.";
    renderTopRecommendations(generalRecommendations);
    return;
  }

  const topCoin = recommendationCache[0];
  const strongCoins = recommendationCache.filter((coin) => coin.hasStrongSignal);

  if (!strongCoins.length) {
    bestCoinName.textContent = "No strong buy signal";
    bestCoinReason.textContent = "Current market conditions are mixed. Momentum or entry quality is not strong enough to suggest a high-confidence buy.";
    bestCoinConfidence.textContent = `${topCoin.confidence}%`;
    bestCoinAllocation.textContent = "--";
    recommendationSummary.textContent = "Scanner result: no coin currently clears the strong-buy threshold.";
    distributionSuggestion.textContent = "Suggestion: wait for stronger alignment before allocating fresh capital.";
    renderTopRecommendations(recommendationCache);
    return;
  }

  bestCoinName.textContent = topCoin.name;
  bestCoinReason.textContent = `${topCoin.label} · ${topCoin.reason}`;
  bestCoinConfidence.textContent = `${topCoin.confidence}% confidence`;
  bestCoinAllocation.textContent = amount > 0
    ? formatAmountInCurrency(amount * 0.5, currency)
    : "Add amount";
  recommendationSummary.textContent = `Best match right now: ${topCoin.name} with ${topCoin.label} and ${topCoin.confidence}% confidence based on trend, momentum, stability, signal, and volume.`;
  distributionSuggestion.textContent = amount > 0
    ? `Suggested split: ${buildAllocationSuggestion(amount, Math.min(3, strongCoins.length), currency)}`
    : "Enter an investment amount to see a suggested split across the top picks.";
  renderTopRecommendations(strongCoins);
}

function createNotification({ coinName, percentChange, type, message }) {
  const notification = document.createElement("article");
  const changeClass = type === "gain" ? "positive" : "negative";

  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-header">
      <span class="notification-title">${coinName}</span>
      <span class="notification-change ${changeClass}">${formatPercent(percentChange)}</span>
    </div>
    <div class="notification-body">${message}</div>
  `;

  notificationsPanel.prepend(notification);

  window.setTimeout(() => {
    notification.classList.add("fade-out");
    window.setTimeout(() => notification.remove(), 350);
  }, ALERT_LIFETIME_MS);
}

function processPriceAlerts(coins) {
  coins.forEach((coin) => {
    const previousPrice = previousCoinPrices.get(coin.id);
    previousCoinPrices.set(coin.id, coin.current_price);

    if (!previousPrice || previousPrice <= 0) {
      return;
    }

    const percentChange = ((coin.current_price - previousPrice) / previousPrice) * 100;
    const nextDirection = percentChange >= ALERT_THRESHOLD_PERCENT
      ? "gain"
      : percentChange <= -ALERT_THRESHOLD_PERCENT
        ? "drop"
        : "neutral";
    const previousDirection = lastAlertDirection.get(coin.id) ?? "neutral";

    if (nextDirection !== "neutral" && nextDirection !== previousDirection) {
      createNotification({
        coinName: coin.name,
        percentChange,
        type: nextDirection,
        message: nextDirection === "gain" ? "Price Gained" : "Price Dropped",
      });
    }

    lastAlertDirection.set(coin.id, nextDirection);
  });
}

function updateProTips() {
  if (!allCoins.length) {
    marketTip.textContent = "Waiting for market data before generating tips.";
    portfolioTip.textContent = "Portfolio guidance will appear once your holdings are added.";
    return;
  }

  const risingCoins = allCoins.filter((coin) => (coin.price_change_percentage_24h ?? 0) > 1).length;
  const fallingCoins = allCoins.filter((coin) => (coin.price_change_percentage_24h ?? 0) < -1).length;

  if (risingCoins >= allCoins.length * 0.6) {
    marketTip.textContent = "Market is bullish - consider buying strong coins.";
  } else if (fallingCoins >= allCoins.length * 0.6) {
    marketTip.textContent = "Market is bearish - be cautious or wait.";
  } else {
    marketTip.textContent = "Market is volatile - trade carefully.";
  }

  const totalInvestedValue = Object.values(portfolio).reduce((sum, entry) => {
    return sum + ((Number(entry.buyPrice) || 0) * (Number(entry.amount) || 0));
  }, 0);
  const totalCurrentValue = Object.entries(portfolio).reduce((sum, [coinId, entry]) => {
    const coin = allCoins.find((item) => item.id === coinId);
    if (!coin) {
      return sum;
    }

    return sum + coin.current_price * (Number(entry.amount) || 0);
  }, 0);
  const totalProfitLossPercent = totalInvestedValue > 0
    ? ((totalCurrentValue - totalInvestedValue) / totalInvestedValue) * 100
    : 0;

  if (totalInvestedValue <= 0) {
    portfolioTip.textContent = "Add holdings with buy price to unlock personalized profit and risk tips.";
  } else if (totalProfitLossPercent <= -10) {
    portfolioTip.textContent = "Your portfolio is down - avoid panic selling.";
  } else if (totalProfitLossPercent >= 10) {
    portfolioTip.textContent = "Good profit - consider booking gains.";
  } else {
    portfolioTip.textContent = "Stay disciplined with entries and keep tracking your average buy price.";
  }
}

function detectCurrencySymbol(input) {
  const trimmedInput = input.trim();

  if (trimmedInput.startsWith("₹")) {
    return "INR";
  }

  if (trimmedInput.startsWith("€")) {
    return "EUR";
  }

  if (trimmedInput.startsWith("£")) {
    return "GBP";
  }

  if (trimmedInput.startsWith("¥")) {
    return "JPY";
  }

  if (trimmedInput.startsWith("$")) {
    return "USD";
  }

  return "USD";
}

function parseAmount(input) {
  if (!input) {
    return null;
  }

  const cleaned = input.replace(/[₹$€£¥,\s]/g, "");
  const value = Number.parseFloat(cleaned);

  return Number.isNaN(value) ? null : value;
}

function parseInvestmentInput(rawInput) {
  const currency = detectCurrencySymbol(rawInput);
  const amount = parseAmount(rawInput);

  return {
    currency,
    amount,
  };
}

async function getUsdRateForCurrency(currency) {
  if (currency === "USD") {
    usingApproximateConversion = false;
    return 1;
  }

  if (
    cachedRatesState &&
    cachedRatesState.baseCurrency === currency &&
    Date.now() - cachedRatesState.timestamp < FX_CACHE_TTL_MS
  ) {
    usingApproximateConversion = Boolean(cachedRatesState.approximate);
    return cachedRatesState.usdRate;
  }

  if (fxRequestInFlight) {
    usingApproximateConversion = Boolean(cachedRatesState?.approximate);
    return cachedRatesState?.usdRate ?? FALLBACK_RATES_TO_USD[currency] ?? 1;
  }

  fxRequestInFlight = true;

  try {
    const response = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=USD`, {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`FX request failed with status ${response.status}`);
    }

    const data = await response.json();
    const usdRate = data.rates?.USD;

    if (!usdRate) {
      throw new Error("Missing USD rate");
    }

    usingApproximateConversion = false;
    saveFxCache(currency, usdRate, false);
    return usdRate;
  } catch (error) {
    console.error("Failed to fetch live exchange rate:", error);
    const fallbackRate = FALLBACK_RATES_TO_USD[currency] ?? cachedRatesState?.usdRate ?? 1;
    usingApproximateConversion = true;
    saveFxCache(currency, fallbackRate, true);
    return fallbackRate;
  } finally {
    fxRequestInFlight = false;
  }
}

async function updateInvestmentConversionPreview() {
  const topCoin = recommendationCache[0];

  if (!topCoin || lastRecommendationMode !== "investment") {
    return;
  }

  const rawInput = investmentAmountInput.value.trim();

  if (!rawInput) {
    return;
  }

  const parsedInput = parseInvestmentInput(rawInput);

  if (parsedInput.amount === null || parsedInput.amount <= 0) {
    return;
  }

  const usdRate = await getUsdRateForCurrency(parsedInput.currency);
  const usdValue = parsedInput.amount * usdRate;
  const cryptoAmount = usdValue / topCoin.current_price;
  const approxNote = usingApproximateConversion ? " Using approximate conversion." : "";

  bestCoinAllocation.textContent = `${formatAmountInCurrency(parsedInput.amount, parsedInput.currency)} ≈ ${formatCurrency(usdValue)}`;
  recommendationSummary.textContent = `${rawInput} ≈ ${formatCurrency(usdValue)} -> You can buy ${formatAmount(cryptoAmount)} ${topCoin.symbol.toUpperCase()}.${approxNote}`;
}

function updateAffiliateLinks() {
  recommendAffiliateLink.href = AFFILIATE_URL;
  portfolioAffiliateLink.href = AFFILIATE_URL;
  chartAffiliateLink.href = AFFILIATE_URL;

  if (recommendationCache[0]) {
    recommendAffiliateLink.textContent = `Start investing in ${recommendationCache[0].name} (Recommended)`;
  }

  if (selectedCoinName) {
    chartAffiliateLink.textContent = `Start investing in ${selectedCoinName} (Recommended)`;
  } else {
    chartAffiliateLink.textContent = "Start investing in this coin (Recommended)";
  }
}

function formatChartLabel(timestamp) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatLiveTimeLabel(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createChartInstance() {
  if (priceChart) {
    return;
  }

  priceChart = new Chart(priceChartCanvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Price",
          data: [],
          borderColor: "#7fd5ff",
          backgroundColor: "rgba(127, 213, 255, 0.16)",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 14,
          tension: 0.35,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 450,
        easing: "easeOutQuart",
      },
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(context) {
              return formatCurrency(context.parsed.y);
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#91a5c6",
          },
          grid: {
            color: "rgba(145, 165, 198, 0.08)",
          },
        },
        y: {
          ticks: {
            color: "#91a5c6",
            callback(value) {
              return formatCurrency(value);
            },
          },
          grid: {
            color: "rgba(145, 165, 198, 0.08)",
          },
        },
      },
    },
  });
}

function normalizeChartPoints(pricePoints) {
  return pricePoints.slice(-MAX_CHART_POINTS).map(([timestamp, price]) => ({
    label: formatChartLabel(timestamp),
    value: Number(price.toFixed(2)),
  }));
}

function setChartData(points) {
  createChartInstance();

  priceChart.data.labels = points.map((point) => point.label);
  priceChart.data.datasets[0].label = `${selectedCoinName} Price`;
  priceChart.data.datasets[0].data = points.map((point) => point.value);
  priceChart.update();
}

function appendLiveChartPoint(price) {
  if (!priceChart || !selectedCoinId) {
    return;
  }

  const cachedPoints = chartHistoryCache.get(selectedCoinId);

  if (!cachedPoints?.length) {
    return;
  }

  const nextPoint = {
    label: formatLiveTimeLabel(),
    value: Number(price.toFixed(2)),
  };

  cachedPoints.push(nextPoint);

  if (cachedPoints.length > MAX_CHART_POINTS) {
    cachedPoints.shift();
  }

  priceChart.data.labels = cachedPoints.map((point) => point.label);
  priceChart.data.datasets[0].data = cachedPoints.map((point) => point.value);
  priceChart.data.datasets[0].label = `${selectedCoinName} Price`;
  priceChart.update();
}

async function loadCoinChart(coinId, coinName) {
  selectedCoinId = coinId;
  selectedCoinName = coinName;
  chartTitle.textContent = `${coinName} Price Chart`;
  updateAffiliateLinks();
  applySearch();

  const cachedPoints = chartHistoryCache.get(coinId);

  if (cachedPoints?.length) {
    setChartData(cachedPoints);
    updateChartStatus("Showing saved chart data with live updates enabled.");
    return;
  }

  updateChartStatus("Loading 7-day price history...");

  if (!hasLoadedChartOnce) {
    setChartLoading(true);
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${HISTORY_DAYS}&interval=daily`,
      {
        headers: {
          accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Chart request failed with status ${response.status}`);
    }

    const history = await response.json();

    if (!history.prices?.length) {
      throw new Error("No chart data returned");
    }

    const normalizedPoints = normalizeChartPoints(history.prices);
    chartHistoryCache.set(coinId, normalizedPoints);
    setChartData(normalizedPoints);
    updateChartStatus("Showing the last 7 days of USD price history.");
    hasLoadedChartOnce = true;
  } catch (error) {
    console.error("Failed to fetch chart data:", error);
    updateChartStatus("Unable to load chart data right now.", true);
  } finally {
    if (!hasLoadedChartOnce) {
      setChartLoading(false);
    } else {
      chartWrap.classList.remove("loading-chart");
    }
  }
}

function applySearch() {
  const query = searchInput.value.trim().toLowerCase();

  const filteredCoins = allCoins.filter((coin) => {
    return (
      coin.name.toLowerCase().includes(query) ||
      coin.symbol.toLowerCase().includes(query)
    );
  });

  renderTable(filteredCoins);
}

async function fetchCoins() {
  if (marketRequestInFlight) {
    return;
  }

  marketRequestInFlight = true;
  updateStatus("Refreshing...");
  setMarketLoading(true);

  try {
    const response = await fetch(API_URL, {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      const error = new Error(`Request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const marketData = await response.json();
    allCoins = marketData.map(updateCoinSignal);
    saveMarketCache(marketData);
    processPriceAlerts(allCoins);
    analyzeRecommendations();
    applySearch();
    renderPortfolio();
    renderRecommendations(lastAnalyzedAmount, lastAnalyzedCurrency, lastRecommendationMode);
    updateProTips();
    updateAffiliateLinks();

    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    lastUpdated.textContent = `Last updated: ${timestamp}`;
    updateStatus("Live");
    marketRetryIndex = 0;

    if (selectedCoinId) {
      const selectedCoin = allCoins.find((coin) => coin.id === selectedCoinId);

      if (selectedCoin) {
        appendLiveChartPoint(selectedCoin.current_price);
      }
    }
  } catch (error) {
    console.error("Failed to fetch crypto data:", error);
    const retryDelay = RETRY_DELAYS_MS[Math.min(marketRetryIndex, RETRY_DELAYS_MS.length - 1)];
    marketRetryIndex = Math.min(marketRetryIndex + 1, RETRY_DELAYS_MS.length - 1);

    if (error.status === 429) {
      updateStatus("Too many requests, retrying...", true);
    } else if (error.status >= 500) {
      updateStatus("Server issue, retrying...", true);
    } else {
      updateStatus("⚠️ Temporary issue, showing last updated data", true);
    }

    if (!allCoins.length) {
      const cachedMarket = loadMarketCache();

      if (cachedMarket?.coins?.length) {
        allCoins = cachedMarket.coins.map(updateCoinSignal);
        analyzeRecommendations();
        applySearch();
        renderPortfolio();
        renderRecommendations(lastAnalyzedAmount, lastAnalyzedCurrency, lastRecommendationMode);
        updateProTips();
        lastUpdated.textContent = `Last updated: ${new Date(cachedMarket.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}`;
      }
    }

    scheduleNextFetch(retryDelay);
    marketRequestInFlight = false;
    setMarketLoading(false);
    return;
  } finally {
    setMarketLoading(false);
    marketRequestInFlight = false;
  }

  scheduleNextFetch(REFRESH_INTERVAL_MS);
}

function startAutoRefresh() {
  scheduleNextFetch(REFRESH_INTERVAL_MS);
}

searchInput.addEventListener("input", applySearch);
recommendButton.addEventListener("click", async () => {
  const rawInput = investmentAmountInput.value || "";
  const parsedInput = parseInvestmentInput(rawInput);

  if (!rawInput.trim()) {
    renderRecommendations(0, "USD", "general");
    return;
  }

  if (parsedInput.amount === null) {
    if (rawInput.trim() !== "") {
      window.alert("Please enter a valid amount.");
    }

    renderRecommendations(0, "USD", "general");
    lastRecommendationMode = "general";
    return;
  }

  if (parsedInput.amount <= 0) {
    renderRecommendations(0, "USD", "general");
    lastRecommendationMode = "general";
    return;
  }

  try {
    renderRecommendations(parsedInput.amount, parsedInput.currency, "investment");
    await updateInvestmentConversionPreview();
  } catch (error) {
    console.error("Falling back to general mode:", error);
    renderRecommendations(0, "USD", "general");
  }
});
tableBody.addEventListener("click", (event) => {
  const addButton = event.target.closest("button[data-add-portfolio]");

  if (addButton) {
    event.stopPropagation();

    const coinId = addButton.dataset.coinId;
    const coin = allCoins.find((item) => item.id === coinId);

    if (!coin) {
      return;
    }

    const currentEntry = portfolio[coinId] ?? { amount: 0, buyPrice: 0 };
    const amountInput = window.prompt(`Enter amount of ${coin.name} you own:`, currentEntry.amount || "");

    if (amountInput === null) {
      return;
    }

    const amount = Number(amountInput);

    if (!Number.isFinite(amount) || amount < 0) {
      window.alert("Please enter a valid amount.");
      return;
    }

    let buyPrice = currentEntry.buyPrice || 0;

    if (amount > 0) {
      const buyPriceInput = window.prompt(`Enter your buy price for ${coin.name}:`, buyPrice || coin.current_price);

      if (buyPriceInput === null) {
        return;
      }

      buyPrice = Number(buyPriceInput);

      if (!Number.isFinite(buyPrice) || buyPrice < 0) {
        window.alert("Please enter a valid buy price.");
        return;
      }
    }

    if (amount === 0) {
      delete portfolio[coinId];
    } else {
      portfolio[coinId] = {
        amount,
        buyPrice,
      };
    }

    savePortfolio();
    renderPortfolio();
    updateProTips();
    return;
  }

  const row = event.target.closest("tr[data-coin-id]");

  if (!row) {
    return;
  }

  loadCoinChart(row.dataset.coinId, row.dataset.coinName);
});

const cachedMarket = loadMarketCache();

if (cachedMarket?.coins?.length) {
  allCoins = cachedMarket.coins.map(updateCoinSignal);
  analyzeRecommendations();
  applySearch();
  renderPortfolio();
  renderRecommendations(lastAnalyzedAmount, lastAnalyzedCurrency, "general");
  updateProTips();
  lastUpdated.textContent = `Last updated: ${new Date(cachedMarket.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

fetchCoins();
renderPortfolio();
renderRecommendations(0, "USD", "general");
updateProTips();
updateAffiliateLinks();
