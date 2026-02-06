// ==========================================
// Service Worker - リフォーム見積・会計 Pro
// Version: 2.0.0
// ★ v2.0.0: idb-storage.js追加（IndexedDB画像ストレージ）
// ★ v2.0.1: スプラッシュ画像・アイコン・privacy-policy追加
// ==========================================

const CACHE_NAME = 'reform-app-v2.0.0';
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
  console.log('[SW] インストール開始 v2.0.0');
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

console.log('[SW] Service Worker ロード完了 v2.0.0');
