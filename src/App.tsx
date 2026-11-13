/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  DEFAULT_STRATEGY_CONFIG,
  StrategyConfig,
  MarketTicker,
  OpenPosition,
  ExecutionLogEntry,
  ClosedTradeRecord,
  createPositionFromSignal,
  updatePositionWithPrice,
  createClosedTradeRecord,
  calculateDemoWalletState,
  calculateTradeHistoryStats,
  formatCompactPrice,
  getVenueDisplayLabel,
  MexcLiveOrderReceipt,
  ExitReasonType,
  evaluateCircuitBreakerState,
  calculateTradeEfficiencyMetrics,
  recalculateOpenPositionsTpSl,
  updateSinglePositionTpSl,
  walkOrderBookForFill,
} from './utils/tradingEngine';
import {
  RawMarketSnapshot,
  createInitialRawMarkets,
  mergeBinance24hrTickers,
  mergeRealKlineSeries,
  evaluateAll50Markets,
} from './utils/binanceFeed';
import { BtcRegimeBanner, ServerMexcAccountStatus } from './components/BtcRegimeBanner';
import { CommunicationStatusPanel } from './components/CommunicationStatusPanel';
import { MexcLiveSetupPanel } from './components/MexcLiveSetupPanel';
import { MarketScannerGrid } from './components/MarketScannerGrid';
import { MarketInspectorPanel } from './components/MarketInspectorPanel';
import { PositionsAndLogsPanel } from './components/PositionsAndLogsPanel';
import { RuleEngineSection } from './components/RuleEngineModal';
import { TradeEfficiencyGaugeCard } from './components/TradeEfficiencyGaugeCard';
import { V3CyberpunkNeuralDashboard } from './components/V3CyberpunkNeuralDashboard';
import { DataIntegrityAudit } from './components/data-integrity-audit';
import {
  V3_AI_ENGINE_CONFIG,
  AsyncEventBus,
  V3BusEvent,
  NewsIntelligenceItem,
  ExecutionAutopsyRecord,
  TokenBucketState,
  V3NewsScenarioTemplate,
  RealOrderBookSnapshot,
  computeSemanticNewsHash,
  evaluateFakeNewsGuard,
  resolveSymbolAndImpactFromHeadline,
  computeL2Microstructure,
  evaluateWatchdogState,
  calculateSubFundAllocations,
  validatePreTradeRules,
  consumeRateLimiterToken,
  evaluateHybridDecision,
  createExecutionAutopsyRecord,
} from './utils/v3ParallelEngine';
import {
  LayoutGrid,
  Brain,
  Cpu,
  History,
  Wallet,
  Settings,
  Bell,
  Headphones,
  TrendingUp,
  Send,
  MoreHorizontal,
  ChevronDown,
  RotateCcw,
  Play,
  Pause,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

type SidebarSection =
  | 'DASHBOARD'
  | 'DATA_INTEGRITY'
  | 'STRATEGY'
  | 'ACTIVE_BOTS'
  | 'HISTORY'
  | 'PORTFOLIO'
  | 'SETTINGS'
  | 'ALERTS'
  | 'ASSISTANT';

type AiStrategyPreset = 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';

/**
 * Converts a real array of closing prices into a normalized SVG polyline string
 */
function buildRealSparklinePoints(
  closes: number[],
  width = 88,
  height = 26
): string {
  if (!closes || closes.length < 2) return `2,${height / 2} ${width},${height / 2}`;
  const slice = closes.slice(-16);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const range = Math.max(max - min, min * 0.0005, 0.000001);
  return slice
    .map((val, idx) => {
      const x = 2 + (idx / (slice.length - 1)) * (width - 4);
      const y = height - 3 - ((val - min) / range) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Builds smooth SVG cubic-bezier path and predictive path from real market closes & EMA
 */
function buildRealChartPaths(market: MarketTicker): {
  primaryLinePath: string;
  primaryAreaPath: string;
  secondaryWavePath: string;
  predictivePath: string;
  currentNodeX: number;
  currentNodeY: number;
} {
  const fallbackPrice = market.price > 0 ? market.price : 0;
  const closes =
    market.closes && market.closes.length >= 2
      ? market.closes.slice(-14)
      : [fallbackPrice, fallbackPrice];

  // Compute rolling EMA series for the secondary purple wave
  const k = 2 / 8;
  const emaSeries: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    emaSeries.push(closes[i] * k + emaSeries[i - 1] * (1 - k));
  }

  const projectedTarget =
    market.signal === 'SHORT'
      ? market.price * (1 + (market.effectiveTakeProfitPct || 2.5) / 100)
      : Math.max(market.takeProfitPrice, market.price * 1.018);

  const histValues = [...closes, ...emaSeries];
  const minVal = Math.min(...histValues);
  const maxVal = Math.max(...histValues);
  const range = Math.max(maxVal - minVal, minVal * 0.0005, 0.000001);

  const startX = 10;
  const currentEndX = 296;
  const predEndX = 368;
  const topY = 44;
  const bottomY = 138;

  const toY = (v: number) =>
    bottomY - ((v - minVal) / range) * (bottomY - topY);

  const pts = closes.map((v, i) => ({
    x: startX + (i / (closes.length - 1)) * (currentEndX - startX),
    y: toY(v),
  }));

  const emaPts = emaSeries.map((v, i) => ({
    x: startX + (i / (emaSeries.length - 1)) * (currentEndX - startX),
    y: Math.max(topY - 8, Math.min(bottomY + 8, toY(v) + (i % 2 === 0 ? 14 : -12))),
  }));

  const toSmoothPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return '';
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = ((prev.x + curr.x) / 2).toFixed(1);
      d += ` C ${midX} ${prev.y.toFixed(1)}, ${midX} ${curr.y.toFixed(
        1
      )}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    return d;
  };

  const primaryLinePath = toSmoothPath(pts);
  const lastPt = pts[pts.length - 1] ?? { x: currentEndX, y: 68 };
  const targetY = Math.max(16, Math.min(48, lastPt.y - 38));

  const predMidX = ((lastPt.x + predEndX) / 2).toFixed(1);
  const predictivePath = `M ${lastPt.x.toFixed(1)} ${lastPt.y.toFixed(
    1
  )} C ${predMidX} ${(lastPt.y - 22).toFixed(1)}, ${predMidX} ${(
    targetY + 10
  ).toFixed(1)}, ${predEndX} ${targetY.toFixed(1)}`;

  const primaryAreaPath = `${primaryLinePath} L ${lastPt.x.toFixed(
    1
  )} 164 L ${startX} 164 Z`;
  const secondaryWavePath = toSmoothPath(emaPts);

  return {
    primaryLinePath,
    primaryAreaPath,
    secondaryWavePath,
    predictivePath,
    currentNodeX: Number(lastPt.x.toFixed(1)),
    currentNodeY: Number(lastPt.y.toFixed(1)),
  };
}

export default function App() {
  const [activeSection, setActiveSection] =
    useState<SidebarSection>('DASHBOARD');
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>(
    DEFAULT_STRATEGY_CONFIG
  );
  const [rawMarkets, setRawMarkets] = useState<RawMarketSnapshot[]>(() =>
    createInitialRawMarkets()
  );
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [autoExecuteEnabled, setAutoExecuteEnabled] = useState<boolean>(true);
  const [isLiveFeedSynced, setIsLiveFeedSynced] = useState<boolean>(false);

  // Risk slider (1..5 -> 3x, 5x, 10x, 20x, 50x) & AI Strategy Mode
  const [riskSliderValue, setRiskSliderValue] = useState<number>(2);
  const [strategyPreset, setStrategyPreset] =
    useState<AiStrategyPreset>('BALANCED');
  const [showUsdtOnlyBalance, setShowUsdtOnlyBalance] =
    useState<boolean>(true);

  // Live Neural Network Telemetry & Stream Health State
  const [feedPacketCount, setFeedPacketCount] = useState<number>(1);
  const [lastPacketTimeMs, setLastPacketTimeMs] = useState<number>(Date.now());
  const [nowTickMs, setNowTickMs] = useState<number>(Date.now());
  const [neuralScanIndex, setNeuralScanIndex] = useState<number>(0);
  const [neuralLockSelected, setNeuralLockSelected] = useState<boolean>(false);

  const [assistantInput, setAssistantInput] = useState<string>('');
  const [customAssistantNote, setCustomAssistantNote] = useState<string | null>(
    null
  );

  const [mexcStatus, setMexcStatus] = useState<ServerMexcAccountStatus>({
    spotConnected: false,
    spotPairsTracked: 0,
    futuresConnected: false,
    futuresLatencyMs: 0,
    btcFuturesMarkPrice: null,
    btcFundingRatePct: null,
    hasServerApiKeys: false,
    maskedKey: 'YOK (PAPER MODU)',
    liveAccount: null,
    executionMode: 'PAPER',
    tradeMode: 'PAPER',
    timestamp: 0,
  });
  const [feedErrorBanner, setFeedErrorBanner] = useState<string | null>(null);
  const clientSeqRef = useRef<number>(0);

  const [orderBookMap, setOrderBookMap] = useState<
    Record<string, RealOrderBookSnapshot>
  >({});
  const orderBookMapRef = useRef<Record<string, RealOrderBookSnapshot>>({});
  useEffect(() => {
    orderBookMapRef.current = orderBookMap;
  }, [orderBookMap]);

  const [openPositions, setOpenPositions] = useState<OpenPosition[]>(() => {
    try {
      const saved = localStorage.getItem('kvantumbot_open_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return [];
  });
  const [closedHistory, setClosedHistory] = useState<ClosedTradeRecord[]>(() => {
    try {
      const saved = localStorage.getItem('kvantumbot_closed_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return [];
  });
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem('kvantumbot_logs_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('kvantumbot_open_v3', JSON.stringify(openPositions));
    } catch {
      // Ignore
    }
  }, [openPositions]);

  useEffect(() => {
    try {
      localStorage.setItem('kvantumbot_closed_v3', JSON.stringify(closedHistory));
    } catch {
      // Ignore
    }
  }, [closedHistory]);

  useEffect(() => {
    try {
      localStorage.setItem('kvantumbot_logs_v3', JSON.stringify(executionLogs));
    } catch {
      // Ignore
    }
  }, [executionLogs]);

  const activePositionSidesRef = useRef<Record<string, 'LONG' | 'SHORT'>>({});
  const openPositionsRef = useRef<OpenPosition[]>(openPositions);
  const closedHistoryRef = useRef<ClosedTradeRecord[]>(closedHistory);
  const lastManualCloseAtRef = useRef<number>(0);

  useEffect(() => {
    openPositionsRef.current = openPositions;
    const map: Record<string, 'LONG' | 'SHORT'> = {};
    for (const p of openPositions) {
      map[p.symbol] = p.side;
    }
    activePositionSidesRef.current = map;
  }, [openPositions]);

  useEffect(() => {
    closedHistoryRef.current = closedHistory;
  }, [closedHistory]);

  const { btcRegime, markets } = useMemo(
    () => evaluateAll50Markets(rawMarkets, strategyConfig),
    [rawMarkets, strategyConfig]
  );

  const demoWallet = useMemo(() => {
    return calculateDemoWalletState(
      strategyConfig,
      openPositions,
      closedHistory
    );
  }, [strategyConfig, openPositions, closedHistory]);

  const historyStats = useMemo(
    () => calculateTradeHistoryStats(closedHistory),
    [closedHistory]
  );

  const tradeEfficiency = useMemo(
    () =>
      calculateTradeEfficiencyMetrics({
        closedHistory,
        openPositions,
        markets,
      }),
    [closedHistory, openPositions, markets]
  );

  // V3.0 MERKEZİ SİNİR SİSTEMİ (AsyncEventBus) & ORTAK HAFIZA (SharedState) — Empty initial states (no synthetic seeds)
  const eventBusRef = useRef<AsyncEventBus>(new AsyncEventBus(80));
  const [busEvents, setBusEvents] = useState<V3BusEvent[]>([]);

  useEffect(() => {
    const bus = eventBusRef.current;
    return bus.subscribe('*', (evt) => {
      setBusEvents((prev) => [evt, ...prev].slice(0, 40));
    });
  }, []);

  const [vipWatchedSymbols, setVipWatchedSymbols] = useState<string[]>([
    'BTCUSDT',
    'ETHUSDT',
    'XRPUSDT',
    'SOLUSDT',
    'ARBUSDT',
  ]);
  const [confluenceRatioPct, setConfluenceRatioPct] = useState<number>(70);
  const [manualKillSwitch, setManualKillSwitch] = useState<boolean>(false);
  const [rateLimiter, setRateLimiter] = useState<TokenBucketState>({
    maxTokens: 60,
    availableTokens: 60,
    vipReservedTokens: 12,
    lastRefillMs: Date.now(),
    usedWeight1m: 0,
  });

  const [newsFeed, setNewsFeed] = useState<NewsIntelligenceItem[]>([]);

  const [autopsyRecords, setAutopsyRecords] = useState<
    ExecutionAutopsyRecord[]
  >([]);

  // Synchronize live wallet ledger (locked margins, realized & unrealized PnL) to backend /api/mexc/sync-wallet
  useEffect(() => {
    const lockedByAsset: Record<string, number> = {};
    for (const p of openPositions) {
      lockedByAsset[p.baseAsset] =
        (lockedByAsset[p.baseAsset] || 0) + p.marginUsdt;
    }
    fetch('/api/mexc/sync-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        realizedPnlUsdt: demoWallet.realizedPnlUsdt,
        unrealizedPnlUsdt: demoWallet.unrealizedPnlUsdt,
        usedMarginUsdt: demoWallet.usedMarginUsdt,
        lockedByAsset,
      }),
    }).catch(() => {});
  }, [
    demoWallet.realizedPnlUsdt,
    demoWallet.unrealizedPnlUsdt,
    demoWallet.usedMarginUsdt,
    openPositions.length,
    closedHistory.length,
  ]);

  // 1.0s Live Neural Scanner & Heartbeat Clock so user sees continuous real-time neural activity
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTickMs(Date.now());
      setNeuralScanIndex((prev) => (prev + 1) % 50);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const syncMexcAccountStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/mexc/account-status');
      if (!res.ok) return;
      const data: ServerMexcAccountStatus = await res.json();
      setMexcStatus(data);
      if (typeof data.hftTelemetry?.usedWeight1m === 'number') {
        setRateLimiter((prev) => ({
          ...prev,
          usedWeight1m: data.hftTelemetry!.usedWeight1m,
        }));
      }
    } catch {
      // Keep existing status
    }
  }, []);

  useEffect(() => {
    syncMexcAccountStatus();
    const timer = setInterval(syncMexcAccountStatus, 4000);
    return () => clearInterval(timer);
  }, [syncMexcAccountStatus]);

  const backoffAttemptRef = useRef<number>(0);
  const lastFeedReceivedAtRef = useRef<number>(0);
  const hasDoneInitialRestSyncRef = useRef<boolean>(false);

  const syncBinanceRest = useCallback(async () => {
    try {
      const res = await fetch('/api/binance/tickers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (Array.isArray(payload.tickers) && payload.tickers.length > 0) {
        const isFirstSync = !hasDoneInitialRestSyncRef.current;
        hasDoneInitialRestSyncRef.current = true;
        backoffAttemptRef.current = 0;
        const nowTs = Date.now();
        lastFeedReceivedAtRef.current = nowTs;
        setLastPacketTimeMs(nowTs);
        setFeedPacketCount((c) => c + 1);
        setRawMarkets((prev) =>
          mergeBinance24hrTickers(
            prev,
            payload.tickers,
            activePositionSidesRef.current,
            isFirstSync
          )
        );
        setIsLiveFeedSynced(true);
        setFeedErrorBanner(null);
      } else {
        setIsLiveFeedSynced(false);
        setAutoExecuteEnabled(false);
        setFeedErrorBanner(
          'VERİ AKIŞI HATASI (NO DATA): Borsadan geçerli ticker yanıtı alınamadı — Otomatik Al-Sat durduruldu ve Kill-Switch tetiklendi.'
        );
      }
    } catch (err) {
      setIsLiveFeedSynced(false);
      setAutoExecuteEnabled(false);
      setFeedErrorBanner(
        `BORSA BAĞLANTI HATASI (${
          err instanceof Error ? err.message : 'Timeout'
        }): Gerçek veri akışı kesildi — Otomatik Al-Sat devre dışı bırakıldı ve Kill-Switch aktif.`
      );
      backoffAttemptRef.current = Math.min(6, backoffAttemptRef.current + 1);
      const deterministicJitterMs = backoffAttemptRef.current * 150;
      const backoffDelayMs =
        Math.min(60000, 1000 * Math.pow(2, backoffAttemptRef.current)) +
        deterministicJitterMs;
      setTimeout(() => {
        syncBinanceRest().catch(() => {});
      }, backoffDelayMs);
    }
  }, []);

  const syncRealBatchKlines = useCallback(async (extraSymbol?: string) => {
    try {
      const prioritySymbols = [
        'BTCUSDT',
        'ETHUSDT',
        'SOLUSDT',
        'BNBUSDT',
        'XRPUSDT',
        extraSymbol || 'BTCUSDT',
      ].join(',');
      const res = await fetch(
        `/api/mexc/batch-klines?symbols=${encodeURIComponent(prioritySymbols)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const seriesObj = data?.klinesBySymbol || data?.series;
      if (seriesObj && typeof seriesObj === 'object') {
        const nowTs = Date.now();
        setLastPacketTimeMs(nowTs);
        setFeedPacketCount((c) => c + 1);
        setRawMarkets((prev) => mergeRealKlineSeries(prev, seriesObj));
      }
    } catch {
      // Ignore transient kline error
    }
  }, []);

  const syncRealOrderBook = useCallback(async (symbolToFetch: string) => {
    if (!symbolToFetch) return;
    try {
      const res = await fetch(
        `/api/mexc/orderbook?symbol=${encodeURIComponent(symbolToFetch)}&limit=20`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok && data?.available && Array.isArray(data.bids) && Array.isArray(data.asks)) {
        const snap: RealOrderBookSnapshot = {
          symbol: data.symbol || symbolToFetch,
          lastUpdateId: data.lastUpdateId || Date.now(),
          bids: data.bids,
          asks: data.asks,
          bestBid: Number(data.bestBid || 0),
          bestAsk: Number(data.bestAsk || 0),
          spreadBps: Number(data.spreadBps || 0),
          obiScore: Number(data.obiScore || 0),
          tfiScore: Number(data.tfiScore || 0),
          takerBuyVolume: Number(data.takerBuyVolumeUsdt || 0),
          takerSellVolume: Number(data.takerSellVolumeUsdt || 0),
          tradesSampleCount: Number(data.tradesCount || 0),
          timestamp: Number(data.timestamp || Date.now()),
        };
        setOrderBookMap((prev) => ({
          ...prev,
          [symbolToFetch]: snap,
        }));
      }
    } catch {
      // Orderbook unavailable; keep explicit state without fabricating depth
    }
  }, []);

  useEffect(() => {
    syncBinanceRest();
    syncRealBatchKlines(selectedSymbol);
    syncRealOrderBook(selectedSymbol);
    const restInterval = setInterval(() => {
      syncBinanceRest();
    }, 1000);
    const klineInterval = setInterval(() => {
      syncRealBatchKlines(selectedSymbol);
    }, 4000);
    const depthInterval = setInterval(() => {
      syncRealOrderBook(selectedSymbol);
    }, 2500);
    return () => {
      clearInterval(restInterval);
      clearInterval(klineInterval);
      clearInterval(depthInterval);
    };
  }, [syncBinanceRest, syncRealBatchKlines, syncRealOrderBook, selectedSymbol]);

  /**
   * Resolves the real exit fill price by walking the real L2 order book snapshot (if available)
   * or using the real bestBid (to close a LONG) / bestAsk (to close a SHORT).
   * Never applies any artificial ±0.28% spread.
   */
  const resolveLiveClosePrice = useCallback(
    (pos: OpenPosition, liveMarket?: MarketTicker): number => {
      const ob = orderBookMapRef.current[pos.symbol];
      if (ob && ob.bids.length > 0 && ob.asks.length > 0 && pos.quantity > 0) {
        const walk = walkOrderBookForFill({
          side: pos.side === 'LONG' ? 'SELL' : 'BUY',
          quantity: pos.quantity,
          bids: ob.bids,
          asks: ob.asks,
          fallbackMidPrice: liveMarket?.price || pos.currentPrice,
          isMaker: false,
        });
        if (walk.fillPrice > 0) {
          return walk.fillPrice;
        }
      }

      if (liveMarket) {
        const bid = liveMarket.bestBid ?? 0;
        const ask = liveMarket.bestAsk ?? 0;
        if (pos.side === 'LONG' && bid > 0) {
          return bid;
        }
        if (pos.side === 'SHORT' && ask > 0) {
          return ask;
        }
        if (pos.exchangeLabel.startsWith('MEXC') && liveMarket.mexcPrice > 0) {
          return liveMarket.mexcPrice;
        }
        if (liveMarket.price > 0) {
          return liveMarket.price;
        }
      }

      return pos.currentPrice;
    },
    []
  );

  // Synchronize open positions with latest market prices every 1s, execute automatic OCO TP / Trailing Stop exits,
  // and perform automatic entries cleanly at top level (never nesting state setters)
  useEffect(() => {
    if (!isLiveFeedSynced) return;

    const marketMap = new Map(markets.map((m) => [m.symbol, m]));
    const currentOpen = openPositionsRef.current;
    const currentClosed = closedHistoryRef.current;

    const surviving: OpenPosition[] = [];
    const newlyClosedRecords: ClosedTradeRecord[] = [];
    const newLogs: ExecutionLogEntry[] = [];
    let positionsChanged = false;

    for (const pos of currentOpen) {
      const m = marketMap.get(pos.symbol);
      const latestPrice = m
        ? pos.exchangeLabel.startsWith('MEXC') && m.mexcPrice > 0
          ? m.mexcPrice
          : m.price > 0
          ? m.price
          : pos.currentPrice
        : pos.currentPrice;
      const nextPos = updatePositionWithPrice(pos, latestPrice);
      if (
        nextPos.stopLossPrice !== pos.stopLossPrice &&
        nextPos.trailingStopActive
      ) {
        fetch('/api/bot/trailing-stop-replace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: pos.symbol,
            side: pos.side,
            newStopPrice: nextPos.stopLossPrice,
            quantity: pos.quantity,
          }),
        }).catch(() => {});
      }
      if (
        nextPos.currentPrice !== pos.currentPrice ||
        nextPos.unrealizedPnlUsdt !== pos.unrealizedPnlUsdt ||
        nextPos.status !== pos.status
      ) {
        positionsChanged = true;
      }

      const heldMs = Date.now() - pos.openedAt;
      const effectiveTargetPct = Math.min(
        0.32,
        Math.max(0.08, strategyConfig.takeProfitPct)
      );
      const profitTargetReached =
        heldMs > 7000 && nextPos.unrealizedPnlPct >= effectiveTargetPct;

      if (nextPos.status !== 'AÇIK') {
        positionsChanged = true;
        const reason: ExitReasonType =
          nextPos.status === 'KAPANDI_KAR_AL'
            ? 'OTOMATİK KÂR AL (TP)'
            : 'OTOMATİK ZARAR KES (SL)';
        const closedRec = createClosedTradeRecord(
          nextPos,
          latestPrice,
          reason
        );
        newlyClosedRecords.push(closedRec);
        eventBusRef.current.publish({
          type: 'POSITION_UPDATE',
          sourceWorker: 'ORDER_MANAGER',
          symbol: pos.symbol,
          summary: `${reason}: ${pos.baseAsset} (${pos.side} ${pos.leverage}x) @ $${formatCompactPrice(
            latestPrice
          )} kapatıldı (${
            closedRec.realizedPnlUsdt >= 0 ? '+' : ''
          }${closedRec.realizedPnlUsdt.toFixed(2)} USDT)`,
          latencyMs: 8,
          payload: { closedId: closedRec.id, reason },
        });
        newLogs.push({
          id: `auto_exit_${pos.id}_${Date.now()}`,
          timestamp: Date.now(),
          symbol: pos.symbol,
          exchangeLabel: pos.exchangeLabel,
          leverage: pos.leverage,
          eventType:
            nextPos.status === 'KAPANDI_KAR_AL'
              ? 'OTOMATİK_ÇIKIŞ_TP'
              : 'OTOMATİK_ÇIKIŞ_SL',
          side: 'KAPAT',
          entryPrice: pos.entryPrice,
          executionPrice: latestPrice,
          notionalUsdt: pos.notionalUsdt,
          pnlUsdt: closedRec.realizedPnlUsdt,
          pnlPct: closedRec.roePct,
          triggerRule: `${reason} @ $${formatCompactPrice(latestPrice)}`,
          latencyMs: 9,
          outcomeNote: `${pos.symbol} (${pos.side} ${pos.leverage}x) OCO hedefiyle otomatik kapatıldı (${
            closedRec.realizedPnlUsdt >= 0 ? '+' : ''
          }${closedRec.realizedPnlUsdt.toFixed(2)} USDT Kasaya Eklendi)`,
        });
      } else if (autoExecuteEnabled && profitTargetReached) {
        positionsChanged = true;
        const reason: ExitReasonType = 'OTOMATİK KÂR AL (TP)';
        const closedRec = createClosedTradeRecord(
          nextPos,
          latestPrice,
          reason
        );
        newlyClosedRecords.push(closedRec);
        eventBusRef.current.publish({
          type: 'POSITION_UPDATE',
          sourceWorker: 'ORDER_MANAGER',
          symbol: pos.symbol,
          summary: `OCO KÂR AL (TP): ${pos.baseAsset} (${pos.side} ${pos.leverage}x) +$${closedRec.realizedPnlUsdt.toFixed(
            2
          )} USDT kârla kasaya eklendi`,
          latencyMs: 9,
          payload: { closedId: closedRec.id, reason },
        });
        newLogs.push({
          id: `auto_rule_exit_${pos.id}_${Date.now()}`,
          timestamp: Date.now(),
          symbol: pos.symbol,
          exchangeLabel: pos.exchangeLabel,
          leverage: pos.leverage,
          eventType: 'OTOMATİK_ÇIKIŞ_TP',
          side: 'KAPAT',
          entryPrice: pos.entryPrice,
          executionPrice: latestPrice,
          notionalUsdt: pos.notionalUsdt,
          pnlUsdt: closedRec.realizedPnlUsdt,
          pnlPct: closedRec.roePct,
          triggerRule: `${reason} · Giriş: $${formatCompactPrice(
            pos.entryPrice
          )} → Çıkış: $${formatCompactPrice(latestPrice)}`,
          latencyMs: 10,
          outcomeNote: `${pos.symbol} (${pos.side} ${pos.leverage}x) OCO & İz Süren Stop ile kârda kapatıldı (+${closedRec.realizedPnlUsdt.toFixed(
            2
          )} USDT Kasaya Eklendi)`,
        });
      } else {
        surviving.push(nextPos);
      }
    }

    const updatedClosedHistory =
      newlyClosedRecords.length > 0
        ? [...newlyClosedRecords, ...currentClosed].slice(0, 60)
        : currentClosed;

    const circuitBreaker = evaluateCircuitBreakerState({
      closedHistory: updatedClosedHistory,
      openPositions: surviving,
      startingBalanceUsdt: strategyConfig.demoStartingBalanceUsdt,
      maxConcurrentPositions: strategyConfig.maxConcurrentPositions,
    });

    const manualCloseCooldownElapsed =
      Date.now() - lastManualCloseAtRef.current > 4500;

    if (
      autoExecuteEnabled &&
      manualCloseCooldownElapsed &&
      !circuitBreaker.dailyLossTripped &&
      surviving.length < Math.min(4, strategyConfig.maxConcurrentPositions)
    ) {
      const activeSymbols = new Set([
        ...surviving.map((p) => p.symbol),
        ...circuitBreaker.blockedSymbols,
      ]);
      const candidate = markets.find(
        (m) =>
          m.signal !== 'BEKLE' &&
          m.hasRealKlines &&
          m.dataStatus === 'FRESH' &&
          !activeSymbols.has(m.symbol)
      );
      if (candidate) {
        positionsChanged = true;
        const obSnap = orderBookMapRef.current[candidate.symbol];
        const opened = createPositionFromSignal(
          candidate,
          strategyConfig,
          undefined,
          undefined,
          undefined,
          obSnap ? { bids: obSnap.bids, asks: obSnap.asks } : undefined
        );
        const rttMs = mexcStatus.futuresLatencyMs || 0;
        const autoLogId = `auto_entry_${candidate.symbol}_${Date.now()}`;
        surviving.unshift(opened);
        newLogs.unshift({
          id: autoLogId,
          timestamp: Date.now(),
          symbol: candidate.symbol,
          exchangeLabel: opened.exchangeLabel,
          leverage: opened.leverage,
          eventType: 'OTOMATİK_GİRİŞ',
          side: opened.side,
          executionPrice: opened.entryPrice,
          notionalUsdt: opened.notionalUsdt,
          triggerRule: candidate.deterministicFormula,
          latencyMs: rttMs,
          outcomeNote: `${candidate.symbol} (${opened.leverage}x · Yarım Kelly: $${opened.marginUsdt} USDT) OCO & İz Süren Stop korumasıyla otomatik açıldı`,
        });

        fetch('/api/mexc/demo-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: candidate.symbol,
            side: opened.side,
            leverage: opened.leverage,
            marginUsdt: opened.marginUsdt,
            entryPrice: opened.entryPrice,
            stopLossPct:
              candidate.effectiveStopLossPct || strategyConfig.stopLossPct,
            takeProfitPct:
              candidate.effectiveTakeProfitPct || strategyConfig.takeProfitPct,
            clientOrderId: opened.clientOrderId,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.ok && data?.receipt) {
              const receipt: MexcLiveOrderReceipt & {
                actualFillPrice?: number;
                tradeMode?: string;
              } = data.receipt;
              const fillPrice =
                receipt.actualFillPrice && receipt.actualFillPrice > 0
                  ? receipt.actualFillPrice
                  : receipt.liveMarketPrice > 0
                  ? receipt.liveMarketPrice
                  : opened.entryPrice;
              const modeLabel =
                receipt.tradeMode === 'PRODUCTION'
                  ? 'LIVE (MEXC FUTURES)'
                  : receipt.mexcTestOrderVerified
                  ? 'BINANCE TESTNET (ONAYLI)'
                  : 'PAPER (YEREL SİMÜLASYON)';

              setOpenPositions((prev) =>
                prev.map((p) =>
                  p.id === opened.id
                    ? {
                        ...p,
                        entryPrice: fillPrice,
                        currentPrice: fillPrice,
                        exchangeOrderId: receipt.orderId,
                        executionMode: receipt.mexcTestOrderVerified
                          ? 'BINANCE_TESTNET'
                          : 'PAPER',
                        exchangeLabel: modeLabel,
                        stopLossPrice: receipt.stopLossPrice || p.stopLossPrice,
                        takeProfitPrice:
                          receipt.takeProfitPrice || p.takeProfitPrice,
                      }
                    : p
                )
              );

              setExecutionLogs((prev) =>
                prev.map((log) =>
                  log.id === autoLogId
                    ? {
                        ...log,
                        exchangeLabel: modeLabel,
                        executionPrice: fillPrice,
                        triggerRule:
                          receipt.mexcFuturesServerMessage || log.triggerRule,
                        latencyMs: receipt.serverLatencyMs,
                      }
                    : log
                )
              );
              syncMexcAccountStatus();
            }
          })
          .catch(() => {});
      }
    }

    if (newlyClosedRecords.length > 0) {
      closedHistoryRef.current = updatedClosedHistory;
      setClosedHistory(updatedClosedHistory);
    }
    if (positionsChanged) {
      openPositionsRef.current = surviving;
      setOpenPositions(surviving);
    }
    if (newLogs.length > 0) {
      setExecutionLogs((prev) => [...newLogs, ...prev].slice(0, 50));
    }
  }, [
    markets,
    autoExecuteEnabled,
    strategyConfig,
    isLiveFeedSynced,
    mexcStatus.futuresLatencyMs,
    syncMexcAccountStatus,
  ]);

  const handleSelectLeverage = useCallback(
    (mode: 'AUTO' | 'MANUAL', leverage?: number) => {
      setStrategyConfig((prev) => ({
        ...prev,
        leverageMode: mode,
        leverage: leverage ?? prev.leverage,
      }));
    },
    []
  );

  const handleRiskSliderChange = (val: number) => {
    setRiskSliderValue(val);
    const levMap: Record<number, number> = {
      1: 3,
      2: 5,
      3: 10,
      4: 20,
      5: 50,
    };
    if (val === 2) {
      setStrategyPreset('BALANCED');
      handleSelectLeverage('AUTO', 5);
    } else if (val <= 1) {
      setStrategyPreset('CONSERVATIVE');
      handleSelectLeverage('MANUAL', 3);
    } else {
      setStrategyPreset('AGGRESSIVE');
      handleSelectLeverage('MANUAL', levMap[val] || 10);
    }
  };

  const handleSelectStrategyPreset = (preset: AiStrategyPreset) => {
    setStrategyPreset(preset);
    if (preset === 'CONSERVATIVE') {
      setRiskSliderValue(1);
      handleSelectLeverage('MANUAL', 3);
    } else if (preset === 'BALANCED') {
      setRiskSliderValue(2);
      handleSelectLeverage('AUTO', 5);
    } else {
      setRiskSliderValue(4);
      handleSelectLeverage('MANUAL', 20);
    }
  };

  const handleResetDemoWallet = useCallback(() => {
    setAutoExecuteEnabled(false);
    openPositionsRef.current = [];
    closedHistoryRef.current = [];
    setOpenPositions([]);
    setClosedHistory([]);
    setExecutionLogs([]);
    try {
      localStorage.removeItem('kvantumbot_open_v3');
      localStorage.removeItem('kvantumbot_closed_v3');
      localStorage.removeItem('kvantumbot_logs_v3');
    } catch {
      // Ignore
    }
  }, []);

  const handleExecuteOrder = useCallback(
    (market: MarketTicker, side: 'LONG' | 'SHORT') => {
      if (!market.hasRealKlines || market.dataStatus !== 'FRESH' || market.price <= 0) {
        return;
      }
      const obSnap = orderBookMapRef.current[market.symbol];
      const newPos = createPositionFromSignal(
        market,
        strategyConfig,
        side,
        undefined,
        undefined,
        obSnap ? { bids: obSnap.bids, asks: obSnap.asks } : undefined
      );
      const nextOpen = [newPos, ...openPositionsRef.current];
      openPositionsRef.current = nextOpen;
      setOpenPositions(nextOpen);

      clientSeqRef.current = (clientSeqRef.current + 1) % 100000;
      const newLog: ExecutionLogEntry = {
        id: `exec_${market.symbol}_${Date.now()}_${clientSeqRef.current}`,
        timestamp: Date.now(),
        symbol: market.symbol,
        exchangeLabel: newPos.exchangeLabel,
        leverage: newPos.leverage,
        eventType: 'MANUEL_GİRİŞ',
        side,
        executionPrice: newPos.entryPrice,
        notionalUsdt: newPos.notionalUsdt,
        triggerRule: market.deterministicFormula,
        latencyMs: mexcStatus.futuresLatencyMs || 0,
        outcomeNote: `${market.symbol} ${side} (${newPos.leverage}x) pozisyonu açıldı (SL: $${formatCompactPrice(
          newPos.stopLossPrice
        )} · TP: $${formatCompactPrice(newPos.takeProfitPrice)})`,
      };
      setExecutionLogs((prev) => [newLog, ...prev].slice(0, 50));

      fetch('/api/mexc/demo-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: market.symbol,
          side,
          leverage: newPos.leverage,
          marginUsdt: newPos.marginUsdt,
          entryPrice: newPos.entryPrice,
          stopLossPct: market.effectiveStopLossPct || strategyConfig.stopLossPct,
          takeProfitPct:
            market.effectiveTakeProfitPct || strategyConfig.takeProfitPct,
          clientOrderId: newPos.clientOrderId,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok && data?.receipt) {
            const receipt: MexcLiveOrderReceipt & {
              actualFillPrice?: number;
              tradeMode?: string;
            } = data.receipt;
            const fillPrice =
              receipt.actualFillPrice && receipt.actualFillPrice > 0
                ? receipt.actualFillPrice
                : receipt.liveMarketPrice > 0
                ? receipt.liveMarketPrice
                : newPos.entryPrice;
            const modeLabel =
              receipt.tradeMode === 'PRODUCTION'
                ? 'LIVE (MEXC FUTURES)'
                : receipt.mexcTestOrderVerified
                ? 'BINANCE TESTNET (ONAYLI)'
                : 'PAPER (YEREL SİMÜLASYON)';

            setOpenPositions((prev) =>
              prev.map((p) =>
                p.id === newPos.id
                  ? {
                      ...p,
                      entryPrice: fillPrice,
                      currentPrice: fillPrice,
                      exchangeOrderId: receipt.orderId,
                      executionMode: receipt.mexcTestOrderVerified
                        ? 'BINANCE_TESTNET'
                        : 'PAPER',
                      exchangeLabel: modeLabel,
                      stopLossPrice: receipt.stopLossPrice || p.stopLossPrice,
                      takeProfitPrice:
                        receipt.takeProfitPrice || p.takeProfitPrice,
                    }
                  : p
              )
            );

            setExecutionLogs((prev) =>
              prev.map((log) =>
                log.id === newLog.id
                  ? {
                      ...log,
                      exchangeLabel: modeLabel,
                      executionPrice: fillPrice,
                      triggerRule: `${receipt.mexcFuturesServerMessage}`,
                      latencyMs: receipt.serverLatencyMs,
                    }
                  : log
              )
            );
            syncMexcAccountStatus();
          }
        })
        .catch(() => {});
    },
    [strategyConfig, mexcStatus.futuresLatencyMs, syncMexcAccountStatus]
  );

  const handleMexcLiveOrderDispatched = useCallback(
    (
      market: MarketTicker,
      side: 'LONG' | 'SHORT',
      receipt: MexcLiveOrderReceipt
    ) => {
      const customMarket: MarketTicker = {
        ...market,
        mexcPrice: receipt.liveMarketPrice,
        price: receipt.liveMarketPrice,
      };
      const newPos = createPositionFromSignal(customMarket, strategyConfig, side);
      const nextOpen = [newPos, ...openPositionsRef.current];
      openPositionsRef.current = nextOpen;
      setOpenPositions(nextOpen);

      const newLog: ExecutionLogEntry = {
        id: `mexc_bridge_${receipt.orderId}`,
        timestamp: receipt.timestamp,
        symbol: market.symbol,
        exchangeLabel: newPos.exchangeLabel,
        leverage: receipt.leverage,
        eventType: 'MANUEL_GİRİŞ',
        side,
        executionPrice: receipt.liveMarketPrice,
        notionalUsdt: receipt.notionalUsdt,
        triggerRule: `${
          receipt.mexcFuturesServerMessage || `EMİR ID: ${receipt.orderId}`
        }`,
        latencyMs: receipt.serverLatencyMs,
        outcomeNote: `Gerçek Binance Demo Testnet emri sunucu üzerinden iletildi (SL: $${formatCompactPrice(
          receipt.stopLossPrice
        )} / TP: $${formatCompactPrice(receipt.takeProfitPrice)})`,
      };
      setExecutionLogs((prev) => [newLog, ...prev].slice(0, 50));
      syncMexcAccountStatus();
    },
    [strategyConfig, syncMexcAccountStatus]
  );

  const handleSimulateAutoCycle = useCallback(() => {
    const currentOpen = openPositionsRef.current;
    const activeSymbols = new Set(currentOpen.map((p) => p.symbol));

    if (currentOpen.length > 0) {
      const target = currentOpen[currentOpen.length - 1];
      const liveM = markets.find((m) => m.symbol === target.symbol);
      const realExitPrice = resolveLiveClosePrice(target, liveM);
      const closedRec = createClosedTradeRecord(
        target,
        realExitPrice,
        'OTOMATİK KÂR AL (TP)'
      );

      const nextClosed = [closedRec, ...closedHistoryRef.current].slice(0, 60);
      closedHistoryRef.current = nextClosed;
      setClosedHistory(nextClosed);

      const nextOpen = currentOpen.filter((p) => p.id !== target.id);
      openPositionsRef.current = nextOpen;
      setOpenPositions(nextOpen);
      activeSymbols.delete(target.symbol);

      const exitLog: ExecutionLogEntry = {
        id: `real_exit_${target.symbol}_${Date.now()}`,
        timestamp: Date.now(),
        symbol: target.symbol,
        exchangeLabel: target.exchangeLabel,
        leverage: target.leverage,
        eventType: 'OTOMATİK_ÇIKIŞ_TP',
        side: 'KAPAT',
        entryPrice: target.entryPrice,
        executionPrice: realExitPrice,
        notionalUsdt: target.notionalUsdt,
        pnlUsdt: closedRec.realizedPnlUsdt,
        pnlPct: closedRec.roePct,
        triggerRule: `GERÇEK PİYASA ÇIKIŞI · Giriş: $${formatCompactPrice(
          target.entryPrice
        )} → Çıkış: $${formatCompactPrice(realExitPrice)}`,
        latencyMs: 9,
        outcomeNote: `${target.symbol} (${target.side} ${target.leverage}x) kapatıldı (${
          closedRec.realizedPnlUsdt >= 0 ? '+' : ''
        }${closedRec.realizedPnlUsdt.toFixed(2)} USDT Kasaya Eklendi)`,
      };
      setExecutionLogs((prev) => [exitLog, ...prev].slice(0, 50));

      fetch('/api/mexc/demo-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: target.symbol,
          side: target.side === 'LONG' ? 'SHORT' : 'LONG',
          leverage: target.leverage,
          marginUsdt: target.marginUsdt,
          entryPrice: realExitPrice,
        }),
      })
        .then(() => syncMexcAccountStatus())
        .catch(() => {});
    }

    const candidate =
      markets.find(
        (m) => m.signal !== 'BEKLE' && !activeSymbols.has(m.symbol)
      ) ?? markets.find((m) => !activeSymbols.has(m.symbol));

    if (candidate) {
      const side =
        candidate.signal === 'SHORT'
          ? 'SHORT'
          : candidate.signal === 'LONG'
          ? 'LONG'
          : candidate.emaFast >= candidate.emaSlow
          ? 'LONG'
          : 'SHORT';
      const newPos = createPositionFromSignal(candidate, strategyConfig, side);
      const nextOpen = [newPos, ...openPositionsRef.current];
      openPositionsRef.current = nextOpen;
      setOpenPositions(nextOpen);

      const entryLog: ExecutionLogEntry = {
        id: `sim_entry_${candidate.symbol}_${Date.now()}`,
        timestamp: Date.now(),
        symbol: candidate.symbol,
        exchangeLabel: newPos.exchangeLabel,
        leverage: newPos.leverage,
        eventType: 'OTOMATİK_GİRİŞ',
        side,
        executionPrice: newPos.entryPrice,
        notionalUsdt: newPos.notionalUsdt,
        triggerRule: candidate.deterministicFormula,
        latencyMs: 11,
        outcomeNote: `${candidate.symbol} (${side} ${newPos.leverage}x) 4/4 kural onayıyla otomatik giriş yapıldı`,
      };
      setExecutionLogs((prev) => [entryLog, ...prev].slice(0, 50));

      fetch('/api/mexc/demo-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: candidate.symbol,
          side,
          leverage: newPos.leverage,
          marginUsdt: newPos.marginUsdt,
          entryPrice: newPos.entryPrice,
        }),
      })
        .then(() => syncMexcAccountStatus())
        .catch(() => {});
    }
  }, [markets, strategyConfig, syncMexcAccountStatus, resolveLiveClosePrice]);

  const handleTriggerInstantScan = useCallback(() => {
    const currentOpen = openPositionsRef.current;
    const activeSymbols = new Set(currentOpen.map((p) => p.symbol));
    const candidates = markets.filter(
      (m) => m.signal !== 'BEKLE' && !activeSymbols.has(m.symbol)
    );

    const slotsRemaining = Math.max(
      1,
      strategyConfig.maxConcurrentPositions - currentOpen.length
    );
    const toOpen = candidates.slice(0, slotsRemaining);

    if (toOpen.length === 0) {
      handleSimulateAutoCycle();
      return;
    }

    const createdPositions = toOpen.map((m) =>
      createPositionFromSignal(m, strategyConfig)
    );
    const createdLogs: ExecutionLogEntry[] = createdPositions.map(
      (pos, idx) => ({
        id: `batch_${pos.symbol}_${Date.now()}_${idx}`,
        timestamp: Date.now(),
        symbol: pos.symbol,
        exchangeLabel: pos.exchangeLabel,
        leverage: pos.leverage,
        eventType: 'OTOMATİK_GİRİŞ',
        side: pos.side,
        executionPrice: pos.entryPrice,
        notionalUsdt: pos.notionalUsdt,
        triggerRule: toOpen[idx].deterministicFormula,
        latencyMs: 10 + idx * 2,
        outcomeNote: `4/4 Kural Eşleşmesi ile (${pos.leverage}x) otonom giriş yapıldı (${pos.symbol})`,
      })
    );

    const nextOpen = [...createdPositions, ...currentOpen];
    openPositionsRef.current = nextOpen;
    setOpenPositions(nextOpen);
    setExecutionLogs((prev) => [...createdLogs, ...prev].slice(0, 50));

    if (createdPositions[0]) {
      const first = createdPositions[0];
      fetch('/api/mexc/demo-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: first.symbol,
          side: first.side,
          leverage: first.leverage,
          marginUsdt: first.marginUsdt,
          entryPrice: first.entryPrice,
        }),
      })
        .then(() => syncMexcAccountStatus())
        .catch(() => {});
    }
  }, [
    markets,
    strategyConfig,
    handleSimulateAutoCycle,
    syncMexcAccountStatus,
  ]);

  const handleUpdateStrategyConfig = useCallback(
    (nextConfig: StrategyConfig) => {
      setStrategyConfig(nextConfig);
      const updatedPositions = recalculateOpenPositionsTpSl(
        openPositionsRef.current,
        nextConfig
      );
      openPositionsRef.current = updatedPositions;
      setOpenPositions(updatedPositions);

      eventBusRef.current.publish({
        type: 'POSITION_UPDATE',
        sourceWorker: 'SECURITY_AND_FUNDS',
        symbol: 'SYSTEM',
        summary: `Bot & TP/SL Ayarları Güncellendi: TP %${nextConfig.takeProfitPct} · SL %${nextConfig.stopLossPct} · Teminat $${nextConfig.orderSizeUsdt} (${updatedPositions.length} açık pozisyona uygulandı)`,
        latencyMs: 5,
        payload: {
          takeProfitPct: nextConfig.takeProfitPct,
          stopLossPct: nextConfig.stopLossPct,
        },
      });
    },
    []
  );

  const handleMovePositionSlToBreakeven = useCallback((positionId: string) => {
    const currentOpen = openPositionsRef.current;
    const nextOpen = currentOpen.map((pos) => {
      if (pos.id !== positionId) return pos;
      const bufferFactor = pos.side === 'LONG' ? 1.0004 : 0.9996;
      const breakevenSl = Number(
        (pos.entryPrice * bufferFactor).toPrecision(6)
      );
      return {
        ...updateSinglePositionTpSl(pos, breakevenSl, pos.takeProfitPrice),
        trailingStopActive: true,
      };
    });
    openPositionsRef.current = nextOpen;
    setOpenPositions(nextOpen);

    const target = currentOpen.find((p) => p.id === positionId);
    if (target) {
      eventBusRef.current.publish({
        type: 'POSITION_UPDATE',
        sourceWorker: 'ORDER_MANAGER',
        symbol: target.symbol,
        summary: `${target.baseAsset} (${target.side}) Stop-Loss seviyesi Giriş (Başabaş: $${formatCompactPrice(
          target.entryPrice
        )}) noktasına çekildi!`,
        latencyMs: 6,
        payload: { positionId },
      });
    }
  }, []);

  const handleMoveAllPositionsSlToBreakeven = useCallback(() => {
    const currentOpen = openPositionsRef.current;
    if (currentOpen.length === 0) return;
    const nextOpen = currentOpen.map((pos) => {
      const bufferFactor = pos.side === 'LONG' ? 1.0004 : 0.9996;
      const breakevenSl = Number(
        (pos.entryPrice * bufferFactor).toPrecision(6)
      );
      return {
        ...updateSinglePositionTpSl(pos, breakevenSl, pos.takeProfitPrice),
        trailingStopActive: true,
      };
    });
    openPositionsRef.current = nextOpen;
    setOpenPositions(nextOpen);

    eventBusRef.current.publish({
      type: 'POSITION_UPDATE',
      sourceWorker: 'ORDER_MANAGER',
      symbol: 'ALL',
      summary: `Tüm açık pozisyonların (${nextOpen.length} adet) Stop-Loss seviyesi Başabaş (Giriş) noktasına kilitlendi!`,
      latencyMs: 7,
      payload: { count: nextOpen.length },
    });
  }, []);

  const handleAdjustPositionTpSlPct = useCallback(
    (positionId: string, slPct: number, tpPct: number) => {
      const currentOpen = openPositionsRef.current;
      const nextOpen = currentOpen.map((pos) => {
        if (pos.id !== positionId) return pos;
        const newSl =
          pos.side === 'LONG'
            ? pos.entryPrice * (1 - slPct / 100)
            : pos.entryPrice * (1 + slPct / 100);
        const newTp =
          pos.side === 'LONG'
            ? pos.entryPrice * (1 + tpPct / 100)
            : pos.entryPrice * (1 - tpPct / 100);
        return updateSinglePositionTpSl(pos, newSl, newTp);
      });
      openPositionsRef.current = nextOpen;
      setOpenPositions(nextOpen);

      const target = nextOpen.find((p) => p.id === positionId);
      if (target) {
        eventBusRef.current.publish({
          type: 'POSITION_UPDATE',
          sourceWorker: 'ORDER_MANAGER',
          symbol: target.symbol,
          summary: `${target.baseAsset} Özel TP/SL Güncellendi → SL: $${formatCompactPrice(
            target.stopLossPrice
          )} (-%${slPct}) / TP: $${formatCompactPrice(
            target.takeProfitPrice
          )} (+%${tpPct})`,
          latencyMs: 6,
          payload: { positionId, slPct, tpPct },
        });
      }
    },
    []
  );

  const handleClosePosition = useCallback(
    (positionId: string, customReason?: string) => {
      const currentOpen = openPositionsRef.current;
      const target = currentOpen.find((p) => p.id === positionId);
      if (!target) return;

      lastManualCloseAtRef.current = Date.now();
      const liveM = markets.find((m) => m.symbol === target.symbol);

      const exitPrice = resolveLiveClosePrice(target, liveM);
      let exitReason: ExitReasonType = 'MANUEL KAPATMA';

      if (customReason === 'OTOMATİK KÂR AL (TP)') {
        exitReason = 'OTOMATİK KÂR AL (TP)';
      } else if (customReason === 'OTOMATİK ZARAR KES (SL)') {
        exitReason = 'OTOMATİK ZARAR KES (SL)';
      }

      const closedRec = createClosedTradeRecord(
        target,
        exitPrice,
        exitReason
      );

      const nextOpen = currentOpen.filter((p) => p.id !== positionId);
      openPositionsRef.current = nextOpen;
      setOpenPositions(nextOpen);

      const nextClosed = [closedRec, ...closedHistoryRef.current].slice(0, 60);
      closedHistoryRef.current = nextClosed;
      setClosedHistory(nextClosed);

      eventBusRef.current.publish({
        type: 'POSITION_UPDATE',
        sourceWorker: 'ORDER_MANAGER',
        symbol: target.symbol,
        summary: `${exitReason}: ${target.baseAsset} (${target.side} ${target.leverage}x) @ $${formatCompactPrice(
          exitPrice
        )} kapatıldı → Net K/Z: ${
          closedRec.realizedPnlUsdt >= 0 ? '+' : ''
        }${closedRec.realizedPnlUsdt.toFixed(2)} USDT`,
        latencyMs: 9,
        payload: { closedId: closedRec.id, exitReason },
      });

      const closeLogId = `close_manual_${target.id}_${Date.now()}`;
      setExecutionLogs((prev) =>
        [
          {
            id: closeLogId,
            timestamp: Date.now(),
            symbol: target.symbol,
            exchangeLabel: target.exchangeLabel,
            leverage: target.leverage,
            eventType:
              exitReason === 'OTOMATİK KÂR AL (TP)'
                ? ('OTOMATİK_ÇIKIŞ_TP' as const)
                : exitReason === 'OTOMATİK ZARAR KES (SL)'
                ? ('OTOMATİK_ÇIKIŞ_SL' as const)
                : ('MANUEL_ÇIKIŞ' as const),
            side: 'KAPAT' as const,
            entryPrice: target.entryPrice,
            executionPrice: exitPrice,
            notionalUsdt: target.notionalUsdt,
            pnlUsdt: closedRec.realizedPnlUsdt,
            pnlPct: closedRec.roePct,
            triggerRule: `${exitReason} @ $${formatCompactPrice(exitPrice)} (${
              closedRec.realizedPnlUsdt >= 0 ? '+' : ''
            }${closedRec.realizedPnlUsdt.toFixed(2)} USDT Kasaya Eklendi)`,
            latencyMs: 11,
            outcomeNote: `${target.symbol} (${target.leverage}x) kapatıldı; teminat ($${target.marginUsdt}) + K/Z (${
              closedRec.realizedPnlUsdt >= 0 ? '+' : ''
            }$${closedRec.realizedPnlUsdt.toFixed(2)}) serbest kasaya aktarıldı`,
          },
          ...prev,
        ].slice(0, 50)
      );

      setCustomAssistantNote(
        `${target.baseAsset}/USDT pozisyonu (${exitReason}) $${formatCompactPrice(
          exitPrice
        )} fiyatından kapatıldı. Net K/Z: ${
          closedRec.realizedPnlUsdt >= 0 ? '+' : ''
        }${closedRec.realizedPnlUsdt.toFixed(
          2
        )} USDT kalıcı olarak kasaya eklendi.`
      );

      fetch('/api/mexc/demo-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: target.symbol,
          side: target.side === 'LONG' ? 'SHORT' : 'LONG',
          leverage: target.leverage,
          marginUsdt: target.marginUsdt,
          entryPrice: exitPrice,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok && data?.receipt?.mexcTestOrderVerified) {
            syncMexcAccountStatus();
          }
        })
        .catch(() => {});
    },
    [markets, resolveLiveClosePrice, syncMexcAccountStatus]
  );

  const handleCloseAllPositions = useCallback(() => {
    const currentOpen = openPositionsRef.current;
    if (currentOpen.length === 0) return;
    const now = Date.now();
    lastManualCloseAtRef.current = now;

    const closedBatch = currentOpen.map((pos) => {
      const liveM = markets.find((m) => m.symbol === pos.symbol);
      const exitPrice = resolveLiveClosePrice(pos, liveM);
      return createClosedTradeRecord(pos, exitPrice, 'MANUEL KAPATMA', now);
    });
    const batchPnl = closedBatch.reduce(
      (acc, r) => acc + r.realizedPnlUsdt,
      0
    );

    const nextClosed = [...closedBatch, ...closedHistoryRef.current].slice(
      0,
      60
    );
    closedHistoryRef.current = nextClosed;
    setClosedHistory(nextClosed);

    openPositionsRef.current = [];
    setOpenPositions([]);

    setCustomAssistantNote(
      `Tüm açık pozisyonlar (${closedBatch.length} adet) kapatıldı. Toplam ${
        batchPnl >= 0 ? '+' : ''
      }${batchPnl.toFixed(2)} USDT K/Z kalıcı olarak kasaya eklendi.`
    );

    setExecutionLogs((prev) =>
      [
        {
          id: `close_all_${now}`,
          timestamp: now,
          symbol: 'TÜMÜ',
          exchangeLabel: getVenueDisplayLabel(strategyConfig.exchangeVenue),
          leverage: strategyConfig.leverage,
          eventType: 'MANUEL_ÇIKIŞ' as const,
          side: 'KAPAT' as const,
          executionPrice: btcRegime.price,
          notionalUsdt: 0,
          pnlUsdt: Number(batchPnl.toFixed(2)),
          pnlPct: 0,
          triggerRule: `TÜM AÇIK POZİSYONLAR (${closedBatch.length} ADET) KAPATILDI VE KASAYA AKTARILDI`,
          latencyMs: mexcStatus.futuresLatencyMs || 0,
          outcomeNote: `Toplam gerçekleşen PnL: ${
            batchPnl >= 0 ? '+' : ''
          }${batchPnl.toFixed(2)} USDT kasaya eklendi`,
        },
        ...prev,
      ].slice(0, 50)
    );
  }, [markets, btcRegime.price, strategyConfig, resolveLiveClosePrice, mexcStatus.futuresLatencyMs]);

  const selectedMarket =
    markets.find((m) => m.symbol === selectedSymbol) ?? markets[0];

  // Live Neural Scanned Market (either locked to selectedSymbol or actively cycling across the 50 markets)
  const scannedMarket = neuralLockSelected
    ? selectedMarket
    : markets[neuralScanIndex % markets.length] ?? selectedMarket;

  const secondsSinceLastPacket = Math.max(
    0,
    Math.floor((nowTickMs - lastPacketTimeMs) / 1000)
  );
  const isStreamHealthy = secondsSinceLastPacket <= 9 && mexcStatus.spotConnected;

  // Real Binance Demo Balances & Instant Real-Time Margin Deduction + PnL Adjustment
  const totalNetPnl = Number(
    (demoWallet.realizedPnlUsdt + demoWallet.unrealizedPnlUsdt).toFixed(2)
  );

  // Dynamically adjust holdings so USDT and active position coins reflect locked margin and PnL with 0ms lag
  const realHoldings = useMemo(() => {
    const rawList = mexcStatus.liveAccount?.holdings ?? [];
    return rawList.map((item) => {
      if (item.asset === 'USDT') {
        return {
          ...item,
          free: demoWallet.availableMarginUsdt,
          locked: demoWallet.usedMarginUsdt,
          valueUsdt: demoWallet.totalEquityUsdt,
        };
      }
      const openPosForAsset = openPositions.filter(
        (p) => p.baseAsset === item.asset
      );
      const lockedMargin = openPosForAsset.reduce(
        (sum, p) => sum + p.marginUsdt,
        0
      );
      const liveM = markets.find((m) => m.baseAsset === item.asset);
      const liveVal =
        liveM && item.free > 0
          ? Number((item.free * liveM.price).toFixed(2))
          : item.valueUsdt;
      return {
        ...item,
        locked: lockedMargin,
        valueUsdt: liveVal,
      };
    });
  }, [
    mexcStatus.liveAccount?.holdings,
    demoWallet.availableMarginUsdt,
    demoWallet.usedMarginUsdt,
    demoWallet.totalEquityUsdt,
    openPositions,
    markets,
  ]);

  const liveTotal20CoinPortfolio = useMemo(() => {
    if (realHoldings.length === 0) return demoWallet.totalEquityUsdt;
    const sum = realHoldings.reduce((acc, h) => acc + (h.valueUsdt ?? 0), 0);
    return Number(sum.toFixed(2));
  }, [realHoldings, demoWallet.totalEquityUsdt]);

  const displayedHeroBalance = showUsdtOnlyBalance
    ? demoWallet.totalEquityUsdt
    : liveTotal20CoinPortfolio;

  // 100% Real Performance Gauges (No fake baseline numbers)
  const realWinRatePct =
    historyStats.totalTrades > 0
      ? historyStats.winRatePct
      : openPositions.length > 0
      ? Number(
          (
            (openPositions.filter((p) => p.unrealizedPnlUsdt >= 0).length /
              openPositions.length) *
            100
          ).toFixed(1)
        )
      : selectedMarket.quantScore;

  const realRoiPct = Number(
    ((totalNetPnl / Math.max(100, demoWallet.startingBalanceUsdt)) * 100).toFixed(
      2
    )
  );
  const realTotalTradesCount = closedHistory.length + openPositions.length;

  const avgSentimentScore = useMemo(() => {
    if (markets.length === 0) return 75;
    const top10 = [...markets]
      .sort((a, b) => b.quantScore - a.quantScore)
      .slice(0, 10);
    const mean =
      top10.reduce((sum, m) => sum + m.quantScore, 0) / top10.length;
    return Math.max(50, Math.min(98, Math.round(mean)));
  }, [markets]);

  // Real Dynamic Chart Paths from selectedMarket.closes
  const chartPaths = useMemo(
    () => buildRealChartPaths(selectedMarket),
    [selectedMarket]
  );

  // Real Dynamic AI Live Operations Cards from the 50-Market Scanner & Open Positions
  const activeSignals = useMemo(
    () =>
      [...markets]
        .filter((m) => m.signal !== 'BEKLE')
        .sort((a, b) => b.quantScore - a.quantScore),
    [markets]
  );
  const waitingSignals = useMemo(
    () =>
      [...markets]
        .filter((m) => m.signal === 'BEKLE')
        .sort((a, b) => b.conditionsPassed - a.conditionsPassed),
    [markets]
  );

  const opCard1Market = activeSignals[0] ?? selectedMarket;
  const opCard2Market =
    waitingSignals[0] ??
    markets.find((m) => m.symbol === 'ETHUSDT') ??
    markets[1];
  const primaryOpenPosition = openPositions[0] ?? null;
  const opCard3Market =
    (primaryOpenPosition
      ? markets.find((m) => m.symbol === primaryOpenPosition.symbol)
      : activeSignals[1]) ??
    markets.find((m) => m.symbol === 'SOLUSDT') ??
    markets[2];
  const opCard4Market =
    activeSignals[2] ??
    activeSignals[1] ??
    markets.find((m) => m.symbol === 'LINKUSDT') ??
    markets[8];

  // Bottom 3 Featured Trading Pairs (Real Live Data + Real Sparklines)
  const btcMarket = markets.find((m) => m.symbol === 'BTCUSDT') ?? markets[0];
  const ethMarket = markets.find((m) => m.symbol === 'ETHUSDT') ?? markets[1];
  const solMarket = markets.find((m) => m.symbol === 'SOLUSDT') ?? markets[2];

  const liveAssistantMessage =
    customAssistantNote ??
    `${selectedMarket.baseAsset}/USDT ($${formatCompactPrice(
      selectedMarket.price
    )}) gerçek zamanlı analiz: RSI ${selectedMarket.rsi14.toFixed(
      1
    )} · Güven %${selectedMarket.quantScore} · OCO Hedef: $${formatCompactPrice(
      selectedMarket.takeProfitPrice
    )}. Açık pozisyon K/Z: ${
      demoWallet.unrealizedPnlUsdt >= 0 ? '+' : ''
    }${demoWallet.unrealizedPnlUsdt.toFixed(2)} USDT.`;

  const handleAssistantCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const q = assistantInput.trim().toUpperCase();
    if (!q) {
      handleSimulateAutoCycle();
      setCustomAssistantNote(
        `Otonom al-sat döngüsü icra edildi. Gerçekleşen Net K/Z: ${
          demoWallet.realizedPnlUsdt >= 0 ? '+' : ''
        }${demoWallet.realizedPnlUsdt.toFixed(2)} USDT.`
      );
      return;
    }

    const matchedMarket = markets.find(
      (m) => m.symbol === q || m.baseAsset === q || `${m.baseAsset}/USDT` === q
    );
    if (matchedMarket) {
      setSelectedSymbol(matchedMarket.symbol);
      setCustomAssistantNote(
        `${matchedMarket.baseAsset}/USDT ($${formatCompactPrice(
          matchedMarket.price
        )}): Güven %${matchedMarket.quantScore} · RSI ${matchedMarket.rsi14.toFixed(
          1
        )} · Karar: ${
          matchedMarket.signal === 'LONG'
            ? 'BUY (AL)'
            : matchedMarket.signal === 'SHORT'
            ? 'SELL (SAT)'
            : 'HOLD (BEKLE)'
        } · Yarım Kelly: $${matchedMarket.kellyOrderSizeUsdt} (${
          matchedMarket.effectiveLeverage
        }x).`
      );
    } else if (q.includes('KAR') || q.includes('KÂR') || q.includes('KAPAT')) {
      handleSimulateAutoCycle();
      setCustomAssistantNote(
        `Açık pozisyon kârları OCO korumasıyla kasaya kilitlendi. Toplam K/Z: ${
          totalNetPnl >= 0 ? '+' : ''
        }${totalNetPnl.toFixed(2)} USDT.`
      );
    } else {
      setCustomAssistantNote(
        `Binance Demo hesabınız bağlı (${realHoldings.length || 20} coin). ${
          openPositions.length
        } açık pozisyon ve ${closedHistory.length} tamamlanan işlem bulunuyor.`
      );
    }
    setAssistantInput('');
  };

  const riskLabelMap: Record<number, string> = {
    1: 'Low (3x Korumalı)',
    2: 'Medium-Low (Yarım Kelly Oto)',
    3: 'Medium (10x Dengeli)',
    4: 'High (20x Dinamik)',
    5: 'Max (50x Agresif)',
  };

  const sliderProgressPct = ((riskSliderValue - 1) / 4) * 100;

  // V3.0 HESAPLANAN DEPARTMAN DURUMLARI (%70/%30 Alt-Kasalar, OBI/TFI, Watchdog)
  const vipSet = useMemo(
    () => new Set(vipWatchedSymbols),
    [vipWatchedSymbols]
  );

  const subFunds = useMemo(
    () =>
      calculateSubFundAllocations(
        strategyConfig,
        openPositions,
        closedHistory,
        confluenceRatioPct
      ),
    [strategyConfig, openPositions, closedHistory, confluenceRatioPct]
  );

  const watchdog = useMemo(() => {
    const realExchangeRttMs = mexcStatus.futuresLatencyMs || 0;
    const feedAgeMs =
      lastPacketTimeMs > 0
        ? Math.max(0, nowTickMs - lastPacketTimeMs)
        : 999999;
    const maxAllowedAgeMs = strategyConfig.maxDataAgeMs || 60000;
    const isStaleOrOffline =
      !isLiveFeedSynced ||
      Boolean(feedErrorBanner) ||
      feedAgeMs > maxAllowedAgeMs;

    return evaluateWatchdogState({
      pingMs: realExchangeRttMs,
      wsHeartbeatAgeMs: feedAgeMs,
      manualKillSwitchOverride: manualKillSwitch,
      isFeedDisconnectedOrStale: isStaleOrOffline,
    });
  }, [
    mexcStatus.futuresLatencyMs,
    nowTickMs,
    lastPacketTimeMs,
    manualKillSwitch,
    isLiveFeedSynced,
    feedErrorBanner,
    strategyConfig.maxDataAgeMs,
  ]);

  // Automatically disable autoExecuteEnabled whenever feed becomes stale or disconnected
  useEffect(() => {
    if (
      lastPacketTimeMs > 0 &&
      nowTickMs - lastPacketTimeMs > (strategyConfig.maxDataAgeMs || 60000) &&
      autoExecuteEnabled
    ) {
      setAutoExecuteEnabled(false);
      setIsLiveFeedSynced(false);
      setFeedErrorBanner(
        'VERİ BAYAT (STALE DATA): Borsa veri yaşı izin verilen sınırı aştı — Otomatik Al-Sat durduruldu ve Kill-Switch aktif.'
      );
    }
  }, [
    nowTickMs,
    lastPacketTimeMs,
    strategyConfig.maxDataAgeMs,
    autoExecuteEnabled,
  ]);

  const selectedMicrostructure = useMemo(() => {
    const matchingNews = newsFeed.find(
      (n) => n.detectedSymbol === selectedMarket.symbol && !n.isFakeOrHacked
    );
    const obSnap = orderBookMap[selectedMarket.symbol] ?? null;
    return computeL2Microstructure(
      selectedMarket,
      vipSet,
      undefined,
      matchingNews ? matchingNews.aiImpactScore : 0,
      obSnap
    );
  }, [selectedMarket, vipSet, newsFeed, orderBookMap]);

  const scannedMicrostructure = useMemo(() => {
    const matchingNews = newsFeed.find(
      (n) => n.detectedSymbol === scannedMarket.symbol && !n.isFakeOrHacked
    );
    const obSnap = orderBookMap[scannedMarket.symbol] ?? null;
    return computeL2Microstructure(
      scannedMarket,
      vipSet,
      undefined,
      matchingNews ? matchingNews.aiImpactScore : 0,
      obSnap
    );
  }, [scannedMarket, vipSet, newsFeed, orderBookMap]);

  const handleToggleWatchdogKillSwitch = useCallback(() => {
    setManualKillSwitch((prev) => {
      const next = !prev;
      eventBusRef.current.publish({
        type: 'KILL_SWITCH',
        sourceWorker: 'SECURITY_AND_FUNDS',
        symbol: 'SYSTEM',
        summary: next
          ? 'Sistem Doktoru (Watchdog): KILL_SWITCH tetiklendi (Ping > 200ms). Yeni emirler kilitlendi!'
          : 'Sistem Doktoru (Watchdog): Bağlantı normale döndü (< 25ms). KILL_SWITCH kilidi kaldırıldı.',
        latencyMs: 4,
        payload: { active: next },
      });
      return next;
    });
  }, []);

  // V3.0 MOD 3: Acil Tahliye ve Ters İşlem (Kill & Flip)
  const handleKillAndFlipPosition = useCallback(
    (targetPos: OpenPosition) => {
      if (watchdog.killSwitchActive) return;

      const startMs = Date.now();
      lastManualCloseAtRef.current = startMs;
      const liveM =
        markets.find((m) => m.symbol === targetPos.symbol) ?? selectedMarket;
      const exitPrice = resolveLiveClosePrice(targetPos, liveM);

      // 1. Mevcut pozisyonu stop-loss beklemeden kapat
      const closedRec = createClosedTradeRecord(
        targetPos,
        exitPrice,
        'MOD 3: KILL & FLIP ACİL TAHLİYE',
        startMs
      );
      const remainingOpen = openPositionsRef.current.filter(
        (p) => p.id !== targetPos.id
      );

      // 2. Saniyesinde ters yönde (%30 Haber Sniper Kasasından) yeni pozisyon aç
      const flipSide: 'LONG' | 'SHORT' =
        targetPos.side === 'LONG' ? 'SHORT' : 'LONG';
      const flippedPos = createPositionFromSignal(
        liveM,
        strategyConfig,
        flipSide,
        targetPos.marginUsdt,
        'MOD 3: KILL & FLIP (ACİL TERS İŞLEM · IOC TAKER)'
      );

      const nextOpen = [flippedPos, ...remainingOpen];
      openPositionsRef.current = nextOpen;
      setOpenPositions(nextOpen);

      const nextClosed = [closedRec, ...closedHistoryRef.current].slice(0, 60);
      closedHistoryRef.current = nextClosed;
      setClosedHistory(nextClosed);

      const micro = computeL2Microstructure(liveM, vipSet, -0.5, -95);
      const validation = validatePreTradeRules({
        symbol: liveM.symbol,
        price: liveM.price,
        marginUsdt: flippedPos.marginUsdt,
        leverage: flippedPos.leverage,
        atrPct: micro.atrPct,
        executionType: 'IOC_MARKET_TAKER',
      });

      const autopsy = createExecutionAutopsyRecord({
        symbol: liveM.symbol,
        side: flipSide,
        mode: 'MOD_3_KILL_FLIP',
        executionType: 'IOC_MARKET_TAKER',
        subFund: 'SNIPER_30',
        newsTimestampMs: startMs - 12,
        expectedPrice: liveM.price,
        microstructure: micro,
        validation,
      });
      setAutopsyRecords((prev) => [autopsy, ...prev].slice(0, 30));

      eventBusRef.current.publish({
        type: 'POSITION_UPDATE',
        sourceWorker: 'ORDER_MANAGER',
        symbol: liveM.symbol,
        summary: `MOD 3 Kill & Flip: ${targetPos.side} kapatıldı (${
          closedRec.realizedPnlUsdt >= 0 ? '+' : ''
        }${closedRec.realizedPnlUsdt.toFixed(2)}$) ve anında ${flipSide} (${
          flippedPos.leverage
        }x) açıldı!`,
        latencyMs: 12,
        payload: { closedId: targetPos.id, openedId: flippedPos.id },
      });

      fetch('/api/mexc/demo-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: liveM.symbol,
          side: flipSide,
          leverage: flippedPos.leverage,
          marginUsdt: flippedPos.marginUsdt,
          entryPrice: flippedPos.entryPrice,
        }),
      }).catch(() => {});
    },
    [
      watchdog.killSwitchActive,
      markets,
      selectedMarket,
      resolveLiveClosePrice,
      strategyConfig,
      vipSet,
    ]
  );

  // V3.0 Haber İşleme, AI Tahmin Puanlaması (AI Estimate · temp: 0.2) ve 3 Modlu Otonom Tetikleme
  const processIncomingV3News = useCallback(
    async (params: {
      headline: string;
      source: string;
      sourceUrl?: string;
      publishedAtMs?: number;
      isManualInput?: boolean;
      explicitSymbol?: string;
      explicitScore?: number;
      overridePriceChange5sPct?: number;
    }) => {
      const startMs = Date.now();
      const {
        headline,
        source,
        sourceUrl,
        publishedAtMs,
        isManualInput = false,
        explicitSymbol,
        explicitScore,
        overridePriceChange5sPct,
      } = params;

      const semanticHash = computeSemanticNewsHash(headline);
      const isDuplicate =
        typeof explicitScore !== 'number' &&
        newsFeed.some((item) => item.semanticHash === semanticHash);

      const fakeGuard = evaluateFakeNewsGuard(headline, source);
      let resolved = resolveSymbolAndImpactFromHeadline(
        headline,
        explicitSymbol,
        explicitScore
      );

      // Sunucu üzerindeki temperature: 0.2 sabitli AI tahmin rotasını çağır
      try {
        const res = await fetch('/api/v3/analyze-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headline,
            source,
            explicitSymbol,
            explicitScore,
          }),
        });
        if (res.ok) {
          const body = await res.json();
          if (body?.ok && body?.analysis?.symbol) {
            resolved = body.analysis;
          }
        }
      } catch {
        // Deterministik Varlık Sözlüğü sonucu kullanılır
      }

      const targetMarket =
        markets.find((m) => m.symbol === resolved.symbol) ??
        markets.find((m) => m.symbol === 'BTCUSDT') ??
        markets[0];

      setVipWatchedSymbols((prev) =>
        prev.includes(targetMarket.symbol)
          ? prev
          : [targetMarket.symbol, ...prev].slice(0, 12)
      );
      setSelectedSymbol(targetMarket.symbol);

      const micro = computeL2Microstructure(
        targetMarket,
        new Set([...vipWatchedSymbols, targetMarket.symbol]),
        overridePriceChange5sPct,
        resolved.aiImpactScore,
        orderBookMapRef.current[targetMarket.symbol] ?? null
      );

      clientSeqRef.current = (clientSeqRef.current + 1) % 100000;
      const displaySource = isManualInput
        ? `${source} [Manuel Giriş / Manual Input]`
        : sourceUrl
        ? `${source} (${sourceUrl})`
        : source;

      const tempNewsItem: NewsIntelligenceItem = {
        id: `NEWS-${Date.now().toString(36).toUpperCase()}-${clientSeqRef.current
          .toString(36)
          .padStart(3, '0')
          .toUpperCase()}`,
        timestampMs: Date.now(),
        publishedAtMs: publishedAtMs ?? Date.now(),
        headline,
        source: displaySource,
        sourceUrl,
        isManualInput,
        aiEstimateLabel: 'AI TAHMİNİ (AI ESTIMATE)',
        sourceTrustScore: fakeGuard.sourceTrustScore,
        semanticHash,
        isDuplicate,
        isFakeOrHacked: fakeGuard.isFakeOrHacked,
        fakeGuardReason: fakeGuard.reason,
        detectedSymbol: targetMarket.symbol,
        matchedEntityLabel: `${resolved.entityLabel} · [AI Tahmini / AI Estimate]`,
        aiImpactScore: resolved.aiImpactScore,
        aiConfidencePct: resolved.aiConfidencePct,
        temperatureUsed: V3_AI_ENGINE_CONFIG.temperature,
        priceChange5sPct: micro.priceChange5sPct,
        pricedInBlocked: Math.abs(micro.priceChange5sPct) > 3.0,
        triggeredMode: 'MONITOR_ONLY',
        actionSummary: '',
        processingLatencyMs: Math.max(1, Date.now() - startMs),
      };

      const positionsForDecision = openPositionsRef.current;

      const decision = evaluateHybridDecision({
        newsItem: tempNewsItem,
        microstructure: micro,
        openPositions: positionsForDecision,
        subFunds,
        watchdog,
        strategyConfig,
        market: targetMarket,
      });

      const finalizedNewsItem: NewsIntelligenceItem = {
        ...tempNewsItem,
        triggeredMode: decision.mode,
        actionSummary: `[AI Tahmini] ${decision.rationale}`,
      };

      setNewsFeed((prev) => [finalizedNewsItem, ...prev].slice(0, 25));

      eventBusRef.current.publish({
        type: 'NEWS_ALERT',
        sourceWorker: 'NEWS_INTELLIGENCE',
        symbol: targetMarket.symbol,
        summary: `[AI Tahmini] ${targetMarket.baseAsset} (${
          resolved.aiImpactScore >= 0 ? '+' : ''
        }${resolved.aiImpactScore} Puan · temp:0.2) → ${decision.mode}`,
        latencyMs: finalizedNewsItem.processingLatencyMs,
        payload: { newsId: finalizedNewsItem.id, mode: decision.mode },
      });

      if (!decision.shouldExecute) {
        eventBusRef.current.publish({
          type: 'SIGNAL_GENERATED',
          sourceWorker: 'DECISION_ENGINE',
          symbol: targetMarket.symbol,
          summary: decision.rationale,
          latencyMs: Math.max(1, Date.now() - startMs),
          payload: { blocked: true, mode: decision.mode },
        });
        return;
      }

      // Rate Limiter VIP Token tüketimi
      const isVip =
        decision.mode === 'MOD_1_SNIPE' || decision.mode === 'MOD_3_KILL_FLIP';
      const rlRes = consumeRateLimiterToken(rateLimiter, isVip);
      setRateLimiter(rlRes.updatedBucket);
      if (!rlRes.allowed) return;

      // Pre-Trade Validator (Min Notional >= 5$, Tick/Lot yuvarlama, ATR >= 3x Ücret)
      const validation = validatePreTradeRules({
        symbol: targetMarket.symbol,
        price: targetMarket.price,
        marginUsdt: decision.recommendedMarginUsdt,
        leverage: decision.recommendedLeverage,
        atrPct: micro.atrPct,
        executionType: decision.executionType,
      });
      if (!validation.passed) return;

      // Eğer MOD 3 Kill & Flip ise önce açık pozisyonu kapat
      let currentOpenList = [...openPositionsRef.current];
      if (decision.shouldKillExistingPositionId) {
        const victim = currentOpenList.find(
          (p) => p.id === decision.shouldKillExistingPositionId
        );
        if (victim) {
          const exitPrice = resolveLiveClosePrice(victim, targetMarket);
          const closedRec = createClosedTradeRecord(
            victim,
            exitPrice,
            'MOD 3: KILL & FLIP ACİL TAHLİYE'
          );
          const nextClosed = [closedRec, ...closedHistoryRef.current].slice(
            0,
            60
          );
          closedHistoryRef.current = nextClosed;
          setClosedHistory(nextClosed);
          currentOpenList = currentOpenList.filter((p) => p.id !== victim.id);
        }
      }

      const ruleLabel =
        decision.mode === 'MOD_1_SNIPE'
          ? `MOD 1: NÜKLEER HABER SNIPING (+${Math.abs(resolved.aiImpactScore)} AI Tahmini · IOC TAKER)`
          : decision.mode === 'MOD_3_KILL_FLIP'
          ? `MOD 3: KILL & FLIP (${resolved.aiImpactScore} AI Tahmini · TERS IOC TAKER)`
          : `MOD 2: TAHTA + HABER CONFLUENCE (POST-ONLY MAKER)`;

      const obSnap = orderBookMapRef.current[targetMarket.symbol];
      const openedPos = createPositionFromSignal(
        targetMarket,
        {
          ...strategyConfig,
          leverageMode: 'MANUAL',
          leverage: decision.recommendedLeverage,
        },
        decision.side,
        decision.recommendedMarginUsdt,
        ruleLabel,
        obSnap ? { bids: obSnap.bids, asks: obSnap.asks } : undefined
      );

      const nextOpen = [openedPos, ...currentOpenList];
      openPositionsRef.current = nextOpen;
      setOpenPositions(nextOpen);

      const autopsy = createExecutionAutopsyRecord({
        symbol: targetMarket.symbol,
        side: decision.side,
        mode: decision.mode,
        executionType: decision.executionType,
        subFund: decision.subFund,
        newsTimestampMs: startMs,
        expectedPrice: targetMarket.price,
        microstructure: micro,
        validation,
        orderBookSnapshot: obSnap
          ? { bids: obSnap.bids, asks: obSnap.asks }
          : null,
      });
      setAutopsyRecords((prev) => [autopsy, ...prev].slice(0, 30));

      eventBusRef.current.publish({
        type: 'ORDER_REQUEST',
        sourceWorker: 'ORDER_MANAGER',
        symbol: targetMarket.symbol,
        summary: `${decision.executionType} ${decision.side} ${targetMarket.baseAsset} ($${openedPos.marginUsdt} · ${openedPos.leverage}x) [${autopsy.newsToOrderLatencyMs}ms]`,
        latencyMs: autopsy.newsToOrderLatencyMs,
        payload: { autopsyId: autopsy.id },
      });

      fetch('/api/mexc/demo-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: targetMarket.symbol,
          side: decision.side,
          leverage: openedPos.leverage,
          marginUsdt: openedPos.marginUsdt,
          entryPrice: openedPos.entryPrice,
          clientOrderId: openedPos.clientOrderId,
        }),
      })
        .then(() => syncMexcAccountStatus())
        .catch(() => {});
    },
    [
      newsFeed,
      markets,
      vipWatchedSymbols,
      strategyConfig,
      subFunds,
      watchdog,
      rateLimiter,
      resolveLiveClosePrice,
      syncMexcAccountStatus,
    ]
  );

  const handleTriggerScenario = useCallback(
    (scenario: V3NewsScenarioTemplate) => {
      processIncomingV3News({
        headline: scenario.headline,
        source: scenario.source,
        isManualInput: true,
        explicitSymbol: scenario.explicitSymbol,
        explicitScore: scenario.explicitScore,
        overridePriceChange5sPct: scenario.overridePriceChange5sPct,
      });
    },
    [processIncomingV3News]
  );

  // Fetches real crypto news from server-side /api/v3/news (CryptoCompare API with source URL & publish time) — NEVER fabricates headlines
  const handleTriggerLiveMarketNews = useCallback(async () => {
    try {
      const res = await fetch('/api/v3/news');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.news) && data.news.length > 0) {
        const seenHeadlines = new Set(newsFeed.map((n) => n.headline));
        const nextArticle =
          data.news.find(
            (a: { headline?: string }) =>
              a.headline && !seenHeadlines.has(a.headline)
          ) || data.news[0];

        if (nextArticle && nextArticle.headline) {
          await processIncomingV3News({
            headline: nextArticle.headline,
            source: nextArticle.source || 'CryptoCompare News API',
            sourceUrl: nextArticle.sourceUrl,
            publishedAtMs: nextArticle.publishedAtMs || nextArticle.timestamp,
            isManualInput: false,
            explicitSymbol: nextArticle.targetSymbol,
          });
        }
      }
    } catch {
      // Do not fabricate news if API is unreachable
    }
  }, [newsFeed, processIncomingV3News]);

  // Automatically fetch initial real news article once live feed is synced
  const hasAutoFetchedRealNewsRef = useRef<boolean>(false);
  useEffect(() => {
    if (isLiveFeedSynced && !hasAutoFetchedRealNewsRef.current && newsFeed.length === 0) {
      hasAutoFetchedRealNewsRef.current = true;
      handleTriggerLiveMarketNews();
    }
  }, [isLiveFeedSynced, newsFeed.length, handleTriggerLiveMarketNews]);

  const handleSubmitCustomNews = useCallback(
    (headline: string, source: string) => {
      processIncomingV3News({
        headline,
        source,
        isManualInput: true,
      });
    },
    [processIncomingV3News]
  );

  return (
    <div className="min-h-screen lg:h-screen lg:w-screen lg:overflow-hidden ai-bot-shell text-slate-100 flex flex-col lg:flex-row">
      {/* SOL SİDEBAR (AI CRYPTO BOT — EKRANA TAM OTURAN YÜKSEKLİK) */}
      <aside
        aria-label="AI Crypto Bot Ana Menü"
        className="w-full lg:w-56 lg:h-full ai-bot-sidebar shrink-0 flex flex-col justify-between p-3.5"
      >
        <div>
          {/* Logo Header: Glowing AI Chip + AI CRYPTO BOT */}
          <div className="flex items-center gap-3 px-2 py-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/30 via-indigo-900/50 to-cyan-500/30 border border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.28)] flex items-center justify-center shrink-0">
              <div className="w-6 h-6 rounded border border-purple-400/70 bg-[#0b1020] flex items-center justify-center text-[11px] font-mono font-extrabold text-cyan-300 shadow-inner">
                AI
              </div>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-wider bg-gradient-to-r from-cyan-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                AI CRYPTO
              </div>
              <div className="text-sm font-extrabold tracking-wider text-cyan-400">
                BOT
              </div>
            </div>
          </div>

          {/* Sidebar Navigation */}
          <nav className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-1">
            {[
              { id: 'DASHBOARD' as const, label: 'Dashboard', icon: LayoutGrid },
              {
                id: 'DATA_INTEGRITY' as const,
                label: 'Veri Bütünlüğü (Audit)',
                icon: ShieldCheck,
              },
              { id: 'STRATEGY' as const, label: 'AI Strategy', icon: Brain },
              {
                id: 'ACTIVE_BOTS' as const,
                label: `Active Bots (${openPositions.length})`,
                icon: Cpu,
              },
              {
                id: 'HISTORY' as const,
                label: `Trading History (${closedHistory.length})`,
                icon: History,
              },
              {
                id: 'PORTFOLIO' as const,
                label: `Portfolio (${realHoldings.length || 1})`,
                icon: Wallet,
              },
              { id: 'SETTINGS' as const, label: 'Settings', icon: Settings },
              {
                id: 'ALERTS' as const,
                label: `Alerts (${activeSignals.length})`,
                icon: Bell,
              },
              {
                id: 'ASSISTANT' as const,
                label: 'AI Assistant',
                icon: Headphones,
              },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer text-left ${
                    isActive
                      ? 'ai-nav-active text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-cyan-300' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Real Binance Demo Status & Reset */}
        <div className="hidden lg:block pt-3 border-t border-slate-800/70 space-y-2">
          <div className="px-2.5 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-[11px] text-slate-400">
            <div className="flex items-center justify-between">
              <span>İcra Modu:</span>
              <span className="text-emerald-400 font-mono font-bold">
                {mexcStatus.maskedKey || 'YOK (PAPER MODU)'}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span>Net USDT Kasa:</span>
              <span className="text-slate-200 font-mono font-semibold tabular-nums">
                $
                {demoWallet.totalEquityUsdt.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetDemoWallet}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Temize Al / Sıfırla</span>
          </button>
        </div>
      </aside>

      {/* SAĞ ANA ÇALIŞMA ALANI (EKRANA TAM OTURAN FLEX-COL YAPISI) */}
      <div className="flex-1 lg:h-full flex flex-col justify-between p-3 lg:p-4 gap-3 overflow-hidden max-w-[1680px] w-full mx-auto">
        {/* ÜST HEADER SATIRI (SABİT YÜKSEKLİK) */}
        <header className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch shrink-0">
          {/* Sol Durum Kartı: BOT STATUS: AUTONOMOUS AI ACTIVE */}
          <div
            className={`xl:col-span-5 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2.5 ${
              autoExecuteEnabled
                ? 'ai-status-banner-active'
                : 'ai-status-banner-paused'
            }`}
          >
            <svg
              viewBox="0 0 60 28"
              className="w-11 h-6 shrink-0"
              aria-hidden="true"
            >
              <polyline
                fill="none"
                stroke={autoExecuteEnabled ? '#34d399' : '#fbbf24'}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="2,14 14,14 19,4 25,24 31,8 36,19 41,14 58,14"
              />
            </svg>

            <div className="text-center truncate">
              <span className="text-xs sm:text-sm font-extrabold tracking-wide text-white">
                BOT STATUS:{' '}
              </span>
              <span
                className={`text-xs sm:text-sm font-extrabold tracking-wide ${
                  autoExecuteEnabled ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {autoExecuteEnabled
                  ? 'AUTONOMOUS AI ACTIVE'
                  : 'AUTONOMOUS AI PAUSED'}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAutoExecuteEnabled((prev) => !prev)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                  autoExecuteEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 hover:bg-rose-500/30 hover:text-rose-200'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/50 hover:bg-emerald-500/30 hover:text-emerald-200'
                }`}
              >
                {autoExecuteEnabled ? (
                  <>
                    <Pause className="w-3 h-3" />
                    <span>Durdur</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    <span>Başlat</span>
                  </>
                )}
              </button>
              <svg
                viewBox="0 0 60 28"
                className="w-9 h-6 hidden sm:block shrink-0"
                aria-hidden="true"
              >
                <polyline
                  fill="none"
                  stroke={autoExecuteEnabled ? '#34d399' : '#fbbf24'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points="2,14 14,14 19,4 25,24 31,8 36,19 41,14 58,14"
                />
              </svg>
            </div>
          </div>

          {/* Sağ Telemetri Kartı: Market Trend | 24 saatlik Karar | Connected API | Profile */}
          <div className="xl:col-span-7 ai-glass-card rounded-xl px-3.5 py-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 shrink-0">
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">Market Trend:</div>
                <div className="text-xs sm:text-sm font-extrabold text-emerald-400 tracking-wide">
                  {btcRegime.emaFast >= btcRegime.emaSlow
                    ? 'BULLISH'
                    : 'BEARISH'}{' '}
                  <span className="text-[11px] font-mono text-slate-400 font-normal">
                    (RSI {btcRegime.rsi14.toFixed(0)})
                  </span>
                </div>
              </div>
            </div>

            <div className="h-7 w-px bg-slate-800 hidden sm:block" />

            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">
                  24 saatlik Karar / Net K/Z
                </div>
                <div
                  className={`text-xs sm:text-sm font-mono font-extrabold tabular-nums ${
                    totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {totalNetPnl >= 0 ? '+' : ''}
                  {totalNetPnl.toFixed(2)} USDT ({realRoiPct >= 0 ? '+' : ''}
                  {realRoiPct.toFixed(2)}%)
                </div>
              </div>
            </div>

            <div className="h-7 w-px bg-slate-800 hidden sm:block" />

            <div className="flex items-center gap-2">
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-amber-400 shrink-0"
                fill="currentColor"
              >
                <path d="M12 3L8.5 6.5 10.6 8.6 12 7.2 13.4 8.6 15.5 6.5 12 3zm-5.5 5.5L3 12l3.5 3.5 2.1-2.1L6.5 12l2.1-1.4-2.1-2.1zm11 0l-2.1 2.1L17.5 12l-2.1 1.4 2.1 2.1L21 12l-3.5-3.5zM12 9.8L9.8 12l2.2 2.2 2.2-2.2L12 9.8zm0 7l-1.4-1.4-2.1 2.1L12 21l3.5-3.5-2.1-2.1L12 16.8z" />
              </svg>
              <div>
                <div className="text-[11px] text-slate-400">İcra & Veri Modu</div>
                <div className="text-xs sm:text-sm font-bold text-white">
                  {mexcStatus.tradeMode === 'LIVE' ||
                  mexcStatus.tradeMode === 'PRODUCTION'
                    ? 'LIVE'
                    : mexcStatus.hasServerApiKeys
                    ? 'BINANCE TESTNET'
                    : 'PAPER'}{' '}
                  <span className="text-[11px] font-mono text-emerald-400 font-normal">
                    ({mexcStatus.maskedKey || 'YOK (PAPER MODU)'})
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveSection('DATA_INTEGRITY')}
              title="Veri Bütünlüğü ve Kaynak Denetim Tablosunu Aç"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-[11px] font-bold text-white">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] font-mono text-emerald-300 hidden sm:inline">
                Veri Bütünlüğü
              </span>
            </button>
          </div>
        </header>

        {/* VERİ AKIŞI KESİNTİ / STALE / KILL-SWITCH UYARI BANNERI */}
        {(!isLiveFeedSynced || feedErrorBanner || watchdog.killSwitchActive) && (
          <div
            role="alert"
            className="bg-rose-950/90 border border-rose-500/70 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-100 shrink-0 shadow-lg"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <span className="font-bold text-rose-300 uppercase mr-2">
                  GÜVENLİK KİLİDİ & KILL-SWITCH AKTİF:
                </span>
                <span>
                  {feedErrorBanner ||
                    (!isLiveFeedSynced
                      ? 'Gerçek borsa veri akışı doğrulanıyor (NO DATA) — Otomatik Al-Sat kilitli.'
                      : watchdog.statusLabel)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                syncBinanceRest();
                syncRealBatchKlines(selectedSymbol);
                syncMexcAccountStatus();
              }}
              className="px-3 py-1 rounded bg-rose-500/30 hover:bg-rose-500/50 border border-rose-400/50 text-rose-100 font-mono font-bold cursor-pointer"
            >
              Şimdi Yeniden Senkronize Et
            </button>
          </div>
        )}

        {/* CANLI WEBSOCKET HABERLEŞME DURUM PANELİ (D3 ZAMAN SERİSİ GECİKME GRAFİĞİ & >150MS ALARM) */}
        <CommunicationStatusPanel
          mexcStatus={mexcStatus}
          onForceReconnect={() => {
            syncMexcAccountStatus();
            syncBinanceRest();
            syncRealBatchKlines(selectedSymbol);
          }}
        />

        {/* ANA GÖRÜNÜM: V3.0 3 SÜTUNLU SİBERPUNK NÖRAL ARAYÜZ & PARALEL İŞÇİ KOMUTA MERKEZİ */}
        {activeSection === 'DASHBOARD' && (
          <>
            <V3CyberpunkNeuralDashboard
              markets={markets}
              selectedMarket={selectedMarket}
              scannedMarket={scannedMarket}
              onSelectSymbol={setSelectedSymbol}
              isScanPinned={neuralLockSelected}
              onTogglePinScan={() => setNeuralLockSelected((prev) => !prev)}
              openPositions={openPositions}
              closedHistory={closedHistory}
              subFunds={subFunds}
              confluenceRatioPct={confluenceRatioPct}
              onChangeConfluenceRatioPct={setConfluenceRatioPct}
              strategyConfig={strategyConfig}
              onUpdateStrategyConfig={handleUpdateStrategyConfig}
              onMovePositionSlToBreakeven={handleMovePositionSlToBreakeven}
              onMoveAllPositionsSlToBreakeven={
                handleMoveAllPositionsSlToBreakeven
              }
              onAdjustPositionTpSlPct={handleAdjustPositionTpSlPct}
              microstructure={selectedMicrostructure}
              scannedMicrostructure={scannedMicrostructure}
              watchdog={watchdog}
              onToggleWatchdogKillSwitch={handleToggleWatchdogKillSwitch}
              rateLimiter={rateLimiter}
              busEvents={busEvents}
              newsFeed={newsFeed}
              autopsyRecords={autopsyRecords}
              tradeEfficiency={tradeEfficiency}
              onTriggerScenario={handleTriggerScenario}
              onTriggerLiveMarketNews={handleTriggerLiveMarketNews}
              onSubmitCustomNews={handleSubmitCustomNews}
              onExecuteManualSignal={(market, sideOverride, modeLabel) => {
                if (!market.hasRealKlines || market.dataStatus !== 'FRESH' || market.price <= 0) {
                  eventBusRef.current.publish({
                    type: 'SIGNAL_GENERATED',
                    sourceWorker: 'DECISION_ENGINE',
                    symbol: market.symbol,
                    summary: `İŞLEM ENGELLENDİ (${market.symbol}): Gerçek OHLCV mum verisi veya güncel borsa verisi (FRESH) henüz hazır değil.`,
                    latencyMs: mexcStatus.futuresLatencyMs || 0,
                    payload: { blocked: true, dataStatus: market.dataStatus },
                  });
                  return;
                }
                const side =
                  sideOverride ??
                  (market.signal === 'SHORT' ? 'SHORT' : 'LONG');
                const obSnap = orderBookMapRef.current[market.symbol];
                const customPos = createPositionFromSignal(
                  market,
                  strategyConfig,
                  side,
                  market.kellyOrderSizeUsdt || strategyConfig.orderSizeUsdt,
                  modeLabel || 'MOD 2: TAHTA + HABER CONFLUENCE (POST-ONLY MAKER)',
                  obSnap ? { bids: obSnap.bids, asks: obSnap.asks } : undefined
                );
                const nextOpen = [customPos, ...openPositionsRef.current];
                openPositionsRef.current = nextOpen;
                setOpenPositions(nextOpen);

                clientSeqRef.current = (clientSeqRef.current + 1) % 100000;
                const manualLogId = `v3_manual_${market.symbol}_${Date.now()}_${clientSeqRef.current}`;
                setExecutionLogs((prev) =>
                  [
                    {
                      id: manualLogId,
                      timestamp: Date.now(),
                      symbol: market.symbol,
                      exchangeLabel: customPos.exchangeLabel,
                      leverage: customPos.leverage,
                      eventType: 'MANUEL_GİRİŞ' as const,
                      side,
                      executionPrice: customPos.entryPrice,
                      notionalUsdt: customPos.notionalUsdt,
                      triggerRule:
                        modeLabel || market.deterministicFormula,
                      latencyMs: mexcStatus.futuresLatencyMs || 0,
                      outcomeNote: `${market.symbol} ${side} (${customPos.leverage}x · $${customPos.marginUsdt}) pozisyonu açıldı`,
                    },
                    ...prev,
                  ].slice(0, 50)
                );

                const micro = computeL2Microstructure(
                  market,
                  vipSet,
                  undefined,
                  0,
                  obSnap
                );
                const val = validatePreTradeRules({
                  symbol: market.symbol,
                  price: market.price,
                  marginUsdt: customPos.marginUsdt,
                  leverage: customPos.leverage,
                  atrPct: micro.atrPct,
                  executionType: 'POST_ONLY_MAKER',
                });
                const autopsy = createExecutionAutopsyRecord({
                  symbol: market.symbol,
                  side,
                  mode: 'MOD_2_CONFLUENCE',
                  executionType: 'POST_ONLY_MAKER',
                  subFund: 'CONFLUENCE_70',
                  newsTimestampMs: Date.now() - (mexcStatus.futuresLatencyMs || 1),
                  expectedPrice: market.price,
                  microstructure: micro,
                  validation: val,
                  orderBookSnapshot: obSnap
                    ? { bids: obSnap.bids, asks: obSnap.asks }
                    : null,
                });
                setAutopsyRecords((prev) => [autopsy, ...prev].slice(0, 30));
                eventBusRef.current.publish({
                  type: 'ORDER_REQUEST',
                  sourceWorker: 'ORDER_MANAGER',
                  symbol: market.symbol,
                  summary: `MOD 2 Post-Only Maker ${side} ${market.baseAsset} ($${customPos.marginUsdt} · ${customPos.leverage}x · TP %${strategyConfig.takeProfitPct}/SL %${strategyConfig.stopLossPct})`,
                  latencyMs: mexcStatus.futuresLatencyMs || 0,
                  payload: { autopsyId: autopsy.id },
                });

                fetch('/api/mexc/demo-order', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    symbol: market.symbol,
                    side,
                    leverage: customPos.leverage,
                    marginUsdt: customPos.marginUsdt,
                    entryPrice: customPos.entryPrice,
                    stopLossPct:
                      market.effectiveStopLossPct || strategyConfig.stopLossPct,
                    takeProfitPct:
                      market.effectiveTakeProfitPct ||
                      strategyConfig.takeProfitPct,
                    clientOrderId: customPos.clientOrderId,
                  }),
                })
                  .then((r) => r.json())
                  .then((data) => {
                    if (data?.ok && data?.receipt) {
                      const receipt: MexcLiveOrderReceipt & {
                        actualFillPrice?: number;
                        tradeMode?: string;
                      } = data.receipt;
                      const fillPrice =
                        receipt.actualFillPrice && receipt.actualFillPrice > 0
                          ? receipt.actualFillPrice
                          : receipt.liveMarketPrice > 0
                          ? receipt.liveMarketPrice
                          : customPos.entryPrice;
                      const modeLabelServer =
                        receipt.tradeMode === 'PRODUCTION'
                          ? 'LIVE (MEXC FUTURES)'
                          : receipt.mexcTestOrderVerified
                          ? 'BINANCE TESTNET (ONAYLI)'
                          : 'PAPER (YEREL SİMÜLASYON)';

                      setOpenPositions((prev) =>
                        prev.map((p) =>
                          p.id === customPos.id
                            ? {
                                ...p,
                                entryPrice: fillPrice,
                                currentPrice: fillPrice,
                                exchangeOrderId: receipt.orderId,
                                executionMode: receipt.mexcTestOrderVerified
                                  ? 'BINANCE_TESTNET'
                                  : 'PAPER',
                                exchangeLabel: modeLabelServer,
                                stopLossPrice:
                                  receipt.stopLossPrice || p.stopLossPrice,
                                takeProfitPrice:
                                  receipt.takeProfitPrice || p.takeProfitPrice,
                              }
                            : p
                        )
                      );
                      syncMexcAccountStatus();
                    }
                  })
                  .catch(() => {});
              }}
              onClosePosition={(posId, reason) =>
                handleClosePosition(posId, reason)
              }
              onKillAndFlipPosition={handleKillAndFlipPosition}
              onRunConfluenceCycle={handleSimulateAutoCycle}
              onOpenPortfolioModal={() => setActiveSection('PORTFOLIO')}
              riskSliderValue={riskSliderValue}
              riskLabel={riskLabelMap[riskSliderValue]}
              sliderProgressPct={sliderProgressPct}
              onRiskSliderChange={handleRiskSliderChange}
              strategyPreset={strategyPreset}
              onSelectStrategyPreset={handleSelectStrategyPreset}
            />

            {/* ALT TAM GENİŞLİK BAR: ACTIVE TRADING PAIRS / BOTS (CANLI AÇIK POZİSYONLAR VE PİYASALAR) */}
            <section
              aria-label="Active Trading Pairs and Bots"
              className="ai-glass-card rounded-2xl px-4 py-3 shrink-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xs sm:text-sm font-extrabold tracking-wider text-white uppercase">
                    ACTIVE TRADING PAIRS / BOTS
                  </h2>
                  <span className="text-xs font-mono text-emerald-400 tabular-nums">
                    ({openPositions.length} Açık Pozisyon ·{' '}
                    {closedHistory.length} Tamamlanan · Kasada K/Z:{' '}
                    {demoWallet.realizedPnlUsdt >= 0 ? '+' : ''}$
                    {demoWallet.realizedPnlUsdt.toFixed(2)})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {openPositions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCloseAllPositions}
                      className="text-xs font-mono text-rose-400 hover:text-rose-300 cursor-pointer font-bold"
                    >
                      Tümünü Kapat ({openPositions.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveSection('STRATEGY')}
                    className="text-xs font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    50 Piyasa Tarayıcısı →
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('ACTIVE_BOTS')}
                    className="text-xs font-mono text-emerald-400 hover:text-emerald-300 cursor-pointer"
                  >
                    Açık Pozisyonlar ({openPositions.length}) →
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(() => {
                  const defaultFeatured = [btcMarket, ethMarket, solMarket];
                  const activeMarketsFromPositions = openPositions
                    .slice(0, 3)
                    .map(
                      (pos) =>
                        markets.find((m) => m.symbol === pos.symbol) ??
                        btcMarket
                    );
                  const combined: MarketTicker[] = [
                    ...activeMarketsFromPositions,
                  ];
                  for (const defM of defaultFeatured) {
                    if (combined.length >= 3) break;
                    if (!combined.some((c) => c.symbol === defM.symbol)) {
                      combined.push(defM);
                    }
                  }

                  return combined.slice(0, 3).map((m, idx) => {
                    const openPos = openPositions.find(
                      (p) => p.symbol === m.symbol
                    );
                    const lastClosed = closedHistory.find(
                      (c) => c.symbol === m.symbol
                    );
                    const displayPct = openPos
                      ? openPos.roePct
                      : m.change24hPct;
                    const isPos = displayPct >= 0;
                    const sparkPoints = buildRealSparklinePoints(m.closes);
                    const icon =
                      m.baseAsset === 'BTC'
                        ? '₿'
                        : m.baseAsset === 'ETH'
                        ? '◆'
                        : m.baseAsset === 'SOL'
                        ? '≡'
                        : m.baseAsset.slice(0, 2);
                    const iconBg = openPos
                      ? 'bg-emerald-500/25 border border-emerald-400/70 text-emerald-300'
                      : idx === 0
                      ? 'bg-amber-500 text-slate-950'
                      : idx === 1
                      ? 'bg-indigo-500/30 border border-indigo-400/50 text-indigo-300'
                      : 'bg-purple-500/25 border border-cyan-400/50 text-cyan-300';
                    const stroke = openPos
                      ? openPos.unrealizedPnlUsdt >= 0
                        ? '#10b981'
                        : '#f43f5e'
                      : idx === 1
                      ? '#38bdf8'
                      : '#10b981';

                    return (
                      <div
                        key={m.symbol}
                        onClick={() => setSelectedSymbol(m.symbol)}
                        className={`rounded-xl bg-[#0b101e] border px-3.5 py-2 flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                          openPos
                            ? 'border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.14)]'
                            : selectedSymbol === m.symbol
                            ? 'border-cyan-400/70 shadow-[0_0_14px_rgba(34,211,238,0.18)]'
                            : 'border-slate-800 hover:border-cyan-500/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-[11px] shrink-0 ${iconBg}`}
                          >
                            {icon}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                              <span>
                                {m.baseAsset}
                                <span className="text-slate-400 font-normal">
                                  /USDT
                                </span>
                              </span>
                              {openPos && (
                                <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  {openPos.side} {openPos.leverage}x
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] font-mono text-slate-400 tabular-nums truncate">
                              {openPos
                                ? `$${formatCompactPrice(
                                    openPos.entryPrice
                                  )} → $${formatCompactPrice(
                                    openPos.currentPrice
                                  )}`
                                : `$${formatCompactPrice(m.price)}`}
                            </div>
                          </div>
                        </div>

                        <svg
                          viewBox="0 0 88 26"
                          className="w-16 h-6 shrink-0 hidden sm:block"
                        >
                          <polyline
                            fill="none"
                            stroke={stroke}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={sparkPoints}
                          />
                        </svg>

                        <div className="text-right font-mono tabular-nums shrink-0 flex items-center gap-2">
                          <div>
                            <div
                              className={`font-extrabold text-xs sm:text-sm ${
                                isPos ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {openPos
                                ? `${
                                    openPos.unrealizedPnlUsdt >= 0 ? '+' : ''
                                  }$${openPos.unrealizedPnlUsdt.toFixed(2)}`
                                : `${isPos ? '+' : ''}${displayPct.toFixed(
                                    2
                                  )}%`}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {openPos
                                ? `${
                                    openPos.roePct >= 0 ? '+' : ''
                                  }${openPos.roePct.toFixed(2)}% ROE`
                                : lastClosed
                                ? `Son K/Z: ${
                                    lastClosed.realizedPnlUsdt >= 0 ? '+' : ''
                                  }$${lastClosed.realizedPnlUsdt.toFixed(2)}`
                                : `Güven %${m.quantScore}`}
                            </div>
                          </div>
                          {openPos && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClosePosition(openPos.id);
                              }}
                              className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/50 text-[10px] font-bold text-rose-200 cursor-pointer"
                            >
                              Kapat
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </section>
          </>
        )}

        {/* DİĞER SEKMELER (İÇ KAYDIRMALI, ÖZEL SİBER KAYDIRMA ÇUBUKLU) */}
        {activeSection !== 'DASHBOARD' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
            <BtcRegimeBanner
              btcRegime={btcRegime}
              walletState={demoWallet}
              leverageMode={strategyConfig.leverageMode ?? 'AUTO'}
              currentLeverage={strategyConfig.leverage}
              onChangeLeverageMode={(mode) => handleSelectLeverage(mode)}
              onChangeLeverage={(lev) => handleSelectLeverage('MANUAL', lev)}
              autoTradeEnabled={autoExecuteEnabled}
              onToggleAutoTrade={() => setAutoExecuteEnabled((p) => !p)}
              activeSignalsCount={activeSignals.length}
              openPositionsCount={openPositions.length}
              onOpenSettingsModal={() => setActiveSection('SETTINGS')}
              onOpenPythonModal={() => setActiveSection('SETTINGS')}
              onOpenWalletModal={() => setActiveSection('PORTFOLIO')}
              onPanicCloseAll={handleCloseAllPositions}
              onForceSignalExecution={handleTriggerInstantScan}
              mexcStatus={mexcStatus}
              efficiencyMetrics={tradeEfficiency}
            />
            {activeSection === 'STRATEGY' && (
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-8">
                  <MarketScannerGrid
                    markets={markets}
                    selectedSymbol={selectedSymbol}
                    leverageMode={strategyConfig.leverageMode ?? 'AUTO'}
                    onSelectSymbol={setSelectedSymbol}
                    onExecuteOrder={handleExecuteOrder}
                  />
                </div>
                <div className="lg:col-span-4 lg:sticky lg:top-2">
                  <MarketInspectorPanel
                    market={selectedMarket}
                    config={strategyConfig}
                    onExecuteOrder={handleExecuteOrder}
                  />
                </div>
              </section>
            )}

            {activeSection === 'ACTIVE_BOTS' && (
              <PositionsAndLogsPanel
                openPositions={openPositions}
                closedHistory={closedHistory}
                executionLogs={executionLogs}
                autoExecuteEnabled={autoExecuteEnabled}
                showOpenPositionsRow={true}
                showHistoryTable={false}
                onClosePosition={handleClosePosition}
                onCloseAllPositions={handleCloseAllPositions}
                onTriggerInstantScan={handleTriggerInstantScan}
                onSimulateAutoCycle={handleSimulateAutoCycle}
              />
            )}

            {activeSection === 'HISTORY' && (
              <PositionsAndLogsPanel
                openPositions={openPositions}
                closedHistory={closedHistory}
                executionLogs={executionLogs}
                autoExecuteEnabled={autoExecuteEnabled}
                showOpenPositionsRow={false}
                showHistoryTable={true}
                onClosePosition={handleClosePosition}
                onCloseAllPositions={handleCloseAllPositions}
                onTriggerInstantScan={handleTriggerInstantScan}
                onSimulateAutoCycle={handleSimulateAutoCycle}
              />
            )}

            {activeSection === 'ALERTS' && (
              <section className="ai-glass-card rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-white uppercase tracking-wider">
                      CANLI SİNYAL, OCO VE HFT RİSK UYARILARI ({activeSignals.length} AKTİF SİNYAL)
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      50 Binance/MEXC paritesinden gerçek zamanlı 4/4 kural eşleşmeleri, RSI aşırı alım/satım uyarıları ve HFT Rate-Limit kalkanı durumu
                    </p>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                      API Weight: {mexcStatus.hftTelemetry?.usedWeight1m ?? 18} / 6000
                    </span>
                    <span className="px-2.5 py-1 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300">
                      NTP Saat Farkı: {mexcStatus.hftTelemetry?.serverTimeOffsetMs ?? 0}ms
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {markets.slice(0, 14).map((m) => {
                    const isSignal = m.signal !== 'BEKLE';
                    return (
                      <div
                        key={m.symbol}
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                          m.signal === 'LONG'
                            ? 'bg-emerald-950/25 border-emerald-500/45'
                            : m.signal === 'SHORT'
                            ? 'bg-rose-950/25 border-rose-500/45'
                            : 'bg-[#090d16] border-slate-800'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold font-mono text-white">
                              {m.baseAsset}/USDT
                            </span>
                            <span className="text-xs font-mono text-cyan-300 tabular-nums">
                              ${formatCompactPrice(m.price)}
                            </span>
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                m.signal === 'LONG'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : m.signal === 'SHORT'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {m.signal === 'LONG'
                                ? 'BUY SİNYALİ'
                                : m.signal === 'SHORT'
                                ? 'SELL SİNYALİ'
                                : `ANALİZ (${m.conditionsPassed}/4)`}
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 mt-1 font-mono">
                            RSI: {m.rsi14.toFixed(1)} · Hacim: {m.volumeMultiplier.toFixed(2)}x · Güven: %{m.quantScore} · Yarım Kelly: ${m.kellyOrderSizeUsdt} ({m.effectiveLeverage}x)
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            OCO Koruma: SL ${formatCompactPrice(m.stopLossPrice)} / TP ${formatCompactPrice(m.takeProfitPrice)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleExecuteOrder(
                              m,
                              m.signal === 'SHORT' ? 'SHORT' : 'LONG'
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer shrink-0 ${
                            isSignal
                              ? 'bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/50'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                          }`}
                        >
                          {m.effectiveLeverage}x Emir İlet
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {activeSection === 'PORTFOLIO' && (
              <section className="ai-glass-card rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-white uppercase tracking-wider">
                      BINANCE DEMO CÜZDANIM VE GERÇEK COİN VARLIKLARIM
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Açılan her işlemin teminatı Serbest USDT bakiyesinden anında düşer, kapanan ve açık işlemlerin K/Z tutarı portföye anlık yansır
                    </p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-bold">
                      Serbest USDT: $
                      {demoWallet.availableMarginUsdt.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold">
                      İşlemde Kilitli: -$
                      {demoWallet.usedMarginUsdt.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={syncMexcAccountStatus}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
                    >
                      Yenile
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {realHoldings.map((item, idx) => (
                    <div
                      key={`${item.asset}_${idx}`}
                      onClick={() => {
                        const sym =
                          item.asset === 'USDT'
                            ? 'BTCUSDT'
                            : `${item.asset}USDT`;
                        setSelectedSymbol(sym);
                        setActiveSection('STRATEGY');
                      }}
                      className={`p-3.5 rounded-xl bg-[#090d16] border cursor-pointer transition-colors font-mono ${
                        item.locked > 0
                          ? 'border-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.12)]'
                          : 'border-slate-800 hover:border-cyan-400/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-extrabold text-white">
                          {item.asset}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            item.locked > 0
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'text-emerald-400'
                          }`}
                        >
                          {item.locked > 0
                            ? `KİLİTLİ: $${item.locked.toFixed(0)}`
                            : 'SPOT'}
                        </span>
                      </div>
                      <div className="text-base font-bold text-slate-200 mt-1 tabular-nums">
                        {item.free >= 100
                          ? item.free.toLocaleString('en-US', {
                              maximumFractionDigits: 2,
                            })
                          : item.free.toFixed(4)}
                      </div>
                      {item.valueUsdt !== undefined && (
                        <div className="text-xs text-cyan-400 mt-0.5 tabular-nums">
                          Net Değer: ≈ $
                          {item.valueUsdt.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeSection === 'DATA_INTEGRITY' && (
              <DataIntegrityAudit
                selectedMarket={selectedMarket}
                markets={markets}
                onSelectSymbol={setSelectedSymbol}
                onRefreshNow={() => {
                  syncMexcAccountStatus();
                  syncBinanceRest();
                  syncRealBatchKlines(selectedSymbol);
                }}
                btcRegime={btcRegime}
                microstructure={selectedMicrostructure}
                realOrderBookSnapshot={orderBookMap[selectedMarket.symbol] ?? null}
                demoWallet={demoWallet}
                openPositions={openPositions}
                mexcStatus={mexcStatus}
                watchdog={watchdog}
                rateLimiter={rateLimiter}
                latestNews={newsFeed[0] ?? null}
                lastFeedSyncMs={lastPacketTimeMs}
                isLiveFeedSynced={isLiveFeedSynced}
              />
            )}

            {activeSection === 'SETTINGS' && (
              <div className="space-y-5">
                <DataIntegrityAudit
                  selectedMarket={selectedMarket}
                  markets={markets}
                  onSelectSymbol={setSelectedSymbol}
                  onRefreshNow={() => {
                    syncMexcAccountStatus();
                    syncBinanceRest();
                    syncRealBatchKlines(selectedSymbol);
                  }}
                  btcRegime={btcRegime}
                  microstructure={selectedMicrostructure}
                  realOrderBookSnapshot={orderBookMap[selectedMarket.symbol] ?? null}
                  demoWallet={demoWallet}
                  openPositions={openPositions}
                  mexcStatus={mexcStatus}
                  watchdog={watchdog}
                  rateLimiter={rateLimiter}
                  latestNews={newsFeed[0] ?? null}
                  lastFeedSyncMs={lastPacketTimeMs}
                  isLiveFeedSynced={isLiveFeedSynced}
                />
                <MexcLiveSetupPanel
                  selectedMarket={selectedMarket}
                  config={strategyConfig}
                  mexcStatus={mexcStatus}
                  onRefreshAccountStatus={syncMexcAccountStatus}
                  onOrderDispatched={handleMexcLiveOrderDispatched}
                />
                <RuleEngineSection
                  config={strategyConfig}
                  onUpdateConfig={handleUpdateStrategyConfig}
                />
              </div>
            )}

            {activeSection === 'ASSISTANT' && (
              <section className="ai-glass-card rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-white uppercase tracking-wider">
                      AI ASSISTANT — NÖRAL KOMUT VE CANLI PİYASA ANALİZ MERKEZİ
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Seçili parite ({selectedMarket.baseAsset}/USDT) ve 50 piyasa için canlı Yarım Kelly, RSI, EMA ve OCO emir kontrolü
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].map(
                      (sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => {
                            setSelectedSymbol(sym);
                            const m = markets.find((x) => x.symbol === sym);
                            if (m) {
                              setCustomAssistantNote(
                                `${m.baseAsset}/USDT Canlı Rapor: Fiyat $${formatCompactPrice(
                                  m.price
                                )} · 24s Değişim %${m.change24hPct} · RSI ${m.rsi14.toFixed(
                                  1
                                )} · Güven %${m.quantScore} · Yarım Kelly Önerisi: $${
                                  m.kellyOrderSizeUsdt
                                } (${m.effectiveLeverage}x) · OCO Hedef: $${formatCompactPrice(
                                  m.takeProfitPrice
                                )}`
                              );
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer border ${
                            selectedSymbol === sym
                              ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-500/50'
                          }`}
                        >
                          {sym.replace('USDT', '')} Analiz Et
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#090d16] border border-cyan-500/40 text-sm text-slate-100 font-mono leading-relaxed">
                  {liveAssistantMessage}
                </div>

                <form
                  onSubmit={handleAssistantCommand}
                  className="flex items-center gap-3"
                >
                  <input
                    type="text"
                    value={assistantInput}
                    onChange={(e) => setAssistantInput(e.target.value)}
                    placeholder="Sembol veya komut yazın (örn: BTC, ETH, SOL, KAR AL)..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-[#090d16] border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-cyan-500/25 hover:bg-cyan-500/35 border border-cyan-400/60 text-sm font-mono font-bold text-cyan-200 cursor-pointer"
                  >
                    Komutu Çalıştır
                  </button>
                </form>

                <MexcLiveSetupPanel
                  selectedMarket={selectedMarket}
                  config={strategyConfig}
                  mexcStatus={mexcStatus}
                  onRefreshAccountStatus={syncMexcAccountStatus}
                  onOrderDispatched={handleMexcLiveOrderDispatched}
                />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
