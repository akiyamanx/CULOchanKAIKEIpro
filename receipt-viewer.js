// receipt-viewer.js v1.8 — レシート管理画面（Phase1.6+1.7+1.8 bounds切り出し対応）
// 依存: receipt-store.js, globals.js, receipt-purpose.js, receipt-crop.js

var _rvCurrentDate = null;
var _rvCurrentReceipts = [];

// === 日付サマリー一覧 ===

/**
 * 日付一覧画面を表示（レシート管理のトップ）
 */
async function showReceiptDateList() {
  _rvCurrentDate = null;
  _rvCurrentReceipts = [];

  // 表示切替
  var dateListEl = document.getElementById('receiptViewerDateList');
  var detailEl = document.getElementById('receiptViewerDetail');
  var actionBar = document.getElementById('rvActionBar');
  if (dateListEl) dateListEl.style.display = '';
  if (detailEl) detailEl.style.display = 'none';
  if (actionBar) actionBar.style.display = 'none';

  await renderDateSummary();
}

/**
 * 日付サマリーカードを描画
 */
async function renderDateSummary() {
  var container = document.getElementById('receiptViewerDateCards');
  var emptyEl = document.getElementById('receiptViewerEmpty');
  var statsEl = document.getElementById('receiptViewerStats');
  if (!container) return;

  try {
    var summary = await getReceiptDateSummary();

    if (summary.length === 0) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      if (statsEl) statsEl.style.display = 'none';
      updateViewerTotalStats(0, 0);
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (statsEl) statsEl.style.display = '';

    // 全体統計
    var totalCount = 0;
    var totalAmount = 0;
    for (var i = 0; i < summary.length; i++) {
      totalCount += summary[i].count;
      totalAmount += summary[i].totalAmount;
    }
    updateViewerTotalStats(totalCount, totalAmount);

    // カード生成
    var html = '';
    for (var j = 0; j < summary.length; j++) {
      var s = summary[j];
      var dateLabel = formatDateLabel(s.date);
      var typeIcons = '';
      if (s.types.parking) typeIcons += '🅿️' + s.types.parking + ' ';
      if (s.types.shopping) typeIcons += '🛒' + s.types.shopping + ' ';

      html += '<div onclick="showReceiptsForDate(\'' + escapeHtml(s.date) + '\')" '
        + 'style="padding: 14px 16px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; cursor: pointer; '
        + 'display: flex; align-items: center; gap: 12px; transition: background 0.15s;"'
        + ' onpointerdown="this.style.background=\'#f3f4f6\'" onpointerup="this.style.background=\'white\'" onpointerleave="this.style.background=\'white\'">'
        + '<div style="width: 48px; height: 48px; background: linear-gradient(135deg, #dbeafe, #bfdbfe); border-radius: 10px; '
        + 'display: flex; align-items: center; justify-content: center; font-size: 20px;">📅</div>'
        + '<div style="flex: 1;">'
        + '<div style="font-size: 15px; font-weight: 600; color: #1f2937;">' + dateLabel + '</div>'
        + '<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">' + typeIcons + s.count + '件</div>'
        + '</div>'
        + '<div style="text-align: right;">'
        + '<div style="font-size: 16px; font-weight: 700; color: #1f2937;">¥' + Number(s.totalAmount).toLocaleString() + '</div>'
        + '<div style="font-size: 11px; color: #9ca3af;">→</div>'
        + '</div>'
        + '</div>';
    }
    container.innerHTML = html;

  } catch (e) {
    console.error('[receipt-viewer] 日付サマリー取得エラー:', e);
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">読み込みエラー: ' + e.message + '</div>';
  }
}

/**
 * 統計表示を更新
 */
function updateViewerTotalStats(count, amount) {
  var countEl = document.getElementById('rvTotalCount');
  var amountEl = document.getElementById('rvTotalAmount');
  if (countEl) countEl.textContent = count + '件';
  if (amountEl) amountEl.textContent = '¥' + Number(amount).toLocaleString();
}


// === 特定日付のレシート一覧 ===

/**
 * 指定日付のレシートカード一覧を表示
 */
async function showReceiptsForDate(dateStr) {
  _rvCurrentDate = dateStr;

  // 表示切替
  var dateListEl = document.getElementById('receiptViewerDateList');
  var detailEl = document.getElementById('receiptViewerDetail');
  if (dateListEl) dateListEl.style.display = 'none';
  if (detailEl) detailEl.style.display = '';

  // 日付ラベル
  var dateLabel = document.getElementById('rvDetailDate');
  if (dateLabel) dateLabel.textContent = formatDateLabel(dateStr);

  // チェック状態リセット
  var selectAll = document.getElementById('rvSelectAll');
  if (selectAll) selectAll.checked = false;

  await renderReceiptCards(dateStr);
}

/**
 * レシートカードを描画
 */
async function renderReceiptCards(dateStr) {
  var container = document.getElementById('rvReceiptCards');
  if (!container) return;

  try {
    var receipts = await getReceiptsByDateStore(dateStr);
    _rvCurrentReceipts = receipts;

    if (receipts.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 30px; color: #6b7280;">この日のレシートはありません</div>';
      updateCheckedCount();
      return;
    }

    var html = '';
    for (var i = 0; i < receipts.length; i++) {
      var r = receipts[i];
      var typeIcon = r.type === 'parking' ? '🅿️' : '🛒';
      var typeLabel = r.type === 'parking' ? '駐車場' : '買い物';
      var storeName = r.store || '不明';
      var itemCount = r.items ? r.items.length : 0;

      // サムネイル（画像があれば表示）
      var thumbHtml = '';
      if (r.imageData) {
        thumbHtml = '<img src="' + r.imageData.substring(0, 100) + '..." '
          + 'style="width: 56px; height: 56px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb;"'
          + ' onerror="this.style.display=\'none\'">';
        // 実際はfull imageDataが必要。ここではプレースホルダー
        thumbHtml = '<div onclick="event.stopPropagation(); showReceiptImage(\'' + escapeHtml(r.id) + '\')" '
          + 'style="width: 56px; height: 56px; background: linear-gradient(135deg, #e0e7ff, #c7d2fe); '
          + 'border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer; flex-shrink: 0;">📷</div>';
      } else {
        thumbHtml = '<div style="width: 56px; height: 56px; background: #f3f4f6; border-radius: 8px; '
          + 'display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;">' + typeIcon + '</div>';
      }

      // 品目サマリー（最大3件）
      var itemSummary = '';
      if (r.items && r.items.length > 0) {
        var showItems = r.items.slice(0, 3);
        var names = [];
        for (var j = 0; j < showItems.length; j++) {
          names.push(showItems[j].name || '品目');
        }
        itemSummary = names.join('、');
        if (r.items.length > 3) itemSummary += '… 他' + (r.items.length - 3) + '件';
      }

      // 駐車場の場合は入出庫時間
      var extraInfo = '';
      if (r.type === 'parking') {
        if (r.entryTime) extraInfo += '入庫 ' + r.entryTime;
        if (r.exitTime) extraInfo += (extraInfo ? ' → ' : '') + '出庫 ' + r.exitTime;
        if (r.purpose) extraInfo += (extraInfo ? ' / ' : '') + '📋 ' + r.purpose;
        if (r.siteName) extraInfo += (extraInfo ? ' / ' : '') + '📍 ' + r.siteName;
      }

      // v1.7追加: 駐車場で目的未入力の場合ヒント表示
      var purposeHint = '';
      if (r.type === 'parking' && !r.purpose && !r.siteName) {
        purposeHint = '<div style="font-size: 11px; color: #3b82f6; margin-top: 3px;">💡 タップして目的・現場を入力</div>';
      }

      // v1.7追加: カードタップで目的入力（駐車場のみ）or 詳細表示
      var cardOnClick = r.type === 'parking'
        ? 'onclick="openPurposeModal(\'' + escapeHtml(r.id) + '\')"'
        : '';

      html += '<div data-receipt-id="' + escapeHtml(r.id) + '" ' + cardOnClick + ' '
        + 'style="padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; '
        + (r.type === 'parking' ? 'cursor: pointer; ' : '')
        + 'display: flex; align-items: flex-start; gap: 10px;">'
        // チェックボックス
        + '<input type="checkbox" class="rv-receipt-check" data-id="' + escapeHtml(r.id) + '" '
        + 'onchange="updateCheckedCount()" '
        + 'style="width: 20px; height: 20px; accent-color: #3b82f6; margin-top: 18px; flex-shrink: 0;">'
        // サムネイル
        + thumbHtml
        // テキスト情報
        + '<div style="flex: 1; min-width: 0;">'
        + '<div style="display: flex; align-items: center; gap: 6px;">'
        + '<span style="font-size: 15px; font-weight: 600; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(storeName) + '</span>'
        + '<span style="font-size: 11px; padding: 2px 6px; background: ' + (r.type === 'parking' ? '#dbeafe' : '#dcfce7') + '; '
        + 'color: ' + (r.type === 'parking' ? '#1d4ed8' : '#16a34a') + '; border-radius: 4px; font-weight: 500; white-space: nowrap;">' + typeLabel + '</span>'
        + '</div>';

      if (itemSummary) {
        html += '<div style="font-size: 12px; color: #6b7280; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(itemSummary) + '</div>';
      }
      if (extraInfo) {
        html += '<div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">' + escapeHtml(extraInfo) + '</div>';
      }
      html += purposeHint;

      html += '</div>'
        // 金額
        + '<div style="text-align: right; flex-shrink: 0; margin-top: 4px;">'
        + '<div style="font-size: 16px; font-weight: 700; color: #1f2937;">¥' + Number(r.total || 0).toLocaleString() + '</div>'
        + '<div style="font-size: 11px; color: #9ca3af;">' + itemCount + '品目</div>'
        + '</div>'
        + '</div>';
    }
    container.innerHTML = html;
    updateCheckedCount();

  } catch (e) {
    console.error('[receipt-viewer] レシート一覧取得エラー:', e);
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">読み込みエラー: ' + e.message + '</div>';
  }
}


// === チェックボックス操作 ===

/**
 * 全選択/全解除
 */
function toggleAllReceiptChecks(checked) {
  var boxes = document.querySelectorAll('.rv-receipt-check');
  for (var i = 0; i < boxes.length; i++) {
    boxes[i].checked = checked;
  }
  updateCheckedCount();
}

/**
 * チェック数更新＆アクションバー表示制御
 */
function updateCheckedCount() {
  var boxes = document.querySelectorAll('.rv-receipt-check');
  var checked = 0;
  for (var i = 0; i < boxes.length; i++) {
    if (boxes[i].checked) checked++;
  }

  var countEl = document.getElementById('rvCheckedCount');
  if (countEl) countEl.textContent = checked + '件選択中';

  var pdfCountEl = document.getElementById('rvPdfCount');
  if (pdfCountEl) pdfCountEl.textContent = checked;

  // アクションバー表示
  var actionBar = document.getElementById('rvActionBar');
  if (actionBar) {
    actionBar.style.display = checked > 0 ? '' : 'none';
  }

  // 削除ボタン表示
  var deleteBtn = document.getElementById('rvDeleteSelectedBtn');
  if (deleteBtn) {
    deleteBtn.style.display = checked > 0 ? '' : 'none';
  }

  // 全選択チェックボックス連動
  var selectAll = document.getElementById('rvSelectAll');
  if (selectAll && boxes.length > 0) {
    selectAll.checked = (checked === boxes.length);
  }
}

/**
 * チェックされたレシートIDを取得
 * @returns {string[]}
 */
function getCheckedReceiptIds() {
  var boxes = document.querySelectorAll('.rv-receipt-check:checked');
  var ids = [];
  for (var i = 0; i < boxes.length; i++) {
    ids.push(boxes[i].getAttribute('data-id'));
  }
  return ids;
}


// === 削除操作 ===

/**
 * 選択したレシートを削除
 */
async function deleteSelectedReceipts() {
  var ids = getCheckedReceiptIds();
  if (ids.length === 0) return;

  if (!confirm(ids.length + '件のレシートを削除しますか？\nこの操作は元に戻せません。')) {
    return;
  }

  try {
    for (var i = 0; i < ids.length; i++) {
      await deleteReceiptById(ids[i]);
    }
    alert(ids.length + '件を削除しました');

    // 再描画
    if (_rvCurrentDate) {
      await renderReceiptCards(_rvCurrentDate);
      // レシートが0件になったら日付一覧に戻る
      if (_rvCurrentReceipts.length === 0) {
        showReceiptDateList();
      }
    }
  } catch (e) {
    console.error('[receipt-viewer] 削除エラー:', e);
    alert('削除に失敗しました: ' + e.message);
  }
}


// === レシート画像表示 ===

/**
 * レシート画像をフルスクリーン表示
 */
async function showReceiptImage(receiptId) {
  try {
    var receipt = await getReceiptById(receiptId);
    if (!receipt || !receipt.imageData) {
      alert('画像がありません');
      return;
    }
    // 既存の画像ビューアを再利用
    var viewer = document.getElementById('receiptImageViewer');
    var img = document.getElementById('receiptImageFullView');
    if (viewer && img) {
      img.src = receipt.imageData;
      viewer.style.display = 'flex';
    }
  } catch (e) {
    console.error('[receipt-viewer] 画像表示エラー:', e);
  }
}


// === PDF出力（Phase1.8: Canvas自動検出＋駐車場目的表示） ===
async function exportSelectedReceiptsPdf() {
  var ids = getCheckedReceiptIds();
  if (ids.length === 0) { alert('レシートを選択してください'); return; }
  try {
    var selectedReceipts = [];
    for (var i = 0; i < ids.length; i++) {
      var r = await getReceiptById(ids[i]);
      if (r) selectedReceipts.push(r);
    }
    if (selectedReceipts.length === 0) { alert('レシートが見つかりません'); return; }
    var cropOpts = { padding: 15, maxWidth: 700, quality: 0.8 };
    // v1.8: 同一画像グループ化→Canvas自動検出で個別切り出し
    var imgGroups = {};
    for (var g = 0; g < selectedReceipts.length; g++) {
      var imgKey = selectedReceipts[g].imageData ? selectedReceipts[g].imageData.substring(0, 100) : 'none_' + g;
      if (!imgGroups[imgKey]) imgGroups[imgKey] = [];
      imgGroups[imgKey].push(g);
    }
    var imgResults = {};
    var groupKeys = Object.keys(imgGroups);
    for (var gk = 0; gk < groupKeys.length; gk++) {
      var indices = imgGroups[groupKeys[gk]];
      var sampleR = selectedReceipts[indices[0]];
      if (indices.length > 1 && sampleR.imageData && typeof detectAndCropMultipleReceipts === 'function') {
        var crops = await detectAndCropMultipleReceipts(sampleR.imageData, indices.length, cropOpts);
        for (var ci = 0; ci < indices.length; ci++) imgResults[indices[ci]] = crops[ci] || sampleR.imageData;
      } else {
        for (var si = 0; si < indices.length; si++) {
          var sr = selectedReceipts[indices[si]];
          imgResults[indices[si]] = sr.imageData && typeof cropReceiptImage === 'function'
            ? await cropReceiptImage(sr.imageData, cropOpts) : (sr.imageData || null);
        }
      }
    }
    var processedImages = [];
    for (var pi = 0; pi < selectedReceipts.length; pi++) processedImages.push(imgResults[pi] || null);

    var dateKey = selectedReceipts[0].date || new Date().toISOString().split('T')[0];

    var receiptDataList = selectedReceipts.map(function(r) {
      return {
        store: r.store, type: r.type, total: r.total,
        items: r.items || [],
        entry_time: r.entryTime, exit_time: r.exitTime,
        purpose: r.purpose || '', siteName: r.siteName || '',
        date: r.date
      };
    });

    if (typeof generateReceiptPdf === 'function') {
      var pdfBase64 = await generateReceiptPdf(dateKey, receiptDataList, processedImages);
      var byteChars = atob(pdfBase64);
      var byteNumbers = new Array(byteChars.length);
      for (var k = 0; k < byteChars.length; k++) {
        byteNumbers[k] = byteChars.charCodeAt(k);
      }
      var blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'receipt_selected_' + dateKey + '.pdf';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        if (a.parentNode) document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
      alert('✅ ' + selectedReceipts.length + '件のレシートPDFを出力しました');
    } else {
      alert('PDF生成機能が利用できません');
    }

  } catch (e) {
    console.error('[receipt-viewer] PDF出力エラー:', e);
    alert('PDF出力に失敗しました: ' + e.message);
  }
}

// === ユーティリティ ===

/**
 * 日付文字列を読みやすい形式に変換
 */
function formatDateLabel(dateStr) {
  if (!dateStr || dateStr === 'unknown') return '日付不明';
  try {
    var parts = dateStr.split('-');
    var y = parseInt(parts[0]);
    var m = parseInt(parts[1]);
    var d = parseInt(parts[2]);
    var date = new Date(y, m - 1, d);
    var days = ['日', '月', '火', '水', '木', '金', '土'];
    var dayOfWeek = days[date.getDay()];
    return y + '年' + m + '月' + d + '日（' + dayOfWeek + '）';
  } catch (e) {
    return dateStr;
  }
}


// === 画面表示フック ===

/**
 * レシート管理画面が表示された時に自動的に日付一覧を読み込む
 */
(function hookReceiptViewer() {
  if (typeof window.showScreen === 'function' && !window._rvHooked) {
    var _origShowScreen = window.showScreen;
    window.showScreen = function(screenName) {
      _origShowScreen(screenName);
      if (screenName === 'receipt-viewer') {
        showReceiptDateList();
      }
    };
    window._rvHooked = true;
    console.log('[receipt-viewer] showScreenフック完了');
  } else {
    setTimeout(hookReceiptViewer, 300);
  }
})();

// === グローバル公開 ===
window.showReceiptDateList = showReceiptDateList;
window.showReceiptsForDate = showReceiptsForDate;
window.toggleAllReceiptChecks = toggleAllReceiptChecks;
window.updateCheckedCount = updateCheckedCount;
window.getCheckedReceiptIds = getCheckedReceiptIds;
window.deleteSelectedReceipts = deleteSelectedReceipts;
window.showReceiptImage = showReceiptImage;
window.exportSelectedReceiptsPdf = exportSelectedReceiptsPdf;
console.log('[receipt-viewer.js] ✓ v1.8: bounds座標切り出し対応');