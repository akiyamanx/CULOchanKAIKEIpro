// ==========================================
// Service Worker - リフォーム見積・会計 Pro
// Version: 2.30.0
// ★ v2.14.0: Phase1.8 Canvas自動検出方式
// ★ v2.15.0: Phase2 OpenCV.js導入（receipt-multi-crop.js v2.0）
// ★ v2.16.0: Phase2 白紙検出+透視変換+縦補正（receipt-multi-crop.js v2.1）
// ★ v2.17.0: Phase2 回転方向修正（正面化→左90度回転 v2.2）
// ★ v2.18.0: OpenCV.jsデバッグ表示追加
// ★ v2.19.0: OpenCV.js CDN変更（jsdelivr優先+フォールバック）
// ★ v2.21.0: デバッグ表示をreceipt-multi-crop.jsに移動（確実に動作）
// ★ v2.21.0: デバッグ表示をJSに移動（insertAdjacentHTMLではscript未実行の対策）
// ★ v2.21.0: Phase2 v2.3 閾値170+5%マージン（レシート端切れ対策）
// ★ v2.22.0: Phase2 v2.4 アスペクト比修正（4点距離計算）+マージン境界クランプ
// ★ v2.23.0: Phase2 v2.5 クランプ順序修正+warped実サイズ回転判定
// ★ v2.24.0: Phase2 v3.0 ハイブリッド方式（Gemini座標検出＋OpenCV透視変換）
// ==========================================

const CACHE_NAME = 'reform-app-v2.31.0';
const OFFLINE_URL = 'index.html';

// キャッシュするファイル（相対パス）
const FILES_TO_CACHE = [
  './',
  'index.html',
  'styles.css',
  'receipt-styles-add.css',
  'manifest.json',
  // JS モジュール
  'idb-storage.js',
  'globals.js',
  'storage.js',
  'settings.js',
  'customer.js',
  'tax.js',
  'master.js',
  'products.js',
  'receipt-core.js',
  'receipt-ai.js',
  'noto-sans-jp-base64.js',
  'receipt-pdf.js',
  'receipt-pdf-viewer.js',
  'receipt-pdf-viewer.html',
  'receipt-store.js',
  'receipt-viewer.js',
  'receipt-viewer.html',
  'receipt-purpose.js',
  'receipt-crop.js',
  'receipt-multi-crop.js',
  'receipt-hybrid-crop.js',
  'receipt-history.js',
  'receipt-list.js',
  'estimate.js',
  'invoice.js',
  'expense.js',
  'voice.js',
  'price-search.js',
  'data.js',
  'help.js',
  'auto-save.js',
  'doc-template.js',
  'excel-template.js',
  'screen-loader.js',
  'app.js',
  // ★ 画面HTMLファイル（ルート直下）
  'home.html',
  'pricesearch.html',
  'help.html',
  'tax.html',
  'settings.html',
  'receipt.html',
  'receipt-list.html',
  'estimate.html',
  'invoice.html',
  'customers.html',
  'materials.html',
  'expenses.html',
  'data.html',
  'privacy-policy.html',
  // ★ v2.0.1追加: 画像アセット（スプラッシュ・アイコン）
  'cocomi_galaxy.jpg',
  'perafca_galaxy.jpg',
  'icon-192.png',
  'icon-512.png'
];

// インストール時
self.addEventListener('install', event => {
  console.log('[SW] インストール開始 v2.21.0');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] キャッシュ作成:', CACHE_NAME);
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] インストール完了');
        return self.skipWaiting();
      })
  );
});

// アクティベート時（古いキャッシュを削除）
self.addEventListener('activate', event => {
  console.log('[SW] アクティベート開始');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] 古いキャッシュ削除:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] アクティベート完了');
        return self.clients.claim();
      })
  );
});

// フェッチ時（ネットワーク優先、失敗したらキャッシュ）
self.addEventListener('fetch', event => {
  // API呼び出しはキャッシュしない（Gemini API等）
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('api.')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // GETリクエストのみキャッシュ対象
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 成功したらキャッシュを更新
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        // オフライン時はキャッシュから返す
        return caches.match(event.request)
          .then(response => {
            if (response) {
              return response;
            }
            // キャッシュにもなければオフラインページ
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});

// バックグラウンド同期（将来用）
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('[SW] バックグラウンド同期実行');
  }
});

console.log('[SW] Service Worker ロード完了 v2.21.0');
