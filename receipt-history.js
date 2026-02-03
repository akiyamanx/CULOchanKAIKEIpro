// ==========================================
// レシート履歴管理
// Reform App Pro v0.94.1
// ==========================================
// このファイルはレシートの履歴保存・一覧表示・
// 画像閲覧・呼び戻し機能を提供する
//
// LocalStorageキー: reform_app_receipt_history
// 各レコード: { id, storeName, customerName, date,
//   items[], imageData, totalAmount, createdAt }
//
// 依存ファイル:
//   - globals.js (receiptItems, receiptImageData, escapeHtml)
//   - receipt-core.js (renderReceiptItems, updateReceiptTotal, initProjectSelect)
// ==========================================


// ==========================================
// レシート履歴の保存
// ==========================================

// v0.94.1追加: レシート保存時に履歴としても保管する
// receipt-core.jsのsaveReceipt()から呼ばれる
function saveReceiptHistory(storeName, date, materials, expenses, saveImage) {
  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');

  // お客様名を取得
  const custEl = document.getElementById('receiptCustomerName');
  const customerName = custEl ? custEl.value.trim() : '';

  // 全品目をまとめる（除外以外）
  const allItems = receiptItems
    .filter(i => i.type !== 'exclude' && i.name)
    .map(i => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      type: i.type,
      category: i.category,
      projectName: i.projectName || ''
    }));

  // 合計金額
  const totalAmount = allItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  // 履歴レコードを作成
  const record = {
    id: Date.now() + Math.random(),
    storeName: storeName,
    customerName: customerName,
    date: date,
    items: allItems,
    imageData: saveImage ? receiptImageData : null,
    totalAmount: totalAmount,
    materialCount: materials.length,
    expenseCount: expenses.length,
    createdAt: new Date().toISOString()
  };

  histories.push(record);

  // 容量対策: 最大100件まで保持（古いものから削除）
  while (histories.length > 100) {
    histories.shift();
  }

  localStorage.setItem('reform_app_receipt_history', JSON.stringify(histories));
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
    const hasImage = h.imageData ? '📷' : '📝';
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

function showReceiptHistoryDetail(historyId) {
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

  // 画像セクション
  const imageHtml = h.imageData
    ? `<div style="margin-bottom: 16px;">
        <img src="${h.imageData}" style="width: 100%; border-radius: 8px; border: 1px solid #e5e7eb;"
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

function showReceiptImageFull(historyId) {
  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  const h = histories.find(r => String(r.id) === String(historyId));
  if (!h || !h.imageData) return;

  const viewer = document.getElementById('receiptImageViewer');
  const img = document.getElementById('receiptImageFullView');
  if (!viewer || !img) return;

  img.src = h.imageData;
  viewer.style.display = 'flex';
}

function closeReceiptImageViewer() {
  const viewer = document.getElementById('receiptImageViewer');
  if (viewer) viewer.style.display = 'none';
}


// ==========================================
// レシート履歴の呼び戻し（再読み込み）
// ==========================================

function reloadFromHistory() {
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

  // 画像を復元
  if (h.imageData) {
    receiptImageData = h.imageData;
    document.getElementById('imagePreview').src = h.imageData;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
    document.getElementById('ocrBtn').disabled = false;
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

function deleteReceiptHistory(historyId) {
  if (!confirm('このレシート履歴を削除しますか？')) return;

  let histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  histories = histories.filter(h => String(h.id) !== String(historyId));
  localStorage.setItem('reform_app_receipt_history', JSON.stringify(histories));

  // 詳細モーダルを閉じて一覧を更新
  closeReceiptHistoryDetail();
  renderReceiptHistoryList();

  alert('削除しました');
}
