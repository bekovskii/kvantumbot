import {
  MarketTicker,
  OpenPosition,
  ClosedTradeRecord,
  StrategyConfig,
  validateAndRoundOrderFilters,
  walkOrderBookForFill,
  calculateEMA,
  calculateRSI,
} from './tradingEngine';

export const V3_AI_ENGINE_CONFIG = {
  model: 'gemini-3-flash-preview',
  temperature: 0.2,
  topP: 0.85,
  systemRole: 'KVANTUM_V3_DETERMINISTIC_NEWS_SCORER',
} as const;

export type V3WorkerId =
  | 'NEWS_INTELLIGENCE'
  | 'MARKET_ANALYSIS'
  | 'SECURITY_AND_FUNDS'
  | 'DECISION_ENGINE'
  | 'ORDER_MANAGER';

export type V3EventType =
  | 'NEWS_ALERT'
  | 'ORDERBOOK_UPDATE'
  | 'SIGNAL_GENERATED'
  | 'ORDER_REQUEST'
  | 'KILL_SWITCH'
  | 'POSITION_UPDATE';

export interface V3BusEvent<T = unknown> {
  id: string;
  type: V3EventType;
  timestampMs: number;
  sourceWorker: V3WorkerId;
  symbol: string;
  summary: string;
  latencyMs: number;
  payload: T;
}

export class AsyncEventBus {
  private listeners: Map<V3EventType | '*', Set<(event: V3BusEvent) => void>> =
    new Map();
  private history: V3BusEvent[] = [];
  private maxHistory: number;
  private seqCounter = 0;

  constructor(maxHistory = 60) {
    this.maxHistory = maxHistory;
  }

  public subscribe(
    type: V3EventType | '*',
    handler: (event: V3BusEvent) => void
  ): () => void {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(handler);
    this.listeners.set(type, existing);
    return () => {
      existing.delete(handler);
    };
  }

  public publish<T = unknown>(
    eventInput: Omit<V3BusEvent<T>, 'id' | 'timestampMs'> & {
      id?: string;
      timestampMs?: number;
    }
  ): V3BusEvent<T> {
    this.seqCounter = (this.seqCounter + 1) % 100000;
    const evt: V3BusEvent<T> = {
      id:
        eventInput.id ??
        `EVT-${Date.now().toString(36).toUpperCase()}-${this.seqCounter
          .toString(36)
          .padStart(4, '0')
          .toUpperCase()}`,
      timestampMs: eventInput.timestampMs ?? Date.now(),
      sourceWorker: eventInput.sourceWorker,
      type: eventInput.type,
      symbol: eventInput.symbol,
      summary: eventInput.summary,
      latencyMs: eventInput.latencyMs,
      payload: eventInput.payload,
    };

    this.history = [evt, ...this.history].slice(0, this.maxHistory);

    const specific = this.listeners.get(evt.type);
    const wildcard = this.listeners.get('*');

    queueMicrotask(() => {
      specific?.forEach((fn) => fn(evt));
      wildcard?.forEach((fn) => fn(evt));
    });

    return evt;
  }

  public getRecentEvents(): V3BusEvent[] {
    return this.history;
  }
}

export const ENTITY_TO_SYMBOL_DICTIONARY: Record<
  string,
  { symbol: string; entityLabel: string; baseWeight: number }
> = {
  vitalik: { symbol: 'ETHUSDT', entityLabel: 'Vitalik Buterin / Ethereum', baseWeight: 18 },
  pectra: { symbol: 'ETHUSDT', entityLabel: 'Ethereum Pectra Yükseltmesi', baseWeight: 22 },
  ethereum: { symbol: 'ETHUSDT', entityLabel: 'Ethereum Ağı', baseWeight: 15 },
  eth: { symbol: 'ETHUSDT', entityLabel: 'Ethereum (ETH)', baseWeight: 14 },
  garlinghouse: { symbol: 'XRPUSDT', entityLabel: 'Brad Garlinghouse / Ripple', baseWeight: 25 },
  ripple: { symbol: 'XRPUSDT', entityLabel: 'Ripple Labs (XRP)', baseWeight: 24 },
  rlusd: { symbol: 'XRPUSDT', entityLabel: 'Ripple RLUSD Stablecoin', baseWeight: 22 },
  xrp: { symbol: 'XRPUSDT', entityLabel: 'XRP Ledger', baseWeight: 18 },
  blackrock: { symbol: 'BTCUSDT', entityLabel: 'BlackRock IBIT Kurumsal Fon', baseWeight: 26 },
  ibit: { symbol: 'BTCUSDT', entityLabel: 'BlackRock IBIT ETF', baseWeight: 24 },
  microstrategy: { symbol: 'BTCUSDT', entityLabel: 'Strategy / Michael Saylor', baseWeight: 22 },
  saylor: { symbol: 'BTCUSDT', entityLabel: 'Michael Saylor', baseWeight: 20 },
  bitcoin: { symbol: 'BTCUSDT', entityLabel: 'Bitcoin (BTC)', baseWeight: 16 },
  btc: { symbol: 'BTCUSDT', entityLabel: 'Bitcoin (BTC)', baseWeight: 15 },
  altman: { symbol: 'WLDUSDT', entityLabel: 'Sam Altman / Worldcoin', baseWeight: 25 },
  worldcoin: { symbol: 'WLDUSDT', entityLabel: 'World ID (WLD)', baseWeight: 22 },
  openai: { symbol: 'WLDUSDT', entityLabel: 'OpenAI / World ID', baseWeight: 20 },
  toly: { symbol: 'SOLUSDT', entityLabel: 'Anatoly Yakovenko / Solana', baseWeight: 20 },
  firedancer: { symbol: 'SOLUSDT', entityLabel: 'Solana Firedancer', baseWeight: 24 },
  solana: { symbol: 'SOLUSDT', entityLabel: 'Solana (SOL)', baseWeight: 18 },
  arbitrum: { symbol: 'ARBUSDT', entityLabel: 'Arbitrum DAO / L2', baseWeight: 20 },
  arb: { symbol: 'ARBUSDT', entityLabel: 'Arbitrum (ARB)', baseWeight: 18 },
  chainlink: { symbol: 'LINKUSDT', entityLabel: 'Chainlink CCIP / Swift', baseWeight: 22 },
  ccip: { symbol: 'LINKUSDT', entityLabel: 'Chainlink CCIP', baseWeight: 24 },
  avalanche: { symbol: 'AVAXUSDT', entityLabel: 'Avalanche Ava Labs', baseWeight: 19 },
  binance: { symbol: 'BNBUSDT', entityLabel: 'Binance Borsa / BNB Chain', baseWeight: 20 },
  sui: { symbol: 'SUIUSDT', entityLabel: 'Mysten Labs / Sui', baseWeight: 20 },
  render: { symbol: 'RENDERUSDT', entityLabel: 'Render GPU Ağı', baseWeight: 20 },
  doge: { symbol: 'DOGEUSDT', entityLabel: 'Dogecoin / X Payments', baseWeight: 21 },
  musk: { symbol: 'DOGEUSDT', entityLabel: 'Elon Musk / X', baseWeight: 24 },
};

export type V3HybridTriggerMode =
  | 'MOD_1_SNIPE'
  | 'MOD_2_CONFLUENCE'
  | 'MOD_3_KILL_FLIP'
  | 'BLOCKED_PRICED_IN'
  | 'BLOCKED_FAKE_NEWS'
  | 'BLOCKED_DUPLICATE'
  | 'BLOCKED_NO_DATA'
  | 'MONITOR_ONLY';

export interface NewsIntelligenceItem {
  id: string;
  timestampMs: number;
  publishedAtMs?: number;
  headline: string;
  source: string;
  sourceUrl?: string;
  isManualInput?: boolean;
  aiEstimateLabel?: string;
  sourceTrustScore: number;
  semanticHash: string;
  isDuplicate: boolean;
  isFakeOrHacked: boolean;
  fakeGuardReason: string | null;
  detectedSymbol: string;
  matchedEntityLabel: string;
  aiImpactScore: number; // -100 .. +100 (AI Tahmini / AI Estimate)
  aiConfidencePct: number;
  temperatureUsed: number; // 0.2
  priceChange5sPct: number;
  pricedInBlocked: boolean;
  triggeredMode: V3HybridTriggerMode;
  actionSummary: string;
  processingLatencyMs: number;
}

export function computeSemanticNewsHash(headline: string): string {
  const stopWords = new Set([
    'son',
    'dakika',
    'breaking',
    'news',
    'resmi',
    'duyuru',
    'acikladi',
    'açıkladı',
    've',
    'ile',
    'için',
    'bir',
    'the',
    'of',
    'to',
    'in',
    'on',
    'for',
    'urgent',
    'alert',
  ]);
  const tokens = headline
    .toLocaleLowerCase('tr-TR')
    .replace(/\u0307/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w))
    .map((w) => w.slice(0, 6));

  const uniqueSorted = Array.from(new Set(tokens)).sort().slice(0, 6);
  return uniqueSorted.join('-') || 'empty-hash';
}

export function evaluateFakeNewsGuard(
  headline: string,
  source: string
): {
  isFakeOrHacked: boolean;
  sourceTrustScore: number;
  reason: string | null;
} {
  const lower = headline.toLowerCase();
  const scamPatterns = [
    'airdrop claim',
    'free giveaway',
    'send eth to',
    'send btc',
    'bedava dağıtım',
    'bedava airdrop',
    'cüzdanınızı bağlayın',
    'free claim',
    'double your crypto',
    'hacked account test',
    'sahte',
    'phishing',
  ];

  for (const pat of scamPatterns) {
    if (lower.includes(pat)) {
      return {
        isFakeOrHacked: true,
        sourceTrustScore: 8,
        reason: `Sahte/Oltalama (Phishing) kalıbı tespit edildi: "${pat}"`,
      };
    }
  }

  const trustedSources: Record<string, number> = {
    'Binance Official': 98,
    'Binance Official / SEC Filing': 98,
    'Bloomberg Terminal': 97,
    'TreeOfAlpha / Bloomberg Terminal': 98,
    'SEC Edgar Filing': 99,
    'Tier-1 X Feed': 92,
    'Tier-1 X Feed (@VitalikButerin)': 95,
    'Reuters Crypto': 95,
    'Binance Live L2 / OrderFlow Scanner': 96,
  };

  const trust = trustedSources[source] ?? 78;
  if (trust < 40) {
    return {
      isFakeOrHacked: true,
      sourceTrustScore: trust,
      reason: 'Doğrulanmamış düşük güvenilirlikli kaynak',
    };
  }

  return {
    isFakeOrHacked: false,
    sourceTrustScore: trust,
    reason: null,
  };
}

export function resolveSymbolAndImpactFromHeadline(
  headline: string,
  explicitSymbol?: string,
  explicitScore?: number
): {
  symbol: string;
  entityLabel: string;
  aiImpactScore: number;
  aiConfidencePct: number;
} {
  const lower = headline.toLowerCase();
  let matchedSymbol = explicitSymbol || 'BTCUSDT';
  let matchedEntity = 'Genel Kripto Makro Akışı';
  let baseEntityBoost = 15;

  for (const [key, entry] of Object.entries(ENTITY_TO_SYMBOL_DICTIONARY)) {
    if (lower.includes(key)) {
      matchedSymbol = explicitSymbol || entry.symbol;
      matchedEntity = entry.entityLabel;
      baseEntityBoost = entry.baseWeight;
      break;
    }
  }

  if (typeof explicitScore === 'number') {
    return {
      symbol: matchedSymbol,
      entityLabel: matchedEntity,
      aiImpactScore: Math.max(-100, Math.min(100, Math.round(explicitScore))),
      aiConfidencePct: Math.min(
        99,
        Math.max(78, Math.round(Math.abs(explicitScore) * 0.98))
      ),
    };
  }

  const bullKeywords: Array<{ word: string; weight: number }> = [
    { word: 'etf onay', weight: 68 },
    { word: 'sec davası kapandı', weight: 72 },
    { word: 'zafer', weight: 58 },
    { word: 'listeledi', weight: 65 },
    { word: 'listing', weight: 64 },
    { word: 'rekor alım', weight: 60 },
    { word: 'kurumsal fon', weight: 54 },
    { word: 'onay aldı', weight: 58 },
    { word: 'ortaklık', weight: 46 },
    { word: 'yükseltme', weight: 44 },
    { word: 'azaltacak', weight: 32 },
    { word: 'düşeceğini', weight: 35 },
    { word: 'entegrasyon', weight: 45 },
    { word: 'milyar dolar', weight: 52 },
    { word: 'milyon dolar', weight: 46 },
  ];

  const bearKeywords: Array<{ word: string; weight: number }> = [
    { word: 'hacklendi', weight: -78 },
    { word: 'hack', weight: -74 },
    { word: 'exploit', weight: -75 },
    { word: 'delist', weight: -76 },
    { word: 'iflas', weight: -80 },
    { word: 'soruşturma', weight: -58 },
    { word: 'dava açtı', weight: -62 },
    { word: 'reddetti', weight: -55 },
    { word: 'yasakladı', weight: -66 },
    { word: 'çöktü', weight: -64 },
  ];

  let score = 0;
  for (const b of bullKeywords) {
    if (lower.includes(b.word)) score += b.weight;
  }
  for (const br of bearKeywords) {
    if (lower.includes(br.word)) score += br.weight;
  }

  if (score >= 0) {
    score = Math.min(98, score + baseEntityBoost);
  } else {
    score = Math.max(-98, score - Math.round(baseEntityBoost * 0.8));
  }

  const confidence = Math.min(99, Math.max(72, 68 + Math.round(Math.abs(score) * 0.3)));

  return {
    symbol: matchedSymbol,
    entityLabel: matchedEntity,
    aiImpactScore: score,
    aiConfidencePct: confidence,
  };
}

/**
 * Real L2 OrderBook & Recent Trades Snapshot from Server (/api/mexc/orderbook)
 */
export interface RealOrderBookSnapshot {
  symbol: string;
  lastUpdateId: number;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
  bestBid: number;
  bestAsk: number;
  spreadBps: number;
  obiScore: number; // Real top-N depth OBI (-1..+1)
  tfiScore: number; // Real recent trades TFI (-1..+1)
  takerBuyVolume: number;
  takerSellVolume: number;
  tradesSampleCount: number;
  timestamp: number;
}

/**
 * 2. DEPARTMAN: PİYASA ANALİZ (OBI, TFI, Spoofing Status, 5m/15m EMA+RSI, Wilder ATR)
 * Every metric is computed strictly from real L2 depth, real trades, real candles, and stored 5s real prices.
 */
export interface OrderBookMicrostructure {
  symbol: string;
  baseAsset: string;
  obiScore: number; // -1.00 .. +1.00 (Real L2 depth imbalance)
  obiAvailable: boolean;
  tfiScore: number; // -1.00 .. +1.00 (Real trade flow imbalance)
  tfiAvailable: boolean;
  spoofingWallsFiltered: number;
  spoofingStatus: string;
  isVipWatched: boolean;
  emaTrend5m: 'BULL' | 'BEAR';
  emaTrend15m: 'BULL' | 'BEAR';
  rsi15m: number;
  atr5m: number;
  atr15m: number;
  atrPct: number;
  dynamicSlDistance: number;
  chandelierStopLong: number;
  chandelierStopShort: number;
  spreadBps: number;
  priceChange5sPct: number;
  confluenceScore: number;
  recommendedOrderType: 'IOC_MARKET_TAKER' | 'POST_ONLY_MAKER';
  killSwitchTriggered: boolean;
  killSwitchReason: string | null;
}

export type L2MicrostructureMetrics = OrderBookMicrostructure;

export function computeL2Microstructure(
  market: MarketTicker,
  vipSet: Set<string> = new Set(),
  overridePriceChange5sPct?: number,
  _newsScore = 0,
  realOrderBookSnapshot?: RealOrderBookSnapshot | null
): OrderBookMicrostructure {
  const isVipWatched = vipSet.has(market.symbol);
  const price = Math.max(0.000001, market.price);

  // 1. OBI (Order Book Imbalance): Computed ONLY from real L2 depth or real bookTicker top-of-book quantities
  let obiScore = 0;
  let obiAvailable = false;

  const bidQty = market.bestBidQty ?? 0;
  const askQty = market.bestAskQty ?? 0;

  if (realOrderBookSnapshot && realOrderBookSnapshot.bids.length > 0 && realOrderBookSnapshot.asks.length > 0) {
    obiScore = Number(Math.max(-1, Math.min(1, realOrderBookSnapshot.obiScore)).toFixed(2));
    obiAvailable = true;
  } else if (bidQty > 0 || askQty > 0) {
    const totalTop = bidQty + askQty;
    if (totalTop > 0) {
      obiScore = Number(((bidQty - askQty) / totalTop).toFixed(2));
      obiAvailable = true;
    }
  }

  // 2. TFI (Trade Flow Imbalance): Computed ONLY from real recent trades (taker buy vs taker sell volume)
  let tfiScore = 0;
  let tfiAvailable = false;

  if (realOrderBookSnapshot && realOrderBookSnapshot.tradesSampleCount > 0) {
    tfiScore = Number(Math.max(-1, Math.min(1, realOrderBookSnapshot.tfiScore)).toFixed(2));
    tfiAvailable = true;
  }

  // 3. Spread (bps): Computed ONLY from real bestBid and bestAsk
  let spreadBps = 0;
  const mBid = market.bestBid ?? 0;
  const mAsk = market.bestAsk ?? 0;
  if (realOrderBookSnapshot && realOrderBookSnapshot.bestBid > 0 && realOrderBookSnapshot.bestAsk > 0) {
    spreadBps = realOrderBookSnapshot.spreadBps;
  } else if (mBid > 0 && mAsk > 0 && mAsk >= mBid) {
    const mid = (mBid + mAsk) / 2;
    spreadBps = mid > 0 ? Number((((mAsk - mBid) / mid) * 10000).toFixed(2)) : 0;
  }

  // 4. 5m & 15m EMA Trend + RSI from real candle series
  const emaTrend5m: 'BULL' | 'BEAR' =
    market.emaFast >= market.emaSlow ? 'BULL' : 'BEAR';

  let emaTrend15m: 'BULL' | 'BEAR' = emaTrend5m;
  let rsi15m = Number(market.rsi14.toFixed(1));
  if (market.closes15m && market.closes15m.length >= 15) {
    const emaFast15m = calculateEMA(market.closes15m, 9);
    const emaSlow15m = calculateEMA(market.closes15m, 21);
    emaTrend15m = emaFast15m >= emaSlow15m ? 'BULL' : 'BEAR';
    rsi15m = Number(calculateRSI(market.closes15m, 14).toFixed(1));
  }

  // 5. True Wilder ATR from real 5m and 15m candles (never 24h range or |change24h|*0.18+0.65)
  const rawAtr5 = market.atr5mValue ?? 0;
  const rawAtr15 = market.atr15mValue ?? 0;
  const atr5m = rawAtr5 > 0 ? Number(rawAtr5.toPrecision(5)) : 0;
  const atr15m = rawAtr15 > 0 ? Number(rawAtr15.toPrecision(5)) : atr5m;
  const atrPct = market.atrPct > 0 ? Number(market.atrPct.toFixed(3)) : 0;

  // Chandelier Dynamic Stop (2.5x True ATR)
  const dynamicSlDistance = Number((atr15m * 2.5).toPrecision(5));
  const chandelierStopLong =
    price > 0 && dynamicSlDistance > 0
      ? Number(Math.max(price * 0.5, price - dynamicSlDistance).toPrecision(6))
      : 0;
  const chandelierStopShort =
    price > 0 && dynamicSlDistance > 0
      ? Number((price + dynamicSlDistance).toPrecision(6))
      : 0;

  // 6. 5-Second Price Change (%): Stored real price history (never simulated)
  const priceChange5sPct =
    typeof overridePriceChange5sPct === 'number'
      ? Number(overridePriceChange5sPct.toFixed(2))
      : Number((market.priceChange5sPct || 0).toFixed(2));

  const recommendedOrderType: 'IOC_MARKET_TAKER' | 'POST_ONLY_MAKER' =
    Math.abs(obiScore) >= 0.45 && Math.abs(tfiScore) >= 0.45
      ? 'IOC_MARKET_TAKER'
      : 'POST_ONLY_MAKER';

  const dataAgeMs = Math.max(0, Date.now() - (market.lastUpdatedMs || Date.now()));
  const killSwitchTriggered =
    market.dataStatus !== 'FRESH' || !market.hasRealKlines;
  const killSwitchReason =
    market.dataStatus === 'NO_DATA'
      ? 'GERÇEK MUM / KLINE VERİSİ BEKLENİYOR (NO DATA)'
      : market.dataStatus === 'STALE'
      ? `VERİ BAYAT (${Math.round(dataAgeMs / 1000)}sn > Max Eşik)`
      : null;

  const confluenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        market.quantScore * 0.65 +
          Math.abs(obiScore) * 20 +
          Math.abs(tfiScore) * 15
      )
    )
  );

  return {
    symbol: market.symbol,
    baseAsset: market.baseAsset,
    obiScore,
    obiAvailable,
    tfiScore,
    tfiAvailable,
    spoofingWallsFiltered: 0,
    spoofingStatus: 'ÖLÇÜLEMEDİ (UNAVAILABLE)',
    isVipWatched,
    emaTrend5m,
    emaTrend15m,
    rsi15m,
    atr5m,
    atr15m,
    atrPct,
    dynamicSlDistance,
    chandelierStopLong,
    chandelierStopShort,
    spreadBps,
    priceChange5sPct,
    confluenceScore,
    recommendedOrderType,
    killSwitchTriggered,
    killSwitchReason,
  };
}

/**
 * 3. DEPARTMAN: GÜVENLİK VE KASA YÖNETİMİ (Watchdog, %70/%30 Alt-Kasalar, Token Bucket)
 */
export interface WatchdogStatus {
  pingMs: number;
  wsHeartbeatAgeMs: number;
  killSwitchActive: boolean;
  statusLabel: string;
  lastCheckedMs: number;
}

export function evaluateWatchdogState(params: {
  pingMs: number;
  wsHeartbeatAgeMs: number;
  manualKillSwitchOverride?: boolean;
  isFeedDisconnectedOrStale?: boolean;
}): WatchdogStatus {
  const {
    pingMs,
    wsHeartbeatAgeMs,
    manualKillSwitchOverride = false,
    isFeedDisconnectedOrStale = false,
  } = params;
  const latencyTripped =
    pingMs > 200 || wsHeartbeatAgeMs > 8000 || isFeedDisconnectedOrStale;
  const killSwitchActive = manualKillSwitchOverride || latencyTripped;

  let statusLabel = 'SİSTEM DOKTORU: NOMİNAL (AKTİF KORUMA)';
  if (manualKillSwitchOverride) {
    statusLabel = 'KILL_SWITCH: MANUEL ACİL DURDURMA AKTİF';
  } else if (isFeedDisconnectedOrStale) {
    statusLabel = 'KILL_SWITCH: VERİ AKIŞI KESİLDİ / BAYAT VERİ (STALE)';
  } else if (pingMs > 200) {
    statusLabel = `KILL_SWITCH: YÜKSEK BORSA GECİKMESİ (${pingMs}ms > 200ms Sınırı)`;
  } else if (wsHeartbeatAgeMs > 8000) {
    statusLabel = 'KILL_SWITCH: BORSA VERİ AKIŞI GECİKTİ (>8sn)';
  }

  return {
    pingMs,
    wsHeartbeatAgeMs,
    killSwitchActive,
    statusLabel,
    lastCheckedMs: Date.now(),
  };
}

export interface SubFundAllocationState {
  totalWalletEquityUsdt: number;
  totalNetEquityUsdt: number;
  confluenceRatioPct: number; // Default 70%
  sniperRatioPct: number; // Default 30%
  confluenceFund: {
    startingBalanceUsdt: number;
    usedMarginUsdt: number;
    availableMarginUsdt: number;
    freeCashUsdt: number;
    netEquityUsdt: number;
    realizedPnlUsdt: number;
    unrealizedPnlUsdt: number;
    activePositionsCount: number;
    openPositionsCount: number;
  };
  sniperFund: {
    startingBalanceUsdt: number;
    usedMarginUsdt: number;
    availableMarginUsdt: number;
    freeCashUsdt: number;
    netEquityUsdt: number;
    realizedPnlUsdt: number;
    unrealizedPnlUsdt: number;
    activePositionsCount: number;
    openPositionsCount: number;
  };
}

export function calculateSubFundAllocations(
  config: StrategyConfig,
  openPositions: OpenPosition[],
  closedHistory: ClosedTradeRecord[],
  confluenceRatioPct = 70
): SubFundAllocationState {
  const safeConfluencePct = Math.max(40, Math.min(90, confluenceRatioPct));
  const safeSniperPct = 100 - safeConfluencePct;
  const totalStart = config.demoStartingBalanceUsdt || 10000;

  const confStart = Number(((totalStart * safeConfluencePct) / 100).toFixed(2));
  const snipStart = Number(((totalStart * safeSniperPct) / 100).toFixed(2));

  const isSniperRule = (ruleText?: string) => {
    const safe = ruleText || '';
    return (
      safe.includes('MOD 1') ||
      safe.includes('MOD 3') ||
      safe.includes('SNIPE') ||
      safe.includes('KILL & FLIP')
    );
  };

  const sniperOpen = openPositions.filter((p) =>
    isSniperRule(p.triggerFormula)
  );
  const confOpen = openPositions.filter(
    (p) => !isSniperRule(p.triggerFormula)
  );

  const sniperClosed = closedHistory.filter((c) => isSniperRule(c.entryRule));
  const confClosed = closedHistory.filter((c) => !isSniperRule(c.entryRule));

  const confUsed = Number(
    confOpen.reduce((s, p) => s + p.marginUsdt, 0).toFixed(2)
  );
  const confUnrealized = Number(
    confOpen.reduce((s, p) => s + p.unrealizedPnlUsdt, 0).toFixed(2)
  );
  const confRealized = Number(
    confClosed.reduce((s, c) => s + c.realizedPnlUsdt, 0).toFixed(2)
  );
  const confAvailable = Number(
    Math.max(0, confStart + confRealized - confUsed).toFixed(2)
  );
  const confNetEquity = Number(
    (confStart + confRealized + confUnrealized).toFixed(2)
  );

  const snipUsed = Number(
    sniperOpen.reduce((s, p) => s + p.marginUsdt, 0).toFixed(2)
  );
  const snipUnrealized = Number(
    sniperOpen.reduce((s, p) => s + p.unrealizedPnlUsdt, 0).toFixed(2)
  );
  const snipRealized = Number(
    sniperClosed.reduce((s, c) => s + c.realizedPnlUsdt, 0).toFixed(2)
  );
  const snipAvailable = Number(
    Math.max(0, snipStart + snipRealized - snipUsed).toFixed(2)
  );
  const snipNetEquity = Number(
    (snipStart + snipRealized + snipUnrealized).toFixed(2)
  );

  const totalWalletEquityUsdt = Number(
    (
      totalStart +
      confRealized +
      snipRealized +
      confUnrealized +
      snipUnrealized
    ).toFixed(2)
  );

  return {
    totalWalletEquityUsdt,
    totalNetEquityUsdt: totalWalletEquityUsdt,
    confluenceRatioPct: safeConfluencePct,
    sniperRatioPct: safeSniperPct,
    confluenceFund: {
      startingBalanceUsdt: confStart,
      usedMarginUsdt: confUsed,
      availableMarginUsdt: confAvailable,
      freeCashUsdt: confAvailable,
      netEquityUsdt: confNetEquity,
      realizedPnlUsdt: confRealized,
      unrealizedPnlUsdt: confUnrealized,
      activePositionsCount: confOpen.length,
      openPositionsCount: confOpen.length,
    },
    sniperFund: {
      startingBalanceUsdt: snipStart,
      usedMarginUsdt: snipUsed,
      availableMarginUsdt: snipAvailable,
      freeCashUsdt: snipAvailable,
      netEquityUsdt: snipNetEquity,
      realizedPnlUsdt: snipRealized,
      unrealizedPnlUsdt: snipUnrealized,
      activePositionsCount: sniperOpen.length,
      openPositionsCount: sniperOpen.length,
    },
  };
}

export interface TokenBucketState {
  maxTokens: number;
  availableTokens: number;
  vipReservedTokens: number;
  lastRefillMs: number;
  usedWeight1m: number;
}

export function consumeRateLimiterToken(
  bucket: TokenBucketState,
  isVipEmergency: boolean
): { allowed: boolean; updatedBucket: TokenBucketState; reason: string } {
  const now = Date.now();
  const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
  const refilled = Math.min(
    bucket.maxTokens,
    bucket.availableTokens + Math.floor(elapsedSec * 4)
  );

  if (isVipEmergency) {
    if (refilled >= 1) {
      return {
        allowed: true,
        updatedBucket: {
          ...bucket,
          availableTokens: refilled - 1,
          lastRefillMs: now,
          usedWeight1m: Math.min(1200, bucket.usedWeight1m + 5),
        },
        reason: 'VIP_SNIPER_PRIORITY_GRANTED',
      };
    }
    return {
      allowed: false,
      updatedBucket: bucket,
      reason: 'RATE_LIMIT_EXHAUSTED',
    };
  }

  if (refilled > bucket.vipReservedTokens) {
    return {
      allowed: true,
      updatedBucket: {
        ...bucket,
        availableTokens: refilled - 1,
        lastRefillMs: now,
        usedWeight1m: Math.min(1200, bucket.usedWeight1m + 2),
      },
      reason: 'STANDARD_TOKEN_GRANTED',
    };
  }

  return {
    allowed: false,
    updatedBucket: bucket,
    reason: 'RESERVED_FOR_VIP_SNIPER',
  };
}

/**
 * 4. DEPARTMAN: SENTEZ VE KARAR MOTORU (3 Modlu Hibrit Tetikleme + Priced-In Koruması)
 */
export interface HybridDecisionEvaluation {
  mode: V3HybridTriggerMode;
  shouldExecute: boolean;
  shouldKillExistingPositionId: string | null;
  side: 'LONG' | 'SHORT';
  executionType: 'IOC_MARKET_TAKER' | 'POST_ONLY_MAKER';
  subFund: 'SNIPER_30' | 'CONFLUENCE_70';
  recommendedMarginUsdt: number;
  recommendedLeverage: number;
  pricedInGuardPassed: boolean;
  rationale: string;
}

export function evaluateHybridDecision(params: {
  newsItem: NewsIntelligenceItem | null;
  microstructure: OrderBookMicrostructure;
  openPositions: OpenPosition[];
  subFunds: SubFundAllocationState;
  watchdog: WatchdogStatus;
  strategyConfig: StrategyConfig;
  market?: MarketTicker;
}): HybridDecisionEvaluation {
  const {
    newsItem,
    microstructure,
    openPositions,
    subFunds,
    watchdog,
    strategyConfig,
    market,
  } = params;

  if (watchdog.killSwitchActive) {
    return {
      mode: 'MONITOR_ONLY',
      shouldExecute: false,
      shouldKillExistingPositionId: null,
      side: 'LONG',
      executionType: 'POST_ONLY_MAKER',
      subFund: 'CONFLUENCE_70',
      recommendedMarginUsdt: 0,
      recommendedLeverage: strategyConfig.leverage,
      pricedInGuardPassed: true,
      rationale: `Watchdog Kill-Switch Aktif: ${watchdog.statusLabel}`,
    };
  }

  if (market && (!market.hasRealKlines || market.dataStatus !== 'FRESH')) {
    return {
      mode: 'BLOCKED_NO_DATA',
      shouldExecute: false,
      shouldKillExistingPositionId: null,
      side: 'LONG',
      executionType: 'POST_ONLY_MAKER',
      subFund: 'CONFLUENCE_70',
      recommendedMarginUsdt: 0,
      recommendedLeverage: strategyConfig.leverage,
      pricedInGuardPassed: true,
      rationale: `Gerçek Piyasa Verisi Eksik/Bayat (${market.dataStatus}) — İşlem Engellendi`,
    };
  }

  const existingPos = openPositions.find(
    (p) => p.symbol === microstructure.symbol
  );

  if (newsItem) {
    if (newsItem.isFakeOrHacked) {
      return {
        mode: 'BLOCKED_FAKE_NEWS',
        shouldExecute: false,
        shouldKillExistingPositionId: null,
        side: 'LONG',
        executionType: 'POST_ONLY_MAKER',
        subFund: 'SNIPER_30',
        recommendedMarginUsdt: 0,
        recommendedLeverage: strategyConfig.leverage,
        pricedInGuardPassed: true,
        rationale: `Anti-Fake News Guard engelledi: ${newsItem.fakeGuardReason}`,
      };
    }

    if (newsItem.isDuplicate) {
      return {
        mode: 'BLOCKED_DUPLICATE',
        shouldExecute: false,
        shouldKillExistingPositionId: null,
        side: 'LONG',
        executionType: 'POST_ONLY_MAKER',
        subFund: 'SNIPER_30',
        recommendedMarginUsdt: 0,
        recommendedLeverage: strategyConfig.leverage,
        pricedInGuardPassed: true,
        rationale: `Semantik Kopya Kalkanı: Aynı haber (${newsItem.semanticHash}) daha önce işlendi.`,
      };
    }

    // MOD 3: Acil Tahliye ve Ters İşlem (Kill & Flip)
    if (existingPos) {
      const isConflictLong =
        existingPos.side === 'LONG' && newsItem.aiImpactScore <= -75;
      const isConflictShort =
        existingPos.side === 'SHORT' && newsItem.aiImpactScore >= 75;

      if (isConflictLong || isConflictShort) {
        const flipSide: 'LONG' | 'SHORT' =
          existingPos.side === 'LONG' ? 'SHORT' : 'LONG';
        const sniperMargin = Math.min(
          subFunds.sniperFund.availableMarginUsdt,
          Math.max(150, strategyConfig.orderSizeUsdt)
        );
        return {
          mode: 'MOD_3_KILL_FLIP',
          shouldExecute: sniperMargin >= 20,
          shouldKillExistingPositionId: existingPos.id,
          side: flipSide,
          executionType: 'IOC_MARKET_TAKER',
          subFund: 'SNIPER_30',
          recommendedMarginUsdt: sniperMargin,
          recommendedLeverage: Math.min(20, strategyConfig.leverage),
          pricedInGuardPassed: true,
          rationale: `MOD 3 (KILL & FLIP): Açık ${existingPos.side} pozisyonu kritik ters haber (${newsItem.aiImpactScore}) nedeniyle kapatılıp anında ${flipSide} açılıyor!`,
        };
      }
    }

    // Priced-In Koruması: Haberin geldiği saniye fiyat 5sn içinde > %3.0 uçmuşsa tepe/dip kovalamayı engelle
    if (Math.abs(newsItem.priceChange5sPct) > 3.0) {
      return {
        mode: 'BLOCKED_PRICED_IN',
        shouldExecute: false,
        shouldKillExistingPositionId: null,
        side: newsItem.aiImpactScore >= 0 ? 'LONG' : 'SHORT',
        executionType: 'IOC_MARKET_TAKER',
        subFund: 'SNIPER_30',
        recommendedMarginUsdt: 0,
        recommendedLeverage: strategyConfig.leverage,
        pricedInGuardPassed: false,
        rationale: `Fiyatlanmış Haber Koruması (Priced-In Guard): Son 5sn fiyat değişimi %${newsItem.priceChange5sPct.toFixed(
          2
        )} (> %3.0 sınırı).`,
      };
    }

    // MOD 1: Saf Haber Tetiği (News Sniping >= 85 veya <= -85)
    if (Math.abs(newsItem.aiImpactScore) >= 85) {
      const side: 'LONG' | 'SHORT' =
        newsItem.aiImpactScore > 0 ? 'LONG' : 'SHORT';
      const sniperMargin = Math.min(
        subFunds.sniperFund.availableMarginUsdt,
        Math.max(200, Math.round(strategyConfig.orderSizeUsdt * 1.2))
      );
      return {
        mode: 'MOD_1_SNIPE',
        shouldExecute: sniperMargin >= 20,
        shouldKillExistingPositionId: null,
        side,
        executionType: 'IOC_MARKET_TAKER',
        subFund: 'SNIPER_30',
        recommendedMarginUsdt: sniperMargin,
        recommendedLeverage:
          strategyConfig.leverageMode === 'AUTO' ? 10 : strategyConfig.leverage,
        pricedInGuardPassed: true,
        rationale: `MOD 1 (NÜKLEER HABER SNIPING): AI Etki ${newsItem.aiImpactScore} (>=85) & 5sn değişim %${newsItem.priceChange5sPct}. %30 Sniper Kasası ile IOC Taker emri!`,
      };
    }

    // MOD 2: Teyitli Uyum (Confluence Trading — Haber 50..84 + Tahta OBI/TFI uyumu)
    if (Math.abs(newsItem.aiImpactScore) >= 50) {
      const isBullConfluence =
        newsItem.aiImpactScore >= 50 &&
        microstructure.obiScore >= 0.25 &&
        microstructure.tfiScore >= 0.2;
      const isBearConfluence =
        newsItem.aiImpactScore <= -50 &&
        microstructure.obiScore <= -0.25 &&
        microstructure.tfiScore <= -0.2;

      if (isBullConfluence || isBearConfluence) {
        const side: 'LONG' | 'SHORT' = isBullConfluence ? 'LONG' : 'SHORT';
        const confMargin = Math.min(
          subFunds.confluenceFund.availableMarginUsdt,
          strategyConfig.orderSizeUsdt
        );
        return {
          mode: 'MOD_2_CONFLUENCE',
          shouldExecute: confMargin >= 20,
          shouldKillExistingPositionId: null,
          side,
          executionType: 'POST_ONLY_MAKER',
          subFund: 'CONFLUENCE_70',
          recommendedMarginUsdt: confMargin,
          recommendedLeverage: strategyConfig.leverage,
          pricedInGuardPassed: true,
          rationale: `MOD 2 (TAHTA + HABER CONFLUENCE): AI Puanı ${newsItem.aiImpactScore} + OBI (${microstructure.obiScore}) & TFI (${microstructure.tfiScore}) uyumlu. %70 Normal Kasa Post-Only Maker!`,
        };
      }
    }
  }

  // Saf Tahta + Teknik Uyum (MOD 2 Confluence)
  const strongBullBook =
    microstructure.obiScore >= 0.45 &&
    microstructure.tfiScore >= 0.4 &&
    microstructure.emaTrend15m === 'BULL';
  const strongBearBook =
    microstructure.obiScore <= -0.45 &&
    microstructure.tfiScore <= -0.4 &&
    microstructure.emaTrend15m === 'BEAR';

  if (strongBullBook || strongBearBook) {
    const side: 'LONG' | 'SHORT' = strongBullBook ? 'LONG' : 'SHORT';
    const confMargin = Math.min(
      subFunds.confluenceFund.availableMarginUsdt,
      strategyConfig.orderSizeUsdt
    );
    return {
      mode: 'MOD_2_CONFLUENCE',
      shouldExecute: confMargin >= 20,
      shouldKillExistingPositionId: null,
      side,
      executionType: 'POST_ONLY_MAKER',
      subFund: 'CONFLUENCE_70',
      recommendedMarginUsdt: confMargin,
      recommendedLeverage: strategyConfig.leverage,
      pricedInGuardPassed: true,
      rationale: `MOD 2 (L2 TAHTA + MTF CONFLUENCE): OBI ${microstructure.obiScore} · TFI ${microstructure.tfiScore} · 15d Trend ${microstructure.emaTrend15m}. Post-Only Maker emri hazır.`,
    };
  }

  return {
    mode: 'MONITOR_ONLY',
    shouldExecute: false,
    shouldKillExistingPositionId: null,
    side: microstructure.emaTrend15m === 'BULL' ? 'LONG' : 'SHORT',
    executionType: 'POST_ONLY_MAKER',
    subFund: 'CONFLUENCE_70',
    recommendedMarginUsdt: 0,
    recommendedLeverage: strategyConfig.leverage,
    pricedInGuardPassed: true,
    rationale:
      'Nöral tarama devam ediyor; OBI/TFI ve haber eşiği tetikleme bekliyor.',
  };
}

/**
 * 5. DEPARTMAN: İCRA VE EMİR YÖNETİCİSİ (Pre-Trade Validator + Execution Autopsy)
 */
export interface PreTradeValidationResult {
  passed: boolean;
  minNotionalPassed: boolean;
  atrVsFeePassed: boolean;
  roundedPrice: number;
  roundedQty: number;
  notionalUsdt: number;
  estimatedRoundTripFeePct: number;
  atrToFeeMultiple: number;
  rejectionReason: string | null;
}

export function validatePreTradeRules(params: {
  symbol: string;
  price: number;
  marginUsdt: number;
  leverage: number;
  atrPct: number;
  executionType: 'IOC_MARKET_TAKER' | 'POST_ONLY_MAKER';
}): PreTradeValidationResult {
  const { symbol, price, marginUsdt, leverage, atrPct, executionType } = params;
  const rawNotional = marginUsdt * leverage;
  const rawQty = price > 0 ? rawNotional / price : 0;

  const filterCheck = validateAndRoundOrderFilters({
    symbol,
    price,
    quantity: rawQty,
    stopLossPrice: price * 0.985,
    takeProfitPrice: price * 1.03,
  });

  const minNotionalPassed = filterCheck.notionalUsdt >= 5;

  const estimatedRoundTripFeePct =
    executionType === 'IOC_MARKET_TAKER' ? 0.1 : 0.04;
  const effectiveAtrPct = atrPct > 0 ? atrPct : 0.45;
  const atrToFeeMultiple = Number(
    (effectiveAtrPct / estimatedRoundTripFeePct).toFixed(2)
  );
  const atrVsFeePassed = effectiveAtrPct >= estimatedRoundTripFeePct * 3;

  let rejectionReason: string | null = null;
  if (!minNotionalPassed) {
    rejectionReason = `Min Notional Hatası: Emir büyüklüğü ($${filterCheck.notionalUsdt.toFixed(
      2
    )}) < $5.00 borsa alt sınırı.`;
  } else if (!atrVsFeePassed) {
    rejectionReason = `ATR/Komisyon Kalkanı: ATR (%${effectiveAtrPct.toFixed(
      2
    )}) komisyonun 3 katından (%${(estimatedRoundTripFeePct * 3).toFixed(
      2
    )}) küçük.`;
  }

  return {
    passed: minNotionalPassed && atrVsFeePassed,
    minNotionalPassed,
    atrVsFeePassed,
    roundedPrice: filterCheck.roundedPrice,
    roundedQty: filterCheck.roundedQty,
    notionalUsdt: filterCheck.notionalUsdt,
    estimatedRoundTripFeePct,
    atrToFeeMultiple,
    rejectionReason,
  };
}

export interface ExecutionAutopsyRecord {
  id: string;
  timestampMs: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  mode: V3HybridTriggerMode;
  modeLabel: string;
  executionType: 'IOC_MARKET_TAKER' | 'POST_ONLY_MAKER';
  subFund: 'SNIPER_30' | 'CONFLUENCE_70';
  newsToOrderLatencyMs: number;
  expectedPrice: number;
  fillPrice: number;
  slippageBps: number;
  obiAtEntry: number;
  tfiAtEntry: number;
  atrTrailingStopPrice: number;
  hardStopLossPrice: number;
  partialFillPct: number;
  validationSummary: string;
}

export function createExecutionAutopsyRecord(params: {
  symbol: string;
  side: 'LONG' | 'SHORT';
  mode: V3HybridTriggerMode;
  executionType: 'IOC_MARKET_TAKER' | 'POST_ONLY_MAKER';
  subFund: 'SNIPER_30' | 'CONFLUENCE_70';
  newsTimestampMs: number;
  expectedPrice: number;
  microstructure: OrderBookMicrostructure;
  validation: PreTradeValidationResult;
  orderBookSnapshot?: {
    bids: Array<[string, string]>;
    asks: Array<[string, string]>;
  } | null;
}): ExecutionAutopsyRecord {
  const {
    symbol,
    side,
    mode,
    executionType,
    subFund,
    newsTimestampMs,
    expectedPrice,
    microstructure,
    validation,
    orderBookSnapshot,
  } = params;

  const now = Date.now();
  const newsToOrderLatencyMs = Math.max(1, now - newsTimestampMs);

  let fillPrice = expectedPrice;
  let slippageBps = 0;
  let partialFillPct = 100;

  if (
    orderBookSnapshot &&
    orderBookSnapshot.bids.length > 0 &&
    orderBookSnapshot.asks.length > 0 &&
    validation.roundedQty > 0
  ) {
    const walkResult = walkOrderBookForFill({
      side: side === 'LONG' ? 'BUY' : 'SELL',
      quantity: validation.roundedQty,
      bids: orderBookSnapshot.bids,
      asks: orderBookSnapshot.asks,
      fallbackMidPrice: expectedPrice,
      isMaker: executionType === 'POST_ONLY_MAKER',
    });
    fillPrice = walkResult.fillPrice;
    slippageBps = walkResult.slippageBps;
    partialFillPct = walkResult.filledPct;
  } else if (microstructure.spreadBps > 0 && executionType === 'IOC_MARKET_TAKER') {
    const halfSpreadPct = microstructure.spreadBps / 2 / 10000;
    const dir = side === 'LONG' ? 1 : -1;
    fillPrice = Number((expectedPrice * (1 + dir * halfSpreadPct)).toPrecision(7));
    slippageBps = Number((microstructure.spreadBps / 2).toFixed(2));
  }

  const atrTrailingStopPrice =
    side === 'LONG'
      ? microstructure.chandelierStopLong || Number((fillPrice * 0.985).toPrecision(6))
      : microstructure.chandelierStopShort || Number((fillPrice * 1.015).toPrecision(6));

  const hardStopDistance = fillPrice * 0.02;
  const hardStopLossPrice =
    side === 'LONG'
      ? Number((fillPrice - hardStopDistance).toPrecision(6))
      : Number((fillPrice + hardStopDistance).toPrecision(6));

  const modeLabelMap: Record<V3HybridTriggerMode, string> = {
    MOD_1_SNIPE: 'MOD 1: Nükleer Haber Sniping',
    MOD_2_CONFLUENCE: 'MOD 2: Tahta+Haber Confluence',
    MOD_3_KILL_FLIP: 'MOD 3: Kill & Flip (Ters İşlem)',
    BLOCKED_PRICED_IN: 'Engellendi: Fiyatlanmış Haber',
    BLOCKED_FAKE_NEWS: 'Engellendi: Sahte Haber Kalkanı',
    BLOCKED_DUPLICATE: 'Engellendi: Tekrarlanan Haber',
    BLOCKED_NO_DATA: 'Engellendi: Gerçek Veri Bekleniyor',
    MONITOR_ONLY: 'İzleme Modu',
  };

  return {
    id: `AUT-${now.toString(36).toUpperCase()}-${symbol.slice(0, 4)}`,
    timestampMs: now,
    symbol,
    side,
    mode,
    modeLabel: modeLabelMap[mode],
    executionType,
    subFund,
    newsToOrderLatencyMs,
    expectedPrice,
    fillPrice,
    slippageBps,
    obiAtEntry: microstructure.obiScore,
    tfiAtEntry: microstructure.tfiScore,
    atrTrailingStopPrice,
    hardStopLossPrice,
    partialFillPct,
    validationSummary: `Notional $${validation.notionalUsdt.toFixed(
      0
    )} (>=5$) · ATR/Ücret ${validation.atrToFeeMultiple}x (>=3x)`,
  };
}

export interface V3NewsScenarioTemplate {
  id: string;
  badgeLabel: string;
  headline: string;
  source: string;
  explicitSymbol: string;
  explicitScore: number;
  overridePriceChange5sPct: number;
}

export const V3_STRESS_TEST_SCENARIOS: V3NewsScenarioTemplate[] = [
  {
    id: 'scen_mod1_xrp',
    badgeLabel: 'MOD 1: Nükleer Haber (+95 XRP)',
    headline:
      'SON DAKİKA: Brad Garlinghouse Ripple SEC davasının resmen zaferle kapandığını ve kurumsal ETF listelemesini duyurdu!',
    source: 'Binance Official',
    explicitSymbol: 'XRPUSDT',
    explicitScore: 95,
    overridePriceChange5sPct: 0.42,
  },
  {
    id: 'scen_mod2_eth',
    badgeLabel: 'MOD 2: Confluence (+74 Vitalik/ETH)',
    headline:
      'Vitalik Buterin Ethereum Pectra yükseltmesi ile L2 ağ ücretlerinin 10 kat düşeceğini açıkladı.',
    source: 'Tier-1 X Feed',
    explicitSymbol: 'ETHUSDT',
    explicitScore: 74,
    overridePriceChange5sPct: 0.28,
  },
  {
    id: 'scen_mod3_killflip',
    badgeLabel: 'MOD 3: Kill & Flip (-95 ARB Hack)',
    headline:
      'ACİL UYARI: Arbitrum köprü kontratında kritik exploit tespit edildi, acil likidite çıkışı yaşanıyor!',
    source: 'TreeOfAlpha / Bloomberg Terminal',
    explicitSymbol: 'ARBUSDT',
    explicitScore: -95,
    overridePriceChange5sPct: -0.55,
  },
  {
    id: 'scen_priced_in',
    badgeLabel: 'KORUMA: Fiyatlanmış Haber (>%3.8)',
    headline:
      'BlackRock IBIT fonu tek günde 1.2 milyar dolarlık rekor Bitcoin alımı gerçekleştirdi.',
    source: 'Bloomberg Terminal',
    explicitSymbol: 'BTCUSDT',
    explicitScore: 91,
    overridePriceChange5sPct: 4.15,
  },
  {
    id: 'scen_fake_guard',
    badgeLabel: 'KORUMA: Sahte / Hack Haber',
    headline:
      'SON DAKİKA: Sam Altman Worldcoin bedava airdrop dağıtıyor cüzdanınızı bağlayın free claim!',
    source: 'Unverified Feed',
    explicitSymbol: 'WLDUSDT',
    explicitScore: 90,
    overridePriceChange5sPct: 0.12,
  },
];
