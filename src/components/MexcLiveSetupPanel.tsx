import React, { useState } from 'react';
import {
  MarketTicker,
  StrategyConfig,
  MexcLiveOrderReceipt,
  buildMexcFuturesOrderPayload,
  formatCompactPrice,
  generatePythonBotCode,
} from '../utils/tradingEngine';
import { ServerMexcAccountStatus } from './BtcRegimeBanner';
import { Download, Send, RefreshCw } from 'lucide-react';

interface MexcLiveSetupPanelProps {
  selectedMarket: MarketTicker;
  config: StrategyConfig;
  mexcStatus: ServerMexcAccountStatus;
  onRefreshAccountStatus: () => void;
  onOrderDispatched: (
    market: MarketTicker,
    side: 'LONG' | 'SHORT',
    receipt: MexcLiveOrderReceipt
  ) => void;
}

export const MexcLiveSetupPanel: React.FC<MexcLiveSetupPanelProps> = ({
  selectedMarket,
  config,
  mexcStatus,
  onRefreshAccountStatus,
  onOrderDispatched,
}) => {
  const [latestReceipt, setLatestReceipt] = useState<MexcLiveOrderReceipt | null>(null);
  const [isSendingOrder, setIsSendingOrder] = useState<boolean>(false);

  const isRealApiConnected = Boolean(
    mexcStatus.hasServerApiKeys && mexcStatus.liveAccount?.authenticated
  );
  const holdings = mexcStatus.liveAccount?.holdings ?? [];

  const previewPayload = buildMexcFuturesOrderPayload({
    symbol: selectedMarket.symbol,
    side: selectedMarket.signal === 'SHORT' ? 'SHORT' : 'LONG',
    price: selectedMarket.mexcPrice,
    marginUsdt: config.orderSizeUsdt,
    leverage: config.leverage,
    stopLossPct: config.stopLossPct,
    takeProfitPct: config.takeProfitPct,
  });

  const handleDispatchLiveDemoOrder = async (side: 'LONG' | 'SHORT') => {
    setIsSendingOrder(true);
    try {
      const res = await fetch('/api/mexc/demo-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedMarket.symbol,
          side,
          leverage: config.leverage,
          marginUsdt: config.orderSizeUsdt,
          entryPrice: selectedMarket.mexcPrice,
          stopLossPct: config.stopLossPct,
          takeProfitPct: config.takeProfitPct,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.receipt) {
          setLatestReceipt(data.receipt);
          onOrderDispatched(selectedMarket, side, data.receipt);
        }
      }
    } finally {
      setIsSendingOrder(false);
    }
  };

  const handleDownloadPythonScript = () => {
    const code = generatePythonBotCode(config);
    const blob = new Blob([code], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kvantumbot_mexc_demo.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      id="mexc-live-bridge"
      aria-label="MEXC Hesap Bağlantısı ve Canlı Cüzdan Varlıkları"
      className="border border-slate-800 bg-slate-900/90 rounded-lg p-5"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Connected Real MEXC Account Details & Wallet Holdings */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-100">
                  Borsa Hesap Durumu ve İcra Modu Doğrulaması
                </h2>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                    mexcStatus.tradeMode === 'LIVE' || mexcStatus.tradeMode === 'PRODUCTION'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : mexcStatus.hasServerApiKeys
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  İCRA MODU:{' '}
                  {mexcStatus.tradeMode === 'LIVE' || mexcStatus.tradeMode === 'PRODUCTION'
                    ? 'LIVE (CANLI BORSA)'
                    : mexcStatus.hasServerApiKeys
                    ? 'BINANCE TESTNET'
                    : 'PAPER (YEREL SİMÜLASYON)'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                API Anahtarı Durumu:{' '}
                <strong className="font-mono text-amber-300">
                  {mexcStatus.maskedKey || 'YOK (PAPER MODU)'}
                </strong>{' '}
                · Spot Testnet uç noktasında (`testnet.binance.vision/api/v3/order`) SHORT, kaldıraç ve OCO TP/SL yerel motorda simüle edilir; likidasyon fiyatı tahmini (`%92/Kaldıraç`) olarak hesaplanır.
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshAccountStatus}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>API Bağlantısını Yenile</span>
            </button>
          </div>

          {/* Live Connection Status Box */}
          <div
            className={`border rounded-lg p-4 space-y-3 ${
              isRealApiConnected
                ? 'border-emerald-500/50 bg-emerald-950/20'
                : 'border-slate-800 bg-slate-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <span className="font-bold text-slate-100">
                İcra Durumu:{' '}
                <span
                  className={
                    isRealApiConnected ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {isRealApiConnected
                    ? `BINANCE TESTNET HESABI DOĞRULANDI (${mexcStatus.maskedKey})`
                    : 'PAPER MODU (API ANAHTARI YOK — YEREL EMİR DEFTERİ SİMÜLASYONU)'}
                </span>
              </span>
              <span className="text-slate-400">
                Gidiş-Dönüş Gecikme: {mexcStatus.futuresLatencyMs}ms
              </span>
            </div>

            <div className="text-xs text-slate-300">
              {mexcStatus.liveAccount?.statusMessage ||
                'API anahtarı tanımlanmadığında sahte emir ID veya imza üretilmez; tüm emirler gerçek L2 emir defteri üzerinde PAPER olarak işaretlenir.'}
            </div>

            {isRealApiConnected && holdings.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80">
                <div className="text-xs font-semibold text-slate-200 mb-2">
                  Hesabınızda Okunan Canlı Varlıklar (İlk {holdings.length} Adet):
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[160px] overflow-y-auto pr-1 text-xs font-mono tabular-nums">
                  {holdings.map((h, i) => (
                    <div
                      key={`${h.walletType}_${h.asset}_${i}`}
                      className="p-2 rounded bg-slate-950 border border-slate-800 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-100">{h.asset}</span>
                        <span className="text-[10px] text-slate-400">{h.walletType}</span>
                      </div>
                      <div className="mt-1 text-emerald-400 truncate">
                        {h.free >= 100
                          ? h.free.toLocaleString('en-US', { maximumFractionDigits: 2 })
                          : h.free.toFixed(4)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                Kendi bilgisayarınızda çalıştırmak için hazır Python botu:
              </span>
              <button
                type="button"
                onClick={handleDownloadPythonScript}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>kvantumbot_binance_demo.py İndir</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Quick Live Binance Demo Order Test */}
        <div className="lg:col-span-5 border border-slate-800 bg-slate-950 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Emir İletim Köprüsü ({selectedMarket.symbol})
              </h3>
              <p className="text-xs text-slate-400">
                {mexcStatus.hasServerApiKeys
                  ? 'testnet.binance.vision/api/v3/order üzerinden imzalı emir'
                  : 'PAPER Modu — Gerçek L2 emir defteri yürüyüşü ile simülasyon'}
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400">
              {selectedMarket.effectiveLeverage}x (Tahmini Liq)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isSendingOrder}
              onClick={() => handleDispatchLiveDemoOrder('LONG')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>LONG (BUY) Emir Gönder</span>
            </button>
            <button
              type="button"
              disabled={isSendingOrder}
              onClick={() => handleDispatchLiveDemoOrder('SHORT')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-md bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>SHORT (SELL) Emir Gönder</span>
            </button>
          </div>

          {latestReceipt ? (
            <div className="border border-emerald-500/40 bg-slate-900/90 rounded p-3 text-xs font-mono tabular-nums space-y-1.5">
              <div className="flex justify-between text-emerald-400 font-bold">
                <span>
                  {latestReceipt.mexcTestOrderVerified
                    ? `BORSA ONAYLI (${latestReceipt.mexcContractSymbol})`
                    : `PAPER KAYIT (${latestReceipt.mexcContractSymbol})`}
                </span>
                <span>{latestReceipt.orderId}</span>
              </div>
              <div className="text-slate-300 flex justify-between">
                <span>Dolum Fiyatı: ${formatCompactPrice(latestReceipt.liveMarketPrice)}</span>
                <span>
                  SL: ${formatCompactPrice(latestReceipt.stopLossPrice)} / TP: $
                  {formatCompactPrice(latestReceipt.takeProfitPrice)}
                </span>
              </div>
              <div className="text-amber-300 flex justify-between text-[11px]">
                <span>
                  Tahmini Likidasyon: $
                  {formatCompactPrice(latestReceipt.liquidationPrice)} (Tahmini)
                </span>
                <span>RTT: {latestReceipt.serverLatencyMs}ms</span>
              </div>
              {latestReceipt.mexcTestOrderVerified !== undefined && (
                <div className="pt-1.5 border-t border-slate-800 text-[11px] font-sans space-y-1">
                  <div
                    className={
                      latestReceipt.mexcTestOrderVerified
                        ? 'text-emerald-400 font-medium'
                        : 'text-amber-300 font-medium'
                    }
                  >
                    Borsa Doğrulaması:{' '}
                    {latestReceipt.mexcTestOrderVerified
                      ? 'DOĞRULANDI (200 OK — Borsa orderId Döndü)'
                      : `DOĞRULANMADI / PAPER (Kod: ${
                          latestReceipt.mexcFuturesServerCode ?? 0
                        })`}
                  </div>
                  <div className="text-slate-300">
                    {latestReceipt.mexcFuturesServerMessage}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs font-mono tabular-nums text-slate-400 bg-slate-900/60 rounded p-2.5 flex items-center justify-between">
              <span>Fiyat: ${formatCompactPrice(previewPayload.price)}</span>
              <span>SL: ${formatCompactPrice(previewPayload.stopLossPrice)}</span>
              <span>TP: ${formatCompactPrice(previewPayload.takeProfitPrice)}</span>
            </div>
          )}

          <div className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-800/80">
            <strong className="text-slate-200">MEXC Vadeli Demo API Notu:</strong> MEXC borsası web
            sitesindeki sanal demo sayfasını (<em>futures.testnet.mexc.com</em>) dış API anahtarlarına
            kapalı tutmaktadır; oluşturduğunuz <code className="text-emerald-400">mx0v...</code> API
            anahtarı doğrudan <strong>Gerçek MEXC Vadeli (`contract.mexc.com`)</strong> sunucusuna
            bağlanır. Vadeli cüzdan bakiyeniz <strong>$0.0000</strong> olduğunda MEXC sunucusu emri
            doğrulayıp <code className="text-amber-400">Kod 2005 (Bakiye Yetersiz)</code> döner ve
            botumuz işlemi gerçek MEXC vadeli kontrat fiyatlarıyla 10,000 USDT sanal vadeli kasada
            birebir yürütür. Vadeli cüzdanınıza USDT aktardığınızda ise aynı emir doğrudan gerçek
            MEXC vadeli pozisyonu olarak açılır.
          </div>
        </div>
      </div>
    </section>
  );
};
