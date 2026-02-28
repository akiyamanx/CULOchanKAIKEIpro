// ==========================================
// receipt-store.js v1.0
// レシート個別管理 IndexedDB CRUD
// Phase1.6: レシート個別管理基盤
// ==========================================
// 企画書スキーマに準拠:
//   id, date, store, type, total, items[],
//   imageData, purpose, siteId, siteName,
//   entryTime, exitTime, createdAt, updatedAt
//
// DB: CULOchanReceiptPDFs (既存DBを拡張、version 2)
// ストア: receipts (既存、スキーマ拡張)
//
// 依存: なし（最初に読み込むこと）
// ==========================================

var RECEIPT_STORE_DB_NAME = 'CULOchanReceiptPDFs';
var RECEIPT_STORE_DB_VERSION = 2; // v1→v2にアップグレード

// DB接続（シングルトン）
var _receiptStoreDbPromise = null;

/**
 * DB接続を取得
 * v2: receiptsストアにインデックス追加（date, type, store）
 */
function openReceiptStoreDb() {
  if (!_receiptStoreDbPromise) {
    _receiptStoreDbPromise = new Promise(function(resolve, reject) {
      var request = indexedDB.open(RECEIPT_STORE_DB_NAME, RECEIPT_STORE_DB_VERSION);

      request.onupgradeneeded = function(event) {
        var db = event.target.result;
        var oldVersion = event.oldVersion;
        console.log('[receipt-store] DB upgrade: v' + oldVersion + ' → v' + RECEIPT_STORE_DB_VERSION);

        // 既存ストア（v1から）
        if (!db.objectStoreNames.contains('receipt_pdfs')) {
          var pdfStore = db.createObjectStore('receipt_pdfs', { keyPath: 'date' });
          pdfStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // receiptsストア: v1で作成済みならインデックス追加、なければ新規作成
        if (!db.objectStoreNames.contains('receipts')) {
          var rStore = db.createObjectStore('receipts', { keyPath: 'id' });
          rStore.createIndex('date', 'date', { unique: false });
          rStore.createIndex('type', 'type', { unique: false });
          rStore.createIndex('store', 'store', { unique: false });
          console.log('[receipt-store] receiptsストア新規作成');
        } else if (oldVersion < 2) {
          // v1→v2: 既存ストアにインデックスがなければ追加
          var tx = event.target.transaction;
          var existingStore = tx.objectStore('receipts');
          if (!existingStore.indexNames.contains('date')) {
            existingStore.createIndex('date', 'date', { unique: false });
          }
          if (!existingStore.indexNames.contains('type')) {
            existingStore.createIndex('type', 'type', { unique: false });
          }
          if (!existingStore.indexNames.contains('store')) {
            existingStore.createIndex('store', 'store', { unique: false });
          }
          console.log('[receipt-store] receiptsストアにインデックス追加');
        }
      };

      request.onsuccess = function(event) {
        console.log('[receipt-store] DB接続成功 v' + RECEIPT_STORE_DB_VERSION);
        resolve(event.target.result);
      };

      request.onerror = function(event) {
        console.error('[receipt-store] DB接続失敗:', event.target.error);
        _receiptStoreDbPromise = null;
        reject(event.target.error);
      };
    });
  }
  return _receiptStoreDbPromise;
}


// ==========================================
// レシートID生成
// ==========================================

/**
 * ユニークなレシートIDを生成
 * 形式: YYYYMMDD_連番_timestamp
 */
function generateReceiptId(dateStr) {
  var d = dateStr ? dateStr.replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');
  var ts = Date.now();
  var rand = Math.floor(Math.random() * 1000);
  return d + '_' + rand + '_' + ts;
}


// ==========================================
// CRUD操作
// ==========================================

/**
 * レシートを1件保存（新規 or 更新）
 * @param {object} receipt - レシートデータ
 * @returns {Promise<string>} 保存したID
 */
async function saveReceipt(receipt) {
  var db = await openReceiptStoreDb();
  var now = new Date().toISOString();

  // IDがなければ生成
  if (!receipt.id) {
    receipt.id = generateReceiptId(receipt.date);
  }

  // フィールド正規化
  var record = {
    id: receipt.id,
    date: receipt.date || new Date().toISOString().split('T')[0],
    store: receipt.store || receipt.storeName || '',
    type: receipt.type || 'shopping',
    total: Number(receipt.total || receipt.totalAmount || 0),
    items: (receipt.items || []).map(function(item) {
      return {
        name: item.name || '',
        qty: parseInt(item.qty || item.quantity) || 1,
        price: parseInt(item.price || item.amount) || 0,
        checked: item.checked !== undefined ? item.checked : false,
        profitRate: item.profitRate || null,
        sellingPrice: item.sellingPrice || null
      };
    }),
    imageData: receipt.imageData || null,
    purpose: receipt.purpose || '',
    siteId: receipt.siteId || '',
    siteName: receipt.siteName || '',
    entryTime: receipt.entryTime || receipt.entry_time || '',
    exitTime: receipt.exitTime || receipt.exit_time || '',
    createdAt: receipt.createdAt || now,
    updatedAt: now
  };

  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipts', 'readwrite');
    var store = tx.objectStore('receipts');
    var req = store.put(record);
    req.onsuccess = function() {
      console.log('[receipt-store] 保存成功: ' + record.id);
      resolve(record.id);
    };
    req.onerror = function(e) {
      console.error('[receipt-store] 保存失敗:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * AI解析結果＋画像からレシートを一括保存
 * generateAndSaveReceiptPdfs()の後に呼ぶ想定
 * @param {object} aiResults - getLastAiResults()の戻り値
 * @param {string[]} imageDataUrls - 画像データURL配列
 * @returns {Promise<string[]>} 保存したID配列
 */
async function saveReceiptsFromAi(aiResults, imageDataUrls) {
  if (!aiResults || !aiResults.receipts || aiResults.receipts.length === 0) {
    console.warn('[receipt-store] AI結果が空です');
    return [];
  }

  var allImages = imageDataUrls || [];
  var savedIds = [];

  for (var i = 0; i < aiResults.receipts.length; i++) {
    var r = aiResults.receipts[i];
    // 画像の紐付け: i番目の画像、超えたら最後の画像
    var imgIdx = Math.min(i, allImages.length - 1);
    var imgData = allImages.length > 0 ? allImages[imgIdx] : null;

    var id = await saveReceipt({
      date: r.date,
      store: r.store || r.storeName,
      type: r.type || 'shopping',
      total: r.total || r.totalAmount,
      items: r.items || [],
      imageData: imgData,
      entryTime: r.entry_time,
      exitTime: r.exit_time
    });
    savedIds.push(id);
  }

  console.log('[receipt-store] ' + savedIds.length + '件のレシートを保存');
  return savedIds;
}

/**
 * レシートを1件取得
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function getReceiptById(id) {
  var db = await openReceiptStoreDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipts', 'readonly');
    var req = tx.objectStore('receipts').get(id);
    req.onsuccess = function() { resolve(req.result || null); };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

/**
 * 指定日付のレシート一覧を取得
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {Promise<object[]>}
 */
async function getReceiptsByDate(dateStr) {
  var db = await openReceiptStoreDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipts', 'readonly');
    var store = tx.objectStore('receipts');
    var index = store.index('date');
    var req = index.getAll(dateStr);
    req.onsuccess = function() {
      var results = req.result || [];
      // 作成日時でソート（新しい順）
      results.sort(function(a, b) {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      resolve(results);
    };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

/**
 * 全レシートの日付一覧を取得（軽量版: imageData除外）
 * @returns {Promise<object[]>} [{date, count, totalAmount}]
 */
async function getReceiptDateSummary() {
  var db = await openReceiptStoreDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipts', 'readonly');
    var req = tx.objectStore('receipts').getAll();
    req.onsuccess = function() {
      var all = req.result || [];
      // 日付別に集計
      var dateMap = {};
      for (var i = 0; i < all.length; i++) {
        var r = all[i];
        var d = r.date || 'unknown';
        if (!dateMap[d]) {
          dateMap[d] = { date: d, count: 0, totalAmount: 0, types: {} };
        }
        dateMap[d].count++;
        dateMap[d].totalAmount += Number(r.total || 0);
        var t = r.type || 'shopping';
        dateMap[d].types[t] = (dateMap[d].types[t] || 0) + 1;
      }
      // 配列化して日付降順ソート
      var result = Object.values(dateMap);
      result.sort(function(a, b) {
        return b.date.localeCompare(a.date);
      });
      resolve(result);
    };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

/**
 * レシートを1件更新（部分更新対応）
 * @param {string} id
 * @param {object} updates - 更新するフィールド
 * @returns {Promise<void>}
 */
async function updateReceipt(id, updates) {
  var existing = await getReceiptById(id);
  if (!existing) {
    throw new Error('レシートが見つかりません: ' + id);
  }
  // マージ
  var keys = Object.keys(updates);
  for (var i = 0; i < keys.length; i++) {
    existing[keys[i]] = updates[keys[i]];
  }
  existing.updatedAt = new Date().toISOString();
  await saveReceipt(existing);
}

/**
 * レシートを1件削除
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteReceiptById(id) {
  var db = await openReceiptStoreDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipts', 'readwrite');
    var req = tx.objectStore('receipts').delete(id);
    req.onsuccess = function() {
      console.log('[receipt-store] 削除成功: ' + id);
      resolve();
    };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

/**
 * 指定日付のレシートを全削除
 * @param {string} dateStr
 * @returns {Promise<number>} 削除件数
 */
async function deleteReceiptsByDate(dateStr) {
  var receipts = await getReceiptsByDate(dateStr);
  var db = await openReceiptStoreDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipts', 'readwrite');
    var store = tx.objectStore('receipts');
    var count = 0;
    for (var i = 0; i < receipts.length; i++) {
      store.delete(receipts[i].id);
      count++;
    }
    tx.oncomplete = function() {
      console.log('[receipt-store] ' + dateStr + 'の' + count + '件を削除');
      resolve(count);
    };
    tx.onerror = function(e) { reject(e.target.error); };
  });
}

/**
 * 全レシート数を取得
 * @returns {Promise<number>}
 */
async function getReceiptCount() {
  var db = await openReceiptStoreDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipts', 'readonly');
    var req = tx.objectStore('receipts').count();
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function(e) { reject(e.target.error); };
  });
}


// ==========================================
// グローバル公開
// ==========================================
window.openReceiptStoreDb = openReceiptStoreDb;
window.generateReceiptId = generateReceiptId;
window.saveReceipt = saveReceipt;
window.saveReceiptsFromAi = saveReceiptsFromAi;
window.getReceiptById = getReceiptById;
window.getReceiptsByDateStore = getReceiptsByDate; // 既存getReceiptsByDate(receipt-ai.js)と名前衝突回避
window.getReceiptDateSummary = getReceiptDateSummary;
window.updateReceipt = updateReceipt;
window.deleteReceiptById = deleteReceiptById;
window.deleteReceiptsByDate = deleteReceiptsByDate;
window.getReceiptCount = getReceiptCount;

console.log('[receipt-store.js] ✓ レシート個別管理モジュール読み込み完了');
