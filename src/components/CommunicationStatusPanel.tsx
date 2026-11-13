import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Radio,
  RefreshCw,
  Server,
  ShieldAlert,
  Wifi,
} from 'lucide-react';

export interface WsLatencyPointClient {
  timestamp: number;
  timeLabel: string;
  binanceLatencyMs: number;
  mexcLatencyMs: number;
  activeLatencyMs: number;
  thresholdExceeded: boolean;
}

export interface WsStreamTelemetryClient {
  binanceWsStatus: 'CONNECTED' | 'RECONNECTING' | 'DEGRADED' | 'DISCONNECTED';
  mexcWsStatus: 'CONNECTED' | 'RECONNECTING' | 'DEGRADED' | 'DISCONNECTED';
  binanceLatencyMs: number;
  mexcLatencyMs: number;
  activeLatencyMs: number;
  reconnectAttempts: number;
  binanceReconnectAttempts: number;
  mexcReconnectAttempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastHeartbeatAt: number;
  messagesReceivedCount: number;
  klinesCachedSymbolsCount: number;
  klinesTotalSymbols: number;
  latencySeries: WsLatencyPointClient[];
  errorLog: Array<{
    id: string;
    venue: string;
    code: string;
    message: string;
    timestamp: number;
  }>;
}

interface CommunicationStatusPanelProps {
  mexcStatus: {
    serverOnline?: boolean;
    spotConnected?: boolean;
    latencyMs?: number;
    futuresLatencyMs?: number;
    hasCredentials?: boolean;
    hasServerApiKeys?: boolean;
    mode?: string;
    executionMode?: string;
    tradeMode?: 'PAPER' | 'BINANCE_TESTNET' | 'LIVE' | 'TEST' | 'PRODUCTION';
    wsTelemetry?: WsStreamTelemetryClient | null;
  };
  onForceReconnect?: () => void;
}

export const CommunicationStatusPanel: React.FC<CommunicationStatusPanelProps> = ({
  mexcStatus,
}) => {
  const telemetry = mexcStatus.wsTelemetry;
  const activeLatencyMs =
    telemetry?.activeLatencyMs ??
    mexcStatus.latencyMs ??
    mexcStatus.futuresLatencyMs ??
    0;
  const binanceLatencyMs = telemetry?.binanceLatencyMs ?? activeLatencyMs;
  const mexcLatencyMs = telemetry?.mexcLatencyMs ?? 0;
  const isHighLatencyAlert =
    activeLatencyMs > 150 || binanceLatencyMs > 150 || mexcLatencyMs > 150;

  const series = telemetry?.latencySeries ?? [];
  const klinesReady = telemetry?.klinesCachedSymbolsCount ?? 0;
  const klinesTotal = telemetry?.klinesTotalSymbols ?? 50;
  const reconnectAttempts = telemetry?.reconnectAttempts ?? 0;
  const tradeMode = mexcStatus.tradeMode || 'TEST';

  // D3-style SVG time-series coordinates for latencyMs
  const chartWidth = 460;
  const chartHeight = 84;
  const padLeft = 28;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 16;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  const maxY = Math.max(
    220,
    ...series.map((p) => Math.max(p.binanceLatencyMs, p.mexcLatencyMs, p.activeLatencyMs, 160))
  );

  const yForMs = (ms: number) => {
    const clamped = Math.max(0, Math.min(maxY, ms));
    return padTop + innerH - (clamped / maxY) * innerH;
  };

  const xForIdx = (idx: number, total: number) => {
    if (total <= 1) return padLeft + innerW;
    return padLeft + (idx / (total - 1)) * innerW;
  };

  const threshold150Y = yForMs(150);

  const binancePath =
    series.length > 1
      ? series
          .map(
            (pt, i) =>
              `${i === 0 ? 'M' : 'L'} ${xForIdx(i, series.length).toFixed(1)} ${yForMs(
                pt.binanceLatencyMs
              ).toFixed(1)}`
          )
          .join(' ')
      : '';

  const mexcPath =
    series.length > 1
      ? series
          .map(
            (pt, i) =>
              `${i === 0 ? 'M' : 'L'} ${xForIdx(i, series.length).toFixed(1)} ${yForMs(
                pt.mexcLatencyMs || pt.activeLatencyMs
              ).toFixed(1)}`
          )
          .join(' ')
      : '';

  const statusBadge = (
    status: 'CONNECTED' | 'RECONNECTING' | 'DEGRADED' | 'DISCONNECTED' | undefined
  ) => {
    if (status === 'CONNECTED') {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
          <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
          BAĞLI (CANLI)
        </span>
      );
    }
    if (status === 'DEGRADED') {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
          <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
          YAVAŞLAMA
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
        <RefreshCw className="h-2.5 w-2.5 animate-spin text-rose-400" />
        YENİDEN BAĞLANIYOR
      </span>
    );
  };

  return (
    <section
      data-testid="communication-status-panel"
      className={`border-b transition-all duration-300 ${
        isHighLatencyAlert
          ? 'animate-pulse border-rose-500 bg-rose-950/35 shadow-[0_0_25px_rgba(244,63,94,0.28)]'
          : 'border-slate-800/80 bg-[#0B0E17]/95'
      }`}
    >
      <div className="mx-auto max-w-[1600px] px-4 py-2.5 sm:px-6">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center">
          {/* Left: Connection Status & Reconnect / Error Telemetry */}
          <div className="flex flex-wrap items-center gap-2.5 lg:col-span-5">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-md border ${
                  isHighLatencyAlert
                    ? 'border-rose-500/60 bg-rose-500/20 text-rose-300'
                    : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                }`}
              >
                {isHighLatencyAlert ? (
                  <ShieldAlert className="h-4 w-4 text-rose-400" />
                ) : (
                  <Wifi className="h-4 w-4 text-cyan-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold tracking-wider text-slate-200 uppercase">
                    Haberleşme Durum Paneli
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                      tradeMode === 'PRODUCTION'
                        ? 'border border-rose-500/40 bg-rose-500/20 text-rose-300'
                        : 'border border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                    }`}
                  >
                    MOD: {tradeMode}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Veri: Binance Mainnet (`data-api.binance.vision`) · Emir: {tradeMode === 'PRODUCTION' ? 'MEXC Futures' : 'Binance Testnet'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-l border-slate-800 pl-2.5">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 uppercase">Binance Mainnet Akışı</span>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {statusBadge(telemetry?.binanceWsStatus ?? (mexcStatus.serverOnline ? 'CONNECTED' : 'RECONNECTING'))}
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      binanceLatencyMs > 150 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {binanceLatencyMs}ms
                  </span>
                </div>
              </div>

              <div className="flex flex-col border-l border-slate-800/80 pl-2.5">
                <span className="text-[9px] text-slate-400 uppercase">MEXC İkincil Fiyat</span>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {statusBadge(telemetry?.mexcWsStatus ?? 'CONNECTED')}
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      mexcLatencyMs > 150 ? 'text-rose-400' : 'text-cyan-300'
                    }`}
                  >
                    {mexcLatencyMs > 0 ? `${mexcLatencyMs}ms` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Center: Live D3/SVG Time-Series Latency Chart with 150ms Visual Alert Threshold */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-800/90 bg-slate-950/80 px-3 py-1.5 lg:col-span-4">
            <div className="min-w-[110px]">
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-cyan-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase">
                  Canlı Gecikme (ms)
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span
                  data-testid="ws-active-latency-ms"
                  className={`font-mono text-sm font-bold ${
                    isHighLatencyAlert ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {activeLatencyMs} ms
                </span>
                <span className="text-[9px] text-slate-400">Eşik: 150ms</span>
              </div>
              {isHighLatencyAlert && (
                <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-rose-500/25 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  YÜKSEK GECİKME (&gt;150ms)
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="h-14 w-full overflow-visible"
                role="img"
                aria-label="WebSocket Gecikme Zaman Serisi Grafiği"
              >
                {/* Y-axis labels */}
                <text
                  x={2}
                  y={padTop + 6}
                  className="fill-slate-500 font-mono text-[8px]"
                >
                  {maxY}ms
                </text>
                <text
                  x={2}
                  y={threshold150Y + 3}
                  className="fill-rose-400 font-mono text-[8px] font-bold"
                >
                  150ms
                </text>
                <text
                  x={2}
                  y={chartHeight - padBottom}
                  className="fill-slate-500 font-mono text-[8px]"
                >
                  0ms
                </text>

                {/* 150ms Alert Threshold Dashed Line */}
                <line
                  x1={padLeft}
                  y1={threshold150Y}
                  x2={chartWidth - padRight}
                  y2={threshold150Y}
                  stroke="#f43f5e"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.75}
                />

                {/* Baseline */}
                <line
                  x1={padLeft}
                  y1={chartHeight - padBottom}
                  x2={chartWidth - padRight}
                  y2={chartHeight - padBottom}
                  stroke="#1e293b"
                  strokeWidth={1}
                />

                {/* MEXC Latency Line */}
                {mexcPath && (
                  <path
                    d={mexcPath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1.25}
                    strokeOpacity={0.65}
                  />
                )}

                {/* Binance Mainnet Latency Line */}
                {binancePath && (
                  <path
                    d={binancePath}
                    fill="none"
                    stroke={isHighLatencyAlert ? '#f43f5e' : '#10b981'}
                    strokeWidth={2}
                  />
                )}

                {/* Data points */}
                {series.map((pt, i) => {
                  const cx = xForIdx(i, series.length);
                  const cy = yForMs(pt.binanceLatencyMs);
                  return (
                    <circle
                      key={pt.timestamp + '-' + i}
                      cx={cx}
                      cy={cy}
                      r={pt.thresholdExceeded ? 2.8 : 1.8}
                      fill={pt.thresholdExceeded ? '#f43f5e' : '#10b981'}
                    />
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Right: Reconnect Attempts, Kline Sync Progress & Error Code Inspector */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 lg:col-span-3 lg:justify-end">
            <div className="rounded border border-slate-800 bg-slate-900/70 px-2 py-1 text-[10px]">
              <div className="flex items-center gap-1 text-slate-400">
                <Server className="h-3 w-3 text-indigo-400" />
                <span>Gerçek Mum (5m/15m):</span>
                <span
                  className={`font-mono font-bold ${
                    klinesReady >= klinesTotal ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {klinesReady}/{klinesTotal}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[9px] text-slate-400">
                <span>
                  Yeniden Bağlanma:{' '}
                  <strong className="font-mono text-slate-200">{reconnectAttempts}</strong>
                </span>
                <span>·</span>
                <span>
                  Hata Kodu:{' '}
                  <strong
                    className={`font-mono ${
                      telemetry?.lastErrorCode ? 'text-amber-300' : 'text-emerald-400'
                    }`}
                  >
                    {telemetry?.lastErrorCode || 'YOK (0)'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="hidden items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 xl:flex">
              <Radio className="h-3 w-3 animate-pulse text-emerald-400" />
              <span>%100 Gerçek Borsa Verisi</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
