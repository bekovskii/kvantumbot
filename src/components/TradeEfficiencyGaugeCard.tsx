import React, { useMemo } from 'react';
import * as d3 from 'd3';
import { TradeEfficiencyMetrics } from '../utils/tradingEngine';

interface TradeEfficiencyGaugeCardProps {
  metrics: TradeEfficiencyMetrics;
}

export const TradeEfficiencyGaugeCard: React.FC<TradeEfficiencyGaugeCardProps> = ({
  metrics,
}) => {
  const {
    efficiencyScore,
    marketStandardScore,
    profitToSlippageRatio,
    marketStandardRatio,
    avgProfitPerTradeUsdt,
    avgProfitBps,
    avgSlippageUsdt,
    avgSlippageBps,
    marketStandardSlippageBps,
    vsMarketStandardPct,
    gradeLabel,
  } = metrics;

  // D3 Linear Scale mapping [0, 100] efficiency score to [-PI/2, +PI/2] radians
  const d3Geometry = useMemo(() => {
    const scale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([-Math.PI / 2, Math.PI / 2])
      .clamp(true);

    const innerR = 46;
    const outerR = 60;

    const arcGen = d3
      .arc<{ startAngle: number; endAngle: number }>()
      .innerRadius(innerR)
      .outerRadius(outerR)
      .cornerRadius(4);

    // 3 Background Zone Arcs (Low Efficiency | Market Standard | HFT Alpha)
    const zoneLowPath =
      arcGen({ startAngle: scale(0), endAngle: scale(44) }) || '';
    const zoneStdPath =
      arcGen({ startAngle: scale(46), endAngle: scale(73) }) || '';
    const zoneAlphaPath =
      arcGen({ startAngle: scale(75), endAngle: scale(100) }) || '';

    // Foreground Active D3 Arc from 0 to efficiencyScore
    const activeArcPath =
      arcGen({
        startAngle: scale(0),
        endAngle: scale(Math.max(4, efficiencyScore)),
      }) || '';

    // Market Standard Benchmark Tick Coordinates (at score = 60 / 3.5x ratio)
    const stdAngleRad = scale(marketStandardScore);
    // In SVG with 0 rad at 12 o'clock (d3.arc convention): x = r * sin(theta), y = -r * cos(theta)
    const stdInnerX = (innerR - 4) * Math.sin(stdAngleRad);
    const stdInnerY = -(innerR - 4) * Math.cos(stdAngleRad);
    const stdOuterX = (outerR + 5) * Math.sin(stdAngleRad);
    const stdOuterY = -(outerR + 5) * Math.cos(stdAngleRad);
    const stdLabelX = (outerR + 16) * Math.sin(stdAngleRad);
    const stdLabelY = -(outerR + 13) * Math.cos(stdAngleRad);

    // Needle rotation in degrees (-90deg to +90deg)
    const needleAngleDeg = (scale(efficiencyScore) * 180) / Math.PI;

    return {
      zoneLowPath,
      zoneStdPath,
      zoneAlphaPath,
      activeArcPath,
      stdInnerX,
      stdInnerY,
      stdOuterX,
      stdOuterY,
      stdLabelX,
      stdLabelY,
      needleAngleDeg,
    };
  }, [efficiencyScore, marketStandardScore]);

  const isOutperforming = vsMarketStandardPct >= 0;

  return (
    <div
      aria-label="Trade Efficiency Score D3 Gauge"
      className="pt-1.5 border-t border-slate-800/80"
    >
      {/* Header Row 1: Single-line Title + Live Ratio/Score */}
      <div className="flex items-center justify-between gap-1 whitespace-nowrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-extrabold text-white tracking-wide truncate">
            TRADE EFFICIENCY SCORE
          </span>
          <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0">
            D3
          </span>
        </div>
        <div
          className={`text-[11px] font-mono font-extrabold tabular-nums shrink-0 ${
            isOutperforming ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {profitToSlippageRatio.toFixed(2)}x{' '}
          <span className="text-[9.5px] text-slate-300">
            ({efficiencyScore}/100)
          </span>
        </div>
      </div>

      {/* Header Row 2: Formula Subtitle + vs. Market Standard Delta */}
      <div className="flex items-center justify-between gap-1 mt-0.5 whitespace-nowrap">
        <span className="text-[9.5px] text-slate-400 truncate">
          Ort. Kâr / Slippage vs. Piyasa Std ({marketStandardRatio.toFixed(1)}x)
        </span>
        <span
          className={`text-[9.5px] font-mono font-bold tabular-nums shrink-0 ${
            isOutperforming ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {isOutperforming ? '+' : ''}
          {vsMarketStandardPct.toFixed(1)}% vs Std
        </span>
      </div>

      {/* D3 SVG Gauge (5 Cols) + Side Telemetry (7 Cols) */}
      <div className="mt-1.5 grid grid-cols-12 gap-1.5 items-center">
        {/* Left 5 Cols: D3.js Arc & Benchmark Gauge */}
        <div className="col-span-5 flex flex-col items-center">
          <svg
            viewBox="0 0 156 84"
            className="w-full max-w-[132px] h-[68px] overflow-visible"
            role="img"
            aria-label={`Trade Efficiency Score ${efficiencyScore}/100 (${profitToSlippageRatio}x)`}
          >
            <defs>
              <linearGradient
                id="d3EfficiencyGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="50%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            <g transform="translate(78, 70)">
              {/* D3 Background Zone Arcs */}
              <path
                d={d3Geometry.zoneLowPath}
                fill="#f43f5e"
                fillOpacity="0.18"
              />
              <path
                d={d3Geometry.zoneStdPath}
                fill="#38bdf8"
                fillOpacity="0.18"
              />
              <path
                d={d3Geometry.zoneAlphaPath}
                fill="#10b981"
                fillOpacity="0.2"
              />

              {/* D3 Foreground Active Value Arc */}
              <path
                d={d3Geometry.activeArcPath}
                fill="url(#d3EfficiencyGrad)"
              />

              {/* Market Standard Benchmark Tick Marker (3.5x / Score 60) */}
              <line
                x1={d3Geometry.stdInnerX}
                y1={d3Geometry.stdInnerY}
                x2={d3Geometry.stdOuterX}
                y2={d3Geometry.stdOuterY}
                stroke="#fbbf24"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <text
                x={d3Geometry.stdLabelX}
                y={d3Geometry.stdLabelY}
                textAnchor="middle"
                fill="#fbbf24"
                fontSize="7.2"
                fontWeight="700"
                className="font-mono"
              >
                STD {marketStandardRatio.toFixed(1)}x
              </text>

              {/* D3 Gauge Needle */}
              <g transform={`rotate(${d3Geometry.needleAngleDeg})`}>
                <polygon points="-2.5,0 0,-48 2.5,0" fill="#e2e8f0" />
                <circle
                  cx="0"
                  cy="0"
                  r="4.5"
                  fill="#0f172a"
                  stroke="#22d3ee"
                  strokeWidth="2"
                />
              </g>

              {/* Center Grade Label */}
              <text
                x="0"
                y="11"
                textAnchor="middle"
                fill="#34d399"
                fontSize="7"
                fontWeight="700"
                className="font-mono"
              >
                {gradeLabel}
              </text>
            </g>
          </svg>
        </div>

        {/* Right 7 Cols: Profit vs. Slippage Live Breakdown */}
        <div className="col-span-7 space-y-1 font-mono text-[9.5px] tabular-nums">
          <div className="px-2 py-1 rounded-lg bg-[#090d16] border border-emerald-500/30 flex items-center justify-between gap-1 whitespace-nowrap">
            <span className="text-slate-400">Ort. Kâr:</span>
            <span className="font-bold text-emerald-400">
              {avgProfitPerTradeUsdt >= 0 ? '+' : ''}$
              {avgProfitPerTradeUsdt.toFixed(2)}{' '}
              <span className="text-[8.5px] text-slate-400">
                ({avgProfitBps.toFixed(0)}bp)
              </span>
            </span>
          </div>

          <div className="px-2 py-1 rounded-lg bg-[#090d16] border border-cyan-500/30 flex items-center justify-between gap-1 whitespace-nowrap">
            <span className="text-slate-400">Slippage:</span>
            <span className="font-bold text-cyan-300">
              ${avgSlippageUsdt.toFixed(2)}{' '}
              <span className="text-[8.5px] text-emerald-400">
                ({avgSlippageBps.toFixed(1)}bp)
              </span>
            </span>
          </div>

          <div className="px-2 py-1 rounded-lg bg-[#090d16] border border-amber-500/25 flex items-center justify-between gap-1 whitespace-nowrap">
            <span className="text-slate-400">Piyasa Std:</span>
            <span className="font-semibold text-amber-300">
              {marketStandardRatio.toFixed(1)}x · {marketStandardSlippageBps.toFixed(1)}bp
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
