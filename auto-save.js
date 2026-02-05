// ==========================================
// 自動保存・離脱警告・復元
// Reform App Pro v0.95
// ==========================================
// このファイルはアプリ全体の自動保存、
// タブ閉じ/アプリ切替時の保存、
// 復元機能を提供する
//
// v0.95新規作成:
//   - beforeunload: タブ/アプリ閉じ時の警告
//   - visibilitychange: 非表示時に自動保存
//   - 入力変更時の遅延自動保存（デバウンス）
//   - 復元確認ダイアログ
//
// v0.95.1改善:
//   - initAutoSave内で入力フォームへの自動フック追加
//     （各画面のinput/change/clickイベントを自動監視）
//   - 見積書・請求書の復元機能追加
//   - 復元UIをモーダル化（confirm→カスタムダイアログ）
//   - 見積書の追加フィールド（日付・有効期限等）保存対応
//   - 請求書の追加フィールド（日付・振込先等）保存対応
//   - LocalStorage容量オーバー時のエラーハンドリング
//
// LocalStorageキー:
//   - reform_app_autosave_receipt: レシート画面の自動保存データ
//   - reform_app_autosave_estimate: 見積書画面の自動保存データ
//   - reform_app_autosave_invoice: 請求書画面の自動保存データ
//
// 依存ファイル:
//   - globals.js (receiptItems, receiptImageData, multiImageDataUrls,
//                 estimateMaterials, estimateWorks, invoiceMaterials, invoiceWorks)
// ==========================================


// ==========================================
// 自動保存の状態管理
// ==========================================
let _autoSaveTimer = null;
let _autoSaveDirty = false; // 変更があったかどうか
let _autoSaveHooked = false; // v0.95.1: フック済みフラグ（二重登録防止）
const AUTO_SAVE_DELAY = 3000; // 3秒後に自動保存（デバウンス）

/**
 * 自動保存システムの初期化
 * app.jsの起動時に呼ばれる
 */
function initAutoSave() {
  // タブ/アプリ閉じ時の警告
  window.addEventListener('beforeunload', handleBeforeUnload);

  // タブが非表示になった時に自動保存
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // v0.95.1: 入力フォームへの自動フック
  hookInputEvents();

  // 起動時に未保存データがあれば復元を提案
  checkAutoSaveRestore();

  console.log('✓ 自動保存システム初期化完了');
}


// ==========================================
// v0.95.1: 入力イベントの自動フック
// ==========================================

/**
 * 全画面の入力要素にmarkDirty()を自動でフックする
 * - input/textarea: inputイベントとchangeイベント
 * - select: changeイベント
 * - ボタンクリック（行追加/削除など）にも対応
 *
 * イベント委任（delegation）方式で軽量に実装
 * → 動的に追加される要素にも自動対応
 */
function hookInputEvents() {
  if (_autoSaveHooked) return; // 二重登録防止
  _autoSaveHooked = true;

  // --- イベント委任: document全体で監視 ---

  // テキスト入力（input, textarea）
  // 'input'イベント: キー入力のたびに発火
  document.addEventListener('input', function(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // v0.95.1: 検索ボックスなど自動保存不要な要素は除外
      if (e.target.dataset.noAutosave) return;
      markDirty();
    }
  });

  // セレクトボックス変更
  document.addEventListener('change', function(e) {
    const tag = e.target.tagName;
    if (tag === 'SELECT' || (tag === 'INPUT' && e.target.type === 'checkbox')) {
      if (e.target.dataset.noAutosave) return;
      markDirty();
    }
  });

  // ボタンクリック（行追加・削除・並べ替えなど）
  // data-autosave="trigger" 属性付きボタンで発火
  // または、特定のクラス名で判定
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button, [role="button"], .btn');
    if (!btn) return;

    // 明示的にトリガー指定されたボタン
    if (btn.dataset.autosave === 'trigger') {
      markDirty();
      return;
    }

    // 行追加/削除系のボタンを自動検知
    // （テキストやクラス名にadd/delete/removeが含まれる）
    const text = (btn.textContent || '').toLowerCase();
    const cls = (btn.className || '').toLowerCase();
    const triggers = ['add', 'delete', 'remove', '追加', '削除', '行'];
    if (triggers.some(t => text.includes(t) || cls.includes(t))) {
      // 少し遅延してmarkDirty（DOMが更新された後に保存するため）
      setTimeout(() => markDirty(), 100);
    }
  });

  console.log('  ✓ 入力イベント自動フック完了（イベント委任方式）');
}


// ==========================================
// タブ閉じ/離脱時の警告
// ==========================================

/**
 * タブやアプリを閉じようとした時のハンドラ
 * 未保存の変更がある場合のみ警告を表示
 */
function handleBeforeUnload(e) {
  // 変更がなければ何もしない
  if (!_autoSaveDirty) return;

  // 離脱前に保存を実行
  performAutoSave();

  // ブラウザ標準の離脱確認ダイアログ
  // （PWAでもブラウザでも動作する）
  e.preventDefault();
  e.returnValue = '';  // Chrome互換
}


// ==========================================
// 画面非表示時の自動保存
// ==========================================

/**
 * タブが非表示になった時（他アプリに切替など）に自動保存
 * スマホでは特に重要（アプリ切替時にデータを失わない）
 */
function handleVisibilityChange() {
  if (document.hidden && _autoSaveDirty) {
    performAutoSave();
  }
}


// ==========================================
// デバウンス自動保存（入力変更時）
// ==========================================

/**
 * データ変更を通知する
 * hookInputEventsによって自動で呼ばれる
 * 3秒間新しい変更がなければ自動保存を実行
 */
function markDirty() {
  _autoSaveDirty = true;

  // 既存のタイマーをキャンセル
  if (_autoSaveTimer) {
    clearTimeout(_autoSaveTimer);
  }

  // 3秒後に自動保存
  _autoSaveTimer = setTimeout(() => {
    performAutoSave();
  }, AUTO_SAVE_DELAY);
}


// ==========================================
// 自動保存の実行
// ==========================================

/**
 * 現在の画面データを自動保存
 * 全画面のデータをまとめて保存する
 */
function performAutoSave() {
  try {
    // レシート画面のデータを保存
    autoSaveReceipt();

    // 見積書画面のデータを保存
    autoSaveEstimate();

    // 請求書画面のデータを保存
    autoSaveInvoice();

    _autoSaveDirty = false;
    _autoSaveTimer = null;

    // v0.95: 保存インジケータを一瞬表示
    showAutoSaveIndicator();

  } catch (e) {
    console.error('自動保存エラー:', e);
    // v0.95.1: LocalStorage容量オーバーの場合
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      console.warn('⚠ LocalStorage容量不足。古いデータをクリアします');
      // 一番古いデータから削除を試みる
      tryFreeStorage();
    }
  }
}

/**
 * v0.95.1: LocalStorage容量不足時に古いデータを削除
 */
function tryFreeStorage() {
  // reform_app_で始まるキーのうち、autosave以外の古いデータを探して削除
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('reform_app_') && !key.includes('autosave')) {
      keys.push(key);
    }
  }
  // 古い順に最大3つ削除
  keys.slice(0, 3).forEach(key => {
    console.warn('  削除:', key);
    localStorage.removeItem(key);
  });
}

/**
 * レシート画面の自動保存
 */
function autoSaveReceipt() {
  // v0.95.1: グローバル変数の存在チェック強化
  if (typeof receiptItems === 'undefined' || !receiptItems) return;
  if (receiptItems.length === 0) return;
  // 全部空の品目なら保存しない
  if (receiptItems.every(i => !i.name && !i.price)) return;

  const storeEl = document.getElementById('receiptStoreName');
  const dateEl = document.getElementById('receiptDate');
  const custEl = document.getElementById('receiptCustomerName');
  const numEl = document.getElementById('receiptNumber');

  const data = {
    storeName: storeEl ? storeEl.value : '',
    date: dateEl ? dateEl.value : '',
    customerName: custEl ? custEl.value : '',
    receiptNumber: numEl ? numEl.value : '',
    items: receiptItems.map(i => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      type: i.type,
      category: i.category,
      checked: i.checked,
      projectName: i.projectName,
      originalName: i.originalName,
      matched: i.matched
    })),
    // 画像は容量が大きいので保存しない（base64は数MBになる）
    hasImage: typeof receiptImageData !== 'undefined' && !!receiptImageData,
    multiImageCount: (typeof multiImageDataUrls !== 'undefined' && multiImageDataUrls)
      ? multiImageDataUrls.length : 0,
    savedAt: new Date().toISOString()
  };

  localStorage.setItem('reform_app_autosave_receipt', JSON.stringify(data));
}

/**
 * 見積書画面の自動保存
 * v0.95.1: 追加フィールド（日付・有効期限・備考等）も保存
 */
function autoSaveEstimate() {
  if (typeof estimateMaterials === 'undefined' || !estimateMaterials) return;
  if (estimateMaterials.length === 0 &&
      (typeof estimateWorks === 'undefined' || !estimateWorks || estimateWorks.length === 0)) return;

  // v0.95.1: フォーム要素を安全に取得するヘルパー
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };

  const data = {
    customerName: getVal('estCustomerName'),
    subject: getVal('estSubject'),
    // v0.95.1: 追加フィールド
    date: getVal('estDate'),
    validUntil: getVal('estValidUntil'),
    note: getVal('estNote'),
    companyName: getVal('estCompanyName'),
    materials: estimateMaterials,
    works: (typeof estimateWorks !== 'undefined' && estimateWorks) ? estimateWorks : [],
    savedAt: new Date().toISOString()
  };

  localStorage.setItem('reform_app_autosave_estimate', JSON.stringify(data));
}

/**
 * 請求書画面の自動保存
 * v0.95.1: 追加フィールド（日付・振込先・備考等）も保存
 */
function autoSaveInvoice() {
  if (typeof invoiceMaterials === 'undefined' || !invoiceMaterials) return;
  if (invoiceMaterials.length === 0 &&
      (typeof invoiceWorks === 'undefined' || !invoiceWorks || invoiceWorks.length === 0)) return;

  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };

  const data = {
    customerName: getVal('invCustomerName'),
    subject: getVal('invSubject'),
    // v0.95.1: 追加フィールド
    date: getVal('invDate'),
    dueDate: getVal('invDueDate'),
    note: getVal('invNote'),
    bankInfo: getVal('invBankInfo'),
    materials: invoiceMaterials,
    works: (typeof invoiceWorks !== 'undefined' && invoiceWorks) ? invoiceWorks : [],
    savedAt: new Date().toISOString()
  };

  localStorage.setItem('reform_app_autosave_invoice', JSON.stringify(data));
}


// ==========================================
// 復元機能（v0.95.1: 全画面対応）
// ==========================================

/**
 * 起動時に自動保存データがあるか確認
 * v0.95.1: レシート・見積書・請求書すべてチェック
 */
function checkAutoSaveRestore() {
  // 各画面の保存データを確認
  const savedScreens = [];

  // レシート
  const receiptRaw = localStorage.getItem('reform_app_autosave_receipt');
  if (receiptRaw) {
    try {
      const d = JSON.parse(receiptRaw);
      const count = (d.items || []).filter(i => i.name).length;
      if (count > 0 && d.savedAt) {
        savedScreens.push({
          type: 'receipt',
          label: 'レシート',
          detail: `店名: ${d.storeName || '未入力'} / ${count}件`,
          savedAt: d.savedAt,
          data: d
        });
      }
    } catch (e) {
      clearAutoSave('receipt');
    }
  }

  // 見積書
  const estRaw = localStorage.getItem('reform_app_autosave_estimate');
  if (estRaw) {
    try {
      const d = JSON.parse(estRaw);
      const matCount = (d.materials || []).length;
      const wrkCount = (d.works || []).length;
      if ((matCount > 0 || wrkCount > 0) && d.savedAt) {
        savedScreens.push({
          type: 'estimate',
          label: '見積書',
          detail: `${d.customerName || '未入力'} / 材料${matCount}件・作業${wrkCount}件`,
          savedAt: d.savedAt,
          data: d
        });
      }
    } catch (e) {
      clearAutoSave('estimate');
    }
  }

  // 請求書
  const invRaw = localStorage.getItem('reform_app_autosave_invoice');
  if (invRaw) {
    try {
      const d = JSON.parse(invRaw);
      const matCount = (d.materials || []).length;
      const wrkCount = (d.works || []).length;
      if ((matCount > 0 || wrkCount > 0) && d.savedAt) {
        savedScreens.push({
          type: 'invoice',
          label: '請求書',
          detail: `${d.customerName || '未入力'} / 材料${matCount}件・作業${wrkCount}件`,
          savedAt: d.savedAt,
          data: d
        });
      }
    } catch (e) {
      clearAutoSave('invoice');
    }
  }

  // 保存データがなければ何もしない
  if (savedScreens.length === 0) return;

  // v0.95.1: カスタム復元ダイアログを表示
  setTimeout(() => {
    showRestoreDialog(savedScreens);
  }, 1500); // スプラッシュ画面が終わった後
}


// ==========================================
// v0.95.1: カスタム復元ダイアログ
// ==========================================

/**
 * 復元確認用のモーダルダイアログを表示
 * confirm()の代わりにカスタムUIを使用
 * @param {Array} savedScreens - 保存されている画面データの配列
 */
function showRestoreDialog(savedScreens) {
  // 最新の保存日時を取得
  const latestSave = savedScreens.reduce((latest, s) =>
    s.savedAt > latest ? s.savedAt : latest, '');
  const timeStr = new Date(latestSave).toLocaleString('ja-JP');

  // オーバーレイ作成
  const overlay = document.createElement('div');
  overlay.id = 'autoSaveRestoreOverlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  `;

  // ダイアログ本体
  let itemsHtml = savedScreens.map(s =>
    `<div style="
      background: #f0f9ff; border-radius: 8px; padding: 10px 12px;
      margin-bottom: 8px; border-left: 4px solid #3b82f6;
    ">
      <div style="font-weight: bold; color: #1e40af; margin-bottom: 2px;">
        📄 ${s.label}
      </div>
      <div style="font-size: 13px; color: #64748b;">
        ${s.detail}
      </div>
    </div>`
  ).join('');

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white; border-radius: 16px; padding: 24px;
    max-width: 360px; width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  `;
  dialog.innerHTML = `
    <div style="text-align: center; margin-bottom: 16px;">
      <div style="font-size: 36px; margin-bottom: 8px;">💾</div>
      <div style="font-size: 16px; font-weight: bold; color: #1e293b;">
        未保存データがあります
      </div>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
        ${timeStr}
      </div>
    </div>
    <div style="margin-bottom: 20px;">
      ${itemsHtml}
    </div>
    <div style="display: flex; gap: 10px;">
      <button id="autoSaveRestoreCancel" style="
        flex: 1; padding: 12px; border: 2px solid #e2e8f0;
        border-radius: 10px; background: white; color: #64748b;
        font-size: 14px; font-weight: bold; cursor: pointer;
      ">破棄する</button>
      <button id="autoSaveRestoreOk" style="
        flex: 1; padding: 12px; border: none;
        border-radius: 10px; background: #3b82f6; color: white;
        font-size: 14px; font-weight: bold; cursor: pointer;
      ">復元する</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // 復元ボタン
  document.getElementById('autoSaveRestoreOk').addEventListener('click', () => {
    overlay.remove();
    // 全画面を復元
    savedScreens.forEach(s => {
      if (s.type === 'receipt') restoreReceiptFromAutoSave(s.data);
      if (s.type === 'estimate') restoreEstimateFromAutoSave(s.data);
      if (s.type === 'invoice') restoreInvoiceFromAutoSave(s.data);
    });
    showAutoSaveIndicator('✅ データを復元しました');
  });

  // 破棄ボタン
  document.getElementById('autoSaveRestoreCancel').addEventListener('click', () => {
    overlay.remove();
    clearAutoSave('all');
    showAutoSaveIndicator('🗑 保存データを破棄しました');
  });
}


// ==========================================
// 復元処理（各画面）
// ==========================================

/**
 * レシート画面のデータを自動保存から復元
 */
function restoreReceiptFromAutoSave(data) {
  // v0.95.1: 安全にDOMへセットするヘルパー
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  };

  setVal('receiptStoreName', data.storeName);
  setVal('receiptDate', data.date);
  setVal('receiptCustomerName', data.customerName);
  setVal('receiptNumber', data.receiptNumber);

  // 品目を復元
  if (data.items && data.items.length > 0) {
    receiptItems = data.items.map(i => ({
      ...i,
      id: i.id || Date.now() + Math.random()
    }));
    if (typeof renderReceiptItems === 'function') renderReceiptItems();
    if (typeof updateReceiptTotal === 'function') updateReceiptTotal();
  }

  clearAutoSave('receipt');

  // レシート画面に遷移
  if (typeof showScreen === 'function') {
    showScreen('receipt');
  }
}

/**
 * v0.95.1: 見積書画面のデータを自動保存から復元
 */
function restoreEstimateFromAutoSave(data) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  };

  setVal('estCustomerName', data.customerName);
  setVal('estSubject', data.subject);
  setVal('estDate', data.date);
  setVal('estValidUntil', data.validUntil);
  setVal('estNote', data.note);
  setVal('estCompanyName', data.companyName);

  // 材料データを復元
  if (data.materials && data.materials.length > 0) {
    estimateMaterials = data.materials;
  }

  // 作業データを復元
  if (data.works && data.works.length > 0) {
    estimateWorks = data.works;
  }

  // テーブルの再描画
  if (typeof renderEstimateMaterials === 'function') renderEstimateMaterials();
  if (typeof renderEstimateWorks === 'function') renderEstimateWorks();
  if (typeof updateEstimateTotal === 'function') updateEstimateTotal();
  // v0.95.1: 別名の再描画関数にも対応
  if (typeof renderEstimateTable === 'function') renderEstimateTable();

  clearAutoSave('estimate');
}

/**
 * v0.95.1: 請求書画面のデータを自動保存から復元
 */
function restoreInvoiceFromAutoSave(data) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  };

  setVal('invCustomerName', data.customerName);
  setVal('invSubject', data.subject);
  setVal('invDate', data.date);
  setVal('invDueDate', data.dueDate);
  setVal('invNote', data.note);
  setVal('invBankInfo', data.bankInfo);

  // 材料データを復元
  if (data.materials && data.materials.length > 0) {
    invoiceMaterials = data.materials;
  }

  // 作業データを復元
  if (data.works && data.works.length > 0) {
    invoiceWorks = data.works;
  }

  // テーブルの再描画
  if (typeof renderInvoiceMaterials === 'function') renderInvoiceMaterials();
  if (typeof renderInvoiceWorks === 'function') renderInvoiceWorks();
  if (typeof updateInvoiceTotal === 'function') updateInvoiceTotal();
  // v0.95.1: 別名の再描画関数にも対応
  if (typeof renderInvoiceTable === 'function') renderInvoiceTable();

  clearAutoSave('invoice');
}


/**
 * 自動保存データをクリア
 * @param {string} type - 'receipt' | 'estimate' | 'invoice' | 'all'
 */
function clearAutoSave(type) {
  if (type === 'all' || type === 'receipt') {
    localStorage.removeItem('reform_app_autosave_receipt');
  }
  if (type === 'all' || type === 'estimate') {
    localStorage.removeItem('reform_app_autosave_estimate');
  }
  if (type === 'all' || type === 'invoice') {
    localStorage.removeItem('reform_app_autosave_invoice');
  }
}


// ==========================================
// 保存インジケータ（トースト表示）
// ==========================================

/**
 * 自動保存完了を一瞬だけ表示
 * v0.95.1: メッセージをカスタマイズ可能に
 * @param {string} [message] - 表示メッセージ（省略時: '💾 自動保存しました'）
 */
function showAutoSaveIndicator(message) {
  let indicator = document.getElementById('autoSaveIndicator');

  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'autoSaveIndicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(16, 185, 129, 0.9);
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 12px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    `;
    document.body.appendChild(indicator);
  }

  indicator.textContent = message || '💾 自動保存しました';
  indicator.style.opacity = '1';

  setTimeout(() => {
    indicator.style.opacity = '0';
  }, 1500);
}


// ==========================================
// 保存成功時に自動保存データをクリア
// ==========================================

/**
 * 手動保存が成功した時に呼ぶ
 * 自動保存データをクリアして二重復元を防ぐ
 * receipt-core.jsのsaveReceipt()などから呼ばれる
 */
function onManualSaveSuccess(type) {
  clearAutoSave(type);
  _autoSaveDirty = false;
}


// ==========================================
// グローバル公開
// ==========================================
window.initAutoSave = initAutoSave;
window.markDirty = markDirty;
window.performAutoSave = performAutoSave;
window.clearAutoSave = clearAutoSave;
window.onManualSaveSuccess = onManualSaveSuccess;
// v0.95.1追加
window.hookInputEvents = hookInputEvents;
window.restoreEstimateFromAutoSave = restoreEstimateFromAutoSave;
window.restoreInvoiceFromAutoSave = restoreInvoiceFromAutoSave;
