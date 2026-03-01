/**
 * receipt-pdf.js v0.97fix6+phase16
 * レシートPDF生成＆IndexedDB保存
 * 依存: jsPDF, receipt-ai.js, globals.js, noto-sans-jp-base64.js, receipt-store.js
 */

// === IndexedDB設定 ===
// v1.6: receipt-store.jsのopenReceiptStoreDb()を使用（DB v2対応）
// receipt-store.jsが先に読み込まれていない場合のフォールバック
function openReceiptPdfDb() {
  if (typeof openReceiptStoreDb === 'function') {
    return openReceiptStoreDb();
  }
  // フォールバック（旧実装）
  var RECEIPT_PDF_DB_NAME = 'CULOchanReceiptPDFs';
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(RECEIPT_PDF_DB_NAME, 1);
    request.onupgradeneeded = function(event) {
      var db = event.target.result;
      if (!db.objectStoreNames.contains('receipt_pdfs')) {
        var pdfStore = db.createObjectStore('receipt_pdfs', { keyPath: 'date' });
        pdfStore.createIndex('updated_at', 'updated_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('receipts')) {
        var receiptStore = db.createObjectStore('receipts', { keyPath: 'id' });
        receiptStore.createIndex('date', 'date', { unique: false });
      }
    };
    request.onsuccess = function(event) { resolve(event.target.result); };
    request.onerror = function(event) { reject(event.target.error); };
  });
}

// === PDF生成（jsPDF + NotoSansJP日本語フォント対応） ===
async function generateReceiptPdf(dateKey, receiptDataList, imageDataList) {
  // jsPDFが読み込まれているか確認
  if (typeof jspdf === 'undefined' || typeof jspdf.jsPDF === 'undefined') {
    throw new Error('jsPDFが読み込まれていません');
  }

  var doc = new jspdf.jsPDF('p', 'mm', 'a4');

  // 日本語フォント登録 (NotoSansJP レシート用サブセット) v0.97
  var fontLoaded = false;
  if (typeof NOTO_SANS_JP_BASE64 !== 'undefined' && NOTO_SANS_JP_BASE64.length > 0) {
    try {
      doc.addFileToVFS('NotoSansJP-Regular.ttf', NOTO_SANS_JP_BASE64);
      doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal');
      doc.setFont('NotoSansJP');
      fontLoaded = true;
      console.log('日本語フォント(NotoSansJP)登録成功');
    } catch (e) {
      console.warn('日本語フォント登録に失敗。helveticaで代替します:', e);
      doc.setFont('helvetica');
    }
  } else {
    console.warn('NOTO_SANS_JP_BASE64未定義。helveticaで代替します');
    doc.setFont('helvetica');
  }

  var pageWidth = 210;
  var pageHeight = 297;
  var margin = 15;
  var contentWidth = pageWidth - margin * 2;
  var y = margin;

  // タイトル
  doc.setFontSize(16);
  var titleText = 'レシート記録 — ' + dateKey;
  if (fontLoaded) {
    doc.text(titleText, margin, y);
  } else {
    doc.text('Receipt Record - ' + dateKey, margin, y);
  }
  y += 10;

  // 区切り線
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // 各レシートのデータを描画 v0.97fix4
  // ページ跨ぎ防止: 各レシートのテキスト+画像をまとめて1ブロックとして扱う
  // 同じ画像の重複防止: 既に添付済みの画像はスキップ
  var attachedImages = {}; // 添付済み画像の追跡用

  for (var i = 0; i < receiptDataList.length; i++) {
    var receipt = receiptDataList[i];

    // --- テキスト部分の高さを事前計算 ---
    var textHeight = 7; // レシート番号ラベル
    textHeight += 6; // 店名
    if (receipt.type) textHeight += 6; // 種別
    if (receipt.type === 'parking') {
      if (receipt.entry_time) textHeight += 6;
      if (receipt.exit_time) textHeight += 6;
      if (receipt.purpose) textHeight += 6; // v1.8追加
      if (receipt.siteName) textHeight += 6; // v1.8追加
    }
    if (receipt.items && receipt.items.length > 0) {
      textHeight += 5; // 品目ヘッダー
      textHeight += receipt.items.length * 5; // 各品目
    }
    textHeight += 8; // 合計金額

    // --- 画像の高さを事前計算 ---
    var willAttachImage = false;
    var estimatedImgHeight = 0;
    if (imageDataList && imageDataList[i]) {
      var imgSrc = imageDataList[i];
      // 同じ画像が既に添付済みかチェック（データURLの先頭100文字で判定）
      var imgKey = imgSrc.substring(0, 100);
      if (!attachedImages[imgKey]) {
        willAttachImage = true;
        estimatedImgHeight = 75; // 縦長レシート画像の概算高さ(mm)
      }
    }

    // --- ブロック全体がページに収まるかチェック ---
    var totalBlockHeight = textHeight + (willAttachImage ? estimatedImgHeight + 5 : 0) + 10;
    if (y + totalBlockHeight > pageHeight - 15) {
      doc.addPage();
      y = margin;
      if (fontLoaded) { doc.setFont('NotoSansJP'); }
    }

    // レシート番号ラベル
    doc.setFontSize(12);
    doc.setTextColor(80, 80, 80);
    var receiptLabel = fontLoaded
      ? '【レシート ' + (i + 1) + '/' + receiptDataList.length + '】'
      : '[Receipt ' + (i + 1) + '/' + receiptDataList.length + ']';
    doc.text(receiptLabel, margin, y);
    y += 7;

    // 店名
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    var storeName = receipt.store || receipt.storeName || '不明';
    var storeLabel = fontLoaded ? '店名: ' + storeName : 'Store: ' + storeName;
    doc.text(storeLabel, margin, y);
    y += 6;

    // 種別（parking/shopping等）
    if (receipt.type) {
      var typeLabel = fontLoaded
        ? '種別: ' + (receipt.type === 'parking' ? '駐車場' : receipt.type === 'shopping' ? '買い物' : receipt.type)
        : 'Type: ' + receipt.type;
      doc.text(typeLabel, margin, y);
      y += 6;
    }

    // 駐車場の場合：入出庫時間
    if (receipt.type === 'parking') {
      if (receipt.entry_time) {
        var entryLabel = fontLoaded ? '入庫: ' + receipt.entry_time : 'Entry: ' + receipt.entry_time;
        doc.text(entryLabel, margin, y);
        y += 6;
      }
      if (receipt.exit_time) {
        var exitLabel = fontLoaded ? '出庫: ' + receipt.exit_time : 'Exit: ' + receipt.exit_time;
        doc.text(exitLabel, margin, y);
        y += 6;
      }
      // v1.8追加: 目的＋現場名
      if (receipt.purpose) {
        var purposeLabel = fontLoaded ? '目的: ' + receipt.purpose : 'Purpose: ' + receipt.purpose;
        doc.setTextColor(0, 80, 180);
        doc.text(purposeLabel, margin, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      }
      if (receipt.siteName) {
        var siteLabel = fontLoaded ? '現場: ' + receipt.siteName : 'Site: ' + receipt.siteName;
        doc.setTextColor(0, 120, 60);
        doc.text(siteLabel, margin, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      }
    }

    // 品目一覧
    if (receipt.items && receipt.items.length > 0) {
      doc.setFontSize(10);
      var itemHeader = fontLoaded ? '--- 品目 ---' : '--- Items ---';
      doc.text(itemHeader, margin, y);
      y += 5;
      for (var j = 0; j < receipt.items.length; j++) {
        var item = receipt.items[j];
        var itemName = item.name || item.itemName || '品目不明';
        var itemPrice = item.price || item.amount || 0;
        var itemQty = item.quantity || 1;
        var itemText = '  ' + itemName;
        if (itemQty > 1) {
          itemText += ' x' + itemQty;
        }
        itemText += '  ¥' + Number(itemPrice).toLocaleString();
        doc.text(itemText, margin, y);
        y += 5;
      }
    }

    // 合計金額
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    var total = receipt.total || receipt.totalAmount || receipt.amount || 0;
    if (typeof total === 'string') {
      total = Number(total.replace(/[¥￥,，]/g, '')) || 0;
    }
    var totalLabel = fontLoaded
      ? '合計: ¥' + Number(total).toLocaleString()
      : 'Total: ¥' + Number(total).toLocaleString();
    doc.text(totalLabel, margin, y);
    y += 8;

    // レシート画像（アスペクト比維持 + 重複防止）
    if (willAttachImage) {
      var imgData = imageDataList[i];
      var imgKey2 = imgData.substring(0, 100);
      try {
        var imgDims = await getImageDimensions(imgData);
        var maxW = contentWidth * 0.55;
        var maxH = 100;
        var ratio = imgDims.width / imgDims.height;
        var imgWidth, imgHeight;
        if (ratio >= 1) {
          imgWidth = Math.min(maxW, contentWidth * 0.7);
          imgHeight = imgWidth / ratio;
          if (imgHeight > maxH) { imgHeight = maxH; imgWidth = imgHeight * ratio; }
        } else {
          imgHeight = Math.min(maxH, 90);
          imgWidth = imgHeight * ratio;
          if (imgWidth > maxW) { imgWidth = maxW; imgHeight = imgWidth / ratio; }
        }
        // 画像がページに収まらない場合は改ページ
        if (y + imgHeight + 10 > pageHeight - 15) {
          doc.addPage();
          y = margin;
          if (fontLoaded) { doc.setFont('NotoSansJP'); }
        }
        doc.addImage(imgData, 'JPEG', margin, y, imgWidth, imgHeight);
        y += imgHeight + 5;
        attachedImages[imgKey2] = true; // 添付済みとして記録
      } catch (e) {
        console.warn('画像追加エラー:', e);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        var imgErrMsg = fontLoaded ? '（画像を追加できませんでした）' : '(Image error)';
        doc.text(imgErrMsg, margin, y);
        y += 6;
      }
    }

    // レシート間の区切り線
    if (i < receiptDataList.length - 1) {
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
    }
  }

  // フッター（生成日時）
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  var now = new Date();
  var footerText = fontLoaded
    ? '生成: ' + now.toLocaleString('ja-JP')
    : 'Generated: ' + now.toISOString();
  doc.text(footerText, margin, pageHeight - 10);

  // PDF出力（Base64）
  var pdfBase64 = doc.output('datauristring').split(',')[1];
  return pdfBase64;
}

// === メインフロー: AI結果→日付別グループ→PDF生成→IDB保存 ===
async function generateAndSaveReceiptPdfs() {
  try {
    // AI解析結果を取得
    var aiResults = null;
    if (typeof getLastAiResults === 'function') {
      aiResults = getLastAiResults();
    }
    if (!aiResults || !aiResults.receipts || aiResults.receipts.length === 0) {
      alert('AI解析結果がありません。先にレシートを読み取ってください。');
      return;
    }

    // 画像データ取得（単枚 or 複数選択対応）v0.97fix5
    var allImages = [];
    if (typeof multiImageDataUrls !== 'undefined' && multiImageDataUrls.length > 0) {
      allImages = multiImageDataUrls.slice();
    } else if (typeof receiptImageData !== 'undefined' && receiptImageData) {
      allImages = [receiptImageData];
    }

    // v1.8: Canvas画像処理による複数レシート個別切り出し
    // 画像が1枚で複数レシートがある場合、白い紙を自動検出して切り出し
    var receipts = aiResults.receipts;
    var perReceiptImages = [];
    if (allImages.length === 1 && receipts.length > 1 && typeof detectAndCropMultipleReceipts === 'function') {
      // 1枚の写真に複数レシート → Canvas自動検出で個別切り出し
      console.log('[receipt-pdf] v1.8: Canvas自動検出で' + receipts.length + '枚を切り出し');
      perReceiptImages = await detectAndCropMultipleReceipts(allImages[0], receipts.length, { padding: 15, maxWidth: 700, quality: 0.8 });
    } else {
      // 画像数≧レシート数 or 切り出し不要 → 従来通りの割り当て
      for (var ri = 0; ri < receipts.length; ri++) {
        var imgIdx = Math.min(ri, allImages.length - 1);
        perReceiptImages.push(allImages.length > 0 ? allImages[imgIdx] : null);
      }
    }

    // 日付別にグループ化
    var dateGroups = {};
    for (var i = 0; i < receipts.length; i++) {
      var r = receipts[i];
      var dateKey = r.date || new Date().toISOString().split('T')[0];
      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = { receipts: [], images: [] };
      }
      dateGroups[dateKey].receipts.push(r);
      dateGroups[dateKey].images.push(perReceiptImages[i] || null);
    }

    // 日付ごとにPDF生成・保存
    var savedCount = 0;
    var dateKeys = Object.keys(dateGroups);
    for (var d = 0; d < dateKeys.length; d++) {
      var dk = dateKeys[d];
      var group = dateGroups[dk];
      var totalAmount = 0;
      for (var r2 = 0; r2 < group.receipts.length; r2++) {
        totalAmount += Number(group.receipts[r2].total || group.receipts[r2].totalAmount || 0);
      }

      // PDF生成
      var pdfBase64 = await generateReceiptPdf(dk, group.receipts, group.images);

      // IndexedDB保存
      await saveReceiptPdf(dk, pdfBase64, group.receipts.length, totalAmount);

      savedCount++;
    }

    alert('PDF生成完了！' + savedCount + '日分のPDFを保存しました');
    console.log('PDF生成完了: ' + savedCount + '日分');

    // Phase1.6: レシート個別管理に保存（v1.8: 切り出し済み画像＋元画像を渡す）
    if (typeof saveReceiptsFromAi === 'function') {
      try {
        // v1.8: 元画像を1枚渡す（複数レシートが1枚に写っている場合の再切り出し用）
        var origImg = allImages.length === 1 ? allImages[0] : null;
        var savedIds = await saveReceiptsFromAi(aiResults, perReceiptImages, origImg);
        console.log('レシート個別保存完了: ' + savedIds.length + '件');
      } catch (storeErr) {
        console.warn('レシート個別保存に失敗（PDF保存は成功）:', storeErr);
      }
    }

  } catch (e) {
    console.error('PDF生成エラー:', e);
    alert('PDF生成に失敗しました: ' + e.message);
  }
}

// === IndexedDB CRUD ===

// PDF保存
async function saveReceiptPdf(dateKey, pdfBase64, receiptCount, totalAmount) {
  var db = await openReceiptPdfDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipt_pdfs', 'readwrite');
    var store = tx.objectStore('receipt_pdfs');
    var record = {
      date: dateKey,
      pdf_data: pdfBase64,
      receipt_count: receiptCount,
      total_amount: totalAmount,
      updated_at: new Date().toISOString()
    };
    var request = store.put(record);
    request.onsuccess = function() { resolve(); };
    request.onerror = function(e) { reject(e.target.error); };
  });
}

// v1.8: 旧saveReceiptData()はfix7で廃止済み。receipt-store.jsのsaveReceiptsFromAi()に一本化

// PDF取得
async function getReceiptPdf(dateKey) {
  var db = await openReceiptPdfDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipt_pdfs', 'readonly');
    var store = tx.objectStore('receipt_pdfs');
    var request = store.get(dateKey);
    request.onsuccess = function(e) { resolve(e.target.result || null); };
    request.onerror = function(e) { reject(e.target.error); };
  });
}

// PDF一覧取得（軽量: pdf_data除く）
async function listReceiptPdfs() {
  var db = await openReceiptPdfDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipt_pdfs', 'readonly');
    var store = tx.objectStore('receipt_pdfs');
    var request = store.getAll();
    request.onsuccess = function(e) {
      var results = e.target.result || [];
      // 軽量化: pdf_dataを除いて返す
      var lightResults = results.map(function(r) {
        return {
          date: r.date,
          receipt_count: r.receipt_count,
          total_amount: r.total_amount,
          updated_at: r.updated_at
        };
      });
      resolve(lightResults);
    };
    request.onerror = function(e) { reject(e.target.error); };
  });
}

// PDF削除
async function deleteReceiptPdf(dateKey) {
  var db = await openReceiptPdfDb();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('receipt_pdfs', 'readwrite');
    var store = tx.objectStore('receipt_pdfs');
    var request = store.delete(dateKey);
    request.onsuccess = function() { resolve(); };
    request.onerror = function(e) { reject(e.target.error); };
  });
}

// === PDF閲覧（v0.97: ダウンロード方式） ===
async function viewReceiptPdf(dateKey) {
  try {
    var record = await getReceiptPdf(dateKey);
    if (!record || !record.pdf_data) {
      alert('PDFが見つかりません: ' + dateKey);
      return;
    }

    // Base64 → Uint8Array → Blob変換
    var byteChars = atob(record.pdf_data);
    var byteNumbers = new Array(byteChars.length);
    for (var i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    var byteArray = new Uint8Array(byteNumbers);
    var blob = new Blob([byteArray], { type: 'application/pdf' });

    // Blob URLでダウンロード
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'receipt_' + dateKey + '.pdf';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // クリーンアップ
    setTimeout(function() {
      if (a.parentNode) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    }, 1500);

    console.log('PDF ダウンロード開始: receipt_' + dateKey + '.pdf');

  } catch (e) {
    console.error('PDF閲覧エラー:', e);
    alert('PDF表示に失敗しました: ' + e.message);
  }
}

// === 画像サイズ取得ヘルパー（アスペクト比計算用） v0.97 ===
function getImageDimensions(imgSrc) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = function() {
      // 取得失敗時はデフォルト値（3:4縦長）
      console.warn('画像サイズ取得失敗。デフォルト3:4を使用');
      resolve({ width: 3, height: 4 });
    };
    img.src = imgSrc;
  });
}
