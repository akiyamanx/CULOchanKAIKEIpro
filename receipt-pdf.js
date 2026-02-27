// ==========================================
// レシートPDF生成・管理機能
// Reform App Pro v0.96（新規）
// ==========================================
// 日付ごとにレシート画像＋ラベル付きPDFを生成し、
// IndexedDBに保存する。
//
// 企画書 Phase 1: 撮影→読み取り→PDF保存→閲覧
//
// 依存:
//   - jsPDF (CDN読込済み)
//   - receipt-ai.js (getLastAiResults, _lastAiReceiptResults)
//   - receipt-core.js (receiptItems, receiptImageData)
//   - idb-storage.js (IndexedDB操作)
//   - globals.js (escapeHtml)
// ==========================================


// ==========================================
// IndexedDB: receipt_pdfsストア操作
// ==========================================

var RECEIPT_PDF_DB_NAME = 'CULOchanReceiptPDFs';
var RECEIPT_PDF_DB_VERSION = 1;
var RECEIPT_PDF_STORE = 'receipt_pdfs';
var RECEIPT_DATA_STORE = 'receipts';

/**
 * レシートPDF用のIndexedDBを取得/作成
 */
function getReceiptPdfDB() {
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(RECEIPT_PDF_DB_NAME, RECEIPT_PDF_DB_VERSION);

    request.onupgradeneeded = function(event) {
      var db = event.target.result;

      // PDF保存ストア（日付キー）
      if (!db.objectStoreNames.contains(RECEIPT_PDF_STORE)) {
        var pdfStore = db.createObjectStore(RECEIPT_PDF_STORE, { keyPath: 'date' });
        pdfStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // レシートデータストア（UUID）
      if (!db.objectStoreNames.contains(RECEIPT_DATA_STORE)) {
        var dataStore = db.createObjectStore(RECEIPT_DATA_STORE, { keyPath: 'id' });
        dataStore.createIndex('date', 'date', { unique: false });
        dataStore.createIndex('type', 'type', { unique: false });
        dataStore.createIndex('store', 'store', { unique: false });
      }
    };

    request.onsuccess = function(event) { resolve(event.target.result); };
    request.onerror = function(event) { reject(event.target.error); };
  });
}


// ==========================================
// PDF生成
// ==========================================

/**
 * レシート画像+ラベル付きPDFを生成
 * @param {string} dateKey - 日付(YYYY-MM-DD)
 * @param {Array} receiptDataList - その日のレシートデータ配列
 * @param {Array} imageDataList - 対応するレシート画像Base64配列
 * @returns {Promise<string>} 生成されたPDFのBase64データ
 */
async function generateReceiptPdf(dateKey, receiptDataList, imageDataList) {
  var jspdf = window.jspdf || window.jsPDF;
  var JsPDF = jspdf.jsPDF || jspdf;

  // A4縦
  var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  var pageW = 210;
  var pageH = 297;
  var margin = 10;
  var contentW = pageW - margin * 2;
  var y = margin;

  // ヘッダー
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(formatDateJapanese(dateKey) + '  レシート', margin, y + 5);
  y += 8;

  var count = receiptDataList.length;
  var totalAmount = receiptDataList.reduce(function(s, r) {
    return s + (parseInt(r.total) || 0);
  }, 0);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(count + ' receipts / Total: Y' + totalAmount.toLocaleString(), margin, y + 3);
  y += 8;

  // 区切り線
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // 各レシートを配置
  for (var i = 0; i < receiptDataList.length; i++) {
    var receipt = receiptDataList[i];
    var imgData = imageDataList[i] || null;

    // ページ残りチェック（最低60mm必要）
    if (y > pageH - 70) {
      doc.addPage();
      y = margin;
    }

    // ラベル（店名・金額・種別）
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    var storeLabel = (receipt.store || 'Unknown') + '  Y' + ((receipt.total || 0).toLocaleString());
    doc.text(storeLabel, margin, y + 4);
    y += 6;

    // 種別＆時間（駐車場の場合）
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    var typeLabel = receipt.type === 'parking' ? '[Parking]' : '[Shopping]';
    if (receipt.type === 'parking' && receipt.entry_time) {
      typeLabel += ' ' + (receipt.entry_time || '') + ' - ' + (receipt.exit_time || '');
    }
    doc.text(typeLabel, margin, y + 3);
    y += 5;

    // レシート画像を配置
    if (imgData) {
      try {
        var imgDim = await getImageDimensions(imgData);
        // 最大幅: contentW/2 (半分), 最大高さ: 90mm
        var maxW = contentW * 0.5;
        var maxH = 90;
        var scale = Math.min(maxW / imgDim.w, maxH / imgDim.h, 1);
        var drawW = imgDim.w * scale;
        var drawH = imgDim.h * scale;

        // ページ残りチェック
        if (y + drawH > pageH - margin) {
          doc.addPage();
          y = margin;
        }

        var imgFormat = imgData.indexOf('data:image/png') === 0 ? 'PNG' : 'JPEG';
        doc.addImage(imgData, imgFormat, margin, y, drawW, drawH);
        y += drawH + 3;
      } catch (imgErr) {
        console.warn('[receipt-pdf] 画像追加失敗:', imgErr);
        doc.setFontSize(8);
        doc.text('(image unavailable)', margin, y + 3);
        y += 6;
      }
    }

    // 品目リスト（テキスト）
    if (receipt.items && receipt.items.length > 0) {
      doc.setFontSize(7);
      receipt.items.forEach(function(item) {
        if (y > pageH - 15) {
          doc.addPage();
          y = margin;
        }
        var line = '  ' + (item.name || '?') +
          ' x' + (item.qty || item.quantity || 1) +
          '  Y' + ((item.price || 0).toLocaleString());
        doc.text(line, margin + 2, y + 2.5);
        y += 3.5;
      });
    }

    // レシート間の区切り
    y += 3;
    if (i < receiptDataList.length - 1) {
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(margin, y, pageW - margin, y);
      y += 4;
    }
  }

  // Base64で返す
  return doc.output('datauristring');
}


// ==========================================
// 画像サイズ取得ユーティリティ
// ==========================================

function getImageDimensions(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() { resolve({ w: img.width, h: img.height }); };
    img.onerror = function() { resolve({ w: 200, h: 300 }); };
    img.src = dataUrl;
  });
}


// ==========================================
// 日付フォーマット
// ==========================================

function formatDateJapanese(dateStr) {
  if (!dateStr || dateStr === 'unknown') return dateStr;
  var parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[0] + '/' + parts[1] + '/' + parts[2];
}


// ==========================================
// IndexedDBへの保存・取得
// ==========================================

/**
 * 生成したPDFをIndexedDBに保存
 */
async function saveReceiptPdf(dateKey, pdfBase64, receiptCount, totalAmount) {
  var db = await getReceiptPdfDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(RECEIPT_PDF_STORE, 'readwrite');
    var store = tx.objectStore(RECEIPT_PDF_STORE);

    var record = {
      date: dateKey,
      pdf_data: pdfBase64,
      receipt_count: receiptCount,
      total_amount: totalAmount,
      updated_at: new Date().toISOString()
    };

    var req = store.put(record);
    req.onsuccess = function() { resolve(true); };
    req.onerror = function() { reject(req.error); };
  });
}

/**
 * 日付キーでPDFを取得
 */
async function getReceiptPdf(dateKey) {
  var db = await getReceiptPdfDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(RECEIPT_PDF_STORE, 'readonly');
    var store = tx.objectStore(RECEIPT_PDF_STORE);
    var req = store.get(dateKey);
    req.onsuccess = function() { resolve(req.result || null); };
    req.onerror = function() { reject(req.error); };
  });
}

/**
 * 全PDF一覧を取得（日付・件数・金額のみ、PDF本体は除く）
 */
async function listReceiptPdfs() {
  var db = await getReceiptPdfDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(RECEIPT_PDF_STORE, 'readonly');
    var store = tx.objectStore(RECEIPT_PDF_STORE);
    var req = store.getAll();
    req.onsuccess = function() {
      var list = (req.result || []).map(function(r) {
        return {
          date: r.date,
          receipt_count: r.receipt_count,
          total_amount: r.total_amount,
          updated_at: r.updated_at
        };
      });
      // 日付の新しい順
      list.sort(function(a, b) { return b.date.localeCompare(a.date); });
      resolve(list);
    };
    req.onerror = function() { reject(req.error); };
  });
}

/**
 * PDFを削除
 */
async function deleteReceiptPdf(dateKey) {
  var db = await getReceiptPdfDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(RECEIPT_PDF_STORE, 'readwrite');
    var store = tx.objectStore(RECEIPT_PDF_STORE);
    var req = store.delete(dateKey);
    req.onsuccess = function() { resolve(true); };
    req.onerror = function() { reject(req.error); };
  });
}


// ==========================================
// レシートデータの保存（receiptsストア）
// ==========================================

/**
 * 個別レシートデータをIndexedDBに保存
 */
async function saveReceiptData(receiptRecord) {
  var db = await getReceiptPdfDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(RECEIPT_DATA_STORE, 'readwrite');
    var store = tx.objectStore(RECEIPT_DATA_STORE);
    var req = store.put(receiptRecord);
    req.onsuccess = function() { resolve(true); };
    req.onerror = function() { reject(req.error); };
  });
}

/**
 * 日付でレシートデータを検索
 */
async function getReceiptDataByDate(dateKey) {
  var db = await getReceiptPdfDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(RECEIPT_DATA_STORE, 'readonly');
    var store = tx.objectStore(RECEIPT_DATA_STORE);
    var index = store.index('date');
    var req = index.getAll(dateKey);
    req.onsuccess = function() { resolve(req.result || []); };
    req.onerror = function() { reject(req.error); };
  });
}


// ==========================================
// メインフロー: 撮影→解析→PDF保存
// ==========================================

/**
 * AI解析結果からPDFを生成して保存する
 * 保存ボタン or 自動で呼ばれる
 */
async function generateAndSaveReceiptPdfs() {
  var aiResults = getLastAiResults();
  if (!aiResults || !aiResults.receipts || aiResults.receipts.length === 0) {
    alert('AI解析結果がありません。\n先にレシートを読み取ってください。');
    return;
  }

  showAiLoading('PDF生成中...');

  try {
    // 日付別にグループ化
    var grouped = {};
    aiResults.receipts.forEach(function(r) {
      var dateKey = r.date || 'unknown';
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(r);
    });

    var dateKeys = Object.keys(grouped);
    var savedCount = 0;

    for (var d = 0; d < dateKeys.length; d++) {
      var dateKey = dateKeys[d];
      var receiptsForDate = grouped[dateKey];

      // 画像データ（現状は全レシート共通の撮影画像を使用）
      // Phase 2で個別切り出し画像に対応予定
      var images = receiptsForDate.map(function() {
        return receiptImageData || null;
      });

      // PDF生成
      var pdfData = await generateReceiptPdf(dateKey, receiptsForDate, images);

      // 合計金額
      var totalAmt = receiptsForDate.reduce(function(s, r) {
        return s + (parseInt(r.total) || 0);
      }, 0);

      // IDBに保存
      await saveReceiptPdf(dateKey, pdfData, receiptsForDate.length, totalAmt);

      // 各レシートデータもIDBに保存
      for (var ri = 0; ri < receiptsForDate.length; ri++) {
        var r = receiptsForDate[ri];
        await saveReceiptData({
          id: dateKey + '_' + ri + '_' + Date.now(),
          date: dateKey,
          type: r.type || 'shopping',
          store: r.store || '',
          total: parseInt(r.total) || 0,
          items: r.items || [],
          entry_time: r.entry_time || '',
          exit_time: r.exit_time || '',
          purpose: '',
          pdf_date: dateKey,
          created_at: new Date().toISOString()
        });
      }

      savedCount++;
    }

    hideAiLoading();
    alert('✅ PDF生成完了！\n' + savedCount + '日分のPDFを保存しました。');

  } catch (e) {
    hideAiLoading();
    console.error('[receipt-pdf] PDF生成エラー:', e);
    alert('PDF生成中にエラーが発生しました:\n' + e.message);
  }
}


// ==========================================
// PDF閲覧（新しいタブで開く）
// ==========================================

async function viewReceiptPdf(dateKey) {
  try {
    var record = await getReceiptPdf(dateKey);
    if (!record || !record.pdf_data) {
      alert('PDFが見つかりません: ' + dateKey);
      return;
    }
    // data:application/pdf;base64,... の形式で開く
    var pdfWindow = window.open('');
    if (pdfWindow) {
      pdfWindow.document.write(
        '<html><head><title>' + dateKey + ' Receipt</title></head>' +
        '<body style="margin:0;"><iframe src="' + record.pdf_data +
        '" style="width:100%;height:100vh;border:none;"></iframe></body></html>'
      );
    } else {
      // ポップアップブロック対策
      var link = document.createElement('a');
      link.href = record.pdf_data;
      link.download = dateKey + '_receipt.pdf';
      link.click();
    }
  } catch (e) {
    alert('PDF表示エラー: ' + e.message);
  }
}


// ==========================================
// グローバル公開
// ==========================================
window.generateReceiptPdf = generateReceiptPdf;
window.generateAndSaveReceiptPdfs = generateAndSaveReceiptPdfs;
window.saveReceiptPdf = saveReceiptPdf;
window.getReceiptPdf = getReceiptPdf;
window.listReceiptPdfs = listReceiptPdfs;
window.deleteReceiptPdf = deleteReceiptPdf;
window.viewReceiptPdf = viewReceiptPdf;
window.saveReceiptData = saveReceiptData;
window.getReceiptDataByDate = getReceiptDataByDate;
