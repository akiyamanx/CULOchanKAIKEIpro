// ==========================================
// レシートAI解析機能
// Reform App Pro v0.95
// ==========================================
// このファイルはGemini APIを使用してレシート画像を
// AI解析し、品目データを自動抽出する機能を提供する
//
// v0.95新規作成:
//   - OCR機能を廃止し、AI解析に一本化
//   - 複数枚一括解析対応
//   - 品名マスターとの自動マッチング
//
// 依存ファイル:
//   - globals.js (receiptItems, receiptImageData, multiImageDataUrls, productMaster)
//   - receipt-core.js (renderReceiptItems, updateReceiptTotal, mergeImages)
// ==========================================


// ==========================================
// AI解析メイン関数
// ==========================================

/**
 * AIでレシートを読み取る（メインエントリポイント）
 * receipt.htmlのボタンから呼ばれる
 */
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
    // 複数枚モード: 画像を結合
    showAiLoading(`複数画像を結合中... (${multiImageDataUrls.length}枚)`);
    try {
      imageToAnalyze = await mergeImages(multiImageDataUrls);
      imageCount = multiImageDataUrls.length;
    } catch (e) {
      hideAiLoading();
      alert('画像の結合に失敗しました: ' + e.message);
      return;
    }
  } else if (receiptImageData) {
    // 単一画像モード
    imageToAnalyze = receiptImageData;
  } else {
    alert('画像が選択されていません');
    return;
  }
  
  showAiLoading(`AI解析中... (${imageCount}枚)`);
  
  try {
    const result = await analyzeReceiptWithGemini(imageToAnalyze, apiKey);
    
    if (result.success) {
      applyAiResult(result.data);
      hideAiLoading();
      
      const itemCount = result.data.items ? result.data.items.length : 0;
      alert(`✅ AI解析完了！\n${itemCount}件の品目を検出しました。`);
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

/**
 * Gemini APIでレシート画像を解析
 * @param {string} imageData - base64画像データ
 * @param {string} apiKey - Gemini APIキー
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function analyzeReceiptWithGemini(imageData, apiKey) {
  // base64のプレフィックスを除去
  const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
  
  // 画像のMIMEタイプを取得
  const mimeMatch = imageData.match(/^data:(image\/[a-z]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  
  // Gemini API エンドポイント（gemini-2.0-flash）// v0.95修正 - 1.5-flash廃止対応
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  // プロンプト（日本語レシート解析用）
  const prompt = `このレシート画像を解析して、以下の情報をJSON形式で抽出してください。

【抽出する情報】
1. storeName: 店名（ホームセンター名など）
2. date: 購入日（YYYY-MM-DD形式、わからなければ空文字）
3. items: 品目リスト（配列）
   - name: 品名（商品名）
   - quantity: 数量（デフォルト1、数量が明記されていなければ1）
   - price: 単価（税込み金額、円単位の数値のみ）

【注意事項】
- 複数のレシートが結合されている場合は、すべてのレシートから品目を抽出してください
- 店名が複数ある場合は最初の店名を使用してください
- 値引きや割引は別の品目として記録してください（マイナスの金額で）
- 小計・合計・消費税の行は品目に含めないでください
- 読み取れない文字は推測して補完してください
- JSONのみを出力し、説明文は不要です

【出力形式】
{
  "storeName": "〇〇ホームセンター",
  "date": "2025-02-05",
  "items": [
    {"name": "品名1", "quantity": 1, "price": 100},
    {"name": "品名2", "quantity": 2, "price": 200}
  ]
}`;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        }
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
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      return {
        success: false,
        error: `API Error: ${response.status} - ${response.statusText}`
      };
    }

    const data = await response.json();
    
    // レスポンスからテキストを抽出
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      return {
        success: false,
        error: 'AIからの応答が空でした'
      };
    }

    // JSONを抽出してパース
    const parsedData = parseGeminiResponse(text);
    
    if (parsedData) {
      return {
        success: true,
        data: parsedData
      };
    } else {
      return {
        success: false,
        error: 'AI応答のJSON解析に失敗しました'
      };
    }

  } catch (e) {
    console.error('Gemini API呼び出しエラー:', e);
    return {
      success: false,
      error: e.message
    };
  }
}


/**
 * Geminiの応答テキストからJSONを抽出してパース
 * @param {string} text - Geminiの応答テキスト
 * @returns {object|null} パースされたJSONオブジェクト
 */
function parseGeminiResponse(text) {
  // まずそのままパースを試みる
  try {
    return JSON.parse(text);
  } catch (e) {
    // 失敗した場合、JSONブロックを探す
  }
  
  // ```json ... ``` ブロックを探す
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1]);
    } catch (e) {
      console.error('JSONブロックのパースに失敗:', e);
    }
  }
  
  // { ... } を探す
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('JSON抽出のパースに失敗:', e);
    }
  }
  
  return null;
}


// ==========================================
// AI解析結果の適用
// ==========================================

/**
 * AI解析結果を画面に反映
 * @param {object} data - 解析結果 {storeName, date, items[]}
 */
function applyAiResult(data) {
  // 店名を反映
  if (data.storeName) {
    document.getElementById('receiptStoreName').value = data.storeName;
  }
  
  // 日付を反映
  if (data.date && isValidDate(data.date)) {
    document.getElementById('receiptDate').value = data.date;
  }
  
  // 品目を反映
  if (data.items && Array.isArray(data.items) && data.items.length > 0) {
    // 既存の品目をクリア（空の品目のみ残す場合はコメントアウト）
    receiptItems = [];
    
    data.items.forEach(item => {
      const newItem = {
        id: Date.now() + Math.random(),
        name: item.name || '',
        quantity: parseInt(item.quantity) || 1,
        price: parseInt(item.price) || 0,
        type: 'material',
        category: '',
        checked: false,
        projectName: '',
        originalName: item.name || '' // マッチング用に元の名前を保持
      };
      
      // 品名マスターとマッチング
      const matched = matchWithProductMaster(item.name);
      if (matched) {
        newItem.name = matched.productName;
        newItem.category = matched.category || 'material';
        newItem.matched = true;
        if (matched.defaultPrice && newItem.price === 0) {
          newItem.price = matched.defaultPrice;
        }
      } else {
        // マッチしなかった場合はデフォルトカテゴリ
        newItem.category = categories.material.length > 0 ? categories.material[0].value : '';
        newItem.matched = false;
      }
      
      receiptItems.push(newItem);
    });
    
    renderReceiptItems();
    updateReceiptTotal();
  }
}


/**
 * 品名マスターとマッチング
 * @param {string} name - 品名
 * @returns {object|null} マッチした品名マスターエントリ
 */
function matchWithProductMaster(name) {
  if (!name || !productMaster || productMaster.length === 0) return null;
  
  const normalizedName = name.toLowerCase().replace(/\s+/g, '');
  
  for (const entry of productMaster) {
    // キーワードマッチ
    if (entry.keywords && Array.isArray(entry.keywords)) {
      for (const keyword of entry.keywords) {
        if (normalizedName.includes(keyword.toLowerCase())) {
          return entry;
        }
      }
    }
    
    // 品名の部分一致
    if (entry.productName) {
      const normalizedProduct = entry.productName.toLowerCase().replace(/\s+/g, '');
      if (normalizedName.includes(normalizedProduct) || normalizedProduct.includes(normalizedName)) {
        return entry;
      }
    }
  }
  
  return null;
}


/**
 * 日付文字列が有効かチェック
 * @param {string} dateStr - YYYY-MM-DD形式の日付文字列
 * @returns {boolean}
 */
function isValidDate(dateStr) {
  if (!dateStr) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}


// ==========================================
// ローディング表示
// ==========================================

/**
 * AI解析ローディング画面を表示
 * @param {string} message - 表示メッセージ
 */
function showAiLoading(message) {
  const loading = document.getElementById('ocrLoading');
  const progress = document.getElementById('ocrProgress');
  
  if (loading) {
    loading.classList.remove('hidden');
    loading.style.display = 'flex';
  }
  if (progress) {
    progress.textContent = message || 'AI解析中...';
  }
}

/**
 * AI解析ローディング画面を非表示
 */
function hideAiLoading() {
  const loading = document.getElementById('ocrLoading');
  if (loading) {
    loading.classList.add('hidden');
    loading.style.display = 'none';
  }
}


// ==========================================
// グローバル公開（互換性のため）
// ==========================================
window.runAiOcr = runAiOcr;
window.showAiLoading = showAiLoading;
window.hideAiLoading = hideAiLoading;
