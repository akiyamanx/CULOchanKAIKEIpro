// ==========================================
// レシートPDF一覧・閲覧画面ロジック
// Reform App Pro v0.96（新規）
// ==========================================
// 月選択 → 日付一覧 → タップでPDF表示
//
// 依存:
//   - receipt-pdf.js (listReceiptPdfs, viewReceiptPdf, deleteReceiptPdf)
//   - globals.js (escapeHtml)
// ==========================================

var _receiptPdfViewYear = new Date().getFullYear();
var _receiptPdfViewMonth = new Date().getMonth() + 1; // 1-12

/**
 * 画面初期化（showScreen時に呼ばれる）
 */
function initReceiptPdfViewer() {
  _receiptPdfViewYear = new Date().getFullYear();
  _receiptPdfViewMonth = new Date().getMonth() + 1;
  renderReceiptPdfViewer();
}

/**
 * 月を変更
 */
function changeReceiptPdfMonth(delta) {
  _receiptPdfViewMonth += delta;
  if (_receiptPdfViewMonth > 12) {
    _receiptPdfViewMonth = 1;
    _receiptPdfViewYear++;
  } else if (_receiptPdfViewMonth < 1) {
    _receiptPdfViewMonth = 12;
    _receiptPdfViewYear--;
  }
  renderReceiptPdfViewer();
}

/**
 * メイン描画
 */
async function renderReceiptPdfViewer() {
  // 月ラベル更新
  var label = document.getElementById('receiptPdfMonthLabel');
  if (label) {
    label.textContent = _receiptPdfViewYear + '年' + _receiptPdfViewMonth + '月';
  }

  var container = document.getElementById('receiptPdfList');
  var statsEl = document.getElementById('receiptPdfStats');
  if (!container) return;

  // ローディング
  container.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;">読み込み中...</div>';

  try {
    var allPdfs = await listReceiptPdfs();

    // 選択月でフィルタ
    var prefix = _receiptPdfViewYear + '-' + String(_receiptPdfViewMonth).padStart(2, '0');
    var filtered = allPdfs.filter(function(p) {
      return p.date && p.date.startsWith(prefix);
    });

    // 統計更新
    if (statsEl) {
      var pdfCount = filtered.length;
      var totalReceipts = filtered.reduce(function(s, p) { return s + (p.receipt_count || 0); }, 0);
      var totalAmount = filtered.reduce(function(s, p) { return s + (p.total_amount || 0); }, 0);
      statsEl.innerHTML =
        '<span>📄 ' + pdfCount + '日分</span>' +
        '<span>🧾 ' + totalReceipts + '枚</span>' +
        '<span style="font-weight:600;color:#3b82f6;">¥' + totalAmount.toLocaleString() + '</span>';
    }

    // 一覧描画
    if (filtered.length === 0) {
      container.innerHTML =
        '<div style="text-align:center;padding:40px 20px;color:#9ca3af;">' +
        '<div style="font-size:48px;margin-bottom:12px;">📄</div>' +
        '<div style="font-size:15px;">' + _receiptPdfViewYear + '年' + _receiptPdfViewMonth + '月のPDFはありません</div>' +
        '</div>';
      return;
    }

    container.innerHTML = filtered.map(function(p) {
      var dayParts = p.date.split('-');
      var dayNum = dayParts.length === 3 ? parseInt(dayParts[2]) : '?';
      var weekday = getWeekday(p.date);

      return '<div style="display:flex;align-items:center;gap:12px;padding:14px;background:white;border:1px solid #e5e7eb;border-radius:12px;cursor:pointer;" onclick="viewReceiptPdf(\'' + p.date + '\')">' +
        '<div style="min-width:50px;text-align:center;">' +
          '<div style="font-size:24px;font-weight:700;color:#1f2937;">' + dayNum + '</div>' +
          '<div style="font-size:11px;color:#6b7280;">' + weekday + '</div>' +
        '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-size:14px;font-weight:600;color:#1f2937;">レシート ' + (p.receipt_count || 0) + '枚</div>' +
          '<div style="font-size:12px;color:#6b7280;">更新: ' + formatTime(p.updated_at) + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div style="font-size:16px;font-weight:700;color:#3b82f6;">¥' + (p.total_amount || 0).toLocaleString() + '</div>' +
          '<button onclick="event.stopPropagation();confirmDeletePdf(\'' + p.date + '\')" style="margin-top:4px;padding:2px 8px;background:#fee2e2;color:#dc2626;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>' +
        '</div>' +
      '</div>';
    }).join('');

  } catch (e) {
    console.error('[receipt-pdf-viewer] 読み込みエラー:', e);
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">読み込みエラー: ' + e.message + '</div>';
  }
}


// ==========================================
// 削除確認
// ==========================================

async function confirmDeletePdf(dateKey) {
  if (!confirm(dateKey + ' のPDFを削除しますか？')) return;
  try {
    await deleteReceiptPdf(dateKey);
    alert('削除しました');
    renderReceiptPdfViewer();
  } catch (e) {
    alert('削除エラー: ' + e.message);
  }
}


// ==========================================
// ユーティリティ
// ==========================================

function getWeekday(dateStr) {
  var days = ['日', '月', '火', '水', '木', '金', '土'];
  var d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : '(' + days[d.getDay()] + ')';
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  var d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}


// ==========================================
// グローバル公開
// ==========================================
window.initReceiptPdfViewer = initReceiptPdfViewer;
window.changeReceiptPdfMonth = changeReceiptPdfMonth;
window.renderReceiptPdfViewer = renderReceiptPdfViewer;
window.confirmDeletePdf = confirmDeletePdf;
