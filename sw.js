// ==========================================
// Service Worker - リフォーム見積・会計 Pro
// Version: 2.36.0
// ★ v2.36.0: SAM2.1モデルCache First戦略追加 + receipt-sam.js追加
// ★ v2.24.0: Phase2 v3.0 ハイブリッド方式（Gemini座標検出＋OpenCV透視変換）
// ==========================================

const CACHE_NAME = 'reform-app-v2.36.0';
const OFFLINE_URL = 'index.html';

// v1.0追加: SAMモデルファイルURL（Cache First戦略で管理）
const SAM_MODEL_CACHE = 'culo-sam-models-v1';
const SAM_MODEL_URLS = [
  'https://huggingface.co/akiyamanx/sam2.1-hiera-tiny-onnx/resolve/main/sam2.1_hiera_tiny.encoder.ort',
  'https://huggingface.co/akiyamanx/sam2.1-hiera-tiny-onnx/resolve/main/sam2.1_hiera_tiny.decoder.onnx'
];

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
  'receipt-ai-patch.js',
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
  'receipt-frame-modal.js',
  'receipt-sam.js',
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
  console.log('[SW] インストール開始 v2.36.0');
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
            // v1.0: SAMモデルキャッシュは保持する（巨大ファイルの再DL防止）
            if (cacheName !== CACHE_NAME && cacheName !== SAM_MODEL_CACHE) {
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

// フェッチ時
self.addEventListener('fetch', event => {
  var url = event.request.url;

  // v1.0追加: SAMモデルファイルはCache First（初回DLのみ、以降はキャッシュ即返却）
  var isSamModel = SAM_MODEL_URLS.some(function(u) { return url.indexOf(u) !== -1; });
  if (isSamModel) {
    event.respondWith(
      caches.open(SAM_MODEL_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) {
            console.log('[SW] SAMモデル: キャッシュから返却');
            return cached;
          }
          console.log('[SW] SAMモデル: ネットワークからDL＋キャッシュ保存');
          return fetch(event.request).then(function(response) {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // API呼び出しはキャッシュしない（Gemini API等）
  if (url.includes('googleapis.com') || 
      url.includes('api.')) {
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

console.log('[SW] Service Worker ロード完了 v2.36.0');
