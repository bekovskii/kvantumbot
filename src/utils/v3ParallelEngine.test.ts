import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V3_AI_ENGINE_CONFIG,
  AsyncEventBus,
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
  NewsIntelligenceItem,
  RealOrderBookSnapshot,
} from './v3ParallelEngine';
import {
  DEFAULT_STRATEGY_CONFIG,
  evaluateMarketSignal,
  evaluateBtcRegime,
  createPositionFromSignal,
  createClosedTradeRecord,
  recalculateOpenPositionsTpSl,
  updateSinglePositionTpSl,
  updatePositionWithPrice,
} from './tradingEngine';

test('V3_AI_ENGINE_CONFIG strictly locks temperature at 0.2 and AsyncEventBus dispatches pub/sub events without blocking', async () => {
  assert.equal(V3_AI_ENGINE_CONFIG.temperature, 0.2);

  const bus = new AsyncEventBus(20);
  const receivedTypes: string[] = [];

  const unsub = bus.subscribe('NEWS_ALERT', (evt) => {
    receivedTypes.push(`${evt.type}:${evt.symbol}`);
  });

  bus.publish({
    type: 'NEWS_ALERT',
    sourceWorker: 'NEWS_INTELLIGENCE',
    symbol: 'XRPUSDT',
    summary: 'Ripple SEC davasını kazandı (+95)',
    latencyMs: 12,
    payload: { score: 95 },
  });

  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(receivedTypes, ['NEWS_ALERT:XRPUSDT']);
  assert.equal(bus.getRecentEvents().length, 1);
  unsub();
});

test('Departman 1 (news_intelligence): Entity Dictionary maps indirect names to USDT pairs, Deduplication and Fake Guard filter spam', () => {
  const vitalik = resolveSymbolAndImpactFromHeadline(
    'Vitalik Pectra yükseltmesi ile ağ ücretlerinin düşeceğini açıkladı'
  );
  assert.equal(vitalik.symbol, 'ETHUSDT');
  assert.ok(vitalik.aiImpactScore > 0);

  const ripple = resolveSymbolAndImpactFromHeadline(
    'Brad Garlinghouse: SEC davası resmen zaferle sonuçlandı ve listeledi'
  );
  assert.equal(ripple.symbol, 'XRPUSDT');
  assert.ok(ripple.aiImpactScore >= 85);

  const blackrock = resolveSymbolAndImpactFromHeadline(
    'BlackRock IBIT fonu rekor alım gerçekleştirdi'
  );
  assert.equal(blackrock.symbol, 'BTCUSDT');

  const altman = resolveSymbolAndImpactFromHeadline(
    'Sam Altman yeni World ID küresel entegrasyonunu duyurdu'
  );
  assert.equal(altman.symbol, 'WLDUSDT');

  const hash1 = computeSemanticNewsHash(
    'SON DAKİKA: Binance yeni pariteyi listeledi!'
  );
  const hash2 = computeSemanticNewsHash(
    'Resmi Duyuru: Binance yeni pariteyi listeledi'
  );
  assert.equal(hash1, hash2);

  const fakeCheck = evaluateFakeNewsGuard(
    'BlackRock bedava airdrop dağıtıyor cüzdanınızı bağlayın free claim',
    'Unverified X'
  );
  assert.equal(fakeCheck.isFakeOrHacked, true);
});

test('Departman 2 & 3: computeL2Microstructure uses real depth OBI, real trades TFI, real Wilder ATR, and marks spoofing unavailable', () => {
  const btcRegime = evaluateBtcRegime(
    74500,
    2.05,
    75000,
    72500,
    3500000000,
    [73200, 73500, 73800, 74000, 74200, 74350, 74500]
  );

  const closes = [
    2030, 2035, 2040, 2045, 2050, 2055, 2060, 2065, 2070, 2075, 2080, 2085,
    2090, 2095, 2100,
  ];
  const highs = closes.map((c) => c + 12);
  const lows = closes.map((c) => c - 10);

  const ethMarket = evaluateMarketSignal(
    {
      symbol: 'ETHUSDT',
      price: 2100,
      bestBid: 2099.9,
      bestAsk: 2100.1,
      bestBidQty: 18,
      bestAskQty: 6,
      open24h: 2020,
      high24h: 2130,
      low24h: 2000,
      change24hPct: 3.9,
      volume24hUsdt: 1800000000,
      tradesCount24h: 650000,
      closes,
      highs,
      lows,
      closes15m: closes,
      highs15m: highs,
      lows15m: lows,
      volumes: [100, 100, 110, 190, 200],
      btcCorrelation: 0.91,
      priceChange5sPct: 0.34,
      hasRealKlines: true,
      lastUpdatedMs: Date.now(),
    },
    DEFAULT_STRATEGY_CONFIG,
    btcRegime
  );

  const realSnap: RealOrderBookSnapshot = {
    symbol: 'ETHUSDT',
    lastUpdateId: 12345,
    bids: [
      ['2099.90', '15.0'],
      ['2099.50', '25.0'],
    ],
    asks: [
      ['2100.10', '8.0'],
      ['2100.50', '12.0'],
    ],
    bestBid: 2099.9,
    bestAsk: 2100.1,
    spreadBps: 0.95,
    obiScore: 0.54,
    tfiScore: 0.62,
    takerBuyVolume: 420000,
    takerSellVolume: 100000,
    tradesSampleCount: 50,
    timestamp: Date.now(),
  };

  const micro = computeL2Microstructure(
    ethMarket,
    new Set(['ETHUSDT']),
    undefined,
    75,
    realSnap
  );
  assert.equal(micro.obiScore, 0.54);
  assert.equal(micro.obiAvailable, true);
  assert.equal(micro.tfiScore, 0.62);
  assert.equal(micro.tfiAvailable, true);
  assert.equal(micro.spoofingWallsFiltered, 0);
  assert.equal(micro.spoofingStatus, 'ÖLÇÜLEMEDİ (UNAVAILABLE)');
  assert.equal(micro.priceChange5sPct, 0.34);
  assert.equal(micro.isVipWatched, true);
  assert.ok(micro.atr15m > 0, 'Wilder ATR15m must be computed from real candle highs/lows/closes');

  const wdNormal = evaluateWatchdogState({ pingMs: 28, wsHeartbeatAgeMs: 400 });
  assert.equal(wdNormal.killSwitchActive, false);

  const wdTripped = evaluateWatchdogState({
    pingMs: 245,
    wsHeartbeatAgeMs: 400,
  });
  assert.equal(wdTripped.killSwitchActive, true);

  const normalPos = createPositionFromSignal(
    ethMarket,
    DEFAULT_STRATEGY_CONFIG,
    'LONG',
    250,
    'MOD 2: TAHTA + HABER CONFLUENCE'
  );
  const sniperPos = createPositionFromSignal(
    ethMarket,
    DEFAULT_STRATEGY_CONFIG,
    'LONG',
    300,
    'MOD 1: NÜKLEER HABER SNIPING'
  );
  const sniperWin = createClosedTradeRecord(
    sniperPos,
    2150,
    'OTOMATİK KÂR AL (TP)'
  );

  const subFunds = calculateSubFundAllocations(
    DEFAULT_STRATEGY_CONFIG,
    [normalPos],
    [sniperWin],
    70
  );
  assert.equal(subFunds.confluenceFund.startingBalanceUsdt, 7000);
  assert.equal(subFunds.sniperFund.startingBalanceUsdt, 3000);
  assert.equal(subFunds.confluenceFund.usedMarginUsdt, 250);
  assert.ok(subFunds.sniperFund.realizedPnlUsdt > 0);
});

test('Sentez ve Karar Motoru (MOD 1 Sniping + Priced-In Guard, MOD 2 Confluence, MOD 3 Kill & Flip) and Order Manager validate accurately', () => {
  const btcRegime = evaluateBtcRegime(
    74500,
    2.05,
    75000,
    72500,
    3500000000,
    [73200, 73500, 73800, 74000, 74200, 74350, 74500]
  );

  const closes = [
    0.43, 0.432, 0.434, 0.436, 0.438, 0.44, 0.441, 0.442, 0.444, 0.445, 0.446,
    0.447, 0.448, 0.449, 0.45,
  ];
  const arbMarket = evaluateMarketSignal(
    {
      symbol: 'ARBUSDT',
      price: 0.45,
      bestBid: 0.4498,
      bestAsk: 0.4502,
      open24h: 0.43,
      high24h: 0.46,
      low24h: 0.42,
      change24hPct: 4.2,
      volume24hUsdt: 450000000,
      tradesCount24h: 220000,
      closes,
      highs: closes.map((c) => c + 0.005),
      lows: closes.map((c) => c - 0.004),
      volumes: [100, 105, 115, 175, 180],
      btcCorrelation: 0.85,
      hasRealKlines: true,
      lastUpdatedMs: Date.now(),
    },
    DEFAULT_STRATEGY_CONFIG,
    btcRegime
  );

  const micro = computeL2Microstructure(arbMarket, new Set(['ARBUSDT']), 0.4, 80);
  const subFunds = calculateSubFundAllocations(DEFAULT_STRATEGY_CONFIG, [], [], 70);
  const wdNormal = evaluateWatchdogState({ pingMs: 22, wsHeartbeatAgeMs: 300 });

  const bullNews: NewsIntelligenceItem = {
    id: 'n1',
    timestampMs: Date.now(),
    headline: 'Arbitrum kurumsal fon onayı aldı',
    source: 'Binance Official',
    sourceTrustScore: 98,
    semanticHash: 'arb-kurum-onay',
    isDuplicate: false,
    isFakeOrHacked: false,
    fakeGuardReason: null,
    detectedSymbol: 'ARBUSDT',
    matchedEntityLabel: 'Arbitrum',
    aiImpactScore: 95,
    aiConfidencePct: 96,
    temperatureUsed: 0.2,
    priceChange5sPct: 0.42,
    pricedInBlocked: false,
    triggeredMode: 'MOD_1_SNIPE',
    actionSummary: '',
    processingLatencyMs: 14,
  };

  const mod1Eval = evaluateHybridDecision({
    newsItem: bullNews,
    microstructure: micro,
    openPositions: [],
    subFunds,
    watchdog: wdNormal,
    strategyConfig: DEFAULT_STRATEGY_CONFIG,
    market: arbMarket,
  });
  assert.equal(mod1Eval.mode, 'MOD_1_SNIPE');
  assert.equal(mod1Eval.shouldExecute, true);
  assert.equal(mod1Eval.executionType, 'IOC_MARKET_TAKER');
  assert.equal(mod1Eval.subFund, 'SNIPER_30');

  const pricedInEval = evaluateHybridDecision({
    newsItem: { ...bullNews, priceChange5sPct: 4.5 },
    microstructure: micro,
    openPositions: [],
    subFunds,
    watchdog: wdNormal,
    strategyConfig: DEFAULT_STRATEGY_CONFIG,
  });
  assert.equal(pricedInEval.mode, 'BLOCKED_PRICED_IN');
  assert.equal(pricedInEval.shouldExecute, false);

  const openArbLong = createPositionFromSignal(
    arbMarket,
    DEFAULT_STRATEGY_CONFIG,
    'LONG',
    250,
    'MOD 2: CONFLUENCE'
  );
  const hackNews: NewsIntelligenceItem = {
    ...bullNews,
    id: 'n2',
    headline: 'SON DAKİKA: Arbitrum köprüsü hacklendi (-95)',
    aiImpactScore: -95,
    priceChange5sPct: -0.6,
  };

  const mod3Eval = evaluateHybridDecision({
    newsItem: hackNews,
    microstructure: micro,
    openPositions: [openArbLong],
    subFunds,
    watchdog: wdNormal,
    strategyConfig: DEFAULT_STRATEGY_CONFIG,
  });
  assert.equal(mod3Eval.mode, 'MOD_3_KILL_FLIP');
  assert.equal(mod3Eval.shouldExecute, true);
  assert.equal(mod3Eval.shouldKillExistingPositionId, openArbLong.id);
  assert.equal(mod3Eval.side, 'SHORT');

  const preTrade = validatePreTradeRules({
    symbol: 'ARBUSDT',
    price: 0.45,
    marginUsdt: 250,
    leverage: 10,
    atrPct: 1.5,
    executionType: 'IOC_MARKET_TAKER',
  });
  assert.equal(preTrade.passed, true);

  const bucketRes = consumeRateLimiterToken(
    {
      maxTokens: 60,
      availableTokens: 50,
      vipReservedTokens: 10,
      lastRefillMs: Date.now(),
      usedWeight1m: 120,
    },
    true
  );
  assert.equal(bucketRes.allowed, true);

  const autopsy = createExecutionAutopsyRecord({
    symbol: 'ARBUSDT',
    side: 'SHORT',
    mode: 'MOD_3_KILL_FLIP',
    executionType: 'IOC_MARKET_TAKER',
    subFund: 'SNIPER_30',
    newsTimestampMs: Date.now() - 16,
    expectedPrice: 0.45,
    microstructure: micro,
    validation: preTrade,
    orderBookSnapshot: {
      bids: [
        ['0.4498', '5000'],
        ['0.4495', '10000'],
      ],
      asks: [
        ['0.4502', '5000'],
        ['0.4505', '10000'],
      ],
    },
  });
  assert.equal(autopsy.symbol, 'ARBUSDT');
  assert.equal(autopsy.mode, 'MOD_3_KILL_FLIP');
  assert.ok(autopsy.fillPrice > 0);
});

test('Open positions TP/SL recalculation, Breakeven SL, and live TP/SL triggers execute accurately', () => {
  const btcRegime = evaluateBtcRegime(
    74500,
    2.05,
    75000,
    72500,
    3500000000,
    [73200, 73500, 73800, 74000, 74200, 74350, 74500]
  );
  const closes = [98, 98.2, 98.4, 98.6, 98.8, 99, 99.1, 99.2, 99.3, 99.4, 99.5, 99.6, 99.7, 99.8, 100];
  const solMarket = evaluateMarketSignal(
    {
      symbol: 'SOLUSDT',
      price: 100,
      open24h: 97,
      high24h: 103,
      low24h: 96,
      change24hPct: 3.1,
      volume24hUsdt: 950000000,
      tradesCount24h: 420000,
      closes,
      highs: closes.map((c) => c + 0.8),
      lows: closes.map((c) => c - 0.7),
      volumes: [100, 110, 120, 180, 190],
      btcCorrelation: 0.88,
      hasRealKlines: true,
      lastUpdatedMs: Date.now(),
    },
    DEFAULT_STRATEGY_CONFIG,
    btcRegime
  );

  const pos = createPositionFromSignal(
    solMarket,
    DEFAULT_STRATEGY_CONFIG,
    'LONG',
    250,
    'MOD 2: CONFLUENCE'
  );

  const tighterConfig = {
    ...DEFAULT_STRATEGY_CONFIG,
    stopLossPct: 0.25,
    takeProfitPct: 0.35,
    trailingStopPct: 0.18,
  };
  const [recalculatedPos] = recalculateOpenPositionsTpSl([pos], tighterConfig);
  assert.ok(
    Math.abs(recalculatedPos.stopLossPrice - pos.entryPrice * (1 - 0.0025)) <
      0.01
  );
  assert.ok(
    Math.abs(recalculatedPos.takeProfitPrice - pos.entryPrice * (1 + 0.0035)) <
      0.01
  );

  const breakevenPos = updateSinglePositionTpSl(
    recalculatedPos,
    recalculatedPos.entryPrice,
    recalculatedPos.takeProfitPrice
  );
  assert.equal(breakevenPos.stopLossPrice, recalculatedPos.entryPrice);

  const tpCheck = updatePositionWithPrice(
    recalculatedPos,
    recalculatedPos.takeProfitPrice + 0.05
  );
  assert.equal(tpCheck.status, 'KAPANDI_KAR_AL');

  const slCheck = updatePositionWithPrice(
    recalculatedPos,
    recalculatedPos.stopLossPrice - 0.05
  );
  assert.equal(slCheck.status, 'KAPANDI_ZARAR_KES');
});
