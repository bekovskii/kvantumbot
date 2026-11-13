import React, { useState, useMemo } from 'react';
import {
  MarketTicker,
  OpenPosition,
  ClosedTradeRecord,
  StrategyConfig,
  TradeEfficiencyMetrics,
  formatCompactPrice,
} from '../utils/tradingEngine';
import {
  V3_AI_ENGINE_CONFIG,
  V3BusEvent,
  NewsIntelligenceItem,
  OrderBookMicrostructure,
  WatchdogStatus,
  SubFundAllocationState,
  TokenBucketState,
  ExecutionAutopsyRecord,
  V3_STRESS_TEST_SCENARIOS,
  V3NewsScenarioTemplate,
} from '../utils/v3ParallelEngine';
import { TradeEfficiencyGaugeCard } from './TradeEfficiencyGaugeCard';
import {
  Send,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Cpu,
  Radio,
  Settings,
  Sliders,
  X,
  Check,
  Search,
  Zap,
  RotateCcw,
} from 'lucide-react';

interface V3CyberpunkNeuralDashboardProps {
  markets: MarketTicker[];
  selectedMarket: MarketTicker;
  scannedMarket: MarketTicker;
  onSelectSymbol: (symbol: string) => void;
  isScanPinned: boolean;
  onTogglePinScan: () => void;
  openPositions: OpenPosition[];
  closedHistory: ClosedTradeRecord[];
  subFunds: SubFundAllocationState;
  confluenceRatioPct: number;
  onChangeConfluenceRatioPct: (pct: number) => void;
  strategyConfig: StrategyConfig;
  onUpdateStrategyConfig: (nextConfig: StrategyConfig) => void;
  onMovePositionSlToBreakeven: (positionId: string) => void;
  onMoveAllPositionsSlToBreakeven: () => void;
  onAdjustPositionTpSlPct: (
    positionId: string,
    slPct: number,
    tpPct: number
  ) => void;
  microstructure: OrderBookMicrostructure;
  scannedMicrostructure: OrderBookMicrostructure;
  watchdog: WatchdogStatus;
  onToggleWatchdogKillSwitch: () => void;
  rateLimiter: TokenBucketState;
  busEvents: V3BusEvent[];
  newsFeed: NewsIntelligenceItem[];
  autopsyRecords: ExecutionAutopsyRecord[];
  tradeEfficiency: TradeEfficiencyMetrics;
  onTriggerScenario: (scenario: V3NewsScenarioTemplate) => void;
  onTriggerLiveMarketNews: () => void;
  onSubmitCustomNews: (headline: string, source: string) => void;
  onExecuteManualSignal: (
    market: MarketTicker,
    sideOverride?: 'LONG' | 'SHORT',
    modeLabelOverride?: string
  ) => void;
  onClosePosition: (positionId: string, reason?: string) => void;
  onKillAndFlipPosition: (position: OpenPosition) => void;
  onRunConfluenceCycle: () => void;
  onOpenPortfolioModal: () => void;
  riskSliderValue: number;
  riskLabel: string;
  sliderProgressPct: number;
  onRiskSliderChange: (val: number) => void;
  strategyPreset: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
  onSelectStrategyPreset: (
    preset: 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE'
  ) => void;
}

type SynapticCenterTab = 'TOPOLOGY_AND_50' | 'MATRIX_50';
type MatrixFilterMode = 'ALL' | 'SIGNALS' | 'OPEN_POS' | 'VIP';
type BottomCenterTab = 'AUTOPSY' | 'EVENT_BUS';

export const V3CyberpunkNeuralDashboard: React.FC<
  V3CyberpunkNeuralDashboardProps
> = ({
  markets,
  selectedMarket,
  scannedMarket,
  onSelectSymbol,
  isScanPinned,
  onTogglePinScan,
  openPositions,
  closedHistory,
  subFunds,
  confluenceRatioPct,
  onChangeConfluenceRatioPct,
  strategyConfig,
  onUpdateStrategyConfig,
  onMovePositionSlToBreakeven,
  onMoveAllPositionsSlToBreakeven,
  onAdjustPositionTpSlPct,
  microstructure,
  scannedMicrostructure,
  watchdog,
  onToggleWatchdogKillSwitch,
  rateLimiter,
  busEvents,
  newsFeed,
  autopsyRecords,
  tradeEfficiency,
  onTriggerScenario,
  onTriggerLiveMarketNews,
  onSubmitCustomNews,
  onExecuteManualSignal,
  onClosePosition,
  onKillAndFlipPosition,
  onRunConfluenceCycle,
  onOpenPortfolioModal,
  riskSliderValue,
  riskLabel,
  sliderProgressPct,
  onRiskSliderChange,
  strategyPreset,
  onSelectStrategyPreset,
}) => {
  const [customNewsInput, setCustomNewsInput] = useState('');
  const [customNewsSource] = useState('Binance Official / X Feed');
  const [centerTab, setCenterTab] =
    useState<SynapticCenterTab>('TOPOLOGY_AND_50');
  const [matrixFilter, setMatrixFilter] = useState<MatrixFilterMode>('ALL');
  const [matrixSearch, setMatrixSearch] = useState('');
  const [bottomCenterTab, setBottomCenterTab] =
    useState<BottomCenterTab>('AUTOPSY');
  const [showBotSettingsModal, setShowBotSettingsModal] = useState(false);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [customPosSlPct, setCustomPosSlPct] = useState<number>(
    strategyConfig.stopLossPct
  );
  const [customPosTpPct, setCustomPosTpPct] = useState<number>(
    strategyConfig.takeProfitPct
  );

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customNewsInput.trim()) return;
    onSubmitCustomNews(customNewsInput.trim(), customNewsSource);
    setCustomNewsInput('');
  };

  const totalRealizedAndUnrealized =
    subFunds.confluenceFund.realizedPnlUsdt +
    subFunds.confluenceFund.unrealizedPnlUsdt +
    subFunds.sniperFund.realizedPnlUsdt +
    subFunds.sniperFund.unrealizedPnlUsdt;

  const latestNews = newsFeed[0] || null;

  // OBI & TFI percentage positions (0% to 100%, where 50% is neutral 0.00)
  const obiGaugePct = Math.max(
    4,
    Math.min(96, Math.round((microstructure.obiScore + 1) * 50))
  );
  const tfiGaugePct = Math.max(
    4,
    Math.min(96, Math.round((microstructure.tfiScore + 1) * 50))
  );

  const openPosMap = useMemo(() => {
    const map = new Map<string, OpenPosition>();
    for (const p of openPositions) {
      map.set(p.symbol, p);
    }
    return map;
  }, [openPositions]);

  const activeSignalsCount = useMemo(
    () => markets.filter((m) => m.signal !== 'BEKLE').length,
    [markets]
  );

  const filtered50Markets = useMemo(() => {
    const q = matrixSearch.trim().toUpperCase();
    return markets.filter((m) => {
      if (q && !m.symbol.includes(q) && !m.baseAsset.includes(q)) {
        return false;
      }
      if (matrixFilter === 'SIGNALS') return m.signal !== 'BEKLE';
      if (matrixFilter === 'OPEN_POS') return openPosMap.has(m.symbol);
      if (matrixFilter === 'VIP') {
        return (
          openPosMap.has(m.symbol) ||
          newsFeed.some((n) => n.detectedSymbol === m.symbol)
        );
      }
      return true;
    });
  }, [markets, matrixFilter, matrixSearch, openPosMap, newsFeed]);

  // Aggregate real-time stats across all 50 markets for the synaptic topology
  const aggregate50Stats = useMemo(() => {
    const bullCount = markets.filter((m) => m.emaFast >= m.emaSlow).length;
    const bearCount = markets.length - bullCount;
    const avgRsi =
      markets.reduce((acc, m) => acc + m.rsi14, 0) /
      Math.max(1, markets.length);
    return { bullCount, bearCount, avgRsi: avgRsi.toFixed(0) };
  }, [markets]);

  return (
    <div className="relative flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
      {/* =====================================================================
          SOL SÜTUN (3 SÜTUN): DEPARTMAN 1 (HABER & AI İSTİHBARATI) + %70/%30 ALT-KASALAR
         ===================================================================== */}
      <section
        aria-label="Departman 1 Haber İstihbaratı ve Alt-Kasalar"
        className="lg:col-span-3 ai-glass-card rounded-2xl p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden"
      >
        {/* 1. ÜST BLOK: %70 CONFLUENCE & %30 HABER SNIPER ALT-KASALARI (SUB-FUNDS) */}
        <div className="shrink-0">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Radio className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <h2 className="text-[11px] font-extrabold tracking-wide text-white uppercase truncate">
                DEPT 1: AI HABER & ALT-KASALAR
              </h2>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowBotSettingsModal(true)}
                className="text-[9.5px] font-mono font-bold text-amber-300 hover:text-amber-200 cursor-pointer"
              >
                Oran: %{confluenceRatioPct}/%{100 - confluenceRatioPct}
              </button>
              <span className="text-slate-600">·</span>
              <button
                type="button"
                onClick={onOpenPortfolioModal}
                className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Portföy
              </button>
            </div>
          </div>

          {/* Toplam Net Kasa + 2 İzole Alt-Fon Kartı */}
          <div className="mt-1.5 flex items-baseline justify-between">
            <div>
              <div className="text-[9.5px] text-slate-400">
                Toplam Net Kasa (%{confluenceRatioPct} Normal + %
                {100 - confluenceRatioPct} Sniper)
              </div>
              <div className="text-xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                $
                {subFunds.totalNetEquityUsdt.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div
              className={`text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded border ${
                totalRealizedAndUnrealized >= 0
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
              }`}
            >
              {totalRealizedAndUnrealized >= 0 ? '+' : ''}
              {totalRealizedAndUnrealized.toFixed(2)} USDT K/Z
            </div>
          </div>

          {/* Normal Confluence Kasası vs Haber Sniper Kasası */}
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 font-mono tabular-nums">
            <div
              onClick={onOpenPortfolioModal}
              className="p-2 rounded-xl bg-[#090d16]/95 border border-cyan-500/35 hover:border-cyan-400 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between text-[9px] text-cyan-300 font-bold">
                <span>%{confluenceRatioPct} CONFLUENCE</span>
                <span>{subFunds.confluenceFund.openPositionsCount} Açık</span>
              </div>
              <div className="text-xs font-extrabold text-white mt-0.5">
                ${subFunds.confluenceFund.netEquityUsdt.toFixed(2)}
              </div>
              <div className="flex items-center justify-between text-[8.5px] text-slate-400 mt-0.5">
                <span>
                  Boş: ${subFunds.confluenceFund.freeCashUsdt.toFixed(0)}
                </span>
                <span
                  className={
                    subFunds.confluenceFund.realizedPnlUsdt +
                      subFunds.confluenceFund.unrealizedPnlUsdt >=
                    0
                      ? 'text-emerald-400 font-bold'
                      : 'text-rose-400 font-bold'
                  }
                >
                  {subFunds.confluenceFund.realizedPnlUsdt +
                    subFunds.confluenceFund.unrealizedPnlUsdt >=
                  0
                    ? '+'
                    : ''}
                  {(
                    subFunds.confluenceFund.realizedPnlUsdt +
                    subFunds.confluenceFund.unrealizedPnlUsdt
                  ).toFixed(2)}
                  $
                </span>
              </div>
            </div>

            <div
              onClick={onOpenPortfolioModal}
              className="p-2 rounded-xl bg-[#090d16]/95 border border-purple-500/40 hover:border-purple-400 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between text-[9px] text-purple-300 font-bold">
                <span>%{100 - confluenceRatioPct} HABER SNIPER</span>
                <span>{subFunds.sniperFund.openPositionsCount} Açık</span>
              </div>
              <div className="text-xs font-extrabold text-white mt-0.5">
                ${subFunds.sniperFund.netEquityUsdt.toFixed(2)}
              </div>
              <div className="flex items-center justify-between text-[8.5px] text-slate-400 mt-0.5">
                <span>Boş: ${subFunds.sniperFund.freeCashUsdt.toFixed(0)}</span>
                <span
                  className={
                    subFunds.sniperFund.realizedPnlUsdt +
                      subFunds.sniperFund.unrealizedPnlUsdt >=
                    0
                      ? 'text-emerald-400 font-bold'
                      : 'text-rose-400 font-bold'
                  }
                >
                  {subFunds.sniperFund.realizedPnlUsdt +
                    subFunds.sniperFund.unrealizedPnlUsdt >=
                  0
                    ? '+'
                    : ''}
                  {(
                    subFunds.sniperFund.realizedPnlUsdt +
                    subFunds.sniperFund.unrealizedPnlUsdt
                  ).toFixed(2)}
                  $
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. ORTA BLOK: STRES TESTİ SENARYO TETİKLEYİCİLERİ & ÖZEL HABER GİRİŞİ (temp: 0.2) */}
        <div className="pt-1.5 border-t border-slate-800/80 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-200">
              Anlık Haber Stres Testi & AI Çevirmen
            </span>
            <span className="text-[9px] font-mono text-emerald-400">
              temp: {V3_AI_ENGINE_CONFIG.temperature} · JSON
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {V3_STRESS_TEST_SCENARIOS.slice(0, 4).map((sc) => {
              const isBull =
                sc.explicitScore >= 85 && sc.overridePriceChange5sPct <= 3;
              const isBear = sc.explicitScore <= -85;
              const isPricedIn = sc.overridePriceChange5sPct > 3;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => onTriggerScenario(sc)}
                  className={`px-2 py-1 rounded-lg text-[9.5px] font-mono font-bold text-left truncate transition-all cursor-pointer border ${
                    isBull
                      ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                      : isBear
                      ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40'
                      : isPricedIn
                      ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40'
                      : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/40'
                  }`}
                >
                  {sc.badgeLabel}
                </button>
              );
            })}
          </div>

          {/* Özel Haber Analiz Formu */}
          <form
            onSubmit={handleCustomSubmit}
            className="mt-1.5 flex items-center gap-1"
          >
            <input
              type="text"
              value={customNewsInput}
              onChange={(e) => setCustomNewsInput(e.target.value)}
              placeholder='Haber gir ("Vitalik ETF", "Sam Altman", "ARB hack")...'
              aria-label="Canlı Haber Analiz Girişi"
              className="flex-1 min-w-0 px-2.5 py-1 rounded-lg bg-[#090d16] border border-slate-700/80 text-[10.5px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              aria-label="Haberi AI ile Analiz Et"
              className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Send className="w-3 h-3" />
              <span>Analiz</span>
            </button>
          </form>
        </div>

        {/* 3. ALT BLOK: CANLI AKAN HABERLER, SEMANTIC HASH, FAKE GUARD & AI PUANLARI */}
        <div className="pt-1.5 border-t border-slate-800/80 flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-1 shrink-0">
            <span className="text-[10px] font-bold text-white uppercase tracking-wide">
              Canlı Haber Akışı ({newsFeed.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onTriggerLiveMarketNews}
                className="text-[9px] font-mono text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
              >
                Canlı Piyasa Haberi
              </button>
              <button
                type="button"
                onClick={() => onTriggerScenario(V3_STRESS_TEST_SCENARIOS[4])}
                className="text-[9px] font-mono text-amber-300 hover:text-amber-200 underline cursor-pointer"
              >
                Sahte Haber Testi
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
            {newsFeed.length === 0 ? (
              <div className="p-3 rounded-xl border border-slate-800 bg-[#090d16]/80 text-center space-y-1">
                <div className="text-[10.5px] font-mono font-bold text-slate-300">
                  HENÜZ HABER KAYDI YOK (BOŞ DURUM)
                </div>
                <p className="text-[9.5px] text-slate-400">
                  Sentetik başlangıç haberleri kaldırıldı. Gerçek CryptoCompare haberlerini çekmek için{' '}
                  <strong className="text-cyan-300">"Canlı Piyasa Haberi"</strong> butonuna basın veya yukarıdan manuel girdi gönderin. Tüm NLP/AI skorları{' '}
                  <strong className="text-amber-300">AI Tahmini (AI Estimate)</strong> olarak etiketlenir.
                </p>
              </div>
            ) : (
              newsFeed.slice(0, 8).map((item) => {
                const isPositive = item.aiImpactScore >= 0;
                const isBlocked =
                  item.isDuplicate ||
                  item.isFakeOrHacked ||
                  item.pricedInBlocked ||
                  item.triggeredMode.startsWith('BLOCKED');

                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectSymbol(item.detectedSymbol)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer ${
                      isBlocked
                        ? 'bg-slate-900/70 border-amber-500/40'
                        : isPositive
                        ? 'bg-[#090d16]/90 border-emerald-500/35 hover:border-emerald-400/70'
                        : 'bg-[#090d16]/90 border-rose-500/40 hover:border-rose-400/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[9.5px] font-mono">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-extrabold text-cyan-300 shrink-0">
                          {item.detectedSymbol.replace('USDT', '/USDT')}
                        </span>
                        <span className="px-1 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[8.5px] shrink-0">
                          {item.isManualInput ? 'MANUEL GİRİŞ' : 'AI TAHMİNİ'}
                        </span>
                        <span className="text-slate-400 truncate">
                          · {item.matchedEntityLabel}
                        </span>
                      </div>
                      <span
                        className={`font-extrabold shrink-0 ${
                          isBlocked
                            ? 'text-amber-400'
                            : isPositive
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {item.aiImpactScore >= 0 ? '+' : ''}
                        {item.aiImpactScore} Puan (AI Tahmini)
                      </span>
                    </div>

                    <p className="text-[10.5px] text-slate-200 font-medium leading-snug mt-0.5 line-clamp-2">
                      {item.headline}
                    </p>

                    <div className="mt-1 flex items-center justify-between gap-1 text-[9px] font-mono text-slate-400">
                      <span className="truncate flex items-center gap-1">
                        <span className="truncate">{item.source}</span>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-cyan-400 hover:text-cyan-300 underline shrink-0"
                            title="Gerçek Haber Kaynağını Yeni Sekmede Aç"
                          >
                            [Kaynak URL ↗]
                          </a>
                        )}
                        <span>
                          ·{' '}
                          {new Date(
                            item.publishedAtMs || item.timestampMs
                          ).toLocaleTimeString('tr-TR')}{' '}
                          · {item.processingLatencyMs}ms
                        </span>
                      </span>
                      <span
                        className={`font-bold shrink-0 ${
                          item.triggeredMode === 'MOD_1_SNIPE'
                            ? 'text-emerald-400'
                            : item.triggeredMode === 'MOD_3_KILL_FLIP'
                            ? 'text-rose-400'
                            : item.triggeredMode === 'MOD_2_CONFLUENCE'
                            ? 'text-cyan-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {item.triggeredMode === 'MOD_1_SNIPE'
                          ? 'MOD 1: SNIPE'
                          : item.triggeredMode === 'MOD_3_KILL_FLIP'
                          ? 'MOD 3: KILL&FLIP'
                          : item.triggeredMode === 'MOD_2_CONFLUENCE'
                          ? 'MOD 2: UYUM'
                          : item.isFakeOrHacked
                          ? 'SAHTE ELENDİ'
                          : item.isDuplicate
                          ? 'MÜKERRER ELENDİ'
                          : item.pricedInBlocked
                          ? `PRICED-IN (%${item.priceChange5sPct.toFixed(1)})`
                          : 'İZLEMEDE'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          ORTA SÜTUN (5 SÜTUN): MERKEZİ SİNİR SİSTEMİ (AsyncEventBus), SİNAPTİK NÖRAL AĞ,
          TÜM 50 KOİNİN CANLI SİNAPTİK MATRİSİ, 3 MODLU HİBRİT KARAR MOTORU & OTOPSİ UZMANI
         ===================================================================== */}
      <section
        aria-label="Merkezi Sinir Sistemi Sinaptik Ağ ve Otopsi Uzmanı"
        className="lg:col-span-5 ai-glass-card rounded-2xl p-3 flex flex-col justify-between gap-1.5 min-h-0 overflow-hidden"
      >
        {/* 1. ÜST BAŞLIK: MERKEZİ SİNİR SİSTEMİ & 50 KOİN GÖRÜNÜM SEÇİCİ */}
        <div className="flex items-center justify-between gap-1.5 border-b border-slate-800/80 pb-1.5 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="text-[11px] font-extrabold tracking-wider text-white uppercase truncate">
              SİNAPTİK NÖRAL AĞ (50 KOİN CANLI)
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                setCenterTab((prev) =>
                  prev === 'TOPOLOGY_AND_50' ? 'MATRIX_50' : 'TOPOLOGY_AND_50'
                )
              }
              className={`px-2 py-0.5 rounded-lg text-[9.5px] font-mono font-bold border cursor-pointer transition-colors ${
                centerTab === 'MATRIX_50'
                  ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-cyan-300 border-slate-700'
              }`}
            >
              {centerTab === 'MATRIX_50'
                ? 'Topoloji + 50 Koin'
                : '50 Koin Tam Matris'}
            </button>
            <button
              type="button"
              onClick={onTogglePinScan}
              className="px-2 py-0.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-[9.5px] font-mono text-slate-200 border border-slate-700 cursor-pointer"
            >
              {isScanPinned
                ? `Sabit: ${selectedMarket.baseAsset}`
                : `Oto Tarama (${scannedMarket.baseAsset})`}
            </button>
            <button
              type="button"
              onClick={onRunConfluenceCycle}
              className="px-2 py-0.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-[9.5px] font-bold text-emerald-300 cursor-pointer whitespace-nowrap"
            >
              Confluence Turu
            </button>
          </div>
        </div>

        {/* 2. CANLI SİNAPTİK NÖRAL TOPOLOJİ ŞEMASI + TÜM 50 KOİNİN CANLI SİNAPTİK HAREKETLERİ */}
        <div
          aria-label="Canlı Paralel İşçi Sinaptik Topolojisi ve 50 Koin Hareketleri"
          className="rounded-xl bg-[#070b14]/95 border border-cyan-500/30 p-2 shrink-0 flex flex-col gap-1.5"
        >
          {centerTab === 'TOPOLOGY_AND_50' ? (
            <>
              <div className="flex items-center justify-between text-[9px] font-mono">
                <span className="text-cyan-300 font-bold truncate">
                  Tarama: {scannedMarket.baseAsset}/USDT ($
                  {formatCompactPrice(scannedMarket.price)}) · OBI:{' '}
                  {scannedMicrostructure.obiScore >= 0 ? '+' : ''}
                  {scannedMicrostructure.obiScore} · TFI:{' '}
                  {scannedMicrostructure.tfiScore >= 0 ? '+' : ''}
                  {scannedMicrostructure.tfiScore} · 50 Koin: ▲
                  {aggregate50Stats.bullCount} / ▼{aggregate50Stats.bearCount}
                </span>
                <span className="text-slate-400 shrink-0">
                  {activeSignalsCount} Aktif Sinyal · VIP Token:{' '}
                  {rateLimiter.availableTokens}/{rateLimiter.maxTokens}
                </span>
              </div>

              {/* 3 Katmanlı Paralel İşçi Sinaptik SVG */}
              <svg
                viewBox="0 0 500 94"
                className="w-full h-[84px] overflow-visible"
                role="img"
                aria-label="V3.0 Paralel İşçi ve AsyncEventBus Sinaptik Topolojisi"
              >
                <defs>
                  <linearGradient
                    id="v3SynapseGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.85" />
                    <stop offset="50%" stopColor="#a855f7" stopOpacity="0.85" />
                    <stop
                      offset="100%"
                      stopColor="#10b981"
                      stopOpacity="0.95"
                    />
                  </linearGradient>
                </defs>

                {[16, 47, 78].map((y1, idx1) =>
                  [16, 47, 78].map((y2, idx2) => (
                    <g key={`left-${idx1}-${idx2}`}>
                      <line
                        x1="122"
                        y1={y1}
                        x2="188"
                        y2={y2}
                        stroke="url(#v3SynapseGrad)"
                        strokeWidth={idx1 === idx2 ? '1.8' : '0.85'}
                        strokeOpacity={idx1 === idx2 ? '0.85' : '0.32'}
                      />
                      {idx1 === idx2 && (
                        <circle r="2.5" fill="#22d3ee">
                          <animateMotion
                            dur={`${1.0 + idx1 * 0.22}s`}
                            repeatCount="indefinite"
                            path={`M 122 ${y1} L 188 ${y2}`}
                          />
                        </circle>
                      )}
                    </g>
                  ))
                )}

                {[16, 47, 78].map((y2, idx2) => (
                  <g key={`right-${idx2}`}>
                    <line
                      x1="322"
                      y1={y2}
                      x2="378"
                      y2="32"
                      stroke="url(#v3SynapseGrad)"
                      strokeWidth="1.5"
                      strokeOpacity="0.7"
                    />
                    <line
                      x1="322"
                      y1={y2}
                      x2="378"
                      y2="70"
                      stroke="url(#v3SynapseGrad)"
                      strokeWidth="1.3"
                      strokeOpacity="0.55"
                    />
                    <circle
                      r="2.5"
                      fill={
                        idx2 === 0
                          ? '#a855f7'
                          : idx2 === 1
                          ? '#22d3ee'
                          : '#10b981'
                      }
                    >
                      <animateMotion
                        dur={`${0.95 + idx2 * 0.2}s`}
                        repeatCount="indefinite"
                        path={`M 322 ${y2} L 378 32`}
                      />
                    </circle>
                  </g>
                ))}

                {/* KATMAN 1: DIŞ DÜNYA VERİ KAYNAKLARI */}
                {[
                  {
                    y: 16,
                    title: '(A) HABER & X AKIŞI',
                    sub: latestNews
                      ? `${latestNews.detectedSymbol} (${
                          latestNews.aiImpactScore >= 0 ? '+' : ''
                        }${latestNews.aiImpactScore})`
                      : 'Binance / Upbit / X',
                    stroke: '#a855f7',
                  },
                  {
                    y: 47,
                    title: '(B) 50 KOİN L2 & TFI',
                    sub: `▲${aggregate50Stats.bullCount} Boğa · ▼${aggregate50Stats.bearCount} Ayı · RSI ${aggregate50Stats.avgRsi}`,
                    stroke: '#22d3ee',
                  },
                  {
                    y: 78,
                    title: '(C) PRIVATE WS & KASA',
                    sub: `Ping ${watchdog.pingMs}ms · $${subFunds.totalNetEquityUsdt.toFixed(
                      0
                    )}`,
                    stroke: watchdog.killSwitchActive ? '#f43f5e' : '#10b981',
                  },
                ].map((node, i) => (
                  <g key={i} transform={`translate(4, ${node.y - 12})`}>
                    <rect
                      x="0"
                      y="0"
                      width="118"
                      height="24"
                      rx="5"
                      fill="#0f172a"
                      stroke={node.stroke}
                      strokeWidth="1.3"
                    />
                    <text
                      x="7"
                      y="10"
                      fill="#e2e8f0"
                      fontSize="7.5"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {node.title}
                    </text>
                    <text
                      x="7"
                      y="19.5"
                      fill="#94a3b8"
                      fontSize="7.2"
                      fontFamily="monospace"
                    >
                      {node.sub}
                    </text>
                  </g>
                ))}

                {/* KATMAN 2: PARALEL İŞÇİLER & ASYNC EVENT BUS */}
                {[
                  {
                    y: 16,
                    title: 'DEPT 1: HABER & LLM',
                    sub: `temp:0.2 · Fake/Dedup OK`,
                    stroke: '#a855f7',
                  },
                  {
                    y: 47,
                    title: 'DEPT 2: 50 KOİN TARAMA',
                    sub: `${selectedMarket.baseAsset} OBI ${
                      microstructure.obiScore >= 0 ? '+' : ''
                    }${microstructure.obiScore} · ATR %${microstructure.atrPct}`,
                    stroke: '#22d3ee',
                  },
                  {
                    y: 78,
                    title: 'DEPT 3: KASA & TP/SL',
                    sub: watchdog.killSwitchActive
                      ? 'KILL_SWITCH KİLİTLİ!'
                      : `TP %${strategyConfig.takeProfitPct} / SL %${strategyConfig.stopLossPct}`,
                    stroke: watchdog.killSwitchActive ? '#f43f5e' : '#10b981',
                  },
                ].map((worker, i) => (
                  <g key={i} transform={`translate(188, ${worker.y - 12})`}>
                    <rect
                      x="0"
                      y="0"
                      width="134"
                      height="24"
                      rx="5"
                      fill="#111827"
                      stroke={worker.stroke}
                      strokeWidth="1.4"
                    />
                    <text
                      x="7"
                      y="10"
                      fill="#f8fafc"
                      fontSize="7.5"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {worker.title}
                    </text>
                    <text
                      x="7"
                      y="19.5"
                      fill="#38bdf8"
                      fontSize="7.2"
                      fontFamily="monospace"
                    >
                      {worker.sub}
                    </text>
                  </g>
                ))}

                {/* KATMAN 3: SENTEZ KARAR MOTORU & SMART ORDER ROUTER */}
                <g transform="translate(378, 6)">
                  <rect
                    x="0"
                    y="0"
                    width="118"
                    height="42"
                    rx="7"
                    fill="#0f172a"
                    stroke={
                      watchdog.killSwitchActive
                        ? '#f43f5e'
                        : scannedMicrostructure.confluenceScore >= 80
                        ? '#10b981'
                        : '#38bdf8'
                    }
                    strokeWidth="1.7"
                  />
                  <text
                    x="59"
                    y="12"
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="7.2"
                    fontFamily="monospace"
                  >
                    KARAR MOTORU (MOD 1/2/3)
                  </text>
                  <text
                    x="59"
                    y="25"
                    textAnchor="middle"
                    fill={
                      watchdog.killSwitchActive
                        ? '#fb7185'
                        : scannedMicrostructure.obiScore >= 0
                        ? '#34d399'
                        : '#fb7185'
                    }
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {watchdog.killSwitchActive
                      ? 'KILL_SWITCH'
                      : `UYUM: ${scannedMicrostructure.confluenceScore}/100`}
                  </text>
                  <text
                    x="59"
                    y="36.5"
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize="7.2"
                    fontFamily="monospace"
                  >
                    Priced-In 5sn: %{scannedMicrostructure.priceChange5sPct}
                  </text>
                </g>

                <g transform="translate(378, 54)">
                  <rect
                    x="0"
                    y="0"
                    width="118"
                    height="34"
                    rx="7"
                    fill="#0f172a"
                    stroke="#22d3ee"
                    strokeWidth="1.4"
                  />
                  <text
                    x="59"
                    y="13"
                    textAnchor="middle"
                    fill="#22d3ee"
                    fontSize="7.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    OCO TP/SL & ROUTER
                  </text>
                  <text
                    x="59"
                    y="25"
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize="7.2"
                    fontFamily="monospace"
                  >
                    {openPositions.length} Açık · {closedHistory.length} Biten
                  </text>
                </g>
              </svg>

              {/* 50 KOİN CANLI SİNAPTİK NÖRAL HAREKET MATRİSİ (TÜM 50 KOİN KAYDIRILABİLİR VE TIKLANABİLİR) */}
              <div className="pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ['ALL', `Tümü (${markets.length})`],
                        ['SIGNALS', `Sinyaller (${activeSignalsCount})`],
                        ['OPEN_POS', `Açık (${openPositions.length})`],
                        ['VIP', 'VIP Haber'],
                      ] as const
                    ).map(([fKey, fLabel]) => (
                      <button
                        key={fKey}
                        type="button"
                        onClick={() => setMatrixFilter(fKey)}
                        className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold cursor-pointer ${
                          matrixFilter === fKey
                            ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                            : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {fLabel}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-28">
                    <Search className="w-2.5 h-2.5 text-slate-500 absolute left-1.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={matrixSearch}
                      onChange={(e) => setMatrixSearch(e.target.value)}
                      placeholder="Koin ara..."
                      aria-label="Sinaptik Ağda Koin Ara"
                      className="w-full pl-4 pr-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[8.5px] font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                {/* 50 Koin Canlı Sinaptik Hücreler (Grid) */}
                <div className="max-h-[68px] overflow-y-auto grid grid-cols-5 sm:grid-cols-5 gap-1 pr-0.5 font-mono tabular-nums">
                  {filtered50Markets.map((m) => {
                    const hasOpen = openPosMap.get(m.symbol);
                    const isFocused = selectedMarket.symbol === m.symbol;
                    const isScanned = scannedMarket.symbol === m.symbol;
                    const isUp = m.change24hPct >= 0;
                    return (
                      <div
                        key={m.symbol}
                        onClick={() => onSelectSymbol(m.symbol)}
                        className={`px-1.5 py-1 rounded-lg border text-[8.5px] cursor-pointer transition-all flex flex-col justify-between ${
                          hasOpen
                            ? 'bg-emerald-950/40 border-emerald-400/70'
                            : isFocused
                            ? 'bg-cyan-950/50 border-cyan-400'
                            : isScanned
                            ? 'bg-purple-950/35 border-purple-400/60'
                            : m.signal === 'LONG'
                            ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-400'
                            : m.signal === 'SHORT'
                            ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400'
                            : 'bg-[#090d16]/90 border-slate-800/90 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-0.5">
                          <span className="font-extrabold text-white truncate">
                            {m.baseAsset}
                          </span>
                          <span
                            className={`text-[7.5px] font-bold ${
                              hasOpen
                                ? 'text-emerald-300'
                                : m.signal === 'LONG'
                                ? 'text-emerald-400'
                                : m.signal === 'SHORT'
                                ? 'text-rose-400'
                                : isUp
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {hasOpen
                              ? `${hasOpen.side[0]}${hasOpen.leverage}x`
                              : m.signal !== 'BEKLE'
                              ? m.signal
                              : `${isUp ? '+' : ''}${m.change24hPct.toFixed(1)}%`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[8px] text-slate-300 mt-0.5">
                          <span className="truncate">
                            ${formatCompactPrice(m.price)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExecuteManualSignal(
                                m,
                                m.signal === 'SHORT'
                                  ? 'SHORT'
                                  : m.emaFast >= m.emaSlow
                                  ? 'LONG'
                                  : 'SHORT',
                                `SİNAPTİK AĞ HIZLI EMİR (${m.baseAsset})`
                              );
                            }}
                            title={`${m.baseAsset} Hızlı İşlem Aç`}
                            className="px-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-200 font-bold cursor-pointer"
                          >
                            ⚡
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* 50 KOİN TAM SİNAPTİK RADAR MATRİSİ (GENİŞLETİLMİŞ GÖRÜNÜM) */
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['ALL', `Tüm 50 Koin (${markets.length})`],
                      ['SIGNALS', `Aktif Sinyaller (${activeSignalsCount})`],
                      ['OPEN_POS', `Açık Pozlar (${openPositions.length})`],
                      ['VIP', 'VIP Haber Koinleri'],
                    ] as const
                  ).map(([fKey, fLabel]) => (
                    <button
                      key={fKey}
                      type="button"
                      onClick={() => setMatrixFilter(fKey)}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer ${
                        matrixFilter === fKey
                          ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                          : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {fLabel}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  placeholder="50 koin içinde filtrele..."
                  className="w-36 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[9px] font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="h-[155px] overflow-y-auto grid grid-cols-4 sm:grid-cols-5 gap-1 pr-0.5 font-mono tabular-nums">
                {filtered50Markets.map((m) => {
                  const hasOpen = openPosMap.get(m.symbol);
                  const isFocused = selectedMarket.symbol === m.symbol;
                  const isUp = m.change24hPct >= 0;
                  return (
                    <div
                      key={m.symbol}
                      onClick={() => onSelectSymbol(m.symbol)}
                      className={`p-1.5 rounded-lg border text-[8.5px] cursor-pointer transition-all ${
                        hasOpen
                          ? 'bg-emerald-950/45 border-emerald-400/80'
                          : isFocused
                          ? 'bg-cyan-950/50 border-cyan-400'
                          : m.signal === 'LONG'
                          ? 'bg-emerald-950/20 border-emerald-500/40'
                          : m.signal === 'SHORT'
                          ? 'bg-rose-950/20 border-rose-500/40'
                          : 'bg-[#090d16]/90 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-white">
                          {m.baseAsset}
                        </span>
                        <span
                          className={
                            isUp
                              ? 'text-emerald-400 font-bold'
                              : 'text-rose-400 font-bold'
                          }
                        >
                          {isUp ? '+' : ''}
                          {m.change24hPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[9px] font-bold text-cyan-300 mt-0.5">
                        ${formatCompactPrice(m.price)}
                      </div>
                      <div className="flex items-center justify-between text-[7.5px] text-slate-400 mt-0.5">
                        <span>RSI {m.rsi14.toFixed(0)}</span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExecuteManualSignal(
                                m,
                                'LONG',
                                `50 KOİN MATRİS LONG (${m.baseAsset})`
                              );
                            }}
                            className="px-1 rounded bg-emerald-500/25 hover:bg-emerald-500/45 text-emerald-300 font-bold cursor-pointer"
                          >
                            L
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExecuteManualSignal(
                                m,
                                'SHORT',
                                `50 KOİN MATRİS SHORT (${m.baseAsset})`
                              );
                            }}
                            className="px-1 rounded bg-rose-500/25 hover:bg-rose-500/45 text-rose-300 font-bold cursor-pointer"
                          >
                            S
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AsyncEventBus Son Olay Akışı */}
          <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[9px] font-mono text-slate-300 truncate">
            <span className="text-emerald-400 font-bold shrink-0">
              [EVENT_BUS]
            </span>
            <span className="truncate">
              {busEvents[0]
                ? `${busEvents[0].type} (${busEvents[0].symbol}) → ${busEvents[0].summary} [${busEvents[0].latencyMs}ms]`
                : 'AsyncEventBus tüm paralel işçileri dinliyor...'}
            </span>
          </div>
        </div>

        {/* 3. HİBRİT 3 MOD KARTLARI (MOD 1 SNIPE, MOD 2 CONFLUENCE, MOD 3 KILL & FLIP) */}
        <div className="grid grid-cols-3 gap-1.5 shrink-0">
          {/* MOD 1: Nükleer Haber Saldırısı */}
          <button
            type="button"
            onClick={() => onTriggerScenario(V3_STRESS_TEST_SCENARIOS[0])}
            className="p-2 rounded-xl bg-[#090d16]/90 border border-emerald-500/40 hover:border-emerald-400 text-left transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-[9.5px] font-mono font-bold text-emerald-400">
              <span>MOD 1: NEWS SNIPE</span>
              <span>IOC Taker</span>
            </div>
            <div className="text-[10.5px] font-extrabold text-white mt-0.5 truncate">
              |AI| &gt;= 85 · 5sn &lt; %3
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 truncate">
              Priced-In Guard + Anında Giriş
            </div>
          </button>

          {/* MOD 2: Tahta + Haber Uyumu */}
          <button
            type="button"
            onClick={() =>
              onExecuteManualSignal(
                selectedMarket,
                microstructure.obiScore + microstructure.tfiScore >= 0
                  ? 'LONG'
                  : 'SHORT',
                'MOD 2: TAHTA + HABER CONFLUENCE (POST-ONLY MAKER)'
              )
            }
            className="p-2 rounded-xl bg-[#090d16]/90 border border-cyan-500/40 hover:border-cyan-400 text-left transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-[9.5px] font-mono font-bold text-cyan-300">
              <span>MOD 2: CONFLUENCE</span>
              <span>Maker 0%</span>
            </div>
            <div className="text-[10.5px] font-extrabold text-white mt-0.5 truncate">
              {selectedMarket.baseAsset} Uyum: {microstructure.confluenceScore}
              /100
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 truncate">
              OBI+TFI+Trend · Yarım Kelly
            </div>
          </button>

          {/* MOD 3: Acil Tahliye & Ters İşlem (Kill & Flip) */}
          <button
            type="button"
            onClick={() => {
              if (openPositions.length > 0) {
                onKillAndFlipPosition(openPositions[0]);
              } else {
                onTriggerScenario(V3_STRESS_TEST_SCENARIOS[1]);
              }
            }}
            className="p-2 rounded-xl bg-[#090d16]/90 border border-rose-500/40 hover:border-rose-400 text-left transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-[9.5px] font-mono font-bold text-rose-400">
              <span>MOD 3: KILL & FLIP</span>
              <span>Acil Ters</span>
            </div>
            <div className="text-[10.5px] font-extrabold text-white mt-0.5 truncate">
              {openPositions.length > 0
                ? `${openPositions[0].baseAsset} ${openPositions[0].side} → TERS ÇEVİR`
                : 'Ters Haber (-95) Kalkanı'}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 truncate">
              SL Beklemeden Kapat & Ters Aç
            </div>
          </button>
        </div>

        {/* 4. OTOPSİ UZMANI & ASYNC EVENT BUS CANLI KAYIT TABLOSU */}
        <div className="pt-1 border-t border-slate-800/80 flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-1 shrink-0">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBottomCenterTab('AUTOPSY')}
                  className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase tracking-wide cursor-pointer ${
                    bottomCenterTab === 'AUTOPSY'
                      ? 'bg-purple-500/25 text-purple-200 border border-purple-500/50'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Otopsi Uzmanı ({autopsyRecords.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBottomCenterTab('EVENT_BUS')}
                  className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase tracking-wide cursor-pointer ${
                    bottomCenterTab === 'EVENT_BUS'
                      ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/50'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Event Bus ({busEvents.length})
                </button>
              </div>
            </div>
            <span className="text-[8.5px] font-mono text-slate-400">
              TP: %{strategyConfig.takeProfitPct} · SL: %
              {strategyConfig.stopLossPct}
            </span>
          </div>

          {bottomCenterTab === 'AUTOPSY' ? (
            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 font-mono text-[9.5px] tabular-nums">
              {autopsyRecords.slice(0, 8).map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => onSelectSymbol(rec.symbol)}
                  className="px-2.5 py-1.5 rounded-xl bg-[#090d16]/90 border border-slate-800 hover:border-cyan-500/40 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-extrabold ${
                          rec.side === 'LONG'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {rec.side} {rec.symbol.replace('USDT', '/USDT')}
                      </span>
                      <span className="text-cyan-300 font-bold truncate">
                        · {rec.modeLabel}
                      </span>
                      <span className="text-slate-400 shrink-0">
                        (
                        {rec.subFund === 'SNIPER_30'
                          ? `%${100 - confluenceRatioPct} Sniper`
                          : `%${confluenceRatioPct} Normal`}
                        )
                      </span>
                    </div>
                    <div className="text-[8.5px] text-slate-400 truncate mt-0.5">
                      Giriş: ${formatCompactPrice(rec.fillPrice)} · Hard SL: $
                      {formatCompactPrice(rec.hardStopLossPrice)} · ATR
                      Trailing: ${formatCompactPrice(rec.atrTrailingStopPrice)}{' '}
                      · OBI {rec.obiAtEntry >= 0 ? '+' : ''}
                      {rec.obiAtEntry} / TFI {rec.tfiAtEntry >= 0 ? '+' : ''}
                      {rec.tfiAtEntry}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-emerald-400 font-bold">
                      {rec.newsToOrderLatencyMs}ms ·{' '}
                      {rec.executionType === 'POST_ONLY_MAKER'
                        ? 'Maker'
                        : 'IOC Taker'}
                    </div>
                    <div className="text-[8.5px] text-slate-400">
                      Slippage: {rec.slippageBps.toFixed(1)}bp · %
                      {rec.partialFillPct}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 font-mono text-[9px] tabular-nums">
              {busEvents.slice(0, 12).map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => {
                    if (evt.symbol && evt.symbol.endsWith('USDT')) {
                      onSelectSymbol(evt.symbol);
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-[#090d16]/90 border border-slate-800/90 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="min-w-0 truncate">
                    <span className="text-cyan-300 font-bold">
                      [{evt.type}]
                    </span>{' '}
                    <span className="text-white font-bold">{evt.symbol}:</span>{' '}
                    <span className="text-slate-300">{evt.summary}</span>
                  </div>
                  <span className="text-emerald-400 shrink-0">
                    {evt.latencyMs}ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          SAĞ SÜTUN (4 SÜTUN): DEPARTMAN 2 & 3 — SİSTEM DOKTORU (WATCHDOG),
          OBI/TFI İBRELERİ, D3 TRADE EFFICIENCY GAUGE, CANLI TP/SL POZİSYONLAR & BOT AYARLARI
         ===================================================================== */}
      <section
        aria-label="Departman 2 ve 3 Tahta Dengesi OBI TFI ve Açık Pozisyonlar"
        className="lg:col-span-4 ai-glass-card rounded-2xl p-3 flex flex-col justify-between gap-1.5 min-h-0 overflow-hidden"
      >
        {/* 1. SİSTEM DOKTORU (WATCHDOG) & BOT AYARLARI TETİKLEYİCİSİ */}
        <div className="flex items-center justify-between gap-1.5 border-b border-slate-800/80 pb-1.5 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {watchdog.killSwitchActive ? (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <h2 className="text-[11px] font-extrabold tracking-wide text-white uppercase truncate">
              OBI/TFI · TP/SL · AYARLAR
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleWatchdogKillSwitch}
              className={`px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold border transition-all cursor-pointer ${
                watchdog.killSwitchActive
                  ? 'bg-rose-500/25 text-rose-200 border-rose-500/60'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
              }`}
            >
              {watchdog.killSwitchActive
                ? `KILL (${watchdog.pingMs}ms)`
                : `Ping: ${watchdog.pingMs}ms`}
            </button>
            <button
              type="button"
              onClick={() => setShowBotSettingsModal(true)}
              className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/60 text-amber-200 text-[9.5px] font-mono font-bold flex items-center gap-1 cursor-pointer"
            >
              <Settings className="w-3 h-3" />
              <span>Bot & TP/SL Ayarları</span>
            </button>
          </div>
        </div>

        {/* 2. DEPARTMAN 2: OBI [-1, +1] & TFI [-1, +1] İBRELERİ + HIZLI LONG/SHORT */}
        <div className="p-2 rounded-xl bg-[#090d16]/90 border border-slate-800/90 shrink-0">
          <div className="flex items-center justify-between text-[10px] font-mono mb-1">
            <span className="font-bold text-white truncate">
              L2 Tahta ({microstructure.baseAsset}/USDT $
              {formatCompactPrice(selectedMarket.price)})
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onExecuteManualSignal(
                    selectedMarket,
                    'LONG',
                    `MANUEL LONG (${selectedMarket.baseAsset} · TP %${strategyConfig.takeProfitPct} / SL %${strategyConfig.stopLossPct})`
                  )
                }
                className="px-1.5 py-0.5 rounded bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-500/50 text-emerald-200 text-[8.5px] font-bold cursor-pointer"
              >
                +LONG Aç
              </button>
              <button
                type="button"
                onClick={() =>
                  onExecuteManualSignal(
                    selectedMarket,
                    'SHORT',
                    `MANUEL SHORT (${selectedMarket.baseAsset} · TP %${strategyConfig.takeProfitPct} / SL %${strategyConfig.stopLossPct})`
                  )
                }
                className="px-1.5 py-0.5 rounded bg-rose-500/25 hover:bg-rose-500/40 border border-rose-500/50 text-rose-200 text-[8.5px] font-bold cursor-pointer"
              >
                -SHORT Aç
              </button>
            </div>
          </div>

          {/* OBI (Order Book Imbalance) [-1, +1] Bar Gauge */}
          <div className="space-y-1 font-mono text-[9px] tabular-nums">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">
                  OBI (Emir Defteri Baskısı [-1, +1]):
                </span>
                <span
                  className={`font-extrabold ${
                    microstructure.obiScore >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {microstructure.obiScore >= 0 ? '+' : ''}
                  {microstructure.obiScore.toFixed(2)} (
                  {microstructure.obiScore >= 0
                    ? 'ALICI DUVARI'
                    : 'SATICI DUVARI'}
                  )
                </span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-slate-900 border border-slate-800 relative overflow-hidden">
                <div className="absolute inset-y-0 left-1/2 w-0.5 bg-slate-500 z-10" />
                <div
                  style={{ width: `${obiGaugePct}%` }}
                  className={`h-full transition-all duration-300 ${
                    microstructure.obiScore >= 0
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                      : 'bg-gradient-to-r from-rose-500 to-amber-400'
                  }`}
                />
              </div>
            </div>

            {/* TFI (Trade Flow Imbalance) [-1, +1] Bar Gauge */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">
                  TFI (Agresif Taker Hacim Dengesi):
                </span>
                <span
                  className={`font-extrabold ${
                    microstructure.tfiScore >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {microstructure.tfiScore >= 0 ? '+' : ''}
                  {microstructure.tfiScore.toFixed(2)} (
                  {microstructure.tfiScore >= 0 ? 'TAKER BUY' : 'TAKER SELL'})
                </span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-slate-900 border border-slate-800 relative overflow-hidden">
                <div className="absolute inset-y-0 left-1/2 w-0.5 bg-slate-500 z-10" />
                <div
                  style={{ width: `${tfiGaugePct}%` }}
                  className={`h-full transition-all duration-300 ${
                    microstructure.tfiScore >= 0
                      ? 'bg-gradient-to-r from-purple-500 to-emerald-400'
                      : 'bg-gradient-to-r from-rose-600 to-rose-400'
                  }`}
                />
              </div>
            </div>

            {/* 5m/15m EMA, RSI ve Dinamik ATR Özeti */}
            <div className="pt-0.5 flex items-center justify-between text-[8.5px] text-slate-300">
              <span>
                5m/15m:{' '}
                <strong
                  className={
                    microstructure.emaTrend5m === 'BULL'
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }
                >
                  {microstructure.emaTrend5m}/{microstructure.emaTrend15m}
                </strong>
              </span>
              <span>RSI: {microstructure.rsi15m}</span>
              <span>Spread: {microstructure.spreadBps}bp</span>
              <span>
                ATR: ${formatCompactPrice(microstructure.atr15m)} (%
                {microstructure.atrPct})
              </span>
            </div>
          </div>
        </div>

        {/* 3. D3 TRADE EFFICIENCY SCORE GAUGE (ORT. KÂR VS SLIPPAGE VS PİYASA STD) */}
        <div className="shrink-0">
          <TradeEfficiencyGaugeCard metrics={tradeEfficiency} />
        </div>

        {/* 4. CANLI AÇIK POZİSYONLAR (CANLI OCO TP/SL İLERLEME ÇUBUĞU, BAŞABAŞ SL & DÜZENLEME) */}
        <div className="pt-1 border-t border-slate-800/80 flex-1 flex flex-col justify-between min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <span className="text-[10px] font-extrabold text-white uppercase tracking-wide">
                Canlı Pozisyonlar ({openPositions.length} Açık · TP %
                {strategyConfig.takeProfitPct} / SL %
                {strategyConfig.stopLossPct})
              </span>
              <div className="flex items-center gap-1.5">
                {openPositions.length > 0 && (
                  <button
                    type="button"
                    onClick={onMoveAllPositionsSlToBreakeven}
                    title="Tüm açık pozisyonların Zarar Kes (SL) seviyesini giriş fiyatına çek"
                    className="text-[8.5px] font-mono font-bold text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
                  >
                    Tüm SL=Giriş
                  </button>
                )}
                <span className="text-[9px] font-mono text-emerald-400">
                  Biten: {closedHistory.length}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 font-mono text-[9px] tabular-nums">
              {openPositions.length === 0 ? (
                <div className="h-full min-h-[48px] rounded-xl bg-[#090d16]/70 border border-slate-800/80 px-3 py-2 flex items-center justify-between">
                  <span className="text-slate-400 text-[9.5px]">
                    Açık pozisyon yok. Haber Sniping veya Confluence ile
                    başlatın.
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerScenario(V3_STRESS_TEST_SCENARIOS[0])
                    }
                    className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold cursor-pointer shrink-0"
                  >
                    +95 XRP Snipe Aç
                  </button>
                </div>
              ) : (
                openPositions.map((pos) => {
                  const isSniper =
                    pos.triggerFormula.toUpperCase().includes('MOD 1') ||
                    pos.triggerFormula.toUpperCase().includes('MOD 3') ||
                    pos.triggerFormula.toUpperCase().includes('SNIPE');

                  // Calculate progress between SL (0%) and TP (100%)
                  const totalSpan = Math.abs(
                    pos.takeProfitPrice - pos.stopLossPrice
                  );
                  const distFromSl =
                    pos.side === 'LONG'
                      ? pos.currentPrice - pos.stopLossPrice
                      : pos.stopLossPrice - pos.currentPrice;
                  const tpProgressPct =
                    totalSpan > 0
                      ? Math.max(
                          2,
                          Math.min(98, Math.round((distFromSl / totalSpan) * 100))
                        )
                      : 50;

                  const isEditingThis = editingPosId === pos.id;

                  return (
                    <div
                      key={pos.id}
                      className="px-2 py-1.5 rounded-xl bg-[#090d16]/95 border border-slate-800 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className={`font-extrabold ${
                              pos.side === 'LONG'
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {pos.side} {pos.baseAsset} {pos.leverage}x
                          </span>
                          <span className="text-[8px] px-1 rounded bg-slate-800 text-cyan-300">
                            {isSniper
                              ? `%${100 - confluenceRatioPct} Sniper`
                              : `%${confluenceRatioPct} Normal`}
                          </span>
                          {pos.trailingStopActive && (
                            <span className="text-[7.5px] px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              İZ SÜREN SL
                            </span>
                          )}
                          <span
                            className={`font-extrabold ${
                              pos.unrealizedPnlUsdt >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {pos.unrealizedPnlUsdt >= 0 ? '+' : ''}
                            {pos.unrealizedPnlUsdt.toFixed(2)}$ (
                            {pos.roePct >= 0 ? '+' : ''}
                            {pos.roePct.toFixed(1)}%)
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onClosePosition(pos.id, 'OTOMATİK KÂR AL (TP)')
                            }
                            title="Şimdi TP (Kâr Al) Olarak Kapat"
                            className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/50 text-emerald-300 text-[8px] font-bold cursor-pointer"
                          >
                            TP Al
                          </button>
                          <button
                            type="button"
                            onClick={() => onMovePositionSlToBreakeven(pos.id)}
                            title="Stop-Loss seviyesini Giriş Fiyatına (Başabaş) Çek"
                            className="px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-500/50 text-cyan-200 text-[8px] font-bold cursor-pointer"
                          >
                            SL=Giriş
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingThis) {
                                setEditingPosId(null);
                              } else {
                                setEditingPosId(pos.id);
                                setCustomPosSlPct(strategyConfig.stopLossPct);
                                setCustomPosTpPct(strategyConfig.takeProfitPct);
                              }
                            }}
                            title="Bu pozisyonun TP/SL yüzdelerini düzenle"
                            className="px-1 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/50 text-amber-200 text-[8px] font-bold cursor-pointer"
                          >
                            TP/SL
                          </button>
                          <button
                            type="button"
                            onClick={() => onKillAndFlipPosition(pos)}
                            title="MOD 3: Anında Kapat ve Ters Yönde Aç (Kill & Flip)"
                            className="px-1 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/35 border border-purple-500/50 text-purple-200 text-[8px] font-bold cursor-pointer"
                          >
                            Flip
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onClosePosition(pos.id, 'MANUEL KAPATMA')
                            }
                            className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/50 text-rose-200 text-[8px] font-bold cursor-pointer"
                          >
                            Kapat
                          </button>
                        </div>
                      </div>

                      {/* Canlı SL ◄───●───► TP Mesafe ve Fiyat Çubuğu */}
                      <div className="flex items-center justify-between text-[8px] text-slate-300">
                        <span className="text-rose-400">
                          SL: ${formatCompactPrice(pos.stopLossPrice)}
                        </span>
                        <span className="text-slate-200">
                          Giriş ${formatCompactPrice(pos.entryPrice)} → Anlık{' '}
                          <strong className="text-cyan-300">
                            ${formatCompactPrice(pos.currentPrice)}
                          </strong>
                        </span>
                        <span className="text-emerald-400">
                          TP: ${formatCompactPrice(pos.takeProfitPrice)}
                        </span>
                      </div>

                      <div className="h-1.5 rounded-full bg-slate-900 border border-slate-800 relative overflow-hidden">
                        <div
                          style={{ width: `${tpProgressPct}%` }}
                          className={`h-full transition-all duration-300 ${
                            pos.unrealizedPnlUsdt >= 0
                              ? 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                              : 'bg-gradient-to-r from-rose-500 to-amber-400'
                          }`}
                        />
                      </div>

                      {/* Pozisyon İçi Hızlı TP/SL Düzenleme Satırı */}
                      {isEditingThis && (
                        <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-1 text-[8px]">
                          <div className="flex items-center gap-1">
                            <span className="text-rose-300">SL%:</span>
                            <input
                              type="number"
                              step="0.05"
                              min="0.05"
                              max="20"
                              value={customPosSlPct}
                              onChange={(e) =>
                                setCustomPosSlPct(
                                  Math.max(0.05, Number(e.target.value))
                                )
                              }
                              className="w-12 px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-white"
                            />
                            <span className="text-emerald-300">TP%:</span>
                            <input
                              type="number"
                              step="0.05"
                              min="0.08"
                              max="50"
                              value={customPosTpPct}
                              onChange={(e) =>
                                setCustomPosTpPct(
                                  Math.max(0.08, Number(e.target.value))
                                )
                              }
                              className="w-12 px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-white"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onAdjustPositionTpSlPct(
                                  pos.id,
                                  customPosSlPct,
                                  customPosTpPct
                                );
                                setEditingPosId(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-emerald-500/30 border border-emerald-400 text-emerald-200 font-bold cursor-pointer"
                            >
                              Uygula
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onClosePosition(
                                  pos.id,
                                  'OTOMATİK ZARAR KES (SL)'
                                )
                              }
                              className="px-1.5 py-0.5 rounded bg-rose-500/30 border border-rose-400 text-rose-200 font-bold cursor-pointer"
                            >
                              SL Test
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Alt Kompakt Risk & Strateji Modu Seçici */}
          <div className="pt-1 border-t border-slate-800/80 shrink-0 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[9px]">
                <span className="font-bold text-white">Risk & Kelly:</span>
                <span className="text-slate-400 font-mono truncate">
                  {riskLabel}
                </span>
              </div>
              <input
                type="range"
                aria-label="Risk Seviyesi Seçici"
                min={1}
                max={5}
                step={1}
                value={riskSliderValue}
                onChange={(e) => onRiskSliderChange(Number(e.target.value))}
                style={{
                  background: `linear-gradient(90deg, #a855f7 0%, #22d3ee ${Math.max(
                    15,
                    sliderProgressPct * 0.6
                  )}%, #10b981 ${sliderProgressPct}%, #090d16 ${sliderProgressPct}%, #090d16 100%)`,
                }}
                className="ai-neon-slider mt-1"
              />
            </div>

            <div
              role="group"
              aria-label="AI Strateji Modu"
              className="flex items-center gap-0.5 p-0.5 rounded-full bg-[#090d16] border border-slate-800 text-[9px] shrink-0"
            >
              {(
                [
                  ['AGGRESSIVE', 'Aggr'],
                  ['BALANCED', 'Bal'],
                  ['CONSERVATIVE', 'Cons'],
                ] as const
              ).map(([presetKey, label]) => (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => onSelectStrategyPreset(presetKey)}
                  className={`py-0.5 px-2 rounded-full font-medium transition-all cursor-pointer ${
                    strategyPreset === presetKey
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          CANLI BOT, TP/SL, KALDIRAÇ VE ALT-KASA AYARLARI MODALI (OVERLAY)
         ===================================================================== */}
      {showBotSettingsModal && (
        <div
          role="dialog"
          aria-label="V3.0 Bot, TP/SL ve Risk Ayarları Merkezi"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-3xl rounded-2xl bg-[#080d1a] border border-cyan-400/50 shadow-[0_0_50px_rgba(34,211,238,0.25)] p-5 space-y-4 max-h-[90vh] overflow-y-auto font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white uppercase">
                    V3.0 BOT, OCO TP/SL, KALDIRAÇ VE ALT-KASA AYARLARI
                  </h3>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Burada değiştirdiğiniz tüm ayarlar hem yeni işlemlere hem de
                    şu an açık olan {openPositions.length} pozisyona anında
                    uygulanır.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBotSettingsModal(false)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. OCO KÂR AL (TP) & ZARAR KES (SL) HIZLI VE HASSAS AYARLAR */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Take Profit % */}
              <div className="p-3 rounded-xl bg-[#0c1324] border border-emerald-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">
                    Otomatik Kâr Al (TP %)
                  </span>
                  <span className="text-xs font-extrabold text-white">
                    %{strategyConfig.takeProfitPct}
                  </span>
                </div>
                <input
                  type="number"
                  step="0.05"
                  min="0.08"
                  max="50"
                  value={strategyConfig.takeProfitPct}
                  onChange={(e) =>
                    onUpdateStrategyConfig({
                      ...strategyConfig,
                      takeProfitPct: Math.max(
                        0.08,
                        parseFloat(e.target.value) || 0.25
                      ),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                />
                <div className="flex flex-wrap gap-1">
                  {[0.2, 0.35, 0.75, 1.5, 3.0].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        onUpdateStrategyConfig({
                          ...strategyConfig,
                          takeProfitPct: v,
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                        strategyConfig.takeProfitPct === v
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      %{v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stop Loss % */}
              <div className="p-3 rounded-xl bg-[#0c1324] border border-rose-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-400">
                    Otomatik Zarar Kes (SL %)
                  </span>
                  <span className="text-xs font-extrabold text-white">
                    %{strategyConfig.stopLossPct}
                  </span>
                </div>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="25"
                  value={strategyConfig.stopLossPct}
                  onChange={(e) =>
                    onUpdateStrategyConfig({
                      ...strategyConfig,
                      stopLossPct: Math.max(
                        0.05,
                        parseFloat(e.target.value) || 0.2
                      ),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                />
                <div className="flex flex-wrap gap-1">
                  {[0.15, 0.25, 0.5, 1.0, 1.5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        onUpdateStrategyConfig({
                          ...strategyConfig,
                          stopLossPct: v,
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                        strategyConfig.stopLossPct === v
                          ? 'bg-rose-500 text-white font-bold'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      %{v}
                    </button>
                  ))}
                </div>
              </div>

              {/* ATR Trailing Stop % */}
              <div className="p-3 rounded-xl bg-[#0c1324] border border-cyan-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300">
                    ATR İz Süren Stop (%)
                  </span>
                  <span className="text-xs font-extrabold text-white">
                    %{strategyConfig.trailingStopPct || 0.35}
                  </span>
                </div>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="5"
                  value={strategyConfig.trailingStopPct || 0.35}
                  onChange={(e) =>
                    onUpdateStrategyConfig({
                      ...strategyConfig,
                      trailingStopPct: Math.max(
                        0.05,
                        parseFloat(e.target.value) || 0.35
                      ),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                />
                <div className="flex flex-wrap gap-1">
                  {[0.15, 0.25, 0.4, 0.8, 1.2].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        onUpdateStrategyConfig({
                          ...strategyConfig,
                          trailingStopPct: v,
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                        strategyConfig.trailingStopPct === v
                          ? 'bg-cyan-400 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      %{v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. TEMİNAT, KALDIRAÇ, ALT-KASA ORANI VE MAKS POZİSYON */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[#0c1324] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-bold">
                    İşlem Başına Teminat (USDT):
                  </span>
                  <span className="text-cyan-300 font-extrabold">
                    ${strategyConfig.orderSizeUsdt} USDT
                  </span>
                </div>
                <input
                  type="number"
                  step="25"
                  min="10"
                  max="50000"
                  value={strategyConfig.orderSizeUsdt}
                  onChange={(e) =>
                    onUpdateStrategyConfig({
                      ...strategyConfig,
                      orderSizeUsdt: Math.max(
                        10,
                        parseFloat(e.target.value) || 250
                      ),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                />
                <div className="flex gap-1">
                  {[50, 100, 250, 500, 1000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() =>
                        onUpdateStrategyConfig({
                          ...strategyConfig,
                          orderSizeUsdt: amt,
                        })
                      }
                      className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                        strategyConfig.orderSizeUsdt === amt
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0c1324] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-bold">
                    Kaldıraç Modu & Çarpan:
                  </span>
                  <span className="text-purple-300 font-extrabold">
                    {strategyConfig.leverageMode === 'AUTO'
                      ? 'Yarım Kelly Otomatik'
                      : `Manuel ${strategyConfig.leverage}x`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStrategyConfig({
                        ...strategyConfig,
                        leverageMode: 'AUTO',
                      })
                    }
                    className={`px-2 py-1 rounded text-[10px] cursor-pointer ${
                      strategyConfig.leverageMode === 'AUTO'
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-300 border border-slate-700'
                    }`}
                  >
                    Oto Kelly
                  </button>
                  {[1, 3, 5, 10, 20, 50].map((lev) => (
                    <button
                      key={lev}
                      type="button"
                      onClick={() =>
                        onUpdateStrategyConfig({
                          ...strategyConfig,
                          leverageMode: 'MANUAL',
                          leverage: lev,
                        })
                      }
                      className={`px-2 py-1 rounded text-[10px] cursor-pointer ${
                        strategyConfig.leverageMode === 'MANUAL' &&
                        strategyConfig.leverage === lev
                          ? 'bg-purple-500 text-white font-bold'
                          : 'bg-slate-900 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {lev}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Alt-Kasa Dağılım Oranı (%70 Normal / %30 Haber Sniper) */}
              <div className="p-3 rounded-xl bg-[#0c1324] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-bold">
                    Alt-Kasa Dağılım Oranı:
                  </span>
                  <span className="text-amber-300 font-extrabold">
                    %{confluenceRatioPct} Normal / %{100 - confluenceRatioPct}{' '}
                    Sniper
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={90}
                  step={5}
                  value={confluenceRatioPct}
                  onChange={(e) =>
                    onChangeConfluenceRatioPct(Number(e.target.value))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>%50 / %50</span>
                  <span>%70 Normal / %30 Sniper (Önerilen)</span>
                  <span>%85 / %15</span>
                </div>
              </div>

              {/* Maksimum Eşzamanlı Açık Pozisyon & RSI Eşikleri */}
              <div className="p-3 rounded-xl bg-[#0c1324] border border-slate-800 space-y-2">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Maks Açık Poz
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={strategyConfig.maxConcurrentPositions}
                      onChange={(e) =>
                        onUpdateStrategyConfig({
                          ...strategyConfig,
                          maxConcurrentPositions: Math.max(
                            1,
                            Math.min(20, Number(e.target.value) || 6)
                          ),
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      RSI Alım (&lt;)
                    </label>
                    <input
                      type="number"
                      min={15}
                      max={49}
                      value={strategyConfig.rsiOversold}
                      onChange={(e) =>
                        onUpdateStrategyConfig({
                          ...strategyConfig,
                          rsiOversold: Number(e.target.value) || 39,
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      RSI Satım (&gt;)
                    </label>
                    <input
                      type="number"
                      min={51}
                      max={85}
                      value={strategyConfig.rsiOverbought}
                      onChange={(e) =>
                        onUpdateStrategyConfig({
                          ...strategyConfig,
                          rsiOverbought: Number(e.target.value) || 64,
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. ALT AKSİYON BUTONLARI */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onMoveAllPositionsSlToBreakeven}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/60 text-cyan-200 text-xs font-bold cursor-pointer"
                >
                  Tüm Açık Pozisyonlarda SL=Giriş Yap
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateStrategyConfig({
                      ...strategyConfig,
                      stopLossPct: 0.25,
                      takeProfitPct: 0.35,
                      trailingStopPct: 0.18,
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/35 border border-purple-400/60 text-purple-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Hızlı HFT Scalp Modu (TP %0.35 / SL %0.25)</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowBotSettingsModal(false)}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Kaydet ve Uygula</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
