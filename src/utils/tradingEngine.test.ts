import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOP_50_SYMBOLS,
  DEFAULT_STRATEGY_CONFIG,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateStochRSI,
  calculateVWAP,
  calculateADX,
  calculateWilderATR,
  calculateClosedCandleVolumeMultiplier,
  calculateRollingBtcCorrelation,
  walkOrderBookForFill,
  evaluateBtcRegime,
  evaluateMarketSignal,
  createPositionFromSignal,
  updatePositionWithPrice,
  createClosedTradeRecord,
  calculateTradeHistoryStats,
  calculateDemoWalletState,
  validateStrategyConfig,
  buildMexcFuturesOrderPayload,
  calculateHalfKellyPositionSize,
  validateAndRoundOrderFilters,
  generateDeterministicClientOrderId,
  synchronizeLocalOrderBook,
  evaluateCircuitBreakerState,
  calculateTradeEfficiencyMetrics,
} from './tradingEngine';

test('TOP_50_SYMBOLS contains exactly 50 unique USDT pairs including BTCUSDT', () => {
  assert.equal(TOP_50_SYMBOLS.length, 50);
  const unique = new Set(TOP_50_SYMBOLS);
  assert.equal(unique.size, 50);
  assert.equal(TOP_50_SYMBOLS[0], 'BTCUSDT');
});

test('calculateEMA, calculateRSI, calculateMACD, calculateStochRSI, calculateVWAP, calculateADX, and Wilder ATR return accurate quantitative values from real candles', () => {
  const risingCloses = [
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114,
  ];
  const risingHighs = risingCloses.map((c) => c + 1.2);
  const risingLows = risingCloses.map((c) => c - 0.8);
  const volumes = [10, 11, 12, 10, 11, 12, 10, 11, 12, 10, 11, 12, 10, 18, 25];

  const ema9 = calculateEMA(risingCloses, 9);
  const ema21 = calculateEMA(risingCloses, 21);
  assert.ok(ema9 > ema21, 'Fast EMA should exceed Slow EMA in an uptrend');

  const rsi = calculateRSI(risingCloses, 14);
  assert.equal(rsi, 100);

  const macd = calculateMACD(risingCloses);
  assert.ok(macd.macdLine > 0, 'MACD line should be positive in a steady uptrend');
  assert.equal(macd.isBullishMomentum, true);

  const stoch = calculateStochRSI(risingCloses);
  assert.ok(stoch.k >= 50, 'StochRSI %K should be elevated in an uptrend');

  const vwapInfo = calculateVWAP(risingCloses, volumes, risingHighs, risingLows);
  assert.ok(vwapInfo.vwap > 0);
  assert.ok(vwapInfo.deviationPct > 0, 'Latest close in uptrend should be above VWAP');

  const adx = calculateADX(risingCloses, 115, 99, risingHighs, risingLows);
  assert.ok(adx > 0 && adx <= 100);

  const atr = calculateWilderATR(risingHighs, risingLows, risingCloses, 14);
  assert.ok(atr.atrValue > 0, 'Wilder ATR must be positive on valid candle H/L/C');
  assert.ok(atr.atrPct > 0);

  const closedVolMult = calculateClosedCandleVolumeMultiplier(volumes);
  assert.ok(closedVolMult > 1.2, 'Closed candle volume multiplier should reflect the closed bar spike (18 vs ~11 baseline)');

  const corr = calculateRollingBtcCorrelation(risingCloses, risingCloses);
  assert.ok(corr && corr >= 0.99, 'Identical close series should have ~1.0 correlation');
});

test('evaluateMarketSignal blocks trading when real klines are missing or data is stale, and triggers LONG only when real klines + 4 rules pass', () => {
  const btcRegime = evaluateBtcRegime(
    92500,
    2.4,
    93200,
    90100,
    42000000000,
    [90500, 91000, 91400, 91800, 92100, 92300, 92500, 92550, 92600, 92650, 92700, 92750, 92800, 92850, 92500]
  );
  assert.equal(btcRegime.regime, 'GÜÇLÜ_BOĞA');

  // 1) Missing klines -> NO_DATA, signal MUST be BEKLE
  const noDataMarket = evaluateMarketSignal(
    {
      symbol: 'SOLUSDT',
      price: 204.2,
      open24h: 198.0,
      high24h: 207.0,
      low24h: 196.5,
      change24hPct: 3.1,
      volume24hUsdt: 1850000000,
      tradesCount24h: 842100,
      closes: [],
      volumes: [],
      btcCorrelation: 0,
      hasRealKlines: false,
    },
    DEFAULT_STRATEGY_CONFIG,
    btcRegime
  );
  assert.equal(noDataMarket.dataStatus, 'NO_DATA');
  assert.equal(noDataMarket.signal, 'BEKLE');
  assert.equal(noDataMarket.mexcPrice, 0, 'mexcPrice must be 0 when realMexcPrice is not fetched');

  // 2) Real klines + fresh data + realMexcPrice -> LONG
  const closes = [200, 202, 200.5, 202.5, 201.0, 203.0, 201.5, 203.5, 202.0, 203.8, 202.4, 204.0, 202.8, 203.6, 204.2];
  const highs = closes.map((c) => c + 1.5);
  const lows = closes.map((c) => c - 1.2);
  const rawMarket = {
    symbol: 'SOLUSDT',
    price: 204.2,
    bestBid: 204.18,
    bestAsk: 204.22,
    open24h: 198.0,
    high24h: 207.0,
    low24h: 196.5,
    change24hPct: 3.1,
    volume24hUsdt: 1850000000,
    tradesCount24h: 842100,
    closes,
    highs,
    lows,
    volumes: [100, 110, 95, 105, 100, 165, 170],
    btcCorrelation: 0.88,
    hasRealKlines: true,
    realMexcPrice: 204.25,
    lastUpdatedMs: Date.now(),
  };

  const evaluated = evaluateMarketSignal(rawMarket, DEFAULT_STRATEGY_CONFIG, btcRegime);
  assert.equal(evaluated.dataStatus, 'FRESH');
  assert.equal(evaluated.signal, 'LONG');
  assert.equal(evaluated.conditionsPassed, 4);
  assert.ok(evaluated.stopLossPrice < evaluated.price);
  assert.ok(evaluated.takeProfitPrice > evaluated.price);
  assert.equal(evaluated.mexcPrice, 204.25);
});

test('walkOrderBookForFill walks real L2 depth and createClosedTradeRecord deducts real exchange fees', () => {
  const walk = walkOrderBookForFill({
    side: 'BUY',
    quantity: 3,
    bids: [
      ['100.00', '2.0'],
      ['99.50', '5.0'],
    ],
    asks: [
      ['100.10', '1.0'],
      ['100.20', '2.0'],
    ],
    fallbackMidPrice: 100.05,
    isMaker: false,
  });
  // 1 unit @ 100.10 + 2 units @ 100.20 = 300.50 / 3 = 100.16667
  assert.ok(walk.fillPrice > 100.1 && walk.fillPrice <= 100.2);
  assert.equal(walk.filledPct, 100);
  assert.ok(walk.slippageBps > 0);

  const btcRegime = evaluateBtcRegime(
    92000,
    1.5,
    93000,
    90500,
    35000000000,
    [90500, 91000, 91500, 92000]
  );
  const config1x = {
    ...DEFAULT_STRATEGY_CONFIG,
    exchangeVenue: 'BINANCE_DEMO_FUTURES' as const,
    leverageMode: 'MANUAL' as const,
    leverage: 1,
  };
  const closes = [2950, 2970, 2960, 2985, 2975, 2990, 2980, 2992, 2985, 2995, 2988, 2996, 2991, 2998, 3000];
  const market1x = evaluateMarketSignal(
    {
      symbol: 'ETHUSDT',
      price: 3000,
      open24h: 2920,
      high24h: 3050,
      low24h: 2900,
      change24hPct: 2.7,
      volume24hUsdt: 1500000000,
      tradesCount24h: 510000,
      closes,
      highs: closes.map((c) => c + 12),
      lows: closes.map((c) => c - 10),
      volumes: [100, 100, 100, 150, 150],
      btcCorrelation: 0.92,
      hasRealKlines: true,
      lastUpdatedMs: Date.now(),
    },
    config1x,
    btcRegime
  );
  const pos = createPositionFromSignal(market1x, config1x, 'LONG');
  assert.equal(pos.entryPrice, 3000);
  assert.equal(pos.leverage, 1);

  const closedWin = createClosedTradeRecord(pos, 3090, 'OTOMATİK KÂR AL (TP)', pos.openedAt + 95000);
  // Gross PnL = 7.50 USDT, round-trip fee = 250 * 0.0008 = 0.20 USDT -> Net PnL = 7.30 USDT
  assert.equal(closedWin.feeUsdt, 0.2);
  assert.equal(closedWin.realizedPnlUsdt, 7.3);
  assert.equal(closedWin.durationSeconds, 95);

  const closedLoss = createClosedTradeRecord(pos, 2955, 'OTOMATİK ZARAR KES (SL)', pos.openedAt + 40000);
  // Gross PnL = -3.75 USDT, round-trip fee = 0.20 USDT -> Net PnL = -3.95 USDT
  assert.equal(closedLoss.realizedPnlUsdt, -3.95);

  const stats = calculateTradeHistoryStats([closedWin, closedLoss]);
  assert.equal(stats.totalTrades, 2);
  assert.equal(stats.winCount, 1);
  assert.equal(stats.lossCount, 1);
  assert.equal(stats.winRatePct, 50);
  assert.equal(stats.totalNetPnlUsdt, 3.35);

  const walletState = calculateDemoWalletState(config1x, [], [closedWin]);
  assert.equal(walletState.startingBalanceUsdt, 10000);
  assert.equal(walletState.realizedPnlUsdt, 7.3);
});

test('validateStrategyConfig and buildMexcFuturesOrderPayload format MEXC V1 contract payload deterministically', () => {
  const validResult = validateStrategyConfig(DEFAULT_STRATEGY_CONFIG);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.errors.length, 0);

  const mexcPayload = buildMexcFuturesOrderPayload({
    symbol: 'SOLUSDT',
    side: 'LONG',
    price: 200,
    marginUsdt: 250,
    leverage: 10,
    stopLossPct: 1.5,
    takeProfitPct: 3.0,
  });
  assert.equal(mexcPayload.symbol, 'SOL_USDT');
  assert.equal(mexcPayload.side, 1);
  assert.equal(mexcPayload.type, 5);
  assert.equal(mexcPayload.openType, 1);
  assert.equal(mexcPayload.leverage, 10);
  assert.equal(mexcPayload.stopLossPrice, 197);
  assert.equal(mexcPayload.takeProfitPrice, 206);
});

test('HFT Phase 1-5 engines: Half-Kelly Criterion, LOT_SIZE/PRICE_FILTER/MIN_NOTIONAL, newClientOrderId, Local Order Book sync, and Circuit Breakers work deterministically', () => {
  const kellyHigh = calculateHalfKellyPositionSize({
    quantScore: 86,
    conditionsPassed: 4,
    rewardToRiskRatio: 2.0,
    totalWalletUsdt: 10000,
    maxConcurrentPositions: 8,
  });
  const kellyLow = calculateHalfKellyPositionSize({
    quantScore: 45,
    conditionsPassed: 2,
    rewardToRiskRatio: 1.5,
    totalWalletUsdt: 10000,
    maxConcurrentPositions: 8,
  });
  assert.equal(kellyHigh.isolatedPairBudgetUsdt, 1250);
  assert.ok(kellyHigh.kellyOrderSizeUsdt > kellyLow.kellyOrderSizeUsdt);

  const filterRes = validateAndRoundOrderFilters({
    symbol: 'BTCUSDT',
    price: 73941.1289,
    quantity: 0.0034891,
    stopLossPrice: 72831.994,
    takeProfitPrice: 76159.338,
  });
  assert.equal(filterRes.valid, true);
  assert.equal(filterRes.roundedPrice, 73941.12);
  assert.equal(filterRes.roundedQty, 0.0034);

  const id1 = generateDeterministicClientOrderId('BTCUSDT', 'LONG', 1700000001000);
  const id2 = generateDeterministicClientOrderId('BTCUSDT', 'LONG', 1700000005000);
  assert.equal(id1, id2);

  const snapshot = {
    lastUpdateId: 100,
    bids: [
      ['73900.00', '1.5'],
      ['73890.00', '2.0'],
    ] as Array<[string, string]>,
    asks: [
      ['73910.00', '1.0'],
      ['73920.00', '3.0'],
    ] as Array<[string, string]>,
  };
  const syncedOk = synchronizeLocalOrderBook(snapshot, [
    { U: 95, u: 100, b: [['73900.00', '9.9']], a: [] },
    { U: 100, u: 102, b: [['73905.00', '2.5']], a: [['73910.00', '0']] },
    { U: 103, u: 105, b: [], a: [['73915.00', '1.2']] },
  ]);
  assert.equal(syncedOk.synchronized, true);
  assert.equal(syncedOk.bestBid, 73905);
  assert.equal(syncedOk.bestAsk, 73915);

  const cbTripped = evaluateCircuitBreakerState({
    closedHistory: [
      {
        id: 'loss_1',
        symbol: 'SOLUSDT',
        baseAsset: 'SOL',
        exchangeLabel: 'Binance Demo (Testnet)',
        side: 'LONG',
        leverage: 10,
        marginUsdt: 250,
        entryPrice: 200,
        exitPrice: 180,
        quantity: 12.5,
        notionalUsdt: 2500,
        feeUsdt: 1,
        realizedPnlUsdt: -480,
        realizedPnlPct: -10,
        roePct: -100,
        entryTime: Date.now() - 60000,
        exitTime: Date.now() - 10000,
        durationSeconds: 50,
        entryRule: 'TEST',
        exitReason: 'OTOMATİK ZARAR KES (SL)',
      },
    ],
    openPositions: [],
    startingBalanceUsdt: 10000,
    maxConcurrentPositions: 8,
    dailyDrawdownLimitPct: 4.5,
  });
  assert.equal(cbTripped.dailyLossTripped, true);

  const effMetrics = calculateTradeEfficiencyMetrics({
    closedHistory: [
      {
        id: 'win_eff_1',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        exchangeLabel: 'Binance Demo (Testnet)',
        side: 'LONG',
        leverage: 5,
        marginUsdt: 350,
        entryPrice: 74000,
        exitPrice: 74450,
        quantity: 0.0236,
        notionalUsdt: 1750,
        feeUsdt: 0.7,
        realizedPnlUsdt: 10.64,
        realizedPnlPct: 0.61,
        roePct: 3.05,
        entryTime: Date.now() - 40000,
        exitTime: Date.now() - 5000,
        durationSeconds: 35,
        entryRule: 'TEST',
        exitReason: 'OTOMATİK KÂR AL (TP)',
      },
    ],
    openPositions: [],
    markets: [],
  });
  assert.ok(effMetrics.efficiencyScore > effMetrics.marketStandardScore);
});

test('Data Integrity Guard: Math.random and Math.sin are strictly forbidden in market-data and trading paths', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const filesToAudit = [
    'src/utils/tradingEngine.ts',
    'src/utils/binanceFeed.ts',
    'src/utils/v3ParallelEngine.ts',
    'server.ts',
    'src/App.tsx',
  ];

  for (const relPath of filesToAudit) {
    const absPath = path.resolve(process.cwd(), relPath);
    const content = fs.readFileSync(absPath, 'utf8');
    assert.equal(
      content.includes('Math.random'),
      false,
      `Forbidden Math.random found in ${relPath}`
    );
    assert.equal(
      content.includes('Math.sin'),
      false,
      `Forbidden Math.sin found in ${relPath}`
    );
  }
});

