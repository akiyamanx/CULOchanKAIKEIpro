// ==========================================
// receipt-ai-patch.js v1.0
// 枠指定モード用：1枚ずつ個別Gemini解析
// receipt-ai.js の runAiOcr() を上書きする
// v1.0: multiImageDataUrls を1枚ずつ解析→結果統合
// ==========================================

// runAiOcr を上書き
window.runAiOcr = async function runAiOcr() {
  var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  var apiKey = settings.geminiApiKey;

  if (!apiKey) {
    alert('Gemini APIキーが設定されていません。\n設定画面からAPIキーを入力してください。');
    return;
  }

  // 枠指定モード: multiImageDataUrlsに個別切り出し画像が入っている
  // → 1枚ずつ解析して結果を統合
  if (multiImageDataUrls && multiImageDataUrls.length > 0) {
    await _runAiOcrMulti(multiImageDataUrls, apiKey);
    return;
  }

  // 通常モード: 単一画像
  if (!receiptImageData) {
    alert('画像が選択されていません');
    return;
  }

  showAiLoading('AI解析中...');
  try {
    var result = await analyzeReceiptWithGemini(receiptImageData, apiKey);
    if (result.success) {
      window._lastAiReceiptResults = result.data;
      applyAiResult(result.data);
      hideAiLoading();
      var iCount = result.data.receipts
        ? result.data.receipts.reduce(function(s,r){ return s+(r.items?r.items.length:0); }, 0)
        : (result.data.items ? result.data.items.length : 0);
      alert('✅ AI解析完了！\n' + iCount + '件の品目を検出しました。');
    } else {
      hideAiLoading();
      alert('AI解析に失敗しました:\n' + result.error);
    }
  } catch(e) {
    hideAiLoading();
    alert('AI解析中にエラーが発生しました:\n' + e.message);
  }
};

// ==========================================
// 複数画像を1枚ずつ個別解析して統合
// ==========================================
async function _runAiOcrMulti(images, apiKey) {
  var total = images.length;
  var allReceipts = [];
  var failCount = 0;

  for (var i = 0; i < total; i++) {
    showAiLoading('AI解析中... (' + (i+1) + '/' + total + '枚)');
    try {
      var result = await analyzeReceiptWithGemini(images[i], apiKey);
      if (result.success && result.data.receipts) {
        // 各枚の結果を統合
        result.data.receipts.forEach(function(r) {
          allReceipts.push(r);
        });
        console.log('[receipt-ai-patch] ' + (i+1) + '枚目: '
          + result.data.receipts.length + '件検出');
      } else {
        failCount++;
        console.warn('[receipt-ai-patch] ' + (i+1) + '枚目: 解析失敗');
      }
    } catch(e) {
      failCount++;
      console.warn('[receipt-ai-patch] ' + (i+1) + '枚目エラー:', e);
    }
  }

  hideAiLoading();

  if (allReceipts.length === 0) {
    alert('AI解析に失敗しました。\n全' + total + '枚の解析に失敗しました。');
    return;
  }

  // 統合結果を適用
  var mergedData = { receipts: allReceipts };
  window._lastAiReceiptResults = mergedData;
  applyAiResult(mergedData);

  // 結果表示
  var iCount = allReceipts.reduce(function(s,r){ return s+(r.items?r.items.length:0); }, 0);
  var ci = allReceipts.map(function(r, i) {
    return (i+1) + '.' + (r.store||'?').substring(0,4) + '✅';
  }).join(' ');
  var msg = '✅ ' + allReceipts.length + '枚/' + iCount + '品目\n' + ci;
  if (failCount > 0) msg += '\n⚠️ ' + failCount + '枚は解析失敗';
  alert(msg);
}

console.log('[receipt-ai-patch.js] ✓ v1.0 個別解析モード 読み込み完了');
