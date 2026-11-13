import React, { useState, useEffect } from 'react';
import {
  StrategyConfig,
  DEFAULT_STRATEGY_CONFIG,
  validateStrategyConfig,
  generatePythonBotCode,
} from '../utils/tradingEngine';
import { Check, Copy } from 'lucide-react';

interface RuleEngineSectionProps {
  config: StrategyConfig;
  onUpdateConfig: (newConfig: StrategyConfig) => void;
}

export const RuleEngineSection: React.FC<RuleEngineSectionProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [draft, setDraft] = useState<StrategyConfig>(config);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateStrategyConfig(draft);
    if (!check.valid) {
      setValidationErrors(check.errors);
      setSavedNotice(false);
      return;
    }
    setValidationErrors([]);
    onUpdateConfig(draft);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleReset = () => {
    setDraft(DEFAULT_STRATEGY_CONFIG);
    setValidationErrors([]);
    onUpdateConfig(DEFAULT_STRATEGY_CONFIG);
  };

  const pythonCode = generatePythonBotCode(config);

  const handleCopyPython = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(pythonCode).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 6 cols: Deterministic Rule Engine Form */}
      <section
        id="rule-engine"
        aria-label="Deterministik Kural Motoru ve MEXC Demo Ayarları"
        className="lg:col-span-6 border border-slate-800 bg-slate-900/90 rounded-lg p-5"
      >
        <div className="pb-4 border-b border-slate-800">
          <h2 className="text-base font-bold text-slate-100">
            05. Deterministik Kural Motoru ve Borsa İcra Parametreleri
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Gerçek 5m/15m OHLCV mumlarından hesaplanan matematiksel eşikler aynı anda sağlandığında emir üretilir; haber duyarlılık analizleri ise açıkça AI Tahmini (AI Estimate) olarak etiketlenir.
          </p>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4" noValidate>
          {validationErrors.length > 0 && (
            <div
              role="alert"
              className="border border-rose-700 bg-rose-950/70 rounded-md p-3 text-xs text-rose-200 space-y-1"
            >
              <div className="font-semibold">Parametre Doğrulama Hatası:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {savedNotice && (
            <div
              role="status"
              className="border border-emerald-700 bg-emerald-950/70 rounded-md p-3 text-xs text-emerald-200 font-medium"
            >
              Deterministik kural ve MEXC Demo parametreleri güncellendi ve 50 piyasaya eşzamanlı uygulandı.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="rsiOversold"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                RSI(14) Aşırı Satım (LONG Eşiği)
              </label>
              <input
                id="rsiOversold"
                type="number"
                step="1"
                value={Number.isNaN(draft.rsiOversold) ? '' : draft.rsiOversold}
                onChange={(e) =>
                  setDraft({ ...draft, rsiOversold: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="rsiOverbought"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                RSI(14) Aşırı Alım (SHORT Eşiği)
              </label>
              <input
                id="rsiOverbought"
                type="number"
                step="1"
                value={Number.isNaN(draft.rsiOverbought) ? '' : draft.rsiOverbought}
                onChange={(e) =>
                  setDraft({ ...draft, rsiOverbought: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="minVolumeMultiplier"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Min. Anlık Hacim Çarpanı (x)
              </label>
              <input
                id="minVolumeMultiplier"
                type="number"
                step="0.05"
                value={
                  Number.isNaN(draft.minVolumeMultiplier)
                    ? ''
                    : draft.minVolumeMultiplier
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    minVolumeMultiplier: parseFloat(e.target.value),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="orderSizeUsdt"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                İşlem Başına Teminat (Margin USDT)
              </label>
              <input
                id="orderSizeUsdt"
                type="number"
                step="10"
                value={Number.isNaN(draft.orderSizeUsdt) ? '' : draft.orderSizeUsdt}
                onChange={(e) =>
                  setDraft({ ...draft, orderSizeUsdt: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="leverage"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                MEXC Demo Kaldıraç Çarpanı (1x - 50x)
              </label>
              <input
                id="leverage"
                type="number"
                step="1"
                value={Number.isNaN(draft.leverage) ? '' : draft.leverage}
                onChange={(e) =>
                  setDraft({ ...draft, leverage: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="demoStartingBalanceUsdt"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                MEXC Demo Başlangıç Kasası (USDT)
              </label>
              <input
                id="demoStartingBalanceUsdt"
                type="number"
                step="500"
                value={
                  Number.isNaN(draft.demoStartingBalanceUsdt)
                    ? ''
                    : draft.demoStartingBalanceUsdt
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    demoStartingBalanceUsdt: parseFloat(e.target.value),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="stopLossPct"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Otomatik Zarar Kes (Stop-Loss %)
              </label>
              <input
                id="stopLossPct"
                type="number"
                step="0.1"
                value={Number.isNaN(draft.stopLossPct) ? '' : draft.stopLossPct}
                onChange={(e) =>
                  setDraft({ ...draft, stopLossPct: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="takeProfitPct"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Otomatik Kâr Al (Take-Profit %)
              </label>
              <input
                id="takeProfitPct"
                type="number"
                step="0.1"
                value={Number.isNaN(draft.takeProfitPct) ? '' : draft.takeProfitPct}
                onChange={(e) =>
                  setDraft({ ...draft, takeProfitPct: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-md text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
            <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.requireBtcAlignment}
                onChange={(e) =>
                  setDraft({ ...draft, requireBtcAlignment: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
              />
              <span>
                BTC/USDT Rejim Kilidi (BTC düşüşteyken altcoin LONG emirlerini engelle)
              </span>
            </label>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 text-xs font-medium rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Varsayılana Sıfırla
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Kuralları Kaydet ve Uygula
            </button>
          </div>
        </form>
      </section>

      {/* Right 6 cols: Standalone Python CCXT MEXC & Binance Demo/Live Bot Code */}
      <section
        id="python-bot-code"
        aria-label="MEXC ve Binance API Python Bot Kodu"
        className="lg:col-span-6 border border-slate-800 bg-slate-900/90 rounded-lg p-5 flex flex-col justify-between"
      >
        <div>
          <div className="pb-4 border-b border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-100">
                06. MEXC Demo & Binance API (CCXT) Python Bot Kodu
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                İster MEXC Demo (Paper Trading) modunda sanal kasayla, ister canlı API anahtarınızla çalıştırın
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyPython}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Python Kodunu Kopyala</span>
                </>
              )}
            </button>
          </div>

          <pre className="mt-4 p-3.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono tabular-nums text-slate-300 overflow-x-auto max-h-[380px] overflow-y-auto leading-relaxed">
            <code>{pythonCode}</code>
          </pre>
        </div>
      </section>
    </div>
  );
};
