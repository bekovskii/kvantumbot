import React, { useState } from 'react';
import {
  Activity,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Zap,
  Play,
  Pause,
  Sliders,
  Code2,
  Wallet,
  Cpu,
  XOctagon,
  Flame,
  Gauge,
} from 'lucide-react';
import {
  BtcRegimeState,
  DemoWalletState,
  LeverageMode,
  TradeEfficiencyMetrics,
  formatCompactPrice,
} from '../utils/tradingEngine';
import { WsStreamTelemetryClient } from './CommunicationStatusPanel';

export interface ServerMexcAccountStatus {
  spotConnected: boolean;
  spotPairsTracked: number;
  futuresConnected: boolean;
  futuresLatencyMs: number;
  btcFuturesMarkPrice: number | null;
  btcFundingRatePct: number | null;
  hasServerApiKeys: boolean;
  maskedKey: string | null;
  liveAccount: {
    authenticated?: boolean;
    exchange?: string;
    accountType?: string;
    statusMessage?: string;
    canTrade?: boolean;
    usdtFree?: number;
    usdtLocked?: number;
    totalUsdt?: number;
    totalUsdtEquity?: number;
    totalPortfolioUsdt?: number;
    holdings?: Array<{
      asset: string;
      free: number;
      locked: number;
      valueUsdt?: number;
      walletType?: string;
    }>;
  } | null;
  executionMode: string;
  tradeMode?: 'TEST' | 'PRODUCTION' | 'PAPER' | 'BINANCE_TESTNET' | 'LIVE';
  timestamp: number;
  hftTelemetry?: {
    usedWeight1m: number;
    orders10s?: number;
    serverTimeOffsetMs: number;
    circuitBreakerTripped?: boolean;
  };
  wsTelemetry?: WsStreamTelemetryClient | null;
}

interface BtcRegimeBannerProps {
  btcRegime: BtcRegimeState;
  walletState: DemoWalletState;
  leverageMode: LeverageMode;
  currentLeverage: number;
  onChangeLeverageMode: (mode: LeverageMode) => void;
  onChangeLeverage: (lev: number) => void;
  autoTradeEnabled: boolean;
  onToggleAutoTrade: () => void;
  activeSignalsCount: number;
  openPositionsCount: number;
  onOpenSettingsModal: () => void;
  onOpenPythonModal: () => void;
  onOpenWalletModal: () => void;
  onPanicCloseAll: () => void;
  onForceSignalExecution: () => void;
  mexcStatus: {
    serverOnline?: boolean;
    spotConnected?: boolean;
    latencyMs?: number;
    futuresLatencyMs?: number;
    hasCredentials?: boolean;
    hasServerApiKeys?: boolean;
    mode?: string;
    executionMode?: string;
    tradeMode?: 'TEST' | 'PRODUCTION' | 'PAPER' | 'BINANCE_TESTNET' | 'LIVE';
  };
  efficiencyMetrics: TradeEfficiencyMetrics;
}

const LEVERAGE_STEPS = [3, 5, 10, 20];

export const BtcRegimeBanner: React.FC<BtcRegimeBannerProps> = ({
  btcRegime,
  walletState,
  leverageMode,
  currentLeverage,
  onChangeLeverageMode,
  onChangeLeverage,
  autoTradeEnabled,
  onToggleAutoTrade,
  activeSignalsCount,
  openPositionsCount,
  onOpenSettingsModal,
  onOpenPythonModal,
  onOpenWalletModal,
  onPanicCloseAll,
  onForceSignalExecution,
  mexcStatus,
  efficiencyMetrics,
}) => {
  const [serverAckNote, setServerAckNote] = useState<string | null>(null);

  const notifyServerAck = (msg: string) => {
    setServerAckNote(msg);
    window.setTimeout(() => {
      setServerAckNote((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleSelectAutoLeverage = async () => {
    onChangeLeverageMode('AUTO');
    try {
      const res = await fetch('/api/bot/set-leverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'AUTO', leverage: currentLeverage }),
      });
      if (res.ok) {
        notifyServerAck('Sunucu Kaldıraç Modu: OTO BOT');
      }
    } catch {
      // Frontend state already updated
    }
  };

  const handleSelectManualLeverage = async (lev: number) => {
    onChangeLeverage(lev);
    try {
      const res = await fetch('/api/bot/set-leverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'MANUAL', leverage: lev }),
      });
      if (res.ok) {
        notifyServerAck(`Sunucu Kaldıraç: ${lev}x Onaylandı`);
      }
    } catch {
      // Frontend state already updated
    }
  };

  const handleToggleBotStatus = async () => {
    const nextEnabled = !autoTradeEnabled;
    onToggleAutoTrade();
    try {
      const res = await fetch('/api/bot/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (res.ok) {
        notifyServerAck(nextEnabled ? 'Sunucu: Oto Al-Sat AKTİF' : 'Sunucu: Oto Al-Sat DURAKLATILDI');
      }
    } catch {
      // Frontend state already updated
    }
  };

  const handleForceScanClick = async () => {
    onForceSignalExecution();
    try {
      const res = await fetch('/api/bot/force-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        notifyServerAck('Sunucu: Anlık Tarama & Emir Tetiklendi');
      }
    } catch {
      // Frontend callback already invoked
    }
  };

  const handlePanicCloseAllClick = async () => {
    onPanicCloseAll();
    try {
      const res = await fetch('/api/bot/close-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        notifyServerAck('Sunucu: Tüm Pozisyonlar & İzleyen Stoplar Kapatıldı');
      }
    } catch {
      // Frontend callback already invoked
    }
  };

  const regimeBadgeStyle =
    btcRegime.regime === 'GÜÇLÜ_BOĞA'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
      : btcRegime.regime === 'GÜÇLÜ_AYI'
      ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
      : btcRegime.regime === 'YÜKSEK_VOLATİLİTE'
      ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
      : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300';

  const isPositive = btcRegime.change24hPct >= 0;
  const isRoiPositive = walletState.totalRoiPct >= 0;
  const isRealProfit = walletState.realizedPnlUsdt >= 0;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#070A12]/95 backdrop-blur-md">
      <div className="mx-auto max-w-[1600px] px-4 py-2.5 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {/* Left: Brand + Live BTC Anchor */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 pr-3 border-r border-slate-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold tracking-wider text-white">
                    KVANTUM<span className="text-emerald-400">BOT</span>
                  </span>
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                    BINANCE TESTNET · 50 COİN
                  </span>
                  <span
                    className={`hidden sm:inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                      mexcStatus.serverOnline ?? mexcStatus.spotConnected
                        ? 'border border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                        : 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
                    }`}
                    title="Canlı Binance Testnet & 50 Piyasa Köprüsü"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        mexcStatus.serverOnline ?? mexcStatus.spotConnected
                          ? 'bg-cyan-400 animate-ping'
                          : 'bg-amber-400'
                      }`}
                    />
                    {mexcStatus.hasCredentials ?? mexcStatus.hasServerApiKeys
                      ? `TESTNET HESABI AKTİF (${mexcStatus.latencyMs ?? mexcStatus.futuresLatencyMs ?? 0}ms)`
                      : `CANLI KÖPRÜ (${mexcStatus.latencyMs ?? mexcStatus.futuresLatencyMs ?? 0}ms)`}
                  </span>
                  {serverAckNote && (
                    <span
                      data-testid="server-bot-ack-badge"
                      className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-200"
                    >
                      {serverAckNote}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Sıfır Tahmin · 7 İndikatörlü Nöral Konfluens Motoru &amp; OCO / İz Süren Stop Koruması
                </p>
              </div>
            </div>

            {/* BTC Live Anchor */}
            <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-slate-800/90 bg-slate-900/70 px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-mono text-xs font-bold text-white">BTC/USDT</span>
              </div>

              <span className="font-mono text-sm font-bold text-white">
                ${btcRegime.price > 0 ? formatCompactPrice(btcRegime.price) : 'VERİ BEKLENİYOR'}
              </span>

              <span
                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
                  isPositive
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-rose-500/15 text-rose-400'
                }`}
              >
                {isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {isPositive ? '+' : ''}
                {btcRegime.change24hPct.toFixed(2)}%
              </span>

              <div className="hidden items-center gap-2 border-l border-slate-800 pl-2.5 text-[11px] font-mono text-slate-300 md:flex">
                <span>
                  RSI(14):{' '}
                  <strong className="text-white">{btcRegime.rsi14.toFixed(1)}</strong>
                </span>
                <span>·</span>
                <span>
                  ATR:{' '}
                  <strong className="text-amber-300">%{btcRegime.volatilityPct.toFixed(2)}</strong>
                </span>
              </div>

              <div
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${regimeBadgeStyle}`}
              >
                <ShieldAlert className="h-3 w-3" />
                <span>{btcRegime.regime.replace('_', ' ')}</span>
              </div>
            </div>
          </div>

          {/* Center: MEXC Demo Wallet Summary + Leverage Switcher */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenWalletModal}
              className="group flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-slate-900/90 px-3 py-1.5 text-left transition hover:border-emerald-400/60 hover:bg-slate-900"
              title="Demo Kasa ve İşlem Geçmişini Görüntüle"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase">
                    Demo Kasa Özsermaye
                  </span>
                  <span className="font-bold text-white">
                    $
                    {walletState.totalEquityUsdt.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    <span
                      className={`text-[10px] ${
                        isRoiPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      ({isRoiPositive ? '+' : ''}
                      {walletState.totalRoiPct.toFixed(2)}%)
                    </span>
                  </span>
                </div>

                <div className="hidden border-l border-slate-800 pl-3 sm:block">
                  <span className="block text-[9px] text-slate-400 uppercase">
                    Net Kâr / Zarar
                  </span>
                  <span
                    className={`font-bold ${
                      isRealProfit ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isRealProfit ? '+' : ''}$
                    {walletState.realizedPnlUsdt.toFixed(2)}
                  </span>
                </div>

                <div className="hidden border-l border-slate-800 pl-3 md:block">
                  <span className="block text-[9px] text-slate-400 uppercase">
                    Boşta Teminat
                  </span>
                  <span className="font-bold text-cyan-300">
                    $
                    {walletState.availableMarginUsdt.toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              </div>
            </button>

            {/* Real-Time Trade Efficiency Score Gauge (Avg Profit vs Avg Slippage vs Market Standard) */}
            <div
              className="flex items-center gap-2 rounded-lg border border-slate-800/90 bg-slate-900/85 px-2.5 py-1"
              title={`İşlem Verimlilik Skoru: Ortalama Kâr ($${efficiencyMetrics.avgProfitPerTradeUsdt}) / Ortalama Slippage ($${efficiencyMetrics.avgSlippageUsdt} · ${efficiencyMetrics.avgSlippageBps} bps). Piyasa Standardı (3.50x) ile karşılaştırma: ${efficiencyMetrics.vsMarketStandardPct >= 0 ? '+' : ''}${efficiencyMetrics.vsMarketStandardPct}%`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 font-mono text-xs font-extrabold text-emerald-300">
                {efficiencyMetrics.efficiencyScore}
              </div>
              <div className="flex flex-col font-mono">
                <div className="flex items-center gap-1">
                  <Gauge className="h-3 w-3 text-emerald-400" />
                  <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                    İcra Verimliliği
                  </span>
                  <span
                    className={`rounded px-1 py-0.2 text-[8px] font-bold ${
                      efficiencyMetrics.vsMarketStandardPct >= 0
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {efficiencyMetrics.vsMarketStandardPct >= 0 ? '+' : ''}
                    {efficiencyMetrics.vsMarketStandardPct}% Std
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-bold text-white">
                    {efficiencyMetrics.profitToSlippageRatio}x
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Kâr/Kayma (Std: {efficiencyMetrics.marketStandardRatio.toFixed(1)}x)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                  <span className="text-emerald-300">
                    Kayma: {efficiencyMetrics.avgSlippageBps}bps
                  </span>
                  <span>·</span>
                  <span className="text-slate-400">
                    Piyasa: {efficiencyMetrics.marketStandardSlippageBps}bps
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Leverage Switcher: AUTO (BOT) + Manual 3x, 5x, 10x, 20x */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-1">
              <span className="px-1.5 text-[10px] font-semibold text-slate-400">
                Kaldıraç:
              </span>
              <button
                type="button"
                data-testid="btn-leverage-auto"
                onClick={handleSelectAutoLeverage}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] font-bold transition ${
                  leverageMode === 'AUTO'
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title="Bot her coin için volatilite (ATR) ve hacme göre 3x, 5x, 10x veya 20x kaldıracı otomatik seçer"
              >
                <Cpu className="h-3 w-3" />
                BOT
              </button>
              {LEVERAGE_STEPS.map((lev) => {
                const isSelected = leverageMode === 'MANUAL' && currentLeverage === lev;
                return (
                  <button
                    key={lev}
                    type="button"
                    data-testid={`btn-leverage-${lev}x`}
                    onClick={() => handleSelectManualLeverage(lev)}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold transition ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.45)]'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                    title={`Tüm analizleri ve işlemleri ${lev}x manuel kaldıraçla çalıştır`}
                  >
                    {lev}x
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs font-mono">
              <span className="text-slate-400">Sinyal:</span>
              <span className="font-bold text-emerald-400">{activeSignalsCount}</span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-400">Açık:</span>
              <span className="font-bold text-cyan-400">{openPositionsCount}</span>
            </div>

            <button
              type="button"
              data-testid="btn-toggle-autotrade"
              onClick={handleToggleBotStatus}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                autoTradeEnabled
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                  : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {autoTradeEnabled ? (
                <>
                  <Pause className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Oto Al-Sat: AKTİF</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 text-slate-400" />
                  <span>Oto Al-Sat: DURAKLATILDI</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="btn-force-scan"
              onClick={handleForceScanClick}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25"
              title="En güçlü sinyale sahip coinde anında canlı pozisyon aç"
            >
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">Şimdi İşlem Aç</span>
            </button>

            {openPositionsCount > 0 && (
              <button
                type="button"
                data-testid="btn-panic-close-all"
                onClick={handlePanicCloseAllClick}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/60 bg-rose-500/20 px-2.5 py-1.5 text-xs font-bold text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.25)] transition hover:bg-rose-500/35"
                title="Tüm açık pozisyonları anlık piyasa fiyatından kapat ve nakde (USDT) geç"
              >
                <XOctagon className="h-3.5 w-3.5 text-rose-400" />
                <span>Temize Al ({openPositionsCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSettingsModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-300"
            >
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Kural Ayarları</span>
            </button>

            <button
              type="button"
              onClick={onOpenPythonModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/25"
            >
              <Code2 className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Python Bot Kodu</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
