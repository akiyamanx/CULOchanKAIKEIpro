// ==========================================
// Service Worker - リフォーム見積・会計 Pro
// Version: 1.2.0
// v1.6.0→v1.7.0: screens/HTMLファイルをキャッシュに追加
// ==========================================

const CACHE_NAME = 'reform-app-v1.7.0';
const OFFLINE_URL = 'index.html';

// キャッシュするファイル（相対パス）
const FILES_TO_CACHE = [
  './',
  'index.html',
  'products.js',
  'styles.css',
  'manifest.json',
  'globals.js',
  'storage.js',
  'settings.js',
  'customer.js',
  'tax.js',
  'master.js',
  'receipt-core.js',
  'receipt-ai.js',
  'receipt-ocr.js',
  'estimate.js',
  'invoice.js',
  'expense.js',
  'voice.js',
  'data.js',
  'screen-loader.js',
  'app.js',
  // ★ 分割された画面HTMLファイル（screen-loader.jsがfetchで読み込む）
  'screens/home.html',
  'screens/pricesearch.html',
  'screens/help.html',
  'screens/tax.html',
  'screens/settings.html',
  'screens/receipt.html',
  'screens/estimate.html',
  'screens/invoice.html',
  'screens/customers.html',
  'screens/materials.html',
  'screens/expenses.html',
  'screens/data.html'
];

// インストール時
self.addEventListener('install', event => {
  console.log('[SW] インストール開始');
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
    // 将来的にここでデータ同期処理
  }
});

console.log('[SW] Service Worker ロード完了');
