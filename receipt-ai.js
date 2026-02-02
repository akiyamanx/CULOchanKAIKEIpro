// ==========================================
// レシート読込 - AI機能
// Reform App Pro v0.91
// ==========================================
// Gemini API を使用したAI読み取り機能
// 
// 依存ファイル:
//   - globals.js (receiptItems, receiptImageData, multiImageDataUrls, categories, productMaster)
//   - receipt-core.js (renderReceiptItems, updateReceiptTotal, mergeImages)
// ==========================================


// ==========================================
// Gemini API テスト
// ==========================================
async function testGeminiApi() {
  const apiKey = document.getElementById('geminiApiKey').value;
  if (!apiKey) {
    alert('APIキーを入力してください');
    return;
  }
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say "OK" if you can read this.' }] }]
      })
    });
    
    if (response.ok) {
      alert('✅ 接続成功！\nGemini APIが使えます！');
    } else {
      const error = await response.json();
      alert('❌ 接続失敗\n' + (error.error?.message || 'APIキーを確認してください'));
    }
  } catch (e) {
    alert('❌ 接続エラー\n' + e.message);
  }
}


// ==========================================
// AI OCR（Gemini）
// ==========================================
async function runAiOcr() {
  // 複数画像が選択されているか確認
  let imageDataToUse = receiptImageData;
  
  if (multiImageDataUrls.length > 1) {
    // 複数画像を結合
    const loading = document.getElementById('ocrLoading');
    const progress = document.getElementById('ocrProgress');
    loading.classList.remove('hidden');
    progress.textContent = '画像を結合中...';
    
    try {
      imageDataToUse = await mergeImages(multiImageDataUrls);
      receiptImageData = imageDataToUse; // 結合画像を保存
    } catch (error) {
      console.error('画像結合エラー:', error);
      loading.classList.add('hidden');
      alert('❌ 画像の結合に失敗しました');
      return;
    }
  }
  
  if (!imageDataToUse) {
    alert('先に画像を選択してください');
    return;
  }
  
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const apiKey = settings.geminiApiKey;
  
  if (!apiKey) {
    alert('設定画面でGemini APIキーを入力してください');
    return;
  }
  
  const loading = document.getElementById('ocrLoading');
  const progress = document.getElementById('ocrProgress');
  loading.classList.remove('hidden');
  progress.textContent = 'AIが画像を解析中...';
  
  try {
    // 画像のbase64部分を抽出
    const base64Image = imageDataToUse.split(',')[1];
    const mimeType = imageDataToUse.split(';')[0].split(':')[1];
    
    const prompt = `このレシートまたは商品ページの画像を読み取って、以下のJSON形式で返してください。
必ず有効なJSONのみを返してください。説明文は不要です。

{
  "storeName": "店名またはサイト名",
  "date": "YYYY-MM-DD形式の日付（わからなければ空文字）",
  "items": [
{
  "name": "商品名",
  "quantity": 数量（数字）,
  "price": 金額（数字、合計金額ではなく単価×数量の金額）
}
  ],
  "total": 合計金額（数字）
}

注意：
- 商品名は正確に読み取ってください
- 数量が書いていない場合は1としてください
- 金額は数字のみ（カンマや円マークは除く）
- 小計、消費税、合計などの行は items に含めないでください
- 複数の画像が結合されている場合は、全体を1つのレシート/注文として読み取ってください
- 読み取れない部分は推測せず、読み取れた部分のみ返してください`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API呼び出しに失敗しました');
    }
    
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log('Gemini応答:', text); // デバッグ用
    
    // JSONを抽出（```json ... ``` で囲まれている場合も対応）
    let jsonStr = text;
    const jsonMatch = text.match(/```json?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // JSONをパース
    const data = JSON.parse(jsonStr.trim());
    
    // 結果を反映
    applyAiResult(data);
    
    const imageCount = multiImageDataUrls.length > 1 ? `（${multiImageDataUrls.length}枚結合）` : '';
    alert(`✅ AI読み取り完了！${imageCount}\n結果を確認・修正してください。`);
    
  } catch (error) {
    console.error('AI OCR Error:', error);
    alert('❌ AI読み取りに失敗しました\n' + error.message + '\n\n従来のOCRを試すか、手動で入力してください。');
  } finally {
    loading.classList.add('hidden');
  }
}


// ==========================================
// AI結果を画面に反映
// ==========================================
function applyAiResult(data) {
  // 店名を反映
  if (data.storeName) {
    document.getElementById('receiptStoreName').value = data.storeName;
  }
  
  // 日付を反映
  if (data.date) {
    document.getElementById('receiptDate').value = data.date;
  }
  
  // 品目を反映
  if (data.items && data.items.length > 0) {
    receiptItems = data.items.map((item, index) => {
      // 品名マスターと照合
      const matchedProduct = findMatchingProduct(item.name);
      
      return {
        id: Date.now() + index,
        name: matchedProduct ? matchedProduct.officialName : item.name,
        originalName: item.name,
        matched: !!matchedProduct,
        matchedProduct: matchedProduct,
        quantity: item.quantity || 1,
        price: item.price || 0,
        type: matchedProduct ? 
              (categories.expense.find(c => c.value === matchedProduct.category) ? 'expense' : 'material') 
              : 'material',
        category: matchedProduct ? matchedProduct.category : 'other_material'
      };
    });
    
    renderReceiptItems();
    updateReceiptTotal();
  }
}
