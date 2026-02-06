// ==========================================
// レシート履歴管理
// Reform App Pro v0.95
// ==========================================
// このファイルはレシートの履歴保存・重複チェック・
// 一覧表示・画像閲覧・呼び戻し機能を提供する
//
// v0.95変更:
//   - 重複チェック機能追加（複合判定: 店名+日付+合計+品目数+レシート番号）
//   - 保存時に品名マスター自動変換を適用
//   - レコードにreceiptNumber（レシート番号）フィールド追加
//   - 容量上限を100→300件に拡張
//
// LocalStorageキー: reform_app_receipt_history
// 各レコード: { id, storeName, customerName, date, receiptNumber,
//   items[], imageData, totalAmount, createdAt }
//
// 依存ファイル:
//   - globals.js (receiptItems, receiptImageData, escapeHtml, productMaster)
//   - receipt-core.js (renderReceiptItems, updateReceiptTotal, initProjectSelect)
//   - receipt-list.js (リスト表示・フィルタ・品名一括変換)
// ==========================================


// ==========================================
// レシート重複チェック（v0.95追加）
// ==========================================

/**
 * 保存済み履歴と比較して重複レシートかチェック
 * 複合判定: 店名+日付+合計金額+品目数+レシート番号
 * @param {string} storeName - 店名
 * @param {string} date - 日付(YYYY-MM-DD)
 * @param {number} totalAmount - 合計金額
 * @param {number} itemCount - 品目数
 * @param {string} receiptNumber - レシート番号（空文字の場合は判定対象外）
 * @returns {{isDuplicate: boolean, matchedRecord: object|null}}
 */
function checkReceiptDuplicate(storeName, date, totalAmount, itemCount, receiptNumber) {
  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');

  for (const h of histories) {
    // レシート番号が両方あれば番号で判定（最も確実）
    if (receiptNumber && h.receiptNumber && receiptNumber === h.receiptNumber) {
      // 番号一致 + 店名一致なら確実に重複
      if ((h.storeName || '').trim() === storeName.trim()) {
        return { isDuplicate: true, matchedRecord: h };
      }
    }

    // 複合判定: 店名+日付+合計+品目数がすべて一致
    const storeMatch = (h.storeName || '').trim() === storeName.trim();
    const dateMatch = h.date === date;
    const amountMatch = (h.totalAmount || 0) === totalAmount;
    const countMatch = (h.items || []).length === itemCount;

    if (storeMatch && dateMatch && amountMatch && countMatch) {
      return { isDuplicate: true, matchedRecord: h };
    }
  }

  return { isDuplicate: false, matchedRecord: null };
}


// ==========================================
// レシート履歴の保存
// ==========================================

/**
 * レシート保存時に履歴としても保管する
 * receipt-core.jsのsaveReceipt()から呼ばれる
 * v0.95: 重複チェック追加、品名マスター変換適用
 * @returns {boolean} 保存成功ならtrue、重複で中止ならfalse
 */
async function saveReceiptHistory(storeName, date, materials, expenses, saveImage) {
  // お客様名を取得
  const custEl = document.getElementById('receiptCustomerName');
  const customerName = custEl ? custEl.value.trim() : '';

  // レシート番号を取得（AI解析で抽出された場合）
  const numEl = document.getElementById('receiptNumber');
  const receiptNumber = numEl ? numEl.value.trim() : '';

  // 全品目をまとめる（除外以外）
  const allItems = receiptItems
    .filter(i => i.type !== 'exclude' && i.name)
    .map(i => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      type: i.type,
      category: i.category,
      projectName: i.projectName || '',
      originalName: i.originalName || i.name  // v0.95: 変換前の名前を保持
    }));

  // 合計金額
  const totalAmount = allItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  // v0.95: 重複チェック
  const dupCheck = checkReceiptDuplicate(
    storeName, date, totalAmount, allItems.length, receiptNumber
  );
  if (dupCheck.isDuplicate) {
    const matched = dupCheck.matchedRecord;
    const matchDate = matched.date || '日付不明';
    const matchStore = matched.storeName || '店名不明';
    alert(
      `⚠️ このレシートは既に取り込み済みです！\n\n` +
      `📋 一致した履歴:\n` +
      `  店名: ${matchStore}\n` +
      `  日付: ${matchDate}\n` +
      `  金額: ¥${(matched.totalAmount || 0).toLocaleString()}\n\n` +
      `同じレシートの二重登録を防ぎました。`
    );
    return false;
  }

  // 履歴レコードを作成
  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  const recordId = Date.now() + Math.random();
  const record = {
    id: recordId,
    storeName: storeName,
    customerName: customerName,
    receiptNumber: receiptNumber,  // v0.95追加
    date: date,
    items: allItems,
    imageData: null,     // v0.96: LocalStorageには画像を入れない
    imageRef: null,      // v0.96: IDBへの参照キー
    totalAmount: totalAmount,
    materialCount: materials.length,
    expenseCount: expenses.length,
    createdAt: new Date().toISOString()
  };

  // v0.96: 画像をIndexedDBに保存
  if (saveImage && receiptImageData) {
    try {
      var imgKey = makeReceiptImageKey(recordId);
      await saveReceiptImageToIDB(recordId, receiptImageData);
      record.imageRef = imgKey;
      console.log('[receipt-history] 画像をIDBに保存:', imgKey);
    } catch (idbErr) {
      console.warn('[receipt-history] IDB画像保存失敗、LSフォールバック:', idbErr);
      // フォールバック: 旧方式でimageDataに入れる
      record.imageData = receiptImageData;
    }
  }

  histories.push(record);

  // v0.95: 容量上限を300件に拡張
  while (histories.length > 300) {
    histories.shift();
  }

  // v0.96修正: IDB保存成功時は容量問題なし。LS保存のみチェック
  if (!trySaveHistories(histories)) {
    // 保存失敗 → 今回のレシート画像参照も除外して再試行
    console.warn('[receipt-history] 容量オーバー: 画像参照/データを除外して再試行');
    record.imageData = null;
    record.imageRef = null;
    if (!trySaveHistories(histories)) {
      // それでもダメ → 古い履歴の旧imageDataを順番に削除
      console.warn('[receipt-history] まだ容量オーバー: 古い画像データを削除中...');
      let freed = false;
      for (let i = 0; i < histories.length - 1; i++) {
        if (histories[i].imageData) {
          histories[i].imageData = null;
          if (trySaveHistories(histories)) {
            freed = true;
            break;
          }
        }
      }
      if (!freed) {
        // 古い履歴を削除して容量確保
        while (histories.length > 1) {
          histories.shift();
          if (trySaveHistories(histories)) {
            freed = true;
            break;
          }
        }
      }
      if (!freed) {
        alert('⚠️ ストレージ容量が不足しています。\n設定画面からデータを整理してください。');
        return false;
      }
      alert('💡 ストレージ容量を確保するため、古いデータを整理しました。');
    }
  }

  return true;
}


/**
 * LocalStorageに履歴を安全に保存（容量チェック付き）
 * v0.95追加
 * @param {Array} histories - 履歴配列
 * @returns {boolean} 保存成功ならtrue
 */
function trySaveHistories(histories) {
  try {
    localStorage.setItem('reform_app_receipt_history', JSON.stringify(histories));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      return false; // 容量オーバー
    }
    console.error('[receipt-history] 保存エラー:', e);
    return false;
  }
}


// ==========================================
// レシート履歴一覧の表示
// ==========================================

function showReceiptHistory() {
  const modal = document.getElementById('receiptHistoryModal');
  if (!modal) return;

  renderReceiptHistoryList();
  modal.style.display = 'flex';
}

function closeReceiptHistory() {
  const modal = document.getElementById('receiptHistoryModal');
  if (modal) modal.style.display = 'none';
}

function renderReceiptHistoryList(searchText) {
  const container = document.getElementById('receiptHistoryList');
  if (!container) return;

  let histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');

  // 新しい順にソート
  histories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // 検索フィルター
  if (searchText && searchText.trim()) {
    const q = searchText.toLowerCase();
    histories = histories.filter(h =>
      (h.storeName || '').toLowerCase().includes(q) ||
      (h.customerName || '').toLowerCase().includes(q) ||
      (h.items || []).some(i => (i.name || '').toLowerCase().includes(q)) ||
      (h.items || []).some(i => (i.projectName || '').toLowerCase().includes(q))
    );
  }

  if (histories.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
        <div style="font-size: 48px; margin-bottom: 12px;">📷</div>
        <div style="font-size: 15px;">保存されたレシートはまだありません</div>
        <div style="font-size: 12px; margin-top: 8px;">レシートを読み込んで保存すると<br>ここに履歴が表示されます</div>
      </div>
    `;
    return;
  }

  container.innerHTML = histories.map(h => {
    const hasImage = (h.imageData || h.imageRef) ? '📷' : '📝';
    const itemCount = (h.items || []).length;
    const projectNames = [...new Set((h.items || []).map(i => i.projectName).filter(Boolean))];
    const projectBadge = projectNames.length > 0
      ? `<span style="background: #dbeafe; color: #2563eb; padding: 2px 6px; border-radius: 4px; font-size: 10px;">📍${projectNames.join(', ')}</span>`
      : '';
    const customerBadge = h.customerName
      ? `<span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 10px;">👤${escapeHtml(h.customerName)}</span>`
      : '';

    return `
      <div style="padding: 14px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; cursor: pointer;"
           onclick="showReceiptHistoryDetail('${h.id}')">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span style="font-size: 16px;">${hasImage}</span>
              <span style="font-weight: 600; color: #1f2937; font-size: 15px;">${escapeHtml(h.storeName || '店名なし')}</span>
            </div>
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">
              ${customerBadge}
              ${projectBadge}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              ${h.date || ''} ／ ${itemCount}品目
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 700; color: #3b82f6;">
              ¥${(h.totalAmount || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterReceiptHistory() {
  const input = document.getElementById('receiptHistorySearch');
  renderReceiptHistoryList(input ? input.value : '');
}


// ==========================================
// レシート履歴の詳細表示
// ==========================================

// v0.96: async化してIDBから画像取得
async function showReceiptHistoryDetail(historyId) {
  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  const h = histories.find(r => String(r.id) === String(historyId));
  if (!h) {
    alert('履歴が見つかりませんでした');
    return;
  }

  // 詳細表示用の状態を保持
  window._currentHistoryId = historyId;

  const content = document.getElementById('receiptHistoryDetailContent');
  if (!content) return;

  // v0.96: 画像をIDBから取得（imageRef優先、imageDataフォールバック）
  let displayImageData = h.imageData || null;
  if (!displayImageData && h.imageRef) {
    try {
      displayImageData = await getReceiptImageFromIDB(h.id);
    } catch(e) {
      console.warn('[receipt-history] IDB画像取得失敗:', e);
    }
  }

  // 画像セクション
  const imageHtml = displayImageData
    ? `<div style="margin-bottom: 16px;">
        <img src="${displayImageData}" style="width: 100%; border-radius: 8px; border: 1px solid #e5e7eb;"
             onclick="showReceiptImageFull('${historyId}')">
        <div style="text-align: center; font-size: 11px; color: #9ca3af; margin-top: 4px;">タップで拡大</div>
       </div>`
    : `<div style="text-align: center; padding: 20px; background: #f9fafb; border-radius: 8px; color: #9ca3af; margin-bottom: 16px;">
        📝 画像なし（手入力レシート）
       </div>`;

  // 品目リスト
  const itemsHtml = (h.items || []).map((item, idx) => {
    const amount = (item.price || 0) * (item.quantity || 1);
    const typeLabel = item.type === 'material' ? '材料' : '経費';
    const typeColor = item.type === 'material' ? '#3b82f6' : '#10b981';
    const project = item.projectName
      ? `<span style="font-size: 10px; background: #dbeafe; color: #2563eb; padding: 1px 4px; border-radius: 3px;">📍${escapeHtml(item.projectName)}</span>`
      : '';
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 10px; background: ${typeColor}20; color: ${typeColor}; padding: 1px 4px; border-radius: 3px;">${typeLabel}</span>
            <span style="font-size: 14px; color: #1f2937;">${escapeHtml(item.name)}</span>
            ${project}
          </div>
          <div style="font-size: 11px; color: #9ca3af;">×${item.quantity} ／ @¥${(item.price || 0).toLocaleString()}</div>
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #1f2937;">¥${amount.toLocaleString()}</div>
      </div>
    `;
  }).join('');

  content.innerHTML = `
    ${imageHtml}
    <div style="margin-bottom: 12px;">
      <div style="font-size: 12px; color: #6b7280;">店名</div>
      <div style="font-size: 16px; font-weight: 600; color: #1f2937;">${escapeHtml(h.storeName || '店名なし')}</div>
    </div>
    ${h.customerName ? `
    <div style="margin-bottom: 12px;">
      <div style="font-size: 12px; color: #6b7280;">お客様名</div>
      <div style="font-size: 14px; color: #1f2937;">${escapeHtml(h.customerName)}</div>
    </div>` : ''}
    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; color: #6b7280;">日付</div>
      <div style="font-size: 14px; color: #1f2937;">${h.date || '日付なし'}</div>
    </div>
    <div style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;">品目一覧</div>
    ${itemsHtml}
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-top: 2px solid #1f2937; margin-top: 8px;">
      <span style="font-size: 16px; font-weight: 700;">合計</span>
      <span style="font-size: 20px; font-weight: 700; color: #3b82f6;">¥${(h.totalAmount || 0).toLocaleString()}</span>
    </div>
  `;

  // 詳細モーダルを表示
  document.getElementById('receiptHistoryDetailModal').style.display = 'flex';
}

function closeReceiptHistoryDetail() {
  const modal = document.getElementById('receiptHistoryDetailModal');
  if (modal) modal.style.display = 'none';
}


// ==========================================
// 画像フルスクリーン表示
// ==========================================

// v0.96: async化してIDBから画像取得
async function showReceiptImageFull(historyId) {
  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  const h = histories.find(r => String(r.id) === String(historyId));
  if (!h) return;

  // v0.96: IDB優先で画像取得
  let imgData = h.imageData || null;
  if (!imgData && h.imageRef) {
    try {
      imgData = await getReceiptImageFromIDB(h.id);
    } catch(e) {}
  }
  if (!imgData) return;

  const viewer = document.getElementById('receiptImageViewer');
  const img = document.getElementById('receiptImageFullView');
  if (!viewer || !img) return;

  img.src = imgData;
  viewer.style.display = 'flex';
}

function closeReceiptImageViewer() {
  const viewer = document.getElementById('receiptImageViewer');
  if (viewer) viewer.style.display = 'none';
}


// ==========================================
// レシート履歴の呼び戻し（再読み込み）
// ==========================================

// v0.96: async化してIDBから画像取得
async function reloadFromHistory() {
  const historyId = window._currentHistoryId;
  if (!historyId) return;

  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  const h = histories.find(r => String(r.id) === String(historyId));
  if (!h) {
    alert('履歴が見つかりませんでした');
    return;
  }

  if (!confirm('現在のレシート画面の内容を、この履歴で上書きしますか？')) return;

  // お客様名を復元
  const custEl = document.getElementById('receiptCustomerName');
  if (custEl) custEl.value = h.customerName || '';

  // 店名を復元
  document.getElementById('receiptStoreName').value = h.storeName || '';

  // 日付を復元
  document.getElementById('receiptDate').value = h.date || new Date().toISOString().split('T')[0];

  // 画像を復元（v0.96: IDB優先）
  let imgData = h.imageData || null;
  if (!imgData && h.imageRef) {
    try {
      imgData = await getReceiptImageFromIDB(h.id);
    } catch(e) {}
  }
  
  if (imgData) {
    receiptImageData = imgData;
    document.getElementById('imagePreview').src = imgData;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    document.getElementById('aiBtn').disabled = !settings.geminiApiKey;
  }

  // 品目を復元
  receiptItems = (h.items || []).map(i => ({
    id: Date.now() + Math.random(),
    name: i.name || '',
    quantity: i.quantity || 1,
    price: i.price || 0,
    type: i.type || 'material',
    category: i.category || '',
    checked: false,
    projectName: i.projectName || ''
  }));

  // 現場セレクトボックスを更新
  initProjectSelect();

  // 画面を再描画
  renderReceiptItems();
  updateReceiptTotal();

  // モーダルを閉じる
  closeReceiptHistoryDetail();
  closeReceiptHistory();

  alert('✅ レシート履歴を読み込みました！');
}


// ==========================================
// レシート履歴の削除
// ==========================================

// v0.96: async化してIDB画像も削除
async function deleteReceiptHistory(historyId) {
  if (!confirm('このレシート履歴を削除しますか？')) return;

  let histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  
  // v0.96: IDBの画像も削除
  const target = histories.find(h => String(h.id) === String(historyId));
  if (target && target.imageRef) {
    try {
      await deleteReceiptImageFromIDB(target.id);
    } catch(e) {
      console.warn('[receipt-history] IDB画像削除失敗:', e);
    }
  }
  
  histories = histories.filter(h => String(h.id) !== String(historyId));
  localStorage.setItem('reform_app_receipt_history', JSON.stringify(histories));

  // 詳細モーダルを閉じて一覧を更新
  closeReceiptHistoryDetail();
  renderReceiptHistoryList();

  alert('削除しました');
}
