// ==========================================
// レシートリスト管理・表示切替・品名一括変換
// Reform App Pro v0.95
// ==========================================
// このファイルはレシート履歴の高度なリスト表示、
// ソート/フィルタ切替、品名一括変換機能を提供する
//
// v0.95新規作成:
//   - 日付順/商品別/店舗別のリスト表示切替
//   - 品名マスターによる一括変換（設定画面から実行）
//   - 次回読み込み時の自動変換（エイリアス→正式名）
//   - 全商品リスト表示（品名マスター管理画面用）
//
// 依存ファイル:
//   - globals.js (productMaster, escapeHtml)
//   - receipt-history.js (LocalStorage: reform_app_receipt_history)
// ==========================================


// ==========================================
// リスト表示の状態管理
// ==========================================
let _receiptListSortMode = 'date_desc'; // date_desc, date_asc, product, store
let _receiptListFilter = '';             // フリーテキスト検索

/**
 * レシートリスト画面を初期化
 * 画面表示時に呼ばれる
 */
function initReceiptList() {
  _receiptListSortMode = 'date_desc';
  _receiptListFilter = '';
  renderReceiptList();
}


// ==========================================
// リスト表示のレンダリング
// ==========================================

/**
 * メインのリスト描画関数
 * ソートモードに応じて表示方法を切り替える
 */
function renderReceiptList() {
  const container = document.getElementById('receiptListContainer');
  if (!container) return;

  const histories = getFilteredHistories();

  if (histories.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
        <div style="font-size: 48px; margin-bottom: 12px;">📋</div>
        <div style="font-size: 15px;">レシートデータがありません</div>
        <div style="font-size: 12px; margin-top: 8px;">レシートを読み込むとここにリストが表示されます</div>
      </div>`;
    updateReceiptListStats([], 0);
    return;
  }

  // ソートモードに応じて描画
  switch (_receiptListSortMode) {
    case 'date_desc':
    case 'date_asc':
      renderByDate(container, histories);
      break;
    case 'product':
      renderByProduct(container, histories);
      break;
    case 'store':
      renderByStore(container, histories);
      break;
    default:
      renderByDate(container, histories);
  }
}

/**
 * フィルタ済み履歴を取得
 * @returns {Array} フィルタ・ソート済みの履歴配列
 */
function getFilteredHistories() {
  let histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');

  // テキストフィルタ
  if (_receiptListFilter && _receiptListFilter.trim()) {
    const q = _receiptListFilter.toLowerCase();
    histories = histories.filter(h =>
      (h.storeName || '').toLowerCase().includes(q) ||
      (h.customerName || '').toLowerCase().includes(q) ||
      (h.items || []).some(i => (i.name || '').toLowerCase().includes(q)) ||
      (h.items || []).some(i => (i.projectName || '').toLowerCase().includes(q))
    );
  }

  // 日付ソート
  if (_receiptListSortMode === 'date_asc') {
    histories.sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));
  } else {
    histories.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  }

  return histories;
}


// ==========================================
// 日付順表示
// ==========================================

/**
 * 日付順でレシートを表示
 */
function renderByDate(container, histories) {
  // 統計更新
  const totalItems = histories.reduce((sum, h) => sum + (h.items || []).length, 0);
  const totalAmount = histories.reduce((sum, h) => sum + (h.totalAmount || 0), 0);
  updateReceiptListStats(histories, totalAmount);

  container.innerHTML = histories.map(h => {
    const itemCount = (h.items || []).length;
    const hasImage = h.imageData ? '📷' : '📝';
    const projectNames = [...new Set((h.items || []).map(i => i.projectName).filter(Boolean))];

    return `
      <div class="receipt-list-card" onclick="showReceiptHistoryDetail('${h.id}')">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span>${hasImage}</span>
              <span style="font-weight: 600; color: #1f2937; font-size: 14px;">${escapeHtml(h.storeName || '店名なし')}</span>
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              ${h.date || ''} ／ ${itemCount}品目
              ${h.receiptNumber ? ` ／ No.${escapeHtml(h.receiptNumber)}` : ''}
            </div>
            ${projectNames.length > 0 ? `
              <div style="margin-top: 4px;">
                ${projectNames.map(p => `<span style="background: #dbeafe; color: #2563eb; padding: 1px 6px; border-radius: 4px; font-size: 10px; margin-right: 4px;">📍${escapeHtml(p)}</span>`).join('')}
              </div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 700; color: #3b82f6;">
              ¥${(h.totalAmount || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}


// ==========================================
// 商品別表示
// ==========================================

/**
 * 商品別にグルーピングして表示
 * 同じ商品名の購入履歴をまとめる
 */
function renderByProduct(container, histories) {
  // 全品目を商品名でグルーピング
  const productMap = {};
  histories.forEach(h => {
    (h.items || []).forEach(item => {
      const name = item.name || '名前なし';
      if (!productMap[name]) {
        productMap[name] = {
          name: name,
          totalQty: 0,
          totalAmount: 0,
          purchases: [],
          stores: new Set()
        };
      }
      const amount = (item.price || 0) * (item.quantity || 1);
      productMap[name].totalQty += (item.quantity || 1);
      productMap[name].totalAmount += amount;
      productMap[name].stores.add(h.storeName || '不明');
      productMap[name].purchases.push({
        date: h.date,
        storeName: h.storeName,
        quantity: item.quantity || 1,
        price: item.price || 0,
        amount: amount
      });
    });
  });

  // 金額の大きい順にソート
  const products = Object.values(productMap).sort((a, b) => b.totalAmount - a.totalAmount);

  // 統計更新
  const totalAmount = products.reduce((sum, p) => sum + p.totalAmount, 0);
  updateReceiptListStats(histories, totalAmount);

  container.innerHTML = products.map(p => {
    const storeList = [...p.stores].join(', ');
    const avgPrice = p.totalQty > 0 ? Math.round(p.totalAmount / p.totalQty) : 0;

    return `
      <div class="receipt-list-card" onclick="toggleProductDetail(this)">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #1f2937; font-size: 14px; margin-bottom: 2px;">
              ${escapeHtml(p.name)}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              ${p.purchases.length}回購入 ／ 合計${p.totalQty}個 ／ 平均@¥${avgPrice.toLocaleString()}
            </div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">
              🏪 ${escapeHtml(storeList)}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 700; color: #3b82f6;">
              ¥${p.totalAmount.toLocaleString()}
            </div>
            <div style="font-size: 10px; color: #9ca3af;">▼ 詳細</div>
          </div>
        </div>
        <div class="product-detail-body" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f3f4f6;">
          ${p.purchases.map(pur => `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #6b7280;">
              <span>${pur.date || '日付不明'} — ${escapeHtml(pur.storeName || '')}</span>
              <span>×${pur.quantity} @¥${pur.price.toLocaleString()} = ¥${pur.amount.toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');
}

/**
 * 商品別表示の詳細を開閉
 */
function toggleProductDetail(el) {
  const body = el.querySelector('.product-detail-body');
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }
}


// ==========================================
// 店舗別表示
// ==========================================

/**
 * 店舗別にグルーピングして表示
 */
function renderByStore(container, histories) {
  // 店舗でグルーピング
  const storeMap = {};
  histories.forEach(h => {
    const store = h.storeName || '店名なし';
    if (!storeMap[store]) {
      storeMap[store] = {
        name: store,
        receipts: [],
        totalAmount: 0,
        itemCount: 0
      };
    }
    storeMap[store].receipts.push(h);
    storeMap[store].totalAmount += (h.totalAmount || 0);
    storeMap[store].itemCount += (h.items || []).length;
  });

  // 金額の大きい順にソート
  const stores = Object.values(storeMap).sort((a, b) => b.totalAmount - a.totalAmount);

  // 統計更新
  const totalAmount = stores.reduce((sum, s) => sum + s.totalAmount, 0);
  updateReceiptListStats(histories, totalAmount);

  container.innerHTML = stores.map(s => {
    const latestDate = s.receipts.sort((a, b) =>
      new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
    )[0]?.date || '';

    return `
      <div class="receipt-list-card" onclick="toggleStoreDetail(this)">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #1f2937; font-size: 14px; margin-bottom: 2px;">
              🏪 ${escapeHtml(s.name)}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              ${s.receipts.length}回来店 ／ ${s.itemCount}品目 ／ 最新: ${latestDate}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 700; color: #3b82f6;">
              ¥${s.totalAmount.toLocaleString()}
            </div>
            <div style="font-size: 10px; color: #9ca3af;">▼ 詳細</div>
          </div>
        </div>
        <div class="store-detail-body" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f3f4f6;">
          ${s.receipts.map(r => `
            <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; border-bottom: 1px solid #f9fafb; cursor: pointer;"
                 onclick="event.stopPropagation(); showReceiptHistoryDetail('${r.id}')">
              <span style="color: #374151;">${r.date || '日付不明'} — ${(r.items || []).length}品目</span>
              <span style="color: #3b82f6; font-weight: 600;">¥${(r.totalAmount || 0).toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');
}

/**
 * 店舗別表示の詳細を開閉
 */
function toggleStoreDetail(el) {
  const body = el.querySelector('.store-detail-body');
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }
}


// ==========================================
// 統計情報の更新
// ==========================================

/**
 * リスト上部の統計バーを更新
 */
function updateReceiptListStats(histories, totalAmount) {
  const statsEl = document.getElementById('receiptListStats');
  if (!statsEl) return;

  const receiptCount = histories.length;
  const itemCount = histories.reduce((sum, h) => sum + (h.items || []).length, 0);

  statsEl.innerHTML = `
    <span>📋 ${receiptCount}件</span>
    <span>📦 ${itemCount}品目</span>
    <span style="font-weight: 600; color: #3b82f6;">合計 ¥${(totalAmount || 0).toLocaleString()}</span>
  `;
}


// ==========================================
// ソート・フィルタ操作
// ==========================================

/**
 * ソートモードを切り替え
 * @param {string} mode - 'date_desc' | 'date_asc' | 'product' | 'store'
 */
function changeReceiptListSort(mode) {
  _receiptListSortMode = mode;

  // ボタンのアクティブ状態を更新
  document.querySelectorAll('.receipt-sort-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.sort === mode) {
      btn.classList.add('active');
    }
  });

  renderReceiptList();
}

/**
 * フリーテキストでフィルタ
 */
function filterReceiptList() {
  const input = document.getElementById('receiptListSearch');
  _receiptListFilter = input ? input.value : '';
  renderReceiptList();
}


// ==========================================
// 品名一括変換（v0.95新機能）
// ==========================================

/**
 * 品名マスターのエイリアス変更を全履歴に一括適用
 * 設定画面の「一括変換実行」ボタンから呼ばれる
 *
 * @param {string} oldName - 変更前の名前
 * @param {string} newName - 変更後の名前
 * @returns {number} 変換された品目数
 */
function bulkRenameProduct(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return 0;

  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  let convertedCount = 0;

  histories.forEach(h => {
    (h.items || []).forEach(item => {
      // 現在の名前が変更前の名前と一致
      if (item.name === oldName) {
        // originalNameがなければ現在の名前を保持
        if (!item.originalName) {
          item.originalName = item.name;
        }
        item.name = newName;
        convertedCount++;
      }
    });
  });

  if (convertedCount > 0) {
    localStorage.setItem('reform_app_receipt_history', JSON.stringify(histories));
  }

  return convertedCount;
}

/**
 * 品名マスター全体で一括変換を実行
 * productMasterの各エントリのkeywordsと照合し、
 * 一致する品目名をproductNameに変換する
 *
 * @returns {{totalConverted: number, details: Array}}
 */
function bulkConvertAllProducts() {
  if (!productMaster || productMaster.length === 0) {
    return { totalConverted: 0, details: [] };
  }

  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  let totalConverted = 0;
  const details = [];

  histories.forEach(h => {
    (h.items || []).forEach(item => {
      const currentName = (item.name || '').toLowerCase().replace(/\s+/g, '');

      for (const master of productMaster) {
        // すでに正式名称なら変換不要
        if (item.name === master.productName) break;

        let matched = false;

        // キーワード（エイリアス）でマッチ
        if (master.keywords && Array.isArray(master.keywords)) {
          for (const keyword of master.keywords) {
            if (currentName.includes(keyword.toLowerCase())) {
              matched = true;
              break;
            }
          }
        }

        // 品名の部分一致
        if (!matched && master.productName) {
          const normalizedMaster = master.productName.toLowerCase().replace(/\s+/g, '');
          if (currentName.includes(normalizedMaster) || normalizedMaster.includes(currentName)) {
            matched = true;
          }
        }

        if (matched) {
          if (!item.originalName) {
            item.originalName = item.name;
          }
          const oldName = item.name;
          item.name = master.productName;
          totalConverted++;
          details.push({
            from: oldName,
            to: master.productName,
            store: h.storeName,
            date: h.date
          });
          break; // 最初にマッチしたマスターで変換
        }
      }
    });
  });

  if (totalConverted > 0) {
    localStorage.setItem('reform_app_receipt_history', JSON.stringify(histories));
  }

  return { totalConverted, details };
}


// ==========================================
// 全商品名リスト取得（品名マスター管理画面用）
// ==========================================

/**
 * 全履歴から商品名のユニークリストを取得
 * 50音ソートして返す
 *
 * @returns {Array<{name: string, count: number, totalAmount: number, inMaster: boolean}>}
 */
function getAllProductNames() {
  const histories = JSON.parse(localStorage.getItem('reform_app_receipt_history') || '[]');
  const nameMap = {};

  histories.forEach(h => {
    (h.items || []).forEach(item => {
      const name = item.name || '';
      if (!name) return;

      if (!nameMap[name]) {
        nameMap[name] = { name, count: 0, totalAmount: 0 };
      }
      nameMap[name].count += (item.quantity || 1);
      nameMap[name].totalAmount += (item.price || 0) * (item.quantity || 1);
    });
  });

  // 品名マスターに登録済みかチェック
  const result = Object.values(nameMap).map(item => {
    const inMaster = productMaster && productMaster.some(m =>
      m.productName === item.name ||
      (m.keywords && m.keywords.some(k => k.toLowerCase() === item.name.toLowerCase()))
    );
    return { ...item, inMaster };
  });

  // 50音ソート（日本語対応）
  result.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return result;
}


// ==========================================
// 品名一括変換UIラッパー（v0.95追加）
// receipt-list.htmlのボタンから呼ばれる
// ==========================================

/**
 * 品名一括変換の実行（確認ダイアログ付き）
 * レシートリスト画面の「🔄品名マスターで一括変換」ボタンから呼ばれる
 */
function runBulkConvert() {
  if (!confirm('品名マスターのキーワードで、全レシート履歴の商品名を一括変換しますか？\n\n（変換前の名前はoriginalNameとして保持されます）')) {
    return;
  }

  if (typeof bulkConvertAllProducts !== 'function') {
    alert('品名変換機能が読み込まれていません');
    return;
  }

  const result = bulkConvertAllProducts();

  if (result.totalConverted === 0) {
    alert('✅ 変換対象はありませんでした\n（すべて正式名称に統一済み、またはマスター未登録です）');
  } else {
    // 変換結果のサマリーを表示
    const summary = result.details.slice(0, 10).map(d =>
      `「${d.from}」→「${d.to}」`
    ).join('\n');
    const more = result.totalConverted > 10 ? `\n...他${result.totalConverted - 10}件` : '';

    alert(
      `✅ ${result.totalConverted}件の品名を変換しました！\n\n` +
      `${summary}${more}`
    );

    // リストを再描画
    renderReceiptList();
  }
}


// ==========================================
// グローバル公開
// ==========================================
window.initReceiptList = initReceiptList;
window.renderReceiptList = renderReceiptList;
window.changeReceiptListSort = changeReceiptListSort;
window.filterReceiptList = filterReceiptList;
window.toggleProductDetail = toggleProductDetail;
window.toggleStoreDetail = toggleStoreDetail;
window.bulkRenameProduct = bulkRenameProduct;
window.bulkConvertAllProducts = bulkConvertAllProducts;
window.getAllProductNames = getAllProductNames;
window.runBulkConvert = runBulkConvert; // v0.95追加
