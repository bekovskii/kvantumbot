/**
 * Real-time Binance 50-Market Public Data Feed & Kline Sync Engine
 * Every number is sourced from real exchange API responses (Binance Mainnet Public Data)
 * or computed directly from real OHLCV candles and real order-book / trade streams.
 * No synthetic seed prices, no sine-wave micro-noise, no TP/SL drift.
 */

import {
  TOP_50_SYMBOLS,
  BtcRegimeState,
  MarketTicker,
  StrategyConfig,
  calculateRollingBtcCorrelation,
  evaluateBtcRegime,
  evaluateMarketSignal,
} from './tradingEngine';

export interface RawMarketSnapshot {
  symbol: string;
  price: number;
  bestBid: number;
  bestAsk: number;
  bestBidQty: number;
  bestAskQty: number;
  realMexcPrice?: number;
  open24h: number;
  high24h: number;
  low24h: number;
  change24hPct: number;
  volume24hUsdt: number;
  tradesCount24h: number;
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  closes15m: number[];
  highs15m: number[];
  lows15m: number[];
  volumes15m: number[];
  hasRealKlines: boolean;
  lastUpdatedMs: number;
  priceHistory5s: Array<{ ts: number; price: number }>;
  priceChange5sPct: number;
  realObiPct?: number;
  realSlippageBps?: number;
  btcCorrelation: number;
}

export type RawMarketSeries = RawMarketSnapshot;

export interface ServerKlineBundle {
  closes?: number[];
  highs?: number[];
  lows?: number[];
  volumes?: number[];
  closes5m?: number[];
  highs5m?: number[];
  lows5m?: number[];
  volumes5m?: number[];
  closes15m?: number[];
  highs15m?: number[];
  lows15m?: number[];
  volumes15m?: number[];
  updatedAt?: number;
}

/**
 * Initializes all 50 markets in an explicit loading / NO_DATA state.
 * No synthetic seed prices (`BASE_SEED_PRICES`) or sine-wave candles are generated.
 */
export function createInitialRawMarkets(): RawMarketSnapshot[] {
  return TOP_50_SYMBOLS.map((symbol) => ({
    symbol,
    price: 0,
    bestBid: 0,
    bestAsk: 0,
    bestBidQty: 0,
    bestAskQty: 0,
    realMexcPrice: undefined,
    open24h: 0,
    high24h: 0,
    low24h: 0,
    change24hPct: 0,
    volume24hUsdt: 0,
    tradesCount24h: 0,
    closes: [],
    highs: [],
    lows: [],
    volumes: [],
    closes15m: [],
    highs15m: [],
    lows15m: [],
    volumes15m: [],
    hasRealKlines: false,
    lastUpdatedMs: 0,
    priceHistory5s: [],
    priceChange5sPct: 0,
    btcCorrelation: symbol === 'BTCUSDT' ? 1.0 : 0,
  }));
}

export interface IncomingBinanceTickerRow {
  symbol: string;
  lastPrice?: string;
  bidPrice?: string;
  askPrice?: string;
  bidQty?: string;
  askQty?: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
  count?: number;
  realMexcPrice?: number | null;
  klines5m?: {
    closes: number[];
    highs: number[];
    lows: number[];
    volumes: number[];
  } | null;
  klines15m?: {
    closes: number[];
    highs: number[];
    lows: number[];
    volumes: number[];
  } | null;
}

/**
 * Merges real 24hr ticker, bookTicker, and server-cached 5m/15m klines into the 50-market array.
 * Uses the exchange price as-is without any drift toward TP/SL or micro-wave noise.
 */
export function mergeBinance24hrTickers(
  prev: RawMarketSnapshot[],
  binanceRows: IncomingBinanceTickerRow[],
  _openPositionSides?: Record<string, 'LONG' | 'SHORT'> | boolean,
  _isInitialSync?: boolean | Record<string, 'LONG' | 'SHORT'>
): RawMarketSnapshot[] {
  const rowMap = new Map(binanceRows.map((r) => [r.symbol, r]));
  const nowMs = Date.now();

  return prev.map((current) => {
    const row = rowMap.get(current.symbol);
    if (!row) return current;

    const lastPrice =
      row.lastPrice !== undefined ? parseFloat(row.lastPrice) : NaN;
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) return current;

    const bidPrice =
      row.bidPrice !== undefined ? parseFloat(row.bidPrice) : NaN;
    const askPrice =
      row.askPrice !== undefined ? parseFloat(row.askPrice) : NaN;
    const bidQty = row.bidQty !== undefined ? parseFloat(row.bidQty) : NaN;
    const askQty = row.askQty !== undefined ? parseFloat(row.askQty) : NaN;
    const openPrice =
      row.openPrice !== undefined ? parseFloat(row.openPrice) : NaN;
    const highPrice =
      row.highPrice !== undefined ? parseFloat(row.highPrice) : NaN;
    const lowPrice =
      row.lowPrice !== undefined ? parseFloat(row.lowPrice) : NaN;
    const changePct =
      row.priceChangePercent !== undefined
        ? parseFloat(row.priceChangePercent)
        : NaN;
    const quoteVol =
      row.quoteVolume !== undefined ? parseFloat(row.quoteVolume) : NaN;

    // Maintain real 5-second rolling price history (keep last 15 seconds of real samples)
    const prunedHistory = [
      ...(current.priceHistory5s || []).filter((pt) => nowMs - pt.ts <= 15000),
      { ts: nowMs, price: lastPrice },
    ];
    const targetTs = nowMs - 5000;
    let refPoint = prunedHistory[0];
    for (const pt of prunedHistory) {
      if (Math.abs(pt.ts - targetTs) < Math.abs(refPoint.ts - targetTs)) {
        refPoint = pt;
      }
    }
    const priceChange5sPct =
      refPoint && refPoint.price > 0 && nowMs - refPoint.ts >= 1500
        ? Number(
            (((lastPrice - refPoint.price) / refPoint.price) * 100).toFixed(4)
          )
        : 0;

    // Update 5m klines: adopt real server klines when available, and update only the forming candle with live exchange price
    let closes = current.closes;
    let highs = current.highs;
    let lows = current.lows;
    let volumes = current.volumes;
    let hasRealKlines = current.hasRealKlines;

    if (
      row.klines5m &&
      Array.isArray(row.klines5m.closes) &&
      row.klines5m.closes.length >= 14
    ) {
      closes = [...row.klines5m.closes.slice(0, -1), lastPrice];
      const prevFormingHigh =
        row.klines5m.highs[row.klines5m.highs.length - 1] ?? lastPrice;
      const prevFormingLow =
        row.klines5m.lows[row.klines5m.lows.length - 1] ?? lastPrice;
      highs = [
        ...row.klines5m.highs.slice(0, -1),
        Math.max(prevFormingHigh, lastPrice),
      ];
      lows = [
        ...row.klines5m.lows.slice(0, -1),
        prevFormingLow > 0 ? Math.min(prevFormingLow, lastPrice) : lastPrice,
      ];
      volumes = [...row.klines5m.volumes];
      hasRealKlines = true;
    } else if (current.hasRealKlines && current.closes.length >= 14) {
      closes = [...current.closes.slice(0, -1), lastPrice];
      const lastHigh = current.highs[current.highs.length - 1] ?? lastPrice;
      const lastLow = current.lows[current.lows.length - 1] ?? lastPrice;
      highs = [...current.highs.slice(0, -1), Math.max(lastHigh, lastPrice)];
      lows = [
        ...current.lows.slice(0, -1),
        lastLow > 0 ? Math.min(lastLow, lastPrice) : lastPrice,
      ];
    }

    // Update 15m klines if provided by server
    let closes15m = current.closes15m;
    let highs15m = current.highs15m;
    let lows15m = current.lows15m;
    let volumes15m = current.volumes15m;

    if (
      row.klines15m &&
      Array.isArray(row.klines15m.closes) &&
      row.klines15m.closes.length >= 5
    ) {
      closes15m = [...row.klines15m.closes.slice(0, -1), lastPrice];
      const prev15High =
        row.klines15m.highs[row.klines15m.highs.length - 1] ?? lastPrice;
      const prev15Low =
        row.klines15m.lows[row.klines15m.lows.length - 1] ?? lastPrice;
      highs15m = [
        ...row.klines15m.highs.slice(0, -1),
        Math.max(prev15High, lastPrice),
      ];
      lows15m = [
        ...row.klines15m.lows.slice(0, -1),
        prev15Low > 0 ? Math.min(prev15Low, lastPrice) : lastPrice,
      ];
      volumes15m = [...row.klines15m.volumes];
    } else if (current.closes15m.length >= 5) {
      closes15m = [...current.closes15m.slice(0, -1), lastPrice];
    }

    return {
      ...current,
      price: lastPrice,
      bestBid:
        Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : current.bestBid,
      bestAsk:
        Number.isFinite(askPrice) && askPrice > 0 ? askPrice : current.bestAsk,
      bestBidQty:
        Number.isFinite(bidQty) && bidQty >= 0 ? bidQty : current.bestBidQty,
      bestAskQty:
        Number.isFinite(askQty) && askQty >= 0 ? askQty : current.bestAskQty,
      realMexcPrice:
        typeof row.realMexcPrice === 'number' && row.realMexcPrice > 0
          ? row.realMexcPrice
          : current.realMexcPrice,
      open24h:
        Number.isFinite(openPrice) && openPrice > 0
          ? openPrice
          : current.open24h,
      high24h:
        Number.isFinite(highPrice) && highPrice > 0
          ? highPrice
          : current.high24h,
      low24h:
        Number.isFinite(lowPrice) && lowPrice > 0 ? lowPrice : current.low24h,
      change24hPct: Number.isFinite(changePct)
        ? changePct
        : current.change24hPct,
      volume24hUsdt:
        Number.isFinite(quoteVol) && quoteVol >= 0
          ? quoteVol
          : current.volume24hUsdt,
      tradesCount24h:
        typeof row.count === 'number' && row.count >= 0
          ? row.count
          : current.tradesCount24h,
      closes,
      highs,
      lows,
      volumes,
      closes15m,
      highs15m,
      lows15m,
      volumes15m,
      hasRealKlines,
      lastUpdatedMs: nowMs,
      priceHistory5s: prunedHistory,
      priceChange5sPct,
    };
  });
}

/**
 * Merges real OHLCV kline series (5m and/or 15m) fetched from `/api/mexc/batch-klines` or `/api/mexc/klines-batch`
 * into the 50-market array and marks `hasRealKlines = true`.
 */
export function mergeRealKlineSeries(
  prev: RawMarketSnapshot[],
  klinesBySymbol: Record<string, ServerKlineBundle>
): RawMarketSnapshot[] {
  const nowMs = Date.now();

  return prev.map((current) => {
    const bundle = klinesBySymbol[current.symbol];
    if (!bundle) return current;

    let closes = current.closes;
    let highs = current.highs;
    let lows = current.lows;
    let volumes = current.volumes;
    let hasRealKlines = current.hasRealKlines;

    const rawCloses5m = bundle.closes5m || bundle.closes;
    const rawHighs5m = bundle.highs5m || bundle.highs;
    const rawLows5m = bundle.lows5m || bundle.lows;
    const rawVolumes5m = bundle.volumes5m || bundle.volumes;

    if (Array.isArray(rawCloses5m) && rawCloses5m.length >= 14) {
      const livePrice =
        current.price > 0
          ? current.price
          : rawCloses5m[rawCloses5m.length - 1];
      closes = [...rawCloses5m.slice(0, -1), livePrice];
      highs = Array.isArray(rawHighs5m) ? [...rawHighs5m] : [...closes];
      lows = Array.isArray(rawLows5m) ? [...rawLows5m] : [...closes];
      volumes = Array.isArray(rawVolumes5m) ? [...rawVolumes5m] : [];
      hasRealKlines = true;
    }

    let closes15m = current.closes15m;
    let highs15m = current.highs15m;
    let lows15m = current.lows15m;
    let volumes15m = current.volumes15m;

    if (Array.isArray(bundle.closes15m) && bundle.closes15m.length >= 5) {
      const livePrice =
        current.price > 0
          ? current.price
          : bundle.closes15m[bundle.closes15m.length - 1];
      closes15m = [...bundle.closes15m.slice(0, -1), livePrice];
      highs15m = Array.isArray(bundle.highs15m)
        ? [...bundle.highs15m]
        : [...closes15m];
      lows15m = Array.isArray(bundle.lows15m)
        ? [...bundle.lows15m]
        : [...closes15m];
      volumes15m = Array.isArray(bundle.volumes15m)
        ? [...bundle.volumes15m]
        : [];
    }

    const latestClose = closes[closes.length - 1] ?? current.price;

    return {
      ...current,
      price: current.price > 0 ? current.price : latestClose,
      closes,
      highs,
      lows,
      volumes,
      closes15m,
      highs15m,
      lows15m,
      volumes15m,
      hasRealKlines,
      lastUpdatedMs: bundle.updatedAt || current.lastUpdatedMs || nowMs,
    };
  });
}

export const mergeServerKlinesMap = mergeRealKlineSeries;

/**
 * Evaluates all 50 markets and BTC regime from real exchange data.
 * Computes rolling BTC correlation from real close returns for each symbol.
 */
export function evaluateAll50Markets(
  rawInput: RawMarketSnapshot[] | Record<string, RawMarketSnapshot>,
  config: StrategyConfig
): {
  btcRegime: BtcRegimeState;
  markets: MarketTicker[];
} {
  const rawList: RawMarketSnapshot[] = Array.isArray(rawInput)
    ? rawInput
    : TOP_50_SYMBOLS.map((s) => rawInput[s]).filter(Boolean);

  const rawMap = new Map(rawList.map((r) => [r.symbol, r]));
  const btcRaw = rawMap.get('BTCUSDT');

  const btcRegime = evaluateBtcRegime(
    btcRaw?.price ?? 0,
    btcRaw?.change24hPct ?? 0,
    btcRaw?.high24h ?? 0,
    btcRaw?.low24h ?? 0,
    btcRaw?.volume24hUsdt ?? 0,
    btcRaw?.closes ?? [],
    btcRaw?.highs ?? [],
    btcRaw?.lows ?? []
  );

  const btcCloses = btcRaw?.closes ?? [];

  const markets = TOP_50_SYMBOLS.map((symbol) => {
    const item = rawMap.get(symbol);
    if (!item) {
      return evaluateMarketSignal(
        {
          symbol,
          price: 0,
          open24h: 0,
          high24h: 0,
          low24h: 0,
          change24hPct: 0,
          volume24hUsdt: 0,
          tradesCount24h: 0,
          closes: [],
          volumes: [],
          hasRealKlines: false,
          btcCorrelation: 0,
        },
        config,
        btcRegime
      );
    }

    const btcCorrelation =
      symbol === 'BTCUSDT'
        ? 1.0
        : item.hasRealKlines && btcCloses.length >= 5
        ? calculateRollingBtcCorrelation(item.closes, btcCloses)
        : 0;

    return evaluateMarketSignal(
      {
        ...item,
        btcCorrelation,
      },
      config,
      btcRegime
    );
  });

  return { btcRegime, markets };
}
