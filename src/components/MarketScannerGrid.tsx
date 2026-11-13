import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  MarketTicker,
  formatCompactPrice,
  getBeginnerFriendlyExplanation,
} from '../utils/tradingEngine';
import { Search, ArrowUpDown } from 'lucide-react';

export type ScannerFilterMode = 'ALL' | 'LONG' | 'SHORT' | 'TOP_QUANT';
export type ScannerSortKey =
  | 'quantScore'
  | 'change24hPct'
  | 'volume24hUsdt'
  | 'conditionsPassed';

interface MarketScannerGridProps {
  markets: MarketTicker[];
  leverageMode?: 'AUTO' | 'MANUAL';
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onExecuteOrder: (market: MarketTicker, side: 'LONG' | 'SHORT') => void;
}

export const MarketScannerGrid: React.FC<MarketScannerGridProps> = ({
  markets,
  leverageMode = 'AUTO',
  selectedSymbol,
  onSelectSymbol,
  onExecuteOrder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<ScannerFilterMode>('ALL');
  const [sortKey, setSortKey] = useState<ScannerSortKey>('quantScore');
  const [sortDesc, setSortDesc] = useState(true);
  const [sortEpoch, setSortEpoch] = useState(0);

  // Stabilize row ordering across 2.4s background ticks so rows never jump under the user's cursor or reset scroll position
  const lockedSymbolOrderRef = useRef<string[]>([]);
  const lastOrderKeyRef = useRef<string>('');

  const counts = useMemo(() => {
    return {
      all: markets.length,
      long: markets.filter((m) => m.signal === 'LONG').length,
      short: markets.filter((m) => m.signal === 'SHORT').length,
      topQuant: markets.filter((m) => m.quantScore >= 72).length,
    };
  }, [markets]);

  useEffect(() => {
    setSortEpoch((e) => e + 1);
  }, [filterMode, sortKey, sortDesc, searchQuery]);

  const filteredMarkets = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    const list = markets.filter((m) => {
      if (q && !m.symbol.includes(q) && !m.baseAsset.includes(q)) {
        return false;
      }
      if (filterMode === 'LONG') return m.signal === 'LONG';
      if (filterMode === 'SHORT') return m.signal === 'SHORT';
      if (filterMode === 'TOP_QUANT') return m.quantScore >= 72;
      return true;
    });

    const currentOrderKey = `${filterMode}_${sortKey}_${sortDesc}_${q}_${sortEpoch}`;
    if (
      lastOrderKeyRef.current !== currentOrderKey ||
      lockedSymbolOrderRef.current.length === 0
    ) {
      const freshlySorted = [...list].sort((a, b) => {
        let diff = 0;
        if (sortKey === 'change24hPct') diff = a.change24hPct - b.change24hPct;
        else if (sortKey === 'volume24hUsdt')
          diff = a.volume24hUsdt - b.volume24hUsdt;
        else if (sortKey === 'quantScore') {
          diff =
            a.quantScore - b.quantScore ||
            a.conditionsPassed - b.conditionsPassed;
        } else {
          diff =
            a.conditionsPassed - b.conditionsPassed ||
            a.quantScore - b.quantScore;
        }
        return sortDesc ? -diff : diff;
      });
      lockedSymbolOrderRef.current = freshlySorted.map((m) => m.symbol);
      lastOrderKeyRef.current = currentOrderKey;
      return freshlySorted;
    }

    const orderIndexMap = new Map(
      lockedSymbolOrderRef.current.map((sym, idx) => [sym, idx])
    );
    return [...list].sort((a, b) => {
      const idxA = orderIndexMap.get(a.symbol) ?? 999;
      const idxB = orderIndexMap.get(b.symbol) ?? 999;
      return idxA - idxB;
    });
  }, [markets, searchQuery, filterMode, sortKey, sortDesc, sortEpoch]);

  const handleSort = (key: ScannerSortKey) => {
    if (sortKey === key) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
    setSortEpoch((e) => e + 1);
  };

  return (
    <div className="terminal-panel rounded-md overflow-hidden">
      {/* Terminal Window Header Bar */}
      <div className="terminal-header-bar px-4 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-mono font-bold text-emerald-400 tracking-wide">
            04. ANLIK 50 PİYASA TARAYICISI (NÖRAL BOTUN İZLEDİĞİ COİNLER)
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Bir coine tıklayarak sağ tarafta nöral ağın neden o kararı verdiğini ve canlı grafiğini görebilirsiniz
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="50 Piyasa İçinde Sembol Ara"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Coin ara (BTC, SOL, ETH)..."
              className="pl-8 pr-3 py-1.5 text-xs font-mono terminal-screen-inset rounded text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-48"
            />
          </div>

          {/* Sade Filtre Butonları */}
          <div
            role="group"
            aria-label="Sinyal Filtresi"
            className="flex items-center gap-1 p-1 terminal-screen-inset rounded overflow-x-auto"
          >
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterMode === 'ALL'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tüm Coinler ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('LONG')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterMode === 'LONG'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              Botun AL Dediği ({counts.long})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('SHORT')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterMode === 'SHORT'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              Botun SAT Dediği ({counts.short})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('TOP_QUANT')}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterMode === 'TOP_QUANT'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-sky-400'
              }`}
            >
              En Güçlüler ({counts.topQuant})
            </button>
          </div>
        </div>
      </div>

      {/* Sadeleştirilmiş 50-Piyasa Terminal Tablosu */}
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto bg-[#050912]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[#080d18] border-b border-slate-800 text-[11px] font-mono font-semibold text-slate-400 whitespace-nowrap">
            <tr>
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Coin</th>
              <th className="py-2.5 px-3 text-right">Anlık Fiyat</th>
              <th className="py-2.5 px-3 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('change24hPct')}
                  className="inline-flex items-center gap-1 hover:text-white cursor-pointer whitespace-nowrap"
                >
                  <span>24s Değişim</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-3 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('quantScore')}
                  className="inline-flex items-center gap-1 hover:text-white cursor-pointer whitespace-nowrap"
                >
                  <span>Nöral Güven Puanı</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-2.5 px-3 text-right">Botun Kaldıracı</th>
              <th className="py-2.5 px-3">Neden? (Sade Özet)</th>
              <th className="py-2.5 px-3 text-right">Botun Kararı</th>
              <th className="py-2.5 px-3 text-right">Elle İşlem Aç</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums whitespace-nowrap">
            {filteredMarkets.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                  Seçili filtreye uyan coin bulunamadı.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setFilterMode('ALL');
                    }}
                    className="text-emerald-400 underline ml-1 cursor-pointer"
                  >
                    Tüm 50 Coini Göster
                  </button>
                </td>
              </tr>
            ) : (
              filteredMarkets.map((m, idx) => {
                const isSelected = m.symbol === selectedSymbol;
                const isPositive = m.change24hPct >= 0;
                const explain = getBeginnerFriendlyExplanation(m);

                return (
                  <tr
                    key={m.symbol}
                    onClick={() => onSelectSymbol(m.symbol)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-bold ${
                          isSelected ? 'text-emerald-300' : 'text-slate-100'
                        }`}
                      >
                        {m.baseAsset}
                      </span>
                      <span className="text-slate-500 font-normal">/USDT</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-100">
                      ${formatCompactPrice(m.price)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold ${
                        isPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {m.change24hPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <div className="w-12 h-1.5 bg-slate-800 rounded-sm overflow-hidden hidden sm:block">
                          <div
                            className={`h-full ${
                              m.quantScore >= 75
                                ? 'bg-emerald-400'
                                : m.quantScore >= 58
                                ? 'bg-sky-400'
                                : 'bg-slate-500'
                            }`}
                            style={{ width: `${Math.min(100, m.quantScore)}%` }}
                          />
                        </div>
                        <span
                          className={
                            m.quantScore >= 75
                              ? 'text-emerald-400 font-bold'
                              : m.quantScore >= 58
                              ? 'text-sky-400 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          %{m.quantScore} Güven
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <span className="text-amber-400 font-mono font-bold">
                        {m.effectiveLeverage}x
                      </span>{' '}
                      <span className="text-[11px] text-slate-400">
                        ({leverageMode === 'AUTO' ? 'Bot Seçti' : 'Seçiminiz'})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300 max-w-[230px] truncate">
                      {explain.shortReason}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {m.signal === 'LONG' ? (
                        <span className="font-bold text-emerald-400">
                          AL (YÜKSELİŞ)
                        </span>
                      ) : m.signal === 'SHORT' ? (
                        <span className="font-bold text-rose-400">
                          SAT (DÜŞÜŞ)
                        </span>
                      ) : (
                        <span className="text-slate-500">BEKLİYOR</span>
                      )}
                    </td>
                    <td
                      className="py-2.5 px-3 text-right font-mono"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`${m.symbol} Yükseliş (AL) Emir İlet`}
                          onClick={() => onExecuteOrder(m, 'LONG')}
                          className="px-2 py-1 text-[11px] font-semibold rounded bg-emerald-950/90 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-700/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Al ({m.effectiveLeverage}x)
                        </button>
                        <button
                          type="button"
                          aria-label={`${m.symbol} Düşüş (SAT) Emir İlet`}
                          onClick={() => onExecuteOrder(m, 'SHORT')}
                          className="px-2 py-1 text-[11px] font-semibold rounded bg-rose-950/90 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-700/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Sat ({m.effectiveLeverage}x)
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
