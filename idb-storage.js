// ==========================================
// IndexedDB ストレージ管理
// Reform App Pro v0.96
// ==========================================
// Phase 1: 画像データ（レシート画像・ロゴ・印鑑）を
// LocalStorageからIndexedDBに移行するためのモジュール
//
// ★ なぜIndexedDB？
//   LocalStorageは5MB制限 → レシート画像で簡単にパンクする
//   IndexedDBはブラウザ割当量（数百MB〜GB）まで使える
//
// ★ 設計方針：
//   - 画像データだけをIDBに保存（テキストデータはLocalStorageに残す）
//   - レシート履歴は imageData → imageRef（参照キー）に変更
//   - 旧データ自動移行関数（migrateImagesToIDB）を提供
//   - IDB失敗時はLocalStorageにフォールバック
//
// 依存: なし（最初に読み込むこと）
// ==========================================

const IDB_NAME = 'reform_app_idb';
const IDB_VERSION = 1;
const STORE_IMAGES = 'images';

// DB接続（シングルトン）
let _dbPromise = null;

/**
 * IndexedDBへの接続を取得（シングルトン）
 * @returns {Promise<IDBDatabase>}
 */
function getDB() {
  if (!_dbPromise) {
    _dbPromise = new Promise(function(resolve, reject) {
      var req = indexedDB.open(IDB_NAME, IDB_VERSION);
      
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
          db.createObjectStore(STORE_IMAGES, { keyPath: 'key' });
          console.log('[IDB] imagesストアを作成しました');
        }
      };
      
      req.onsuccess = function() {
        console.log('[IDB] DB接続成功');
        resolve(req.result);
      };
      
      req.onerror = function() {
        console.error('[IDB] DB接続失敗:', req.error);
        _dbPromise = null; // リトライ可能に
        reject(req.error);
      };
    });
  }
  return _dbPromise;
}

// ==========================================
// 基本CRUD操作
// ==========================================

/**
 * 画像をIndexedDBに保存
 * @param {string} key - 一意のキー
 * @param {string} dataUrl - base64 data URL
 * @returns {Promise<string>} 保存したキー
 */
async function saveImageToIDB(key, dataUrl) {
  if (!dataUrl) return null;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_IMAGES, 'readwrite');
      tx.objectStore(STORE_IMAGES).put({ key: key, data: dataUrl });
      tx.oncomplete = function() { resolve(key); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveImageToIDB失敗:', key, e);
    return null;
  }
}

/**
 * IndexedDBから画像を取得
 * @param {string} key - キー
 * @returns {Promise<string|null>} data URL or null
 */
async function getImageFromIDB(key) {
  if (!key) return null;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_IMAGES, 'readonly');
      var req = tx.objectStore(STORE_IMAGES).get(key);
      req.onsuccess = function() {
        resolve(req.result ? req.result.data : null);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getImageFromIDB失敗:', key, e);
    return null;
  }
}

/**
 * IndexedDBから画像を削除
 * @param {string} key - キー
 */
async function deleteImageFromIDB(key) {
  if (!key) return;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_IMAGES, 'readwrite');
      tx.objectStore(STORE_IMAGES).delete(key);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteImageFromIDB失敗:', key, e);
  }
}

/**
 * 全画像キー一覧を取得
 * @returns {Promise<string[]>}
 */
async function getAllImageKeys() {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_IMAGES, 'readonly');
      var req = tx.objectStore(STORE_IMAGES).getAllKeys();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllImageKeys失敗:', e);
    return [];
  }
}


// ==========================================
// ロゴ・印鑑の便利関数
// ==========================================

async function saveLogoToIDB(dataUrl) {
  return saveImageToIDB('app_logo', dataUrl);
}

/**
 * ロゴを取得（IDB優先 → LocalStorageフォールバック）
 */
async function getLogoFromIDB() {
  var idbData = await getImageFromIDB('app_logo');
  if (idbData) return idbData;
  // フォールバック: 旧LocalStorageデータ
  return localStorage.getItem('reform_app_logo');
}

async function deleteLogoFromIDB() {
  await deleteImageFromIDB('app_logo');
  localStorage.removeItem('reform_app_logo'); // 旧データも消す
}

async function saveStampToIDB(processedDataUrl, originalDataUrl) {
  await saveImageToIDB('app_stamp', processedDataUrl);
  if (originalDataUrl) {
    await saveImageToIDB('app_stamp_original', originalDataUrl);
  }
}

/**
 * 印鑑（処理済み）を取得（IDB優先 → LocalStorageフォールバック）
 */
async function getStampFromIDB() {
  var idbData = await getImageFromIDB('app_stamp');
  if (idbData) return idbData;
  return localStorage.getItem('reform_app_stamp');
}

/**
 * 印鑑（原本）を取得（IDB優先 → LocalStorageフォールバック）
 */
async function getStampOriginalFromIDB() {
  var idbData = await getImageFromIDB('app_stamp_original');
  if (idbData) return idbData;
  return localStorage.getItem('reform_app_stamp_original');
}

async function deleteStampFromIDB() {
  await deleteImageFromIDB('app_stamp');
  await deleteImageFromIDB('app_stamp_original');
  localStorage.removeItem('reform_app_stamp');
  localStorage.removeItem('reform_app_stamp_original');
}


// ==========================================
// レシート画像の便利関数
// ==========================================

function makeReceiptImageKey(receiptId) {
  return 'receipt_img_' + receiptId;
}

async function saveReceiptImageToIDB(receiptId, dataUrl) {
  var key = makeReceiptImageKey(receiptId);
  return saveImageToIDB(key, dataUrl);
}

async function getReceiptImageFromIDB(receiptId) {
  var key = makeReceiptImageKey(receiptId);
  return getImageFromIDB(key);
}

async function deleteReceiptImageFromIDB(receiptId) {
  var key = makeReceiptImageKey(receiptId);
  return deleteImageFromIDB(key);
}


// ==========================================
// IDB使用量の概算
// ==========================================

async function getIDBStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      var est = await navigator.storage.estimate();
      return {
        usage: est.usage || 0,
        quota: est.quota || 0,
        usageMB: ((est.usage || 0) / 1024 / 1024).toFixed(1),
        quotaMB: ((est.quota || 0) / 1024 / 1024).toFixed(0)
      };
    } catch (e) {
      return null;
    }
  }
  return null;
}


// ==========================================
// 移行ユーティリティ（初回起動時に1回だけ実行）
// ==========================================

/**
 * LocalStorageの画像データをIndexedDBに移行する
 * 移行済みの場合はスキップ
 * @returns {Promise<object>} 移行結果
 */
async function migrateImagesToIDB() {
  var MIGRATION_KEY = 'reform_app_idb_migration_v1';
  if (localStorage.getItem(MIGRATION_KEY) === 'done') {
    console.log('[IDB] 移行済みのためスキップ');
    return { skipped: true };
  }
  
  console.log('[IDB] ========== 画像データ移行開始 ==========');
  var migrated = { logo: false, stamp: false, stampOriginal: false, receiptImages: 0, errors: 0 };
  
  try {
    // テスト: IDBが使えるか確認
    await getDB();
  } catch (e) {
    console.error('[IDB] IndexedDBが使用できません。移行をスキップします:', e);
    return { skipped: true, error: 'IDB unavailable' };
  }
  
  try {
    // 1. ロゴ
    var logo = localStorage.getItem('reform_app_logo');
    if (logo) {
      await saveImageToIDB('app_logo', logo);
      localStorage.removeItem('reform_app_logo');
      migrated.logo = true;
      console.log('[IDB] ✓ ロゴを移行しました (' + Math.round(logo.length / 1024) + 'KB)');
    }
    
    // 2. 印鑑（処理済み）
    var stamp = localStorage.getItem('reform_app_stamp');
    if (stamp) {
      await saveImageToIDB('app_stamp', stamp);
      localStorage.removeItem('reform_app_stamp');
      migrated.stamp = true;
      console.log('[IDB] ✓ 印鑑(処理済)を移行しました (' + Math.round(stamp.length / 1024) + 'KB)');
    }
    
    // 3. 印鑑（オリジナル）
    var stampOrig = localStorage.getItem('reform_app_stamp_original');
    if (stampOrig) {
      await saveImageToIDB('app_stamp_original', stampOrig);
      localStorage.removeItem('reform_app_stamp_original');
      migrated.stampOriginal = true;
      console.log('[IDB] ✓ 印鑑(原本)を移行しました (' + Math.round(stampOrig.length / 1024) + 'KB)');
    }
    
    // 4. レシート履歴の画像 → imageRef方式に変換
    var historyRaw = localStorage.getItem('reform_app_receipt_history');
    if (historyRaw) {
      var histories = JSON.parse(historyRaw);
      var changed = false;
      
      for (var i = 0; i < histories.length; i++) {
        var h = histories[i];
        if (h.imageData) {
          try {
            var key = makeReceiptImageKey(h.id);
            await saveImageToIDB(key, h.imageData);
            h.imageRef = key;
            delete h.imageData;
            migrated.receiptImages++;
            changed = true;
          } catch (imgErr) {
            console.warn('[IDB] レシート画像移行失敗 (id=' + h.id + '):', imgErr);
            migrated.errors++;
            // この画像は移行失敗だが、他は続行
          }
        }
      }
      
      if (changed) {
        localStorage.setItem('reform_app_receipt_history', JSON.stringify(histories));
        console.log('[IDB] ✓ レシート画像 ' + migrated.receiptImages + '件を移行しました');
      }
    }
    
    // 移行完了フラグ
    localStorage.setItem(MIGRATION_KEY, 'done');
    console.log('[IDB] ========== 移行完了 ==========', migrated);
    
  } catch (e) {
    console.error('[IDB] 移行中にエラー:', e);
    migrated.errors++;
    // エラーでもフラグは立てない → 次回リトライ
  }
  
  return migrated;
}


// ==========================================
// グローバル公開
// ==========================================
window.getDB = getDB;
window.saveImageToIDB = saveImageToIDB;
window.getImageFromIDB = getImageFromIDB;
window.deleteImageFromIDB = deleteImageFromIDB;
window.getAllImageKeys = getAllImageKeys;

window.saveLogoToIDB = saveLogoToIDB;
window.getLogoFromIDB = getLogoFromIDB;
window.deleteLogoFromIDB = deleteLogoFromIDB;

window.saveStampToIDB = saveStampToIDB;
window.getStampFromIDB = getStampFromIDB;
window.getStampOriginalFromIDB = getStampOriginalFromIDB;
window.deleteStampFromIDB = deleteStampFromIDB;

window.makeReceiptImageKey = makeReceiptImageKey;
window.saveReceiptImageToIDB = saveReceiptImageToIDB;
window.getReceiptImageFromIDB = getReceiptImageFromIDB;
window.deleteReceiptImageFromIDB = deleteReceiptImageFromIDB;

window.getIDBStorageEstimate = getIDBStorageEstimate;
window.migrateImagesToIDB = migrateImagesToIDB;

console.log('[idb-storage.js] ✓ IndexedDBストレージモジュール読み込み完了');
