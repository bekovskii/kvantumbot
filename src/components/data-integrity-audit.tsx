import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Database,
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Filter,
  Radio,
  Search,
  RefreshCw,
} from 'lucide-react';
import {
  MarketTicker,
  BtcRegimeState,
  DemoWalletState,
  OpenPosition,
  formatCompactPrice,
} from '../utils/tradingEngine';
import {
  OrderBookMicrostructure,
  RealOrderBookSnapshot,
  WatchdogStatus,
  TokenBucketState,
  NewsIntelligenceItem,
} from '../utils/v3ParallelEngine';
import { ServerMexcAccountStatus } from './BtcRegimeBanner';

export type MetricDataType = 'REAL' | 'DERIVED' | 'ESTIMATED';

export interface DataIntegrityRow {
  id: string;
  category:
    | 'KRITIK_CEKIRDEK'
    | 'FIYAT_VE_HACIM'
    | 'MUM_VE_INDIKATOR'
    | 'MIKROYAPI_L2'
    | 'POZISYON_VE_EMIR'
    | 'SISTEM_VE_HABER';
  categoryLabel: string;
  metricName: string;
  shortKey: 'PRICE' | 'RSI' | 'OBI' | 'TFI' | 'FUNDING_RATE' | 'OTHER';
  liveValue: string;
  sourceLabel: string; // e.g., Binance WebSocket / REST, MEXC REST, Derived Calculation
  endpointOrFormula: string;
  timestampMs: number;
  ageMs: number;
  freshness: 'FRESH' | 'STALE' | 'NO_DATA';
  dataType: MetricDataType;
  verificationNote: string;
}

export interface DataIntegrityAuditProps {
  selectedMarket: MarketTicker;
  markets?: MarketTicker[];
  onSelectSymbol?: (symbol: string) => void;
  onRefreshNow?: () => void;
  btcRegime: BtcRegimeState;
  microstructure: OrderBookMicrostructure;
  realOrderBookSnapshot: RealOrderBookSnapshot | null;
  demoWallet: DemoWalletState;
  openPositions: OpenPosition[];
  mexcStatus: ServerMexcAccountStatus;
  watchdog: WatchdogStatus;
  rateLimiter: TokenBucketState;
  latestNews: NewsIntelligenceItem | null;
  lastFeedSyncMs: number;
  isLiveFeedSynced: boolean;
}

function formatExactTimestamp(tsMs: number): string {
  if (!tsMs || tsMs <= 0) return '— (Henüz Güncellenmedi)';
  const d = new Date(tsMs);
  const timePart = d.toLocaleTimeString('tr-TR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const msPart = String(d.getMilliseconds()).padStart(3, '0');
  return `${timePart}.${msPart}`;
}

function formatAgeLabel(ageMs: number): string {
  if (ageMs < 0) return 'Veri Yok';
  if (ageMs < 1000) return `${ageMs} ms önce`;
  return `${(ageMs / 1000).toFixed(1)} sn önce`;
}

export const DataIntegrityAudit: React.FC<DataIntegrityAuditProps> = ({
  selectedMarket,
  markets = [],
  onSelectSymbol,
  onRefreshNow,
  btcRegime,
  microstructure,
  realOrderBookSnapshot,
  demoWallet,
  openPositions,
  mexcStatus,
  watchdog,
  rateLimiter,
  latestNews,
  lastFeedSyncMs,
  isLiveFeedSynced,
}) => {
  const [typeFilter, setTypeFilter] = useState<'ALL' | MetricDataType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const now = Date.now();

  const binanceWsConnected =
    mexcStatus.wsTelemetry?.binanceWsStatus === 'CONNECTED';
  const mexcWsConnected =
    mexcStatus.wsTelemetry?.mexcWsStatus === 'CONNECTED';

  const marketTs =
    selectedMarket.lastUpdatedMs ||
    selectedMarket.updatedAt ||
    lastFeedSyncMs ||
    0;
  const marketAgeMs = marketTs > 0 ? Math.max(0, now - marketTs) : -1;
  const marketFreshness: 'FRESH' | 'STALE' | 'NO_DATA' =
    selectedMarket.dataStatus ||
    (marketTs <= 0 ? 'NO_DATA' : marketAgeMs <= 60000 ? 'FRESH' : 'STALE');

  const depthTs = realOrderBookSnapshot?.timestamp || 0;
  const depthAgeMs = depthTs > 0 ? Math.max(0, now - depthTs) : -1;

  const statusTs = mexcStatus.timestamp || lastFeedSyncMs || 0;
  const statusAgeMs = statusTs > 0 ? Math.max(0, now - statusTs) : -1;

  const rows: DataIntegrityRow[] = useMemo(() => {
    const activePos = openPositions[0] || null;
    const execModeLabel =
      mexcStatus.tradeMode === 'LIVE' || mexcStatus.tradeMode === 'PRODUCTION'
        ? 'LIVE (MEXC FUTURES)'
        : mexcStatus.hasServerApiKeys
        ? 'BINANCE TESTNET'
        : 'PAPER (YEREL SİMÜLASYON)';

    const primaryFeedSource = binanceWsConnected
      ? 'Binance WebSocket + Mainnet REST'
      : 'Binance Mainnet REST';

    const fundingSourceLabel =
      mexcStatus.btcFundingRatePct !== null &&
      mexcStatus.btcFundingRatePct !== undefined
        ? mexcWsConnected
          ? 'Binance Futures REST / MEXC WebSocket'
          : 'Binance Futures REST / MEXC REST'
        : 'Unavailable (Erişilemedi)';

    return [
      // === 5 KRİTİK ÇEKİRDEK METRİK (PRICE, RSI, OBI, TFI, FUNDING RATE) ===
      {
        id: 'critical_price',
        category: 'KRITIK_CEKIRDEK',
        categoryLabel: 'Kritik Çekirdek Metrik',
        metricName: `Price (${selectedMarket.symbol} Anlık Fiyat)`,
        shortKey: 'PRICE',
        liveValue:
          selectedMarket.price > 0
            ? `$${formatCompactPrice(selectedMarket.price)}`
            : 'VERİ YOK (NO DATA)',
        sourceLabel: primaryFeedSource,
        endpointOrFormula:
          'GET https://data-api.binance.vision/api/v3/ticker/24hr (lastPrice) & bookTicker',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: selectedMarket.price > 0 ? marketFreshness : 'NO_DATA',
        dataType: 'REAL',
        verificationNote:
          'Sıfır gürültü / sıfır drift; doğrudan borsa tarafından bildirilen gerçek işlem fiyatı.',
      },
      {
        id: 'critical_rsi',
        category: 'KRITIK_CEKIRDEK',
        categoryLabel: 'Kritik Çekirdek Metrik',
        metricName: `RSI (${selectedMarket.symbol} Wilder RSI-14)`,
        shortKey: 'RSI',
        liveValue: selectedMarket.hasRealKlines
          ? `${selectedMarket.rsi14.toFixed(2)}`
          : 'BEKLENİYOR (NO DATA)',
        sourceLabel: 'Derived Calculation (Binance 5m/15m OHLCV)',
        endpointOrFormula:
          'calculateRSI(closes, 14) — Wilder RMA kazanç/kayıp oranı (data-api.binance.vision/api/v3/klines)',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: selectedMarket.hasRealKlines ? marketFreshness : 'NO_DATA',
        dataType: 'DERIVED',
        verificationNote:
          'Yalnızca gerçek 5m/15m borsa mum kapanışları yüklendiğinde hesaplanır.',
      },
      {
        id: 'critical_obi',
        category: 'KRITIK_CEKIRDEK',
        categoryLabel: 'Kritik Çekirdek Metrik',
        metricName: `OBI (${selectedMarket.symbol} Order Book Imbalance)`,
        shortKey: 'OBI',
        liveValue: microstructure.obiAvailable
          ? `${microstructure.obiScore >= 0 ? '+' : ''}${microstructure.obiScore.toFixed(3)}`
          : 'BEKLENİYOR (UNAVAILABLE)',
        sourceLabel: 'Derived Calculation (Binance L2 Depth REST)',
        endpointOrFormula:
          'GET https://data-api.binance.vision/api/v3/depth?limit=20 → (ΣBidNotional - ΣAskNotional) / (ΣBid + ΣAsk)',
        timestampMs: depthTs || marketTs,
        ageMs: depthTs > 0 ? depthAgeMs : marketAgeMs,
        freshness: microstructure.obiAvailable ? 'FRESH' : 'NO_DATA',
        dataType: 'DERIVED',
        verificationNote:
          'İlk 20 gerçek L2 emir defteri kademesindeki alış/satış USDT ağırlığından türetilir.',
      },
      {
        id: 'critical_tfi',
        category: 'KRITIK_CEKIRDEK',
        categoryLabel: 'Kritik Çekirdek Metrik',
        metricName: `TFI (${selectedMarket.symbol} Trade Flow Imbalance)`,
        shortKey: 'TFI',
        liveValue: microstructure.tfiAvailable
          ? `${microstructure.tfiScore >= 0 ? '+' : ''}${microstructure.tfiScore.toFixed(3)} (${
              realOrderBookSnapshot?.tradesSampleCount || 0
            } işlem)`
          : 'BEKLENİYOR (UNAVAILABLE)',
        sourceLabel: 'Derived Calculation (Binance Trades REST)',
        endpointOrFormula:
          'GET https://data-api.binance.vision/api/v3/trades?limit=80 → (TakerBuyUsdt - TakerSellUsdt) / TotalUsdt',
        timestampMs: depthTs,
        ageMs: depthAgeMs,
        freshness: microstructure.tfiAvailable ? 'FRESH' : 'NO_DATA',
        dataType: 'DERIVED',
        verificationNote:
          'Gerçek gerçekleşen işlemlerdeki isBuyerMaker bayrağından net Taker alıcı/satıcı baskısını ölçer.',
      },
      {
        id: 'critical_funding_rate',
        category: 'KRITIK_CEKIRDEK',
        categoryLabel: 'Kritik Çekirdek Metrik',
        metricName: 'Funding Rate (BTC/USDT Vadeli Fonlama Oranı)',
        shortKey: 'FUNDING_RATE',
        liveValue:
          mexcStatus.btcFundingRatePct !== null &&
          mexcStatus.btcFundingRatePct !== undefined
            ? `%${mexcStatus.btcFundingRatePct.toFixed(4)} (Mark: $${formatCompactPrice(
                mexcStatus.btcFuturesMarkPrice || 0
              )})`
            : 'ERİŞİLEMEDİ (UNAVAILABLE)',
        sourceLabel: fundingSourceLabel,
        endpointOrFormula:
          'GET https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT (Fallback: contract.mexc.com/api/v1/contract/funding_rate/BTC_USDT)',
        timestampMs: statusTs,
        ageMs: statusAgeMs,
        freshness:
          mexcStatus.btcFundingRatePct !== null &&
          mexcStatus.btcFundingRatePct !== undefined
            ? 'FRESH'
            : 'NO_DATA',
        dataType: 'REAL',
        verificationNote:
          'Sabit %0.01 fonlama oranı kaldırıldı; doğrudan vadeli işlemler borsa API yanıtı kullanılır.',
      },

      // === DİĞER BÜTÜN METRİKLER ===
      {
        id: 'book_bid_ask',
        category: 'FIYAT_VE_HACIM',
        categoryLabel: '1. Fiyat & Borsa Akışı',
        metricName: `${selectedMarket.symbol} En İyi Alış / Satış (Best Bid / Ask)`,
        shortKey: 'OTHER',
        liveValue:
          selectedMarket.bestBid && selectedMarket.bestAsk
            ? `$${formatCompactPrice(selectedMarket.bestBid)} / $${formatCompactPrice(
                selectedMarket.bestAsk
              )}`
            : 'VERİ YOK (NO DATA)',
        sourceLabel: primaryFeedSource,
        endpointOrFormula:
          'GET https://data-api.binance.vision/api/v3/ticker/bookTicker (bidPrice, askPrice)',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness:
          selectedMarket.bestBid && selectedMarket.bestAsk
            ? marketFreshness
            : 'NO_DATA',
        dataType: 'REAL',
        verificationNote:
          'Gerçek tahta tepe kademesi; sentetik sinüs salınımı kaldırıldı.',
      },
      {
        id: 'high_low_24h',
        category: 'FIYAT_VE_HACIM',
        categoryLabel: '1. Fiyat & Borsa Akışı',
        metricName: `${selectedMarket.symbol} 24s Yüksek / Düşük & 24s Değişim`,
        shortKey: 'OTHER',
        liveValue:
          selectedMarket.high24h > 0
            ? `$${formatCompactPrice(selectedMarket.high24h)} / $${formatCompactPrice(
                selectedMarket.low24h
              )} (${selectedMarket.change24hPct >= 0 ? '+' : ''}${selectedMarket.change24hPct.toFixed(
                2
              )}%)`
            : 'VERİ YOK (NO DATA)',
        sourceLabel: primaryFeedSource,
        endpointOrFormula:
          'GET https://data-api.binance.vision/api/v3/ticker/24hr (highPrice, lowPrice, priceChangePercent)',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: selectedMarket.high24h > 0 ? marketFreshness : 'NO_DATA',
        dataType: 'REAL',
        verificationNote:
          '±%1 varsayılan dolgu kaldırıldı; gerçek 24s borsa istatistiği.',
      },
      {
        id: 'volume_24h',
        category: 'FIYAT_VE_HACIM',
        categoryLabel: '1. Fiyat & Borsa Akışı',
        metricName: `${selectedMarket.symbol} 24s USDT Hacmi & İşlem Sayısı`,
        shortKey: 'OTHER',
        liveValue:
          selectedMarket.volume24hUsdt > 0
            ? `$${(selectedMarket.volume24hUsdt / 1_000_000).toFixed(2)}M (${selectedMarket.tradesCount24h.toLocaleString(
                'tr-TR'
              )} işlem)`
            : 'VERİ YOK (NO DATA)',
        sourceLabel: primaryFeedSource,
        endpointOrFormula:
          'GET https://data-api.binance.vision/api/v3/ticker/24hr (quoteVolume, count)',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness:
          selectedMarket.volume24hUsdt > 0 ? marketFreshness : 'NO_DATA',
        dataType: 'REAL',
        verificationNote: 'Sabit 18.5M$ varsayılan hacim kaldırıldı.',
      },
      {
        id: 'mexc_second_venue',
        category: 'FIYAT_VE_HACIM',
        categoryLabel: '1. Fiyat & Borsa Akışı',
        metricName: `${selectedMarket.symbol} İkincil Borsa (MEXC) Fiyatı`,
        shortKey: 'OTHER',
        liveValue:
          selectedMarket.mexcPriceAvailable && selectedMarket.mexcPrice > 0
            ? `$${formatCompactPrice(selectedMarket.mexcPrice)}`
            : 'DEVRE DIŞI / ERİŞİLEMEDİ (UNAVAILABLE)',
        sourceLabel: 'MEXC REST API',
        endpointOrFormula: 'GET https://api.mexc.com/api/v3/ticker/price',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness:
          selectedMarket.mexcPriceAvailable && selectedMarket.mexcPrice > 0
            ? 'FRESH'
            : 'NO_DATA',
        dataType: 'REAL',
        verificationNote:
          'Sembol hash türetmesi kaldırıldı; yalnızca gerçek MEXC yanıtı varsa gösterilir.',
      },
      {
        id: 'ohlcv_klines',
        category: 'MUM_VE_INDIKATOR',
        categoryLabel: '2. Mumlar (OHLCV) & İndikatörler',
        metricName: `${selectedMarket.symbol} 5m / 15m OHLCV Mum Serisi`,
        shortKey: 'OTHER',
        liveValue: selectedMarket.hasRealKlines
          ? `${selectedMarket.closes.length} mum (5m) · ${
              selectedMarket.closes15m?.length || 0
            } mum (15m) ONAYLI`
          : 'BEKLENİYOR (NO DATA)',
        sourceLabel: 'Binance Mainnet REST (Klines)',
        endpointOrFormula:
          'GET https://data-api.binance.vision/api/v3/klines?interval=5m & 15m',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: selectedMarket.hasRealKlines ? marketFreshness : 'NO_DATA',
        dataType: 'REAL',
        verificationNote:
          'BASE_SEED_PRICES ve sentetik sinüs mum üretimi tamamen silindi.',
      },
      {
        id: 'wilder_atr',
        category: 'MUM_VE_INDIKATOR',
        categoryLabel: '2. Mumlar (OHLCV) & İndikatörler',
        metricName: `${selectedMarket.symbol} Wilder ATR(14) & ATR %`,
        shortKey: 'OTHER',
        liveValue: selectedMarket.hasRealKlines
          ? `${formatCompactPrice(selectedMarket.atr5mValue || 0)} (%${selectedMarket.atrPct.toFixed(
              3
            )})`
          : 'VERİ YOK',
        sourceLabel: 'Derived Calculation (Wilder RMA-14)',
        endpointOrFormula:
          'True Range max(H-L, |H-PrevC|, |L-PrevC|) Wilder RMA(14) — Gerçek 5m/15m H/L/C',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: selectedMarket.hasRealKlines ? marketFreshness : 'NO_DATA',
        dataType: 'DERIVED',
        verificationNote:
          '24s aralık ve |change24h|*0.18+0.65 yapay formülü kaldırıldı.',
      },
      {
        id: 'wilder_adx',
        category: 'MUM_VE_INDIKATOR',
        categoryLabel: '2. Mumlar (OHLCV) & İndikatörler',
        metricName: `${selectedMarket.symbol} Wilder ADX(14) Trend Gücü`,
        shortKey: 'OTHER',
        liveValue: selectedMarket.hasRealKlines
          ? `${selectedMarket.adx14.toFixed(1)}`
          : 'VERİ YOK',
        sourceLabel: 'Derived Calculation (Wilder ADX-14)',
        endpointOrFormula:
          '+DM / -DM / True Range Wilder 14-periyot — Gerçek 5m H/L/C mumları',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: selectedMarket.hasRealKlines ? marketFreshness : 'NO_DATA',
        dataType: 'DERIVED',
        verificationNote:
          'Gerçek yüksek/düşük/kapanış mumlarından hesaplanır.',
      },
      {
        id: 'vwap_closed_vol',
        category: 'MUM_VE_INDIKATOR',
        categoryLabel: '2. Mumlar (OHLCV) & İndikatörler',
        metricName: `${selectedMarket.symbol} VWAP & Kapalı Mum Hacim Çarpanı`,
        shortKey: 'OTHER',
        liveValue: selectedMarket.hasRealKlines
          ? `VWAP: $${formatCompactPrice(selectedMarket.vwap)} (${
              selectedMarket.vwapDeviationPct >= 0 ? '+' : ''
            }${selectedMarket.vwapDeviationPct}%) · Hacim: ${selectedMarket.volumeMultiplier.toFixed(
              2
            )}x`
          : 'VERİ YOK',
        sourceLabel: 'Derived Calculation (Closed Candles)',
        endpointOrFormula:
          'Tipik Fiyat Σ(((H+L+C)/3)*V)/ΣV & Son Kapalı Mum Hacmi / Önceki Kapalı Mumların Ortalaması',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: selectedMarket.hasRealKlines ? marketFreshness : 'NO_DATA',
        dataType: 'DERIVED',
        verificationNote:
          'Açık (forming) mum hariç tutularak yalnızca kapanmış mumlardan hesaplanır.',
      },
      {
        id: 'ema_macd_stoch',
        category: 'MUM_VE_INDIKATOR',
        categoryLabel: '2. Mumlar (OHLCV) & İndikatörler',
        metricName: `${selectedMarket.symbol} EMA(9/21), MACD(12,26,9) & StochRSI`,
        shortKey: 'OTHER',
        liveValue: selectedMarket.hasRealKlines
          ? `EMA9/21: ${formatCompactPrice(
              selectedMarket.emaFast
            )}/${formatCompactPrice(selectedMarket.emaSlow)} · MACD Hist: ${
              selectedMarket.macdHistogram
            } · StochRSI K: ${selectedMarket.stochRsiK.toFixed(1)}`
          : 'VERİ YOK',
        sourceLabel: 'Derived Calculation (Binance OHLCV)',
        endpointOrFormula:
          'calculateEMA(9/21), calculateMACD(12,26,9), calculateStochRSI(14)',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: selectedMarket.hasRealKlines ? marketFreshness : 'NO_DATA',
        dataType: 'DERIVED',
        verificationNote:
          'Gerçek mum serisi gelmeden sinyal üretimi kilitlidir.',
      },
      {
        id: 'btc_correlation',
        category: 'MUM_VE_INDIKATOR',
        categoryLabel: '2. Mumlar (OHLCV) & İndikatörler',
        metricName: `${selectedMarket.symbol} ↔ BTC/USDT Getiri Korelasyonu (Pearson)`,
        shortKey: 'OTHER',
        liveValue: selectedMarket.hasRealKlines
          ? `${selectedMarket.btcCorrelation.toFixed(2)} (BTC Rejim: ${btcRegime.regime})`
          : 'VERİ YOK',
        sourceLabel: 'Derived Calculation (Rolling Returns)',
        endpointOrFormula:
          'Gerçek 5m Kapanış Log/Yüzde Getirileri Üzerinden Rolling Pearson Korelasyonu',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: selectedMarket.hasRealKlines ? marketFreshness : 'NO_DATA',
        dataType: 'DERIVED',
        verificationNote: 'Sabit korelasyon katsayıları kaldırıldı.',
      },
      {
        id: 'spread_and_5s',
        category: 'MIKROYAPI_L2',
        categoryLabel: '3. L2 Emir Defteri & Mikroyapı',
        metricName: `${selectedMarket.symbol} Makas (Spread bps) & 5sn Fiyat Değişimi`,
        shortKey: 'OTHER',
        liveValue: `Spread: ${microstructure.spreadBps.toFixed(2)} bps · 5sn: ${
          microstructure.priceChange5sPct >= 0 ? '+' : ''
        }${microstructure.priceChange5sPct.toFixed(2)}% · Spoofing: ${
          microstructure.spoofingStatus
        }`,
        sourceLabel: 'Derived Calculation (BookTicker & Price History)',
        endpointOrFormula:
          'Gerçek BestBid/BestAsk & Bellekte Tutulan Son 5sn Gerçek Fiyat Zaman Serisi',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: marketFreshness,
        dataType: 'DERIVED',
        verificationNote:
          'Simüle 5sn değişim ve sahte spoofing sayacı kaldırıldı.',
      },
      {
        id: 'execution_mode',
        category: 'POZISYON_VE_EMIR',
        categoryLabel: '4. Emir İcrası, Pozisyon & PnL',
        metricName: 'Aktif Emir İcra Modu & Doğrulama Durumu',
        shortKey: 'OTHER',
        liveValue: `${execModeLabel} · Anahtar: ${
          mexcStatus.maskedKey || 'Tanımlanmadı (Paper Mod)'
        }`,
        sourceLabel:
          mexcStatus.tradeMode === 'LIVE'
            ? 'MEXC Futures REST API'
            : mexcStatus.hasServerApiKeys
            ? 'Binance Testnet REST API'
            : 'Local Paper Order Book Walker',
        endpointOrFormula:
          mexcStatus.tradeMode === 'LIVE'
            ? 'POST https://contract.mexc.com/api/v1/private/order/submit'
            : mexcStatus.hasServerApiKeys
            ? 'POST https://testnet.binance.vision/api/v3/order'
            : 'walkOrderBookForFill (Gerçek L2 Emir Defteri Derinliği + Borsa Komisyonu)',
        timestampMs: statusTs,
        ageMs: statusAgeMs,
        freshness: isLiveFeedSynced ? 'FRESH' : 'STALE',
        dataType: 'REAL',
        verificationNote:
          'API anahtarı yokken sahte emir ID/imza üretilmez; açıkça PAPER olarak işaretlenir.',
      },
      {
        id: 'position_entry_exit_pnl',
        category: 'POZISYON_VE_EMIR',
        categoryLabel: '4. Emir İcrası, Pozisyon & PnL',
        metricName: 'Açık Pozisyon Giriş / Çıkış Fiyatı & Net PnL',
        shortKey: 'OTHER',
        liveValue: activePos
          ? `${activePos.symbol} ${activePos.side} @ $${formatCompactPrice(
              activePos.entryPrice
            )} · PnL: ${
              activePos.unrealizedPnlUsdt >= 0 ? '+' : ''
            }$${activePos.unrealizedPnlUsdt.toFixed(2)}`
          : `Açık Pozisyon Yok · Kasa Özsermaye: $${demoWallet.totalEquityUsdt.toFixed(
              2
            )}`,
        sourceLabel: 'Derived Calculation (Exchange Fill / Best Bid-Ask)',
        endpointOrFormula:
          'Borsa Fill Yanıtı (cummulativeQuoteQty/executedQty) veya Gerçek Bid (Long Çıkış) / Ask (Short Çıkış)',
        timestampMs: activePos ? activePos.openedAt : marketTs,
        ageMs: activePos ? Math.max(0, now - activePos.openedAt) : marketAgeMs,
        freshness: isLiveFeedSynced ? 'FRESH' : 'STALE',
        dataType: 'DERIVED',
        verificationNote:
          'Yapay ±%0.28 çıkış makası kaldırıldı; gerçek bid/ask ve gerçek komisyon uygulanır.',
      },
      {
        id: 'liquidation_estimate',
        category: 'POZISYON_VE_EMIR',
        categoryLabel: '4. Emir İcrası, Pozisyon & PnL',
        metricName: `${selectedMarket.symbol} Likidasyon Fiyatı & Paper Slippage`,
        shortKey: 'OTHER',
        liveValue: `Tahmini Likidasyon: $${formatCompactPrice(
          selectedMarket.liquidationPrice
        )} (${selectedMarket.effectiveLeverage}x) · Tahmini Kayma: ${
          selectedMarket.estimatedSlippageBps ?? 0
        } bps`,
        sourceLabel: 'Estimated Calculation (Leverage Formula & L2 Walk)',
        endpointOrFormula:
          'Tahmini İzole Marjin Formülü (Giriş ± %92/Kaldıraç) & L2 Emir Defteri Yürüyüşü (walkOrderBookForFill)',
        timestampMs: marketTs,
        ageMs: marketAgeMs,
        freshness: marketFreshness,
        dataType: 'ESTIMATED',
        verificationNote:
          'Arayüzde açıkça "Tahmini (Estimate)" olarak etiketlenir.',
      },
      {
        id: 'exchange_latency_clock',
        category: 'SISTEM_VE_HABER',
        categoryLabel: '5. Ağ Sağlığı, Rate-Limit & Haber',
        metricName:
          'Borsa Gidiş-Dönüş Gecikmesi (RTT) & Saat Farkı (Clock Offset)',
        shortKey: 'OTHER',
        liveValue: `RTT: ${mexcStatus.futuresLatencyMs} ms · Saat Farkı: ${
          mexcStatus.hftTelemetry?.serverTimeOffsetMs ?? 0
        } ms · Ağırlık: ${
          mexcStatus.hftTelemetry?.usedWeight1m ?? rateLimiter.usedWeight1m
        }/1200`,
        sourceLabel: 'Binance Mainnet REST Headers',
        endpointOrFormula:
          'GET https://data-api.binance.vision/api/v3/time + HTTP Header (x-mbx-used-weight-1m)',
        timestampMs: statusTs,
        ageMs: statusAgeMs,
        freshness:
          isLiveFeedSynced && !watchdog.killSwitchActive ? 'FRESH' : 'STALE',
        dataType: 'REAL',
        verificationNote:
          '14–46ms sıkıştırılmış sahte ping formülü ve sabit 45 weight kaldırıldı.',
      },
      {
        id: 'ai_news_estimate',
        category: 'SISTEM_VE_HABER',
        categoryLabel: '5. Ağ Sağlığı, Rate-Limit & Haber',
        metricName: 'Kripto Haber Akışı & Gemini / NLP Duygu Puanı',
        shortKey: 'OTHER',
        liveValue: latestNews
          ? `${latestNews.detectedSymbol} Etki: ${
              latestNews.aiImpactScore >= 0 ? '+' : ''
            }${latestNews.aiImpactScore} (${
              latestNews.isManualInput ? 'Manuel Giriş' : latestNews.source
            }) [AI Tahmini]`
          : 'Henüz Haber İşlenmedi (Boş Başlangıç Durumu)',
        sourceLabel: 'CryptoCompare News REST + AI Estimate',
        endpointOrFormula:
          'GET https://min-api.cryptocompare.com/data/v2/news/ (url, published_on) + AI/NLP Tahmin Motoru',
        timestampMs: latestNews?.publishedAtMs || latestNews?.timestampMs || 0,
        ageMs: latestNews ? Math.max(0, now - latestNews.timestampMs) : -1,
        freshness: latestNews ? 'FRESH' : 'NO_DATA',
        dataType: 'ESTIMATED',
        verificationNote:
          'AI/NLP çıktısı hiçbir zaman borsa verisi olarak sunulmaz; açıkça "AI Tahmini (AI Estimate)" olarak etiketlenir.',
      },
    ];
  }, [
    selectedMarket,
    btcRegime,
    microstructure,
    realOrderBookSnapshot,
    demoWallet,
    openPositions,
    mexcStatus,
    watchdog,
    rateLimiter,
    latestNews,
    marketTs,
    marketAgeMs,
    marketFreshness,
    depthTs,
    depthAgeMs,
    statusTs,
    statusAgeMs,
    isLiveFeedSynced,
    binanceWsConnected,
    mexcWsConnected,
    now,
  ]);

  const criticalRows = useMemo(
    () => rows.filter((r) => r.shortKey !== 'OTHER'),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesType = typeFilter === 'ALL' || r.dataType === typeFilter;
      if (!matchesType) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.metricName.toLowerCase().includes(q) ||
        r.sourceLabel.toLowerCase().includes(q) ||
        r.endpointOrFormula.toLowerCase().includes(q) ||
        r.liveValue.toLowerCase().includes(q)
      );
    });
  }, [rows, typeFilter, searchQuery]);

  const counts = useMemo(() => {
    return {
      total: rows.length,
      real: rows.filter((r) => r.dataType === 'REAL').length,
      derived: rows.filter((r) => r.dataType === 'DERIVED').length,
      estimated: rows.filter((r) => r.dataType === 'ESTIMATED').length,
    };
  }, [rows]);

  return (
    <section
      id="section-data-integrity"
      className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-xl space-y-5"
    >
      {/* Üst Başlık ve Kontroller */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Veri Bütünlüğü ve Gözlemlenebilirlik Denetimi (Data Integrity Audit)
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                OBSERVABILITY ACTIVE
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                {selectedMarket.symbol}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Kritik metriklerin (<span className="text-white font-semibold">Price, RSI, OBI, TFI, Funding Rate</span>) ve tüm alt sistemlerin canlı veri kaynağı, son başarılı güncelleme zaman damgası ve doğruluk sınıfı (
              <span className="text-emerald-300 font-semibold">REAL</span> /{' '}
              <span className="text-cyan-300 font-semibold">DERIVED</span> /{' '}
              <span className="text-amber-300 font-semibold">ESTIMATED</span>).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {markets.length > 0 && onSelectSymbol && (
            <select
              value={selectedMarket.symbol}
              onChange={(e) => onSelectSymbol(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              aria-label="Denetlenecek Sembol Seçimi"
            >
              {markets.map((m) => (
                <option key={m.symbol} value={m.symbol}>
                  {m.symbol} (${formatCompactPrice(m.price)})
                </option>
              ))}
            </select>
          )}

          {onRefreshNow && (
            <button
              type="button"
              onClick={onRefreshNow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-xs font-mono font-semibold text-cyan-200 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Verileri Şimdi Denetle
            </button>
          )}
        </div>
      </div>

      {/* 5 KRİTİK ÇEKİRDEK METRİK VİTRİNİ (PRICE, RSI, OBI, TFI, FUNDING RATE) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              Kritik Çekirdek Metrikler (Price · RSI · OBI · TFI · Funding Rate)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Son Borsa Senkronizasyonu: {formatExactTimestamp(lastFeedSyncMs)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {criticalRows.map((item) => {
            const isFresh = item.freshness === 'FRESH';
            const isStale = item.freshness === 'STALE';
            const borderClass = isFresh
              ? 'border-emerald-500/35 bg-slate-950/80'
              : isStale
              ? 'border-amber-500/40 bg-amber-950/15'
              : 'border-rose-500/40 bg-rose-950/15';

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-3.5 flex flex-col justify-between transition-all ${borderClass}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                      {item.shortKey}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        item.dataType === 'REAL'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                          : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                      }`}
                    >
                      {item.dataType}
                    </span>
                  </div>

                  <div className="mt-2 text-xs font-semibold text-slate-300">
                    {item.metricName}
                  </div>
                  <div className="mt-1 text-base font-bold font-mono text-white truncate">
                    {item.liveValue}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Kaynak:</span>
                    <span className="text-slate-200 font-semibold text-right truncate max-w-[160px]" title={item.sourceLabel}>
                      {item.sourceLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Son Güncelleme:</span>
                    <span className="text-emerald-300">
                      {formatExactTimestamp(item.timestampMs)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Veri Yaşı:</span>
                    <span className="text-slate-300">
                      {formatAgeLabel(item.ageMs)} ({item.freshness})
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Özet Sınıflandırma Kartları ve Filtre Çubuğu */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-950/70 border border-emerald-500/25 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
            <span>REAL (Ham Borsa Verisi)</span>
            <Database className="w-4 h-4" />
          </div>
          <div className="text-lg font-bold font-mono text-white mt-1">
            {counts.real} Metrik
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Binance Mainnet (`data-api.binance.vision`), Futures (`fapi.binance.com`) ve HTTP başlıklarından alınan ham veriler.
          </p>
        </div>

        <div className="bg-slate-950/70 border border-cyan-500/25 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs text-cyan-400 font-semibold">
            <span>DERIVED (Türetilmiş Hesaplama)</span>
            <Activity className="w-4 h-4" />
          </div>
          <div className="text-lg font-bold font-mono text-white mt-1">
            {counts.derived} Metrik
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Gerçek OHLCV mumları, L2 emir defteri (OBI) ve son işlemlerden (TFI) deterministik formüllerle türetilen metrikler.
          </p>
        </div>

        <div className="bg-slate-950/70 border border-amber-500/25 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs text-amber-400 font-semibold">
            <span>ESTIMATED (Tahmini / AI Estimate)</span>
            <Cpu className="w-4 h-4" />
          </div>
          <div className="text-lg font-bold font-mono text-white mt-1">
            {counts.estimated} Metrik
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Açıkça etiketlenmiş AI/NLP haber duygu tahmini, izole marjin tahmini likidasyon fiyatı ve Paper L2 kayma hesabı.
          </p>
        </div>
      </div>

      {/* Arama ve Tür Filtresi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Metrik, veri kaynağı veya uç nokta ara (örn: RSI, OBI, TFI, Funding)..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
          <button
            type="button"
            onClick={() => setTypeFilter('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors border cursor-pointer ${
              typeFilter === 'ALL'
                ? 'bg-slate-800 text-white border-slate-600'
                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            TÜMÜ ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('REAL')}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors border cursor-pointer ${
              typeFilter === 'REAL'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-emerald-300'
            }`}
          >
            REAL ({counts.real})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('DERIVED')}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors border cursor-pointer ${
              typeFilter === 'DERIVED'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-cyan-300'
            }`}
          >
            DERIVED ({counts.derived})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('ESTIMATED')}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors border cursor-pointer ${
              typeFilter === 'ESTIMATED'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-amber-300'
            }`}
          >
            ESTIMATED ({counts.estimated})
          </button>
        </div>
      </div>

      {/* Detaylı Denetim Tablosu */}
      <div className="overflow-x-auto border border-slate-800/80 rounded-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
              <th className="py-2.5 px-3">Kategori & Metrik</th>
              <th className="py-2.5 px-3">
                Canlı Değer ({selectedMarket.symbol})
              </th>
              <th className="py-2.5 px-3">Veri Kaynağı & Uç Nokta / Formül</th>
              <th className="py-2.5 px-3">Son Başarılı Güncelleme</th>
              <th className="py-2.5 px-3">Veri Tipi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {filteredRows.map((row) => {
              const typeBadgeClass =
                row.dataType === 'REAL'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : row.dataType === 'DERIVED'
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40';

              const freshnessBadge =
                row.freshness === 'FRESH' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" /> FRESH
                  </span>
                ) : row.freshness === 'STALE' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400">
                    <AlertTriangle className="w-3 h-3" /> STALE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-400">
                    <AlertTriangle className="w-3 h-3" /> NO DATA
                  </span>
                );

              const formattedTime = formatExactTimestamp(row.timestampMs);
              const formattedAge = formatAgeLabel(row.ageMs);

              return (
                <tr
                  key={row.id}
                  className="bg-slate-900/50 hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-2.5 px-3 align-top">
                    <div className="text-[10px] font-mono text-slate-400">
                      {row.categoryLabel}
                    </div>
                    <div className="font-semibold text-slate-100 mt-0.5">
                      {row.metricName}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {row.verificationNote}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 align-top font-mono text-slate-200 whitespace-nowrap">
                    {row.liveValue}
                  </td>
                  <td className="py-2.5 px-3 align-top font-mono text-[11px]">
                    <div className="text-cyan-300 font-semibold">
                      {row.sourceLabel}
                    </div>
                    <div className="text-slate-400 mt-0.5">
                      {row.endpointOrFormula}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 align-top whitespace-nowrap">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-200">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formattedTime}</span>
                      <span className="text-slate-400">({formattedAge})</span>
                    </div>
                    <div className="mt-1">{freshnessBadge}</div>
                  </td>
                  <td className="py-2.5 px-3 align-top whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${typeBadgeClass}`}
                    >
                      {row.dataType}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const DataIntegrityPanel = DataIntegrityAudit;
export default DataIntegrityAudit;
