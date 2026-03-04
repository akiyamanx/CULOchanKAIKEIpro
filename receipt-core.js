// receipt-core.js
// このファイルはレシートAI解析のメイン制御を担当する
// v6.0: Phase3 AIフル解析方式対応（ReceiptAI.analyzeReceipts使用）
// 旧analyzeReceiptWithGemini廃止、OpenCV/box_2d方式を完全撤廃
// 依存: globals.js, receipt-ai.js, receipt-store.js

'use strict';

// v6.0: 最後のAI解析結果を保持（PDF生成等で使う）
let _lastAiReceiptResults = null;

// ==========================================
// AI解析メイン関数
// ==========================================

// v6.0: runAiOcr - Phase3方式に全面書き換え
async function runAiOcr() {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const apiKey = settings.geminiApiKey;

  if (!apiKey) {
    alert('Gemini APIキーが設定されていません。\n設定画面からAPIキーを入力してください。');
    return;
  }

  // v6.0: 画像ファイルを取得（File オブジェクトとして扱う）
  let imageFile = null;
  let imageCount = 1;

  // 複数画像の場合はマージしてから送る（既存のmergeImages互換）
  if (typeof multiImageFiles !== 'undefined' && multiImageFiles && multiImageFiles.length > 1) {
    // v6.0: 複数画像→Canvas合成→Blobに変換
    showAiLoading('複数画像を結合中... (' + multiImageFiles.length + '枚)');
    try {
      imageFile = await mergeImagesToFile(multiImageFiles);
      imageCount = multiImageFiles.length;
    } catch (e) {
      hideAiLoading();
      alert('画像の結合に失敗しました: ' + e.message);
      return;
    }
  } else if (typeof multiImageDataUrls !== 'undefined' && multiImageDataUrls && multiImageDataUrls.length > 1) {
    // v6.0: 旧方式dataUrl配列との互換
    showAiLoading('複数画像を結合中... (' + multiImageDataUrls.length + '枚)');
    try {
      const mergedDataUrl = await mergeImages(multiImageDataUrls);
      imageFile = dataUrlToFile(mergedDataUrl, 'merged.jpg');
      imageCount = multiImageDataUrls.length;
    } catch (e) {
      hideAiLoading();
      alert('画像の結合に失敗しました: ' + e.message);
      return;
    }
  } else if (typeof receiptImageFile !== 'undefined' && receiptImageFile) {
    // v6.0: Fileオブジェクト直接使用
    imageFile = receiptImageFile;
  } else if (typeof receiptImageData !== 'undefined' && receiptImageData) {
    // v6.0: dataUrlからFileに変換（旧方式互換）
    imageFile = dataUrlToFile(receiptImageData, 'receipt.jpg');
  } else {
    alert('画像が選択されていません');
    return;
  }

  showAiLoading('AI解析中... (' + imageCount + '枚)');

  try {
    // v6.0: ReceiptAI.analyzeReceipts を使用（receipt-ai.js）
    const result = await ReceiptAI.analyzeReceipts(imageFile, apiKey);

    if (result.success && result.receipts && result.receipts.length > 0) {
      // v6.0: 旧形式に変換して互換性を維持
      const legacyData = convertToLegacyFormat(result);
      _lastAiReceiptResults = legacyData;

      applyAiResult(legacyData);
      hideAiLoading();

      // v6.0: デバッグalert（店名と枚数表示）
      const rCount = result.receipts.length;
      const storeList = result.receipts.map(function(r, i) {
        return (i + 1) + '.' + (r.store_name || '?').substring(0, 5) + '✅';
      }).join(' ');
      alert('✅ ' + rCount + '枚/' + result.receipts.reduce(function(s, r) {
        return s + (r.total_amount ? 1 : 0);
      }, 0) + '品目\n' + storeList);

    } else if (result.success) {
      hideAiLoading();
      alert('レシートが検出されませんでした。\n' + (result.notes || ''));
    } else {
      hideAiLoading();
      alert('AI解析に失敗しました:\n' + result.error);
    }
  } catch (e) {
    hideAiLoading();
    console.error('AI解析エラー:', e);
    alert('AI解析中にエラーが発生しました:\n' + e.message);
  }
}

// ==========================================
// v6.0: 新形式→旧形式変換（applyAiResultとの互換）
// ==========================================
function convertToLegacyFormat(result) {
  // v6.0: ReceiptAI.analyzeReceiptsの出力を旧形式に変換
  // 旧: { receipts: [{store, date, items, is_parking, ...}] }
  // 新: { receipts: [{store_name, date, total_amount, category, is_parking, ...}] }
  const legacyReceipts = result.receipts.map(function(r) {
    return {
      store: r.store_name || '不明',
      date: r.date || '',
      total: r.total_amount || 0,
      tax: r.tax_amount || 0,
      is_parking: r.is_parking || false,
      category: r.category || 'その他',
      confidence: r.confidence || 'medium',
      items_summary: r.items_summary || '',
      // v6.0: 切り抜き画像なし（元画像のまま）
      croppedImage: null,
      // v6.0: 旧形式のitemsは空（品目詳細は別途実装予定）
      items: r.items_summary ? [{
        name: r.items_summary,
        qty: 1,
        price: r.total_amount || 0
      }] : []
    };
  });

  return {
    receipts: legacyReceipts,
    // v6.0: 単一レシート互換用
    store: legacyReceipts.length === 1 ? legacyReceipts[0].store : null,
    date: legacyReceipts.length === 1 ? legacyReceipts[0].date : null,
    total: legacyReceipts.length === 1 ? legacyReceipts[0].total : null,
    items: legacyReceipts.length === 1 ? legacyReceipts[0].items : [],
    is_parking: legacyReceipts.some(function(r) { return r.is_parking; })
  };
}

// ==========================================
// v6.0: dataURLをFileオブジェクトに変換
// ==========================================
function dataUrlToFile(dataUrl, filename) {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

// ==========================================
// v6.0: 複数FileオブジェクトをCanvas合成してFile化
// ==========================================
async function mergeImagesToFile(files) {
  const dataUrls = await Promise.all(Array.from(files).map(function(f) {
    return new Promise(function(res, rej) {
      const reader = new FileReader();
      reader.onload = function(e) { res(e.target.result); };
      reader.onerror = rej;
      reader.readAsDataURL(f);
    });
  }));
  const mergedDataUrl = await mergeImages(dataUrls);
  return dataUrlToFile(mergedDataUrl, 'merged_receipts.jpg');
}

// ==========================================
// v6.0: 最後のAI結果を取得（PDF等から呼ばれる）
// ==========================================
function getLastAiReceiptResults() {
  return _lastAiReceiptResults;
}

// ==========================================
// v6.0: 後方互換ラッパー（旧analyzeReceiptWithGeminiを呼んでる箇所がある場合）
// ==========================================
async function analyzeReceiptWithGemini(imageData, apiKey) {
  // v6.0: 旧関数名を維持しつつ内部でReceiptAIを使う
  console.warn('[v6.0] analyzeReceiptWithGeminiは非推奨。ReceiptAI.analyzeReceiptsを使用。');
  const imageFile = dataUrlToFile(imageData, 'receipt.jpg');
  const result = await ReceiptAI.analyzeReceipts(imageFile, apiKey);

  if (result.success) {
    return {
      success: true,
      data: convertToLegacyFormat(result)
    };
  } else {
    return {
      success: false,
      error: result.error
    };
  }
}

// ==========================================
// グローバルエクスポート
// ==========================================
if (typeof window !== 'undefined') {
  window.runAiOcr = runAiOcr;
  window.analyzeReceiptWithGemini = analyzeReceiptWithGemini;
  window.getLastAiReceiptResults = getLastAiReceiptResults;
  window.dataUrlToFile = dataUrlToFile;
}
