import React, { useState, useMemo } from 'react';
import {
  OpenPosition,
  ExecutionLogEntry,
  ClosedTradeRecord,
  calculateTradeHistoryStats,
  formatCompactPrice,
} from '../utils/tradingEngine';

type HistoryFilterMode = 'ALL' | 'WIN' | 'LOSS';

interface PositionsAndLogsPanelProps {
  openPositions: OpenPosition[];
  closedHistory: ClosedTradeRecord[];
  executionLogs: ExecutionLogEntry[];
  autoExecuteEnabled: boolean;
  showOpenPositionsRow?: boolean;
  showHistoryTable?: boolean;
  onClosePosition: (positionId: string) => void;
  onCloseAllPositions: () => void;
  onTriggerInstantScan: () => void;
  onSimulateAutoCycle: () => void;
}

function formatSimpleExitReason(reason: ClosedTradeRecord['exitReason']): string {
  if (reason === 'OTOMATİK KÂR AL (TP)') return 'Bot Otomatik Kâr Aldı (OCO)';
  if (reason === 'OTOMATİK ZARAR KES (SL)') return 'Bot Zararı Durdurdu';
  if (reason === 'OTOMATİK TREND/RSI ÇIKIŞI') return 'Bot Trend Dönüşünde Sattı';
  return 'Kullanıcı Elle Kapattı';
}

export const PositionsAndLogsPanel: React.FC<PositionsAndLogsPanelProps> = ({
  openPositions,
  closedHistory,
  executionLogs,
  autoExecuteEnabled,
  showOpenPositionsRow = true,
  showHistoryTable = true,
  onClosePosition,
  onCloseAllPositions,
  onTriggerInstantScan,
  onSimulateAutoCycle,
}) => {
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterMode>('ALL');

  const historyStats = useMemo(
    () => calculateTradeHistoryStats(closedHistory),
    [closedHistory]
  );

  const filteredHistory = useMemo(() => {
    return closedHistory.filter((item) => {
      if (historyFilter === 'WIN') return item.realizedPnlUsdt >= 0;
      if (historyFilter === 'LOSS') return item.realizedPnlUsdt < 0;
      return true;
    });
  }, [closedHistory, historyFilter]);

  const totalOpenPnlUsdt = useMemo(
    () => openPositions.reduce((acc, p) => acc + p.unrealizedPnlUsdt, 0),
    [openPositions]
  );

  return (
    <div className="space-y-6">
      {/* BÖLÜM 3: AÇIK POZİSYONLAR TERMİNAL PENCERESİ (SABİT YÜKSEKLİKLİ KONSOL ALANI — SAYFA KAYMASINI ÖNLER) */}
      {showOpenPositionsRow && (
        <section
          id="open-positions"
          aria-label="Açık Pozisyonlarım ve Anlık Kâr Zarar"
          className="terminal-panel rounded-md overflow-hidden"
        >
          <div className="terminal-header-bar px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-mono font-bold text-emerald-400 tracking-wide">
                03. AÇIK POZİSYONLARIM (ŞU AN DEVAM EDEN AL-SATLAR · {openPositions.length} ADET)
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Botun açtığı işlemler burada canlı takip edilir; hedefe ulaştığında bot otomatik kapatıp kârı kasaya ekler
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="px-3 py-1.5 rounded terminal-screen-inset text-xs font-mono tabular-nums">
                <span className="text-slate-400 font-sans mr-1.5">Açık İşlemler K/Z:</span>
                <strong
                  className={
                    totalOpenPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }
                >
                  {totalOpenPnlUsdt >= 0 ? '+' : ''}
                  {totalOpenPnlUsdt.toFixed(2)} USDT
                </strong>
              </div>

              <button
                type="button"
                onClick={onSimulateAutoCycle}
                className="px-3 py-1.5 text-xs font-mono font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
              >
                Bot Şimdi Al-Sat Turu Yapsın
              </button>

              {openPositions.length > 0 && (
                <button
                  type="button"
                  onClick={onCloseAllPositions}
                  className="px-3 py-1.5 text-xs font-mono font-semibold rounded border border-rose-700/70 bg-rose-950/60 hover:bg-rose-600 text-rose-200 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  Tümünü Kapat ({openPositions.length})
                </button>
              )}
            </div>
          </div>

          <div className="h-[245px] overflow-y-auto overflow-x-auto bg-[#050912]">
            {openPositions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <div className="text-sm font-mono font-semibold text-slate-200">
                  Şu Anda Açık Pozisyon Yok
                </div>
                <p className="mt-1 text-xs text-slate-400 max-w-lg mx-auto">
                  {autoExecuteEnabled
                    ? 'Nöral terminal şu an 50 coini tarıyor. Uygun fırsat yakaladığı anda Yarım Kelly bütçesiyle otomatik işlem açacaktır.'
                    : 'İsterseniz üstten "Oto Al-Satı Başlat" butonuna basabilir veya hemen şimdi bota işlem açtırabilirsiniz.'}
                </p>
                <button
                  type="button"
                  onClick={onTriggerInstantScan}
                  className="mt-3.5 px-4 py-2 text-xs font-mono font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-colors cursor-pointer"
                >
                  Bot Şimdi En Güçlü Coine İşlem Açsın
                </button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[#080d18] border-b border-slate-800 text-[11px] font-mono font-semibold text-slate-400 whitespace-nowrap">
                  <tr>
                    <th className="py-2.5 px-4">Coin</th>
                    <th className="py-2.5 px-3">İşlem Yönü & Kaldıraç</th>
                    <th className="py-2.5 px-3 text-right">Yatırılan Miktar</th>
                    <th className="py-2.5 px-3 text-right">Alış Fiyatı → Şu Anki Fiyat</th>
                    <th className="py-2.5 px-3 text-right">Otomatik Kâr / Zarar Sınırı</th>
                    <th className="py-2.5 px-3 text-right">Anlık Kâr / Zarar (K/Z)</th>
                    <th className="py-2.5 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums whitespace-nowrap">
                  {openPositions.map((pos) => {
                    const isProfit = pos.unrealizedPnlUsdt >= 0;
                    return (
                      <tr key={pos.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-4">
                          <div className="font-bold text-slate-100 text-sm">
                            {pos.baseAsset}/USDT
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Miktar: {pos.quantity >= 1 ? pos.quantity.toFixed(2) : pos.quantity.toFixed(4)} {pos.baseAsset}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-bold ${
                              pos.side === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {pos.side === 'LONG' ? 'YÜKSELİŞ (AL)' : 'DÜŞÜŞ (SAT)'}
                          </span>
                          <span className="ml-1.5 text-amber-400 font-bold">
                            · {pos.leverage}x
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="font-bold text-slate-100">
                            ${pos.marginUsdt.toFixed(0)} USDT
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Yarım Kelly · Büyüklük: ${pos.notionalUsdt.toLocaleString('en-US')}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-slate-400">
                            ${formatCompactPrice(pos.entryPrice)}
                          </span>{' '}
                          <span className="text-slate-500">→</span>{' '}
                          <span className="font-bold text-slate-100">
                            ${formatCompactPrice(pos.currentPrice)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-[11px]">
                          <div className="text-emerald-400">
                            OCO Kâr Al: ${formatCompactPrice(pos.takeProfitPrice)}
                          </div>
                          <div className="text-rose-400">
                            İz Süren Stop: ${formatCompactPrice(pos.stopLossPrice)}
                            {pos.trailingStopActive ? ' (Kâr Kilitli)' : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div
                            className={`text-sm font-bold ${
                              isProfit ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isProfit ? '+' : ''}
                            {pos.unrealizedPnlUsdt.toFixed(2)} USDT
                          </div>
                          <div
                            className={`text-[11px] ${
                              isProfit ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            ({isProfit ? '+' : ''}
                            {pos.roePct.toFixed(2)}%)
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onClosePosition(pos.id)}
                            className="px-3 py-1.5 text-xs font-mono font-semibold rounded bg-slate-900 hover:bg-rose-600 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                          >
                            Şimdi Kapat
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* BÖLÜM 6: BASİT İŞLEM GEÇMİŞİ VE CANLI TERMİNAL AKIŞI */}
      {showHistoryTable && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Sol 8 Sütun: Basit Kapanan İşlemler Tablosu */}
          <section
            id="trade-history"
            aria-label="Basit İşlem Geçmişi"
            className="lg:col-span-8 terminal-panel rounded-md overflow-hidden"
          >
            <div className="terminal-header-bar px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-mono font-bold text-emerald-400 tracking-wide">
                  06. TAMAMLANAN İŞLEM GEÇMİŞİ ({closedHistory.length} ADET)
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Kapanan tüm al-sat işlemlerinizin ne kadar kazandırdığı veya kaybettirdiği sade biçimde listelenir
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="px-2.5 py-1 rounded terminal-screen-inset text-xs font-mono tabular-nums">
                  <span className="text-slate-400 font-sans mr-1">Toplam Net K/Z:</span>
                  <strong
                    className={
                      historyStats.totalNetPnlUsdt >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {historyStats.totalNetPnlUsdt >= 0 ? '+' : ''}
                    {historyStats.totalNetPnlUsdt.toFixed(2)} USDT
                  </strong>
                </div>

                <div
                  role="group"
                  aria-label="Geçmiş Filtresi"
                  className="flex items-center gap-1 p-1 terminal-screen-inset rounded"
                >
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('ALL')}
                    className={`px-2.5 py-1 text-xs font-mono font-medium rounded cursor-pointer ${
                      historyFilter === 'ALL'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Tümü ({closedHistory.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('WIN')}
                    className={`px-2.5 py-1 text-xs font-mono font-medium rounded cursor-pointer ${
                      historyFilter === 'WIN'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    Kazandıran ({historyStats.winCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('LOSS')}
                    className={`px-2.5 py-1 text-xs font-mono font-medium rounded cursor-pointer ${
                      historyFilter === 'LOSS'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    Kaybettiren ({historyStats.lossCount})
                  </button>
                </div>
              </div>
            </div>

            <div className="h-[340px] overflow-x-auto overflow-y-auto bg-[#050912]">
              {filteredHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center p-8 text-center text-xs text-slate-400">
                  Henüz kapanmış bir işlem bulunmuyor. Açık işlemler kâr hedefine ulaştığında veya kapatıldığında buraya eklenir.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#080d18] border-b border-slate-800 text-[11px] font-mono font-semibold text-slate-400 whitespace-nowrap">
                    <tr>
                      <th className="py-2.5 px-4">Coin</th>
                      <th className="py-2.5 px-3">Ne Yapıldı?</th>
                      <th className="py-2.5 px-3 text-right">Yatırılan Miktar</th>
                      <th className="py-2.5 px-3 text-right">Alış → Satış Fiyatı</th>
                      <th className="py-2.5 px-3 text-right">Net Kâr / Zarar (K/Z)</th>
                      <th className="py-2.5 px-4 text-right">Nasıl Kapandı?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums whitespace-nowrap">
                    {filteredHistory.map((item) => {
                      const isWin = item.realizedPnlUsdt >= 0;
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-4 font-bold text-slate-100">
                            {item.baseAsset}/USDT
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={
                                item.side === 'LONG'
                                  ? 'text-emerald-400 font-semibold'
                                  : 'text-rose-400 font-semibold'
                              }
                            >
                              {item.side === 'LONG' ? 'Yükseliş (AL)' : 'Düşüş (SAT)'}
                            </span>{' '}
                            <span className="text-amber-400 font-bold">
                              {item.leverage}x
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-200">
                            ${item.marginUsdt.toFixed(0)} USDT
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="text-slate-400">
                              ${formatCompactPrice(item.entryPrice)}
                            </span>{' '}
                            →{' '}
                            <span className="text-slate-100 font-semibold">
                              ${formatCompactPrice(item.exitPrice)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`font-bold ${
                                isWin ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isWin ? '+' : ''}
                              {item.realizedPnlUsdt.toFixed(2)} USDT ({isWin ? '+' : ''}
                              {item.roePct.toFixed(1)}%)
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-sans text-slate-300">
                            {formatSimpleExitReason(item.exitReason)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Sağ 4 Sütun: Canlı Terminal Konsol Akışı */}
          <section
            aria-label="Botun Son Al-Sat Hareketleri"
            className="lg:col-span-4 terminal-panel rounded-md overflow-hidden"
          >
            <div className="terminal-header-bar px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-mono font-bold text-emerald-400 tracking-wide">
                  07. CANLI TERMİNAL AKIŞI
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Botun anlık emir ve karar konsolu
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                [{executionLogs.length} Kayıt]
              </span>
            </div>

            <div className="p-3 space-y-2 h-[340px] overflow-y-auto bg-[#04070d] font-mono">
              {executionLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center p-6 text-center text-xs text-slate-400 font-sans">
                  Henüz işlem hareketi yok. Bot alım veya satım yaptığında burada adım adım yazar.
                </div>
              ) : (
                executionLogs.slice(0, 15).map((log) => {
                  const isExit = log.side === 'KAPAT';
                  return (
                    <div
                      key={log.id}
                      className="p-2.5 rounded terminal-screen-inset text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span
                          className={
                            isExit
                              ? (log.pnlUsdt ?? 0) >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                              : log.side === 'LONG'
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }
                        >
                          [{new Date(log.timestamp).toLocaleTimeString('tr-TR')}] {log.symbol} ·{' '}
                          {isExit
                            ? 'KAPATILDI'
                            : log.side === 'LONG'
                            ? `AL ${log.leverage || 5}x`
                            : `SAT ${log.leverage || 5}x`}
                        </span>
                      </div>
                      <div className="text-slate-300 text-[11px] font-sans">
                        {log.outcomeNote}
                      </div>
                      {typeof log.pnlUsdt === 'number' && (
                        <div
                          className={`font-bold text-xs ${
                            log.pnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          Sonuç: {log.pnlUsdt >= 0 ? '+' : ''}
                          {log.pnlUsdt.toFixed(2)} USDT ({log.pnlPct && log.pnlPct >= 0 ? '+' : ''}
                          {log.pnlPct?.toFixed(1)}%)
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
