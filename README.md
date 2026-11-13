# KvantumBot V3.0 — 50 Piyasa Binance Algoritmik İşlem Terminali

KvantumBot, **Binance Mainnet (`data-api.binance.vision`)** gerçek piyasa verileriyle çalışan, 50 USDT paritesini eşzamanlı tarayan ve **Çift Modlu (Paper / Binance Testnet / MEXC Production)** emir yönlendirme mimarisine sahip algoritmik kripto işlem terminalidir.

## Temel Mimari İlkeler ve Veri Bütünlüğü (Data Integrity)

1. **%100 Gerçek Borsa Verisi (`REAL`)**:
   - **Fiyat, En İyi Alış/Satış (Best Bid/Ask) ve 24s İstatistikler**: Doğrudan `data-api.binance.vision/api/v3/ticker/24hr` ve `/api/v3/ticker/bookTicker` uç noktalarından alınır. Sentetik kayma (drift), sinüs dalgası veya sahte varsayılan değerler kullanılmaz.
   - **5m ve 15m OHLCV Mumları**: Sunucu tarafında (`server.ts`) 50 sembol için hız sınırına duyarlı (rate-limit aware) olarak `/api/v3/klines` üzerinden çekilir ve önbelleklenir. Gerçek mum verisi olmayan veya bayatlayan (`STALE` / `NO_DATA`) paritelerde sinyal üretimi ve otomatik işlem kesinkes engellenir.
   - **L2 Emir Defteri (OBI) ve İşlem Akışı (TFI)**: `/api/v3/depth` ve `/api/v3/trades` gerçek verilerinden hesaplanır.
   - **Gerçek Gecikme (RTT), Saat Farkı (Clock Offset) ve Borsa Ağırlığı (Rate Limit Weight)**: `data-api.binance.vision/api/v3/time`, HTTP `Date` ve `x-mbx-used-weight-1m` başlıklarından ölçülür.
   - **Vadeli İşlemler Fonlama Oranı (Funding Rate) ve Mark Fiyatı**: `fapi.binance.com/fapi/v1/premiumIndex` (veya MEXC Contract fallback) üzerinden gerçek zamanlı okunur; erişilemezse uydurulmaz (`UNAVAILABLE` olarak işaretlenir).

2. **Türetilmiş Kantitatif Göstergeler (`DERIVED`)**:
   - **EMA (9/21), RSI (14), MACD, StochRSI, Wilder ATR (14), ADX ve VWAP**: Yalnızca gerçek OHLCV mum dizilerinden hesaplanır.
   - **Hacim Çarpanı**: Yalnızca kapanmış mumların (`closed candles`) hacmi üzerinden hesaplanır.
   - **BTC Korelasyonu**: Sembol ve BTC kapanışlarının gerçek logaritmik/yüzdesel getirileri üzerinden Pearson korelasyonu ile hesaplanır.

3. **Açıkça Etiketlenmiş Tahminler ve Haber Duyarlılığı (`ESTIMATED` / `AI Estimate`)**:
   - **Haber & Duyarlılık Analizi (Sentiment)**: KvantumBot duygu/sentiment analizini **reddetmez**; aksine gerçek haber akışını (`CryptoCompare News API` kaynak URL ve yayın zamanı ile) veya kullanıcı tarafından girilen (`Manuel Giriş / Manual Input`) başlıkları NLP/Gemini ile analiz eder. Ancak üretilen tüm etki puanları arayüzde ve veri modellerinde açıkça **`AI Tahmini (AI Estimate)`** olarak etiketlenir ve hiçbir zaman ham borsa verisi gibi sunulmaz.
   - **Tahmini Likidasyon Fiyatı**: Kaldıraç bazlı yaklaşık likidasyon seviyesi arayüzde açıkça **`Tahmini (Estimate)`** olarak belirtilir.

4. **Emir İletim Modları (`PAPER` / `BINANCE_TESTNET` / `LIVE`)**:
   - API anahtarları tanımlı değilken sahte borsa emir ID'si veya sahte HMAC imzası üretilmez; emirler açıkça **`PAPER`** olarak işaretlenir ve gerçek L2 emir defteri derinliği (`walkOrderBookForFill`) ile gerçek komisyon oranları uygulanarak simüle edilir.
   - API anahtarları tanımlı olduğunda (`BINANCE_TESTNET` veya `LIVE`), pozisyon giriş fiyatı borsadan dönen gerçek gerçekleşme fiyatı (`actualFillPrice`) ile güncellenir ve `mexcTestOrderVerified` yalnızca borsa onayladığında `true` olur.
