import React, { useState, useEffect } from 'react';
import {
  MarketTicker,
  StrategyConfig,
  formatCompactPrice,
  getBeginnerFriendlyExplanation,
} from '../utils/tradingEngine';

interface MexcCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MarketInspectorPanelProps {
  market: MarketTicker;
  config: StrategyConfig;
  onExecuteOrder: (market: MarketTicker, side: 'LONG' | 'SHORT') => void;
}

const INTERVAL_OPTIONS = [
  { id: '1m', label: '1dk' },
  { id: '5m', label: '5dk' },
  { id: '15m', label: '15dk' },
  { id: '1h', label: '1s' },
];

function computeRollingEmaSeries(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const series: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    series.push(closes[i] * k + series[i - 1] * (1 - k));
  }
  return series;
}

export const MarketInspectorPanel: React.FC<MarketInspectorPanelProps> = ({
  market,
  config,
  onExecuteOrder,
}) => {
  const [interval, setIntervalState] = useState<string>('5m');
  const [mexcCandles, setMexcCandles] = useState<MexcCandle[]>([]);

  useEffect(() => {
    let active = true;
    const loadMexcKlines = async () => {
      try {
        const res = await fetch(
          `/api/mexc/klines?symbol=${encodeURIComponent(
            market.symbol
          )}&interval=${encodeURIComponent(interval)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (active && Array.isArray(data?.candles) && data.candles.length > 0) {
          setMexcCandles(data.candles);
        }
      } catch {
        // Fallback to market.closes if network hiccups
      }
    };

    loadMexcKlines();
    const timer = window.setInterval(loadMexcKlines, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [market.symbol, interval]);

  const candles: MexcCandle[] =
    mexcCandles.length >= 8
      ? mexcCandles.slice(-32)
      : market.hasRealKlines && market.closes.length >= 5
      ? market.closes.map((c, idx) => {
          const prev = idx > 0 ? market.closes[idx - 1] : c;
          const high =
            market.highs && market.highs[idx] !== undefined
              ? market.highs[idx]
              : Math.max(prev, c);
          const low =
            market.lows && market.lows[idx] !== undefined
              ? market.lows[idx]
              : Math.min(prev, c);
          return {
            time: Date.now() - (market.closes.length - idx) * 300000,
            open: prev,
            high,
            low,
            close: c,
            volume: market.volumes[idx] ?? 0,
          };
        })
      : [];

  const candleCloses = candles.map((c) => c.close);
  const ema9Series = computeRollingEmaSeries(candleCloses, 9);
  const ema21Series = computeRollingEmaSeries(candleCloses, 21);

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const minPrice =
    Math.min(...lows, market.stopLossPrice, market.takeProfitPrice) * 0.9985;
  const maxPrice =
    Math.max(...highs, market.stopLossPrice, market.takeProfitPrice) * 1.0015;
  const priceRange = Math.max(maxPrice - minPrice, 0.000001);

  const width = 460;
  const height = 175;

  const toY = (val: number) =>
    height - 14 - ((val - minPrice) / priceRange) * (height - 28);

  const slY = Math.max(12, Math.min(height - 12, toY(market.stopLossPrice)));
  const tpY = Math.max(12, Math.min(height - 12, toY(market.takeProfitPrice)));

  const candleStep = (width - 28) / Math.max(1, candles.length);
  const bodyWidth = Math.max(3, Math.min(9, candleStep * 0.65));

  const ema9Points = ema9Series
    .map((val, idx) => `${(16 + idx * candleStep).toFixed(1)},${toY(val).toFixed(1)}`)
    .join(' ');
  const ema21Points = ema21Series
    .map((val, idx) => `${(16 + idx * candleStep).toFixed(1)},${toY(val).toFixed(1)}`)
    .join(' ');

  const isAutoMode = config.leverageMode === 'AUTO';
  const effectiveMarginUsdt =
    isAutoMode && market.kellyOrderSizeUsdt
      ? market.kellyOrderSizeUsdt
      : config.orderSizeUsdt;
  const plannedNotionalUsdt = effectiveMarginUsdt * market.effectiveLeverage;
  const explain = getBeginnerFriendlyExplanation(market);

  const decisionColor =
    market.signal === 'LONG'
      ? '#10b981'
      : market.signal === 'SHORT'
      ? '#f43f5e'
      : '#38bdf8';

  const inputYPositions = [28, 68, 108, 148];
  const hiddenYPositions = [55, 120];
  const outputY = 88;

  return (
    <aside
      aria-label={`${market.symbol} Nöral Karar Ağı ve Canlı Grafik`}
      className="terminal-panel rounded-md overflow-hidden flex flex-col justify-between"
    >
      {/* Terminal Window Title Bar */}
      <div className="terminal-header-bar px-4 py-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono text-emerald-400 font-bold tracking-wide">
            05. NÖRAL BEYİN ANALİZİ · {market.effectiveLeverage}x{' '}
            {isAutoMode ? '(BOT SEÇTİ)' : '(MANUEL)'}
          </div>
          <h2 className="mt-0.5 text-lg font-mono font-bold tracking-tight text-slate-50 flex items-baseline gap-2">
            <span>{market.baseAsset}/USDT</span>
            <span className="text-xs font-sans font-normal text-slate-400">
              Güven: %{market.quantScore} ({explain.confidenceLabel})
            </span>
          </h2>
        </div>

        <div className="text-right font-mono tabular-nums">
          <div className="text-lg font-bold text-slate-50">
            ${formatCompactPrice(market.price)}
          </div>
          <div
            className={`text-xs font-semibold ${
              market.change24hPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {market.change24hPct >= 0 ? '+' : ''}
            {market.change24hPct.toFixed(2)}% (24s)
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3.5">
        {/* 1. GÖRSEL NÖRAL KARAR AĞI (Sıfır Bilgiyle Anlaşılır Beyin Şeması) */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-mono font-bold text-slate-200">
              Canlı Nöral Karar Ağı (Bot Nasıl Karar Veriyor?)
            </span>
            <span className="text-emerald-400 font-mono font-semibold">
              {market.conditionsPassed}/4 Onay
            </span>
          </div>

          <div className="terminal-screen-inset rounded p-2.5">
            <svg
              viewBox="0 0 440 176"
              className="w-full h-40 overflow-visible"
              role="img"
              aria-label={`${market.baseAsset} Nöral Ağ Karar Şeması`}
            >
              {/* Giriş -> Gizli Katman Sinaps Çizgileri */}
              {explain.neuralInputs.map((inp, i) =>
                hiddenYPositions.map((hy, hi) => (
                  <line
                    key={`syn1_${i}_${hi}`}
                    x1="138"
                    y1={inputYPositions[i]}
                    x2="232"
                    y2={hy}
                    stroke={inp.passed ? '#10b981' : '#334155'}
                    strokeWidth={inp.passed ? '1.5' : '1'}
                    strokeOpacity={inp.passed ? '0.65' : '0.4'}
                  />
                ))
              )}

              {/* Gizli Katman -> Son Karar Sinaps Çizgileri */}
              {hiddenYPositions.map((hy, hi) => (
                <line
                  key={`syn2_${hi}`}
                  x1="286"
                  y1={hy}
                  x2="342"
                  y2={outputY}
                  stroke={decisionColor}
                  strokeWidth="2"
                  strokeOpacity="0.8"
                />
              ))}

              {/* Sol Sütun: 4 Giriş Nöronu (Sade Türkçe) */}
              {explain.neuralInputs.map((inp, i) => {
                const y = inputYPositions[i];
                const nodeColor = inp.passed ? '#10b981' : '#64748b';
                return (
                  <g key={inp.id}>
                    <rect
                      x="4"
                      y={y - 15}
                      width="134"
                      height="30"
                      rx="4"
                      fill="#090f1d"
                      stroke={nodeColor}
                      strokeWidth="1.3"
                    />
                    <text
                      x="12"
                      y={y - 2}
                      fill="#f8fafc"
                      fontSize="9.5"
                      fontWeight="bold"
                    >
                      {inp.title}
                    </text>
                    <text
                      x="12"
                      y={y + 10}
                      fill={inp.passed ? '#34d399' : '#94a3b8'}
                      fontSize="8.5"
                    >
                      {inp.statusText}
                    </text>
                  </g>
                );
              })}

              {/* Orta Sütun: 2 Nöral Analiz Katmanı */}
              <g>
                <rect
                  x="212"
                  y={hiddenYPositions[0] - 18}
                  width="86"
                  height="36"
                  rx="5"
                  fill="#090f1d"
                  stroke="#38bdf8"
                  strokeWidth="1.4"
                />
                <text
                  x="255"
                  y={hiddenYPositions[0] - 3}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="9.5"
                  fontWeight="bold"
                >
                  Nöral Güç
                </text>
                <text
                  x="255"
                  y={hiddenYPositions[0] + 10}
                  textAnchor="middle"
                  fill="#38bdf8"
                  fontSize="10"
                  fontWeight="bold"
                >
                  %{market.quantScore} Puan
                </text>

                <rect
                  x="212"
                  y={hiddenYPositions[1] - 18}
                  width="86"
                  height="36"
                  rx="5"
                  fill="#090f1d"
                  stroke="#f59e0b"
                  strokeWidth="1.4"
                />
                <text
                  x="255"
                  y={hiddenYPositions[1] - 3}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="9"
                  fontWeight="bold"
                >
                  Kaldıraç & Kelly
                </text>
                <text
                  x="255"
                  y={hiddenYPositions[1] + 10}
                  textAnchor="middle"
                  fill="#fbbf24"
                  fontSize="9.5"
                  fontWeight="bold"
                >
                  {market.effectiveLeverage}x · ${effectiveMarginUsdt}
                </text>
              </g>

              {/* Sağ Sütun: Botun Son Kararı */}
              <g>
                <rect
                  x="338"
                  y={outputY - 26}
                  width="98"
                  height="52"
                  rx="6"
                  fill="#090f1d"
                  stroke={decisionColor}
                  strokeWidth="2"
                />
                <text
                  x="387"
                  y={outputY - 8}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="8.5"
                >
                  BOTUN KARARI
                </text>
                <text
                  x="387"
                  y={outputY + 6}
                  textAnchor="middle"
                  fill={decisionColor}
                  fontSize="10.5"
                  fontWeight="bold"
                >
                  {explain.decisionBadge}
                </text>
                <text
                  x="387"
                  y={outputY + 19}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="9"
                >
                  Hedef: +%{market.expectedProfitRoePct}
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* 2. HİÇBİR ŞEY BİLMEYENLER İÇİN SADE TÜRKÇE ÖZET KUTUSU */}
        <div className="terminal-screen-inset rounded p-3">
          <div className="text-xs font-mono font-bold text-emerald-400 mb-1">
            {explain.decisionTitle}
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">
            {explain.plainStory}
          </p>
        </div>

        {/* 3. CANLI BINANCE DEMO MUM GRAFİĞİ */}
        <div>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-1.5">
            <span className="font-mono font-bold text-slate-200">
              Canlı Fiyat Grafiği ve Hedef Çizgileri
            </span>
            <div className="flex items-center gap-1 terminal-screen-inset rounded p-0.5 shrink-0">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setIntervalState(opt.id)}
                  className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer transition-colors ${
                    interval === opt.id
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="terminal-screen-inset rounded p-2 overflow-hidden">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-40 overflow-visible"
              role="img"
              aria-label={`${market.symbol} canlı fiyat grafiği`}
            >
              {/* Terminal Izgara Çizgileri */}
              {[35, 85, 135].map((gy) => (
                <line
                  key={`grid_${gy}`}
                  x1="12"
                  y1={gy}
                  x2={width - 12}
                  y2={gy}
                  stroke="#1e293b"
                  strokeDasharray="2 4"
                  strokeWidth="0.8"
                />
              ))}

              {/* Kâr Al Hedef Çizgisi */}
              <line
                x1="12"
                y1={tpY}
                x2={width - 12}
                y2={tpY}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
              <text
                x={width - 14}
                y={Math.max(12, tpY - 4)}
                textAnchor="end"
                fill="#34d399"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                Otomatik Kâr Al (+%{market.expectedProfitRoePct}): $
                {formatCompactPrice(market.takeProfitPrice)}
              </text>

              {/* Zarar Durdur Çizgisi */}
              <line
                x1="12"
                y1={slY}
                x2={width - 12}
                y2={slY}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
              <text
                x={width - 14}
                y={Math.min(height - 4, slY + 12)}
                textAnchor="end"
                fill="#fb7185"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                Zarar Durdur (-%{market.expectedLossRoePct}): $
                {formatCompactPrice(market.stopLossPrice)}
              </text>

              {/* Mumlar */}
              {candles.map((c, idx) => {
                const cx = 16 + idx * candleStep;
                const highY = toY(c.high);
                const lowY = toY(c.low);
                const openY = toY(c.open);
                const closeY = toY(c.close);
                const isBull = c.close >= c.open;
                const color = isBull ? '#10b981' : '#f43f5e';
                const topY = Math.min(openY, closeY);
                const bodyH = Math.max(1.8, Math.abs(closeY - openY));

                return (
                  <g key={`${c.time}_${idx}`}>
                    <line
                      x1={cx}
                      y1={highY}
                      x2={cx}
                      y2={lowY}
                      stroke={color}
                      strokeWidth="1.1"
                    />
                    <rect
                      x={cx - bodyWidth / 2}
                      y={topY}
                      width={bodyWidth}
                      height={bodyH}
                      fill={color}
                      rx="0.5"
                    />
                  </g>
                );
              })}

              {/* Trend Çizgileri */}
              {ema21Points && (
                <polyline
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.4"
                  points={ema21Points}
                />
              )}
              {ema9Points && (
                <polyline
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.6"
                  points={ema9Points}
                />
              )}
            </svg>
          </div>
        </div>

        {/* 4. ELLE İŞLEM AÇMA TERMİNAL BUTONLARI */}
        <div className="pt-3 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>
              Yatırılacak Tutar {isAutoMode ? '(Yarım Kelly Oto)' : ''}:{' '}
              <strong className="text-emerald-400 font-mono">
                ${effectiveMarginUsdt} USDT
              </strong>
            </span>
            <span className="font-mono">
              Büyüklük: {market.effectiveLeverage}x ($
              {plannedNotionalUsdt.toLocaleString('en-US')})
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onExecuteOrder(market, 'LONG')}
              className="py-2.5 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Yükseliş (AL) Aç · {market.effectiveLeverage}x
            </button>
            <button
              type="button"
              onClick={() => onExecuteOrder(market, 'SHORT')}
              className="py-2.5 px-3 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Düşüş (SAT) Aç · {market.effectiveLeverage}x
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
