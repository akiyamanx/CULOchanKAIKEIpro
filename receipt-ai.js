// レシートAI解析機能 — Reform App Pro v0.96
// Gemini APIでレシート画像をAI解析し品目データを自動抽出
// v0.96: レシート分離認識・種別自動判定 / v1.8: bounds / v2.0: corners（ハイブリッド）
// 依存: globals.js, receipt-core.js


// ==========================================
// v0.96: 最後の解析結果を保持（PDF生成等で使う）
// ==========================================
let _lastAiReceiptResults = null;


// ==========================================
// AI解析メイン関数
// ==========================================

async function runAiOcr() {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const apiKey = settings.geminiApiKey;

  if (!apiKey) {
    alert('Gemini APIキーが設定されていません。\n設定画面からAPIキーを入力してください。');
    return;
  }

  // 解析する画像を準備
  let imageToAnalyze = null;
  let imageCount = 1;

  if (multiImageDataUrls && multiImageDataUrls.length > 1) {
    showAiLoading('複数画像を結合中... (' + multiImageDataUrls.length + '枚)');
    try {
      imageToAnalyze = await mergeImages(multiImageDataUrls);
      imageCount = multiImageDataUrls.length;
    } catch (e) {
      hideAiLoading();
      alert('画像の結合に失敗しました: ' + e.message);
      return;
    }
  } else if (receiptImageData) {
    imageToAnalyze = receiptImageData;
  } else {
    alert('画像が選択されていません');
    return;
  }

  showAiLoading('AI解析中... (' + imageCount + '枚)');

  try {
    const result = await analyzeReceiptWithGemini(imageToAnalyze, apiKey);

    if (result.success) {
      // v0.96: 結果を保持
      _lastAiReceiptResults = result.data;

      applyAiResult(result.data);
      hideAiLoading();

      // v0.96: レシート枚数と品目数を表示
      var rCount = 0;
      var iCount = 0;
      if (result.data.receipts && result.data.receipts.length > 0) {
        rCount = result.data.receipts.length;
        iCount = result.data.receipts.reduce(function(s, r) {
          return s + (r.items ? r.items.length : 0);
        }, 0);
        var ci = result.data.receipts.map(function(r, i) {
          return (i+1) + '.' + (r.store||'?').substring(0,6) + (r.corners ? '✅' : '❌');
        }).join(' ');
        // v3.0デバッグ: 座標系の確認（1枚目と2枚目のcorners値を表示）
        var coordInfo = '';
        for (var di = 0; di < Math.min(3, result.data.receipts.length); di++) {
          var dr = result.data.receipts[di];
          if (dr.corners) {
            coordInfo += '\nR' + (di+1) + ' ' + (dr.store||'?').substring(0,6) + ': ' + JSON.stringify(dr.corners);
          }
        }
        // 画像サイズも表示
        var imgSize = '';
        if (result.data.image_width) imgSize = '\nimg: ' + result.data.image_width + 'x' + result.data.image_height;
        alert('✅ AI解析完了！\n' + rCount + '枚/' + iCount + '品目\n' + ci + imgSize + '\n--- corners座標 ---' + coordInfo);
      } else {
        iCount = result.data.items ? result.data.items.length : 0;
        alert('✅ AI解析完了！\n' + iCount + '件の品目を検出しました。');
      }
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
// Gemini API呼び出し
// ==========================================

async function analyzeReceiptWithGemini(imageData, apiKey) {
  var base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
  var mimeMatch = imageData.match(/^data:(image\/[a-z]+);base64,/);
  var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  // v1.6.3: 分割撮影モード対応プロンプト切替
  var isSplit = (typeof splitMode !== 'undefined' && splitMode === true);
  
  var prompt;
  if (isSplit) {
    // 分割撮影モード: 全ての写真を1枚のレシートとして統合
    prompt = 'これらの画像は全て「同一の1枚のレシート」を分割して撮影したものです。\n'
      + '上下や複数部分に分けて撮影されていますが、1枚のレシートとして統合して解析してください。\n\n'
      + '【ルール】\n'
      + '- 全ての画像の内容を統合して、1つのレシートとして出力する（receipts配列には1件だけ）\n'
      + '- 品目は全ての画像から集めて1つのリストにまとめる\n'
      + '- 日付・店名・合計金額はどの画像からでも読み取れるものを使う\n'
      + '- 種別を自動判定: 駐車場/コインパーキングなら "parking"、それ以外は "shopping"\n'
      + '- 駐車場レシートは入庫時間と出庫時間も読み取る\n'
      + '- 買い物レシートは品目リスト（品名・数量・単価）を読み取る\n'
      + '- 小計・合計・消費税の行は品目に含めない\n'
      + '- 値引き/割引は別の品目（マイナス金額）として記録\n'
      + '- 読み取れない文字は推測して補完する\n'
      + '- JSONのみを出力し、説明文は不要\n\n';
  } else {
    // 通常モード: 複数レシートを個別認識 + v1.8座標返却
    prompt = 'この画像に写っているレシート/領収書を全て個別に識別して解析してください。\n\n'
      + '【レシートの識別方法】\n'
      + '- レシートは白い紙片。机やテーブルの上に並べて撮影されている\n'
      + '- レシートとレシートの間には背景（机・テーブル・布等）の隙間がある\n'
      + '- 画像が横向きや斜めでもレシートの文字が読める方向で認識する\n'
      + '- 折れ・シワがあっても「領収証」「領収書」等の文字がある紙はレシート\n'
      + '- 長いレシートも短いレシートも1枚は1枚として数える\n\n'
      + '【ルール】\n'
      + '- 画像内にレシートが複数枚ある場合、それぞれ別のオブジェクトとして返す\n'
      + '- ただし同じ駐車場の「駐車証明書」と「領収書」は同一取引なので1つにまとめる（金額は領収書の合計を使う）\n'
      + '- 同じ店名のレシートが複数の写真にまたがって写っている場合（上半分と下半分を別々に撮影など）、それは1枚のレシートとして統合し、品目は全ての写真から集める\n'
      + '- 各レシートの日付・店名・金額を個別に読み取る\n'
      + '- 種別を自動判定: 駐車場/コインパーキングなら "parking"、それ以外は "shopping"\n'
      + '- 駐車場レシートは入庫時間と出庫時間も読み取る\n'
      + '- 買い物レシートは品目リスト（品名・数量・単価）を読み取る\n'
      + '- 小計・合計・消費税の行は品目に含めない\n'
      + '- 値引き/割引は別の品目（マイナス金額）として記録\n'
      + '- 読み取れない文字は推測して補完する\n'
      + '- JSONのみを出力し、説明文は不要\n\n'
      + '【boundsルール（最重要）】\n'
      + '- boundsは画像の左上を(0,0)、右下を(100,100)とした座標系\n'
      + '- x=左端からの距離%, y=上端からの距離%, w=幅%, h=高さ%\n'
      + '- 各boundsはそのレシートの紙だけをタイトに囲む。背景を含めない\n'
      + '- 隣のレシートが絶対に入らないようにする。隙間の中心で区切る\n'
      + '- 画像が横向きや回転していても、画像座標系(左上原点)で指定する\n'
      + '- レシートが1枚でもboundsを必ず返す\n\n'
      + '【cornersルール（透視変換用・最重要）】\n'
      + '- cornersはレシートの紙の四隅のピクセル座標（画像の左上が原点）\n'
      + '- 形式: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] の4点\n'
      + '- 順序: 左上→右上→右下→左下（レシートの文字が正しく読める向きで）\n'
      + '- レシートが斜めでも回転していても、紙の角を正確に指定する\n'
      + '- 座標は画像のピクセル単位（整数）で指定\n'
      + '- レシートが1枚でもcornersを必ず返す\n\n';
  }
  
  prompt += '【出力形式】\n'
    + '{\n'
    + '  "image_width": 1200,\n'
    + '  "image_height": 900,\n'
    + '  "receipts": [\n'
    + '    {\n'
    + '      "date": "2025-11-13",\n'
    + '      "store": "カインズ松戸店",\n'
    + '      "total": 3500,\n'
    + '      "type": "shopping",\n'
    + '      "bounds": {"x": 2, "y": 5, "w": 30, "h": 90},\n'
    + '      "corners": [[24,45],[384,45],[384,855],[24,855]],\n'
    + '      "items": [{"name": "VP管20A", "qty": 2, "price": 800}]\n'
    + '    },\n'
    + '    {\n'
    + '      "date": "2025-11-13",\n'
    + '      "store": "タイムズ代々木",\n'
    + '      "total": 800,\n'
    + '      "type": "parking",\n'
    + '      "bounds": {"x": 70, "y": 10, "w": 28, "h": 55},\n'
    + '      "corners": [[840,90],[1176,90],[1176,585],[840,585]],\n'
    + '      "entry_time": "08:56",\n'
    + '      "exit_time": "10:42",\n'
    + '      "items": []\n'
    + '    }\n'
    + '  ]\n'
    + '}';

  var requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 1,
      maxOutputTokens: 4096
    }
  };

  try {
    var response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      var errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      return { success: false, error: 'API Error: ' + response.status + ' - ' + response.statusText };
    }

    var data = await response.json();
    var text = data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

    if (!text) {
      return { success: false, error: 'AIからの応答が空でした' };
    }

    var parsedData = parseGeminiResponse(text);
    if (parsedData) {
      // v3.0デバッグ: Geminiレスポンス確認
      console.log('[receipt-ai] === Gemini RAW ===\n' + text);
      console.log('[receipt-ai] === パース結果 ===\n' + JSON.stringify(parsedData, null, 2));
      if (parsedData.receipts) { parsedData.receipts.forEach(function(r, i) {
        console.log('[receipt-ai] R' + (i+1) + ': ' + (r.store||'?') + ' corners=' + (r.corners ? JSON.stringify(r.corners) : 'なし'));
      }); }
      // v0.96: 旧形式→新形式に正規化
      parsedData = normalizeAiResponse(parsedData);
      return { success: true, data: parsedData };
    } else {
      return { success: false, error: 'AI応答のJSON解析に失敗しました' };
    }

  } catch (e) {
    console.error('Gemini API呼び出しエラー:', e);
    return { success: false, error: e.message };
  }
}


// ==========================================
// レスポンスパース
// ==========================================

function parseGeminiResponse(text) {
  try { return JSON.parse(text); } catch (e) {}

  var jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try { return JSON.parse(jsonBlockMatch[1]); } catch (e) {
      console.error('JSONブロックのパースに失敗:', e);
    }
  }

  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch (e) {
      console.error('JSON抽出のパースに失敗:', e);
    }
  }
  return null;
}


// ==========================================
// v0.96: レスポンス正規化（後方互換）
// ==========================================

/**
 * 旧形式（{storeName, items[]}）→ 新形式（{receipts[]}）に変換
 * 新形式がすでにあればそのまま返す
 */
function normalizeAiResponse(data) {
  // 新形式チェック
  if (data.receipts && Array.isArray(data.receipts)) {
    return data;
  }

  // 旧形式 → 新形式に変換
  console.log('[receipt-ai] 旧形式レスポンスを新形式に変換');
  var receipt = {
    date: data.date || '',
    store: data.storeName || data.store || '',
    total: 0,
    type: 'shopping',
    items: []
  };

  if (data.items && Array.isArray(data.items)) {
    receipt.items = data.items.map(function(item) {
      return {
        name: item.name || '',
        qty: parseInt(item.qty || item.quantity) || 1,
        price: parseInt(item.price) || 0
      };
    });
    receipt.total = receipt.items.reduce(function(s, i) {
      return s + (i.price * i.qty);
    }, 0);
  }

  return { receipts: [receipt] };
}


// ==========================================
// AI解析結果の適用
// v0.96: 複数レシート対応
// ==========================================

function applyAiResult(data) {
  var receipts = data.receipts || [];

  if (receipts.length === 0) return;

  // 最初のレシートの店名・日付をメイン欄に反映
  var first = receipts[0];
  if (first.store) {
    document.getElementById('receiptStoreName').value = first.store;
  }
  if (first.date && isValidDate(first.date)) {
    document.getElementById('receiptDate').value = first.date;
  }

  // 複数レシートの場合、店名に枚数を付記
  if (receipts.length > 1) {
    var stores = receipts.map(function(r) { return r.store || '不明'; });
    var uniqueStores = stores.filter(function(s, i) { return stores.indexOf(s) === i; });
    if (uniqueStores.length > 1) {
      document.getElementById('receiptStoreName').value =
        uniqueStores.join(' / ');
    }
  }

  // 全レシートの品目を統合して反映
  receiptItems = [];

  receipts.forEach(function(receipt, rIdx) {
    var items = receipt.items || [];

    // 駐車場レシートで品目がない場合、駐車場代として1品目追加
    if (receipt.type === 'parking' && items.length === 0 && receipt.total) {
      items = [{
        name: (receipt.store || '駐車場') + '（駐車場代）',
        qty: 1,
        price: parseInt(receipt.total) || 0
      }];
    }

    items.forEach(function(item) {
      var newItem = {
        id: Date.now() + Math.random(),
        name: item.name || '',
        quantity: parseInt(item.qty || item.quantity) || 1,
        price: parseInt(item.price) || 0,
        type: 'material',
        category: '',
        checked: false,
        projectName: '',
        originalName: item.name || '',
        // v0.96: レシート情報を品目に紐付け
        _receiptIndex: rIdx,
        _receiptDate: receipt.date || '',
        _receiptStore: receipt.store || '',
        _receiptType: receipt.type || 'shopping'
      };

      // 駐車場は経費カテゴリ
      if (receipt.type === 'parking') {
        newItem.type = 'expense';
      }

      // 品名マスターとマッチング
      var matched = matchWithProductMaster(item.name);
      if (matched) {
        newItem.name = matched.productName;
        newItem.category = matched.category || 'material';
        newItem.matched = true;
        if (matched.defaultPrice && newItem.price === 0) {
          newItem.price = matched.defaultPrice;
        }
      } else {
        if (receipt.type === 'parking') {
          newItem.category = categories.expense && categories.expense.length > 0
            ? categories.expense[0].value : '';
        } else {
          newItem.category = categories.material && categories.material.length > 0
            ? categories.material[0].value : '';
        }
        newItem.matched = false;
      }

      receiptItems.push(newItem);
    });
  });

  renderReceiptItems();
  updateReceiptTotal();
}


// ==========================================
// v0.96: 解析結果のゲッター
// ==========================================

/**
 * 最後のAI解析結果を日付別にグループ化して返す
 * PDF生成時に使う
 */
function getReceiptsByDate() {
  if (!_lastAiReceiptResults || !_lastAiReceiptResults.receipts) return {};

  var grouped = {};
  _lastAiReceiptResults.receipts.forEach(function(r) {
    var dateKey = r.date || 'unknown';
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(r);
  });
  return grouped;
}

/**
 * 最後のAI解析結果をそのまま返す
 */
function getLastAiResults() {
  return _lastAiReceiptResults;
}


// ==========================================
// 品名マスターマッチング（変更なし）
// ==========================================

function matchWithProductMaster(name) {
  if (!name || !productMaster || productMaster.length === 0) return null;
  var normalizedName = name.toLowerCase().replace(/\s+/g, '');

  for (var i = 0; i < productMaster.length; i++) {
    var entry = productMaster[i];
    if (entry.keywords && Array.isArray(entry.keywords)) {
      for (var j = 0; j < entry.keywords.length; j++) {
        if (normalizedName.includes(entry.keywords[j].toLowerCase())) {
          return entry;
        }
      }
    }
    if (entry.productName) {
      var np = entry.productName.toLowerCase().replace(/\s+/g, '');
      if (normalizedName.includes(np) || np.includes(normalizedName)) {
        return entry;
      }
    }
  }
  return null;
}


// ==========================================
// ユーティリティ
// ==========================================

function isValidDate(dateStr) {
  if (!dateStr) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return !isNaN(new Date(dateStr).getTime());
}


// ==========================================
// ローディング表示
// ==========================================

function showAiLoading(message) {
  var loading = document.getElementById('ocrLoading');
  var progress = document.getElementById('ocrProgress');
  if (loading) { loading.classList.remove('hidden'); loading.style.display = 'flex'; }
  if (progress) { progress.textContent = message || 'AI解析中...'; }
}

function hideAiLoading() {
  var loading = document.getElementById('ocrLoading');
  if (loading) { loading.classList.add('hidden'); loading.style.display = 'none'; }
}


// ==========================================
// グローバル公開
// ==========================================
window.runAiOcr = runAiOcr;
window.showAiLoading = showAiLoading;
window.hideAiLoading = hideAiLoading;
window.getReceiptsByDate = getReceiptsByDate;
window.getLastAiResults = getLastAiResults;
window._lastAiReceiptResults = null;
