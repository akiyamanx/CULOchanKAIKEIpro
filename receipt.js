// ==========================================
// レシート読込・OCR・AI読取
// Reform App Pro v0.91
// ==========================================


async function runOCR() {
  if (!receiptImageData) {
    alert('先に画像を選択してください');
    return;
  }
  
  const loading = document.getElementById('ocrLoading');
  const progress = document.getElementById('ocrProgress');
  loading.classList.remove('hidden');
  
  try {
    // Step 1: 画像の前処理
    progress.textContent = '画像を最適化中...';
    const processedImage = await preprocessImage(receiptImageData);
    
    // 処理後の画像を表示（デバッグ用）
    document.getElementById('processedImage').src = processedImage;
    document.getElementById('processedImagePreview').style.display = 'block';
    
    // Step 2: OCR実行
    progress.textContent = 'OCRエンジンを準備中...';
    
    const result = await Tesseract.recognize(
      processedImage,
      'jpn+eng', // 日本語と英語
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            progress.textContent = `読み取り中... ${Math.round(m.progress * 100)}%`;
          }
        }
      }
    );
    
    progress.textContent = '解析中...';
    
    // テキストを解析
    const lines = result.data.text.split('\n').filter(line => line.trim());
    console.log('OCR結果:', lines); // デバッグ用
    parseOCRResult(lines);
    
    alert('読み取り完了！\n結果を確認・修正してください。\n\n※読み取り精度が低い場合は手動で修正してください。');
    
  } catch (error) {
    console.error('OCR Error:', error);
    alert('読み取りに失敗しました。\n手動で入力してください。');
  } finally {
    loading.classList.add('hidden');
  }
}

// 画像前処理
async function preprocessImage(imageData) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // 画像サイズを設定（大きすぎると処理が遅い）
      const maxSize = 1500;
      let width = img.width;
      let height = img.height;
      
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = (height / width) * maxSize;
          width = maxSize;
        } else {
          width = (width / height) * maxSize;
          height = maxSize;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // 元画像を描画
      ctx.drawImage(img, 0, 0, width, height);
      
      // 画像データを取得
      let imageData = ctx.getImageData(0, 0, width, height);
      let data = imageData.data;
      
      // Step 1: グレースケール化
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
      
      // Step 2: コントラスト強調
      const contrast = 1.5; // コントラスト係数
      const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
      for (let i = 0; i < data.length; i += 4) {
        data[i] = clamp(factor * (data[i] - 128) + 128);
        data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128);
        data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128);
      }
      
      // Step 3: 二値化（適応的しきい値）
      const threshold = calculateAdaptiveThreshold(data, width, height);
      for (let i = 0; i < data.length; i += 4) {
        const value = data[i] > threshold ? 255 : 0;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
      }
      
      // Step 4: ノイズ除去（簡易的なメディアンフィルタ的処理）
      // 孤立した黒ピクセルを除去
      const tempData = new Uint8ClampedArray(data);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          if (tempData[idx] === 0) { // 黒ピクセル
            let blackCount = 0;
            // 周囲8ピクセルをチェック
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nIdx = ((y + dy) * width + (x + dx)) * 4;
                if (tempData[nIdx] === 0) blackCount++;
              }
            }
            // 周囲に黒が2個以下なら白にする（ノイズ除去）
            if (blackCount <= 2) {
              data[idx] = 255;
              data[idx + 1] = 255;
              data[idx + 2] = 255;
            }
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // 処理済み画像を返す
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = imageData;
  });
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function calculateAdaptiveThreshold(data, width, height) {
  // ヒストグラムを計算して適切なしきい値を決定（大津の方法の簡易版）
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[Math.floor(data[i])]++;
  }
  
  const total = width * height;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }
  
  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;
  
  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    
    const wF = total - wB;
    if (wF === 0) break;
    
    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    
    const variance = wB * wF * (mB - mF) * (mB - mF);
    
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }
  
  return threshold;
}

function parseOCRResult(lines) {
  // レシートを解析して品目を抽出
  // 価格パターンを拡張
  const pricePatterns = [
    /[¥￥]\s*([0-9,]+)/,                    // ¥1,234
    /([0-9,]+)\s*円/,                        // 1234円
    /([0-9]{1,3}(?:,?[0-9]{3})*)\s*$/,      // 末尾の数字（1,234 or 1234）
    /\\([0-9,]+)/,                           // \1,234（バックスラッシュ）
    /([0-9]+)\s*[円圓]/,                     // 数字+円
  ];
  
  const quantityPatterns = [
    /[×xX✕]\s*([0-9]+)/,                    // ×5, x5, X5
    /([0-9]+)\s*[個本枚点セット]/,          // 5個, 5本
    /数量\s*[:：]?\s*([0-9]+)/,              // 数量: 5
  ];
  
  const items = [];
  let storeName = '';
  let foundDate = '';
  
  // 除外するパターン（合計、小計など）
  const excludePatterns = [
    /合計/i, /小計/i, /税/i, /計$/,
    /現金/i, /クレジット/i, /お預/i, /お釣/i,
    /ポイント/i, /割引/i, /値引/i,
    /レジ/i, /担当/i, /No\./i,
    /電話/i, /TEL/i, /FAX/i,
    /〒/i, /住所/i,
  ];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.length < 2) continue;
    
    // 除外パターンに一致したらスキップ
    if (excludePatterns.some(pattern => pattern.test(trimmedLine))) {
      continue;
    }
    
    // 店名を探す（最初の方の行で、数字が少ないもの）
    if (!storeName && items.length === 0) {
      const digitCount = (trimmedLine.match(/[0-9]/g) || []).length;
      const totalLength = trimmedLine.length;
      // 数字が全体の30%以下で、店舗っぽいキーワードがあれば
      if (digitCount / totalLength < 0.3) {
        if (trimmedLine.includes('ホームセンター') || 
            trimmedLine.includes('電材') || 
            trimmedLine.includes('金物') ||
            trimmedLine.includes('店') ||
            trimmedLine.includes('センター') ||
            trimmedLine.includes('商会') ||
            trimmedLine.includes('建材') ||
            trimmedLine.includes('工業') ||
            trimmedLine.includes('株式会社') ||
            trimmedLine.includes('㈱')) {
          storeName = trimmedLine.replace(/[<>【】\[\]「」]/g, '').trim();
          continue;
        }
      }
    }
    
    // 日付を探す（複数パターン）
    const datePatterns = [
      /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/,   // 2024/01/26, 2024年1月26日
      /(\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/,       // 24/01/26
      /[RR令]?\s*(\d{1,2})[\.年](\d{1,2})[\.月](\d{1,2})/, // R6.01.26, 令和6年
    ];
    
    for (const datePattern of datePatterns) {
      const dateMatch = trimmedLine.match(datePattern);
      if (dateMatch && !foundDate) {
        let year = dateMatch[1];
        // 2桁年号を4桁に変換
        if (year.length <= 2) {
          const numYear = parseInt(year);
          if (numYear <= 10) {
            year = String(2020 + numYear); // 令和
          } else if (numYear > 80) {
            year = String(1900 + numYear);
          } else {
            year = String(2000 + numYear);
          }
        }
        foundDate = `${year}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
        break;
      }
    }
    if (foundDate && !storeName && items.length === 0) continue;
    
    // 価格を抽出
    let price = 0;
    let priceMatch = null;
    for (const pattern of pricePatterns) {
      priceMatch = trimmedLine.match(pattern);
      if (priceMatch) {
        price = parseInt(priceMatch[1].replace(/,/g, '')) || 0;
        // 妥当な価格範囲かチェック（1円〜100万円）
        if (price >= 1 && price <= 1000000) {
          break;
        } else {
          price = 0;
          priceMatch = null;
        }
      }
    }
    
    if (price > 0) {
      // 品名部分を抽出（価格部分を除去）
      let itemName = trimmedLine;
      for (const pattern of pricePatterns) {
        itemName = itemName.replace(pattern, '');
      }
      itemName = itemName.trim();
      
      // 数量を抽出
      let quantity = 1;
      for (const qtyPattern of quantityPatterns) {
        const qtyMatch = itemName.match(qtyPattern);
        if (qtyMatch) {
          quantity = parseInt(qtyMatch[1]) || 1;
          itemName = itemName.replace(qtyPattern, '').trim();
          break;
        }
      }
      
      // ゴミ文字を除去
      itemName = itemName
        .replace(/[*＊#＃@＠\-－ー―_]/g, '')
        .replace(/^[\s\d]+/, '')  // 先頭の空白や数字を除去
        .replace(/[\s\d]+$/, '')  // 末尾の空白や数字を除去
        .trim();
      
      // 品名が2文字以上あれば追加
      if (itemName && itemName.length >= 2) {
        // 品名マスターと照合
        const matchedProduct = findMatchingProduct(itemName);
        
        items.push({
          originalName: itemName,
          name: matchedProduct ? matchedProduct.officialName : itemName,
          matched: !!matchedProduct,
          matchedProduct: matchedProduct,
          quantity: quantity,
          price: price,
          type: matchedProduct ? 
                (categories.expense.find(c => c.value === matchedProduct.category) ? 'expense' : 'material') 
                : 'material',
          category: matchedProduct ? matchedProduct.category : 'other_material'
        });
      }
    }
  }
  
  // 結果を反映
  if (storeName) {
    document.getElementById('receiptStoreName').value = storeName;
  }
  if (foundDate) {
    document.getElementById('receiptDate').value = foundDate;
  }
  
  // 品目をセット
  if (items.length > 0) {
    receiptItems = items.map((item, index) => ({
      id: Date.now() + index,
      name: item.name,
      originalName: item.originalName,
      matched: item.matched,
      matchedProduct: item.matchedProduct,
      quantity: item.quantity,
      price: item.price,
      type: item.type,
      category: item.category
    }));
    renderReceiptItems();
    updateReceiptTotal();
  } else {
    alert('品目を読み取れませんでした。\n手動で入力してください。');
  }
}

// ==========================================
// レシート読込機能
// ==========================================
// receiptItems, receiptImageData, categories は globals.js で定義

function initReceiptScreen() {
  // 今日の日付をセット
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('receiptDate').value = today;
  // 複数画像をリセット
  multiImageDataUrls = [];
  receiptImageData = null;
  if (document.getElementById('multiImageArea')) {
    document.getElementById('multiImageArea').style.display = 'none';
    document.getElementById('multiImageThumbnails').innerHTML = '';
  }
  if (document.getElementById('imagePreviewArea')) {
    document.getElementById('imagePreviewArea').style.display = 'block';
  }
  if (document.getElementById('imagePlaceholder')) {
    document.getElementById('imagePlaceholder').style.display = 'block';
  }
  if (document.getElementById('imagePreview')) {
    document.getElementById('imagePreview').style.display = 'none';
  }
  // 最初の品目を追加
  addReceiptItem();
}

function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // 複数画像モードをリセットして単一画像モードに
  multiImageDataUrls = [];
  document.getElementById('multiImageArea').style.display = 'none';
  document.getElementById('multiImageThumbnails').innerHTML = '';
  
  const reader = new FileReader();
  reader.onload = (e) => {
    receiptImageData = e.target.result;
    document.getElementById('imagePreview').src = receiptImageData;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
    // OCRボタンを有効化
    document.getElementById('ocrBtn').disabled = false;
    // AIボタンを有効化（APIキーがあれば）
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    document.getElementById('aiBtn').disabled = !settings.geminiApiKey;
    if (!settings.geminiApiKey) {
      document.getElementById('aiBtn').title = '設定画面でGemini APIキーを入力してください';
    }
  };
  reader.readAsDataURL(file);
  // inputをリセット（同じファイルを再選択できるように）
  event.target.value = '';
}

// 複数画像用の配列
// multiImageDataUrls は globals.js で定義

// 画像を追加（1枚ずつ追加する方式）
function handleAddImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // 最大3枚まで
  if (multiImageDataUrls.length >= 3) {
    alert('最大3枚まで追加できます');
    event.target.value = '';
    return;
  }
  
  // 最初の追加の場合、既存の単一画像があれば複数画像モードに移行
  if (multiImageDataUrls.length === 0 && receiptImageData) {
    // 既存の画像を複数画像配列に追加
    multiImageDataUrls.push(receiptImageData);
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    multiImageDataUrls.push(e.target.result);
    
    // 単一画像プレビューを非表示
    document.getElementById('imagePreviewArea').style.display = 'none';
    document.getElementById('multiImageArea').style.display = 'block';
    
    renderMultiImageThumbnails();
    
    // ボタン有効化
    document.getElementById('ocrBtn').disabled = true; // OCRは単一のみ
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    document.getElementById('aiBtn').disabled = !settings.geminiApiKey;
  };
  reader.readAsDataURL(file);
  // inputをリセット
  event.target.value = '';
}

// 複数画像サムネイル表示
function renderMultiImageThumbnails() {
  const container = document.getElementById('multiImageThumbnails');
  container.innerHTML = '';
  
  multiImageDataUrls.forEach((dataUrl, index) => {
    const thumb = document.createElement('div');
    thumb.style.cssText = 'position: relative; width: 80px; height: 80px;';
    thumb.innerHTML = `
      <img src="${dataUrl}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid #e5e7eb;">
      <div onclick="removeMultiImage(${index})" style="position: absolute; top: -8px; right: -8px; width: 24px; height: 24px; background: #ef4444; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">×</div>
      <div style="position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.6); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${index + 1}枚目</div>
    `;
    container.appendChild(thumb);
  });
  
  // 追加ボタン（3枚未満の場合）
  if (multiImageDataUrls.length < 3) {
    const addBtn = document.createElement('div');
    addBtn.style.cssText = 'width: 80px; height: 80px; border: 2px dashed #d1d5db; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #9ca3af; font-size: 24px;';
    addBtn.innerHTML = '＋';
    addBtn.onclick = () => document.getElementById('receiptAddImage').click();
    container.appendChild(addBtn);
  }
}

// 複数画像から削除
function removeMultiImage(index) {
  multiImageDataUrls.splice(index, 1);
  
  if (multiImageDataUrls.length === 0) {
    // 全部削除したら単一画像モードに戻る
    document.getElementById('multiImageArea').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'block';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('aiBtn').disabled = true;
    document.getElementById('ocrBtn').disabled = true;
    receiptImageData = null;
  } else if (multiImageDataUrls.length === 1) {
    // 1枚だけになったら単一画像モードに戻る
    receiptImageData = multiImageDataUrls[0];
    document.getElementById('multiImageArea').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
    document.getElementById('imagePreview').src = receiptImageData;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'none';
    document.getElementById('ocrBtn').disabled = false;
    multiImageDataUrls = [];
  } else {
    renderMultiImageThumbnails();
  }
}

// 全画像クリア
function clearAllImages() {
  multiImageDataUrls = [];
  receiptImageData = null;
  document.getElementById('multiImageArea').style.display = 'none';
  document.getElementById('multiImageThumbnails').innerHTML = '';
  document.getElementById('imagePreviewArea').style.display = 'block';
  document.getElementById('imagePlaceholder').style.display = 'block';
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('aiBtn').disabled = true;
  document.getElementById('ocrBtn').disabled = true;
}

// 複数画像を縦に結合
async function mergeImages(dataUrls) {
  const images = await Promise.all(
    dataUrls.map(dataUrl => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = dataUrl;
      });
    })
  );
  
  // 最大幅を基準にする
  const maxWidth = Math.max(...images.map(img => img.width));
  const totalHeight = images.reduce((sum, img) => {
    // アスペクト比を維持してリサイズした高さを計算
    const scale = maxWidth / img.width;
    return sum + (img.height * scale);
  }, 0);
  
  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  
  // 白背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 縦に並べて描画
  let y = 0;
  for (const img of images) {
    const scale = maxWidth / img.width;
    const scaledHeight = img.height * scale;
    ctx.drawImage(img, 0, y, maxWidth, scaledHeight);
    y += scaledHeight;
  }
  
  // base64で返す（品質0.85で圧縮）
  return canvas.toDataURL('image/jpeg', 0.85);
}

function addReceiptItem() {
  const itemId = Date.now();
  receiptItems.push({
    id: itemId,
    name: '',
    quantity: 1,
    price: 0,
    type: 'material', // material, expense, exclude
    category: 'pipe'
  });
  renderReceiptItems();
}

function removeReceiptItem(itemId) {
  receiptItems = receiptItems.filter(item => item.id !== itemId);
  renderReceiptItems();
  updateReceiptTotal();
}

function updateReceiptItem(itemId, field, value) {
  const item = receiptItems.find(i => i.id === itemId);
  if (item) {
    item[field] = value;
    if (field === 'type') {
      // タイプが変わったらカテゴリをリセット
      item.category = value === 'material' ? 'pipe' : 
                      value === 'expense' ? 'consumable' : '';
      renderReceiptItems();
    }
    updateReceiptTotal();
  }
}

function renderReceiptItems() {
  const container = document.getElementById('receiptItemsList');
  container.innerHTML = '';
  
  receiptItems.forEach((item, index) => {
    const categoryOptions = item.type === 'material' ? categories.material :
                           item.type === 'expense' ? categories.expense : [];
    
    // OCRマッチング情報
    let matchInfo = '';
    if (item.originalName && item.originalName !== item.name) {
      matchInfo = `
        <div class="name-suggest">
          <div class="name-suggest-title">✅ 品名マスターと一致</div>
          <div style="font-size: 11px; color: #6b7280;">
            「${item.originalName}」→「${item.name}」に変換
          </div>
        </div>
      `;
    } else if (item.originalName && !item.matched) {
      matchInfo = `
        <div class="name-suggest" style="background: #fef3c7; border-color: #f59e0b;">
          <div class="name-suggest-title" style="color: #d97706;">⚠️ 新しい品名</div>
          <button class="master-btn edit" style="width: 100%; margin-top: 4px;" 
            onclick="registerToMaster(${item.id}, '${escapeHtml(item.name)}', '${item.category}')">
            品名マスターに登録
          </button>
        </div>
      `;
    }
    
    const itemHtml = `
      <div class="receipt-item" data-id="${item.id}">
        <div class="receipt-item-header">
          <span class="receipt-item-number">#${index + 1}</span>
          <button class="receipt-item-delete" onclick="removeReceiptItem(${item.id})">削除</button>
        </div>
        <div class="receipt-item-labels" style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-bottom: 4px;">
          <span style="font-size: 11px; color: #6b7280; padding-left: 4px;">品名</span>
          <span style="font-size: 11px; color: #6b7280; padding-left: 4px;">数量</span>
          <span style="font-size: 11px; color: #6b7280; padding-left: 4px;">金額</span>
        </div>
        <div class="receipt-item-row">
          <div class="suggest-container">
            <input type="text" placeholder="品名" value="${escapeHtml(item.name)}" 
              oninput="showSuggestions(this, ${item.id})"
              onfocus="showSuggestions(this, ${item.id})"
              onblur="setTimeout(() => hideSuggestions(${item.id}), 200)"
              onchange="updateReceiptItem(${item.id}, 'name', this.value)">
            <div class="suggest-dropdown" id="suggest-${item.id}"></div>
          </div>
          <input type="number" placeholder="数量" value="${item.quantity}" min="1"
            onchange="updateReceiptItem(${item.id}, 'quantity', parseInt(this.value) || 1)">
          <input type="number" placeholder="金額" value="${item.price || ''}" 
            onchange="updateReceiptItem(${item.id}, 'price', parseInt(this.value) || 0)">
        </div>
        ${matchInfo}
        <div class="receipt-item-type">
          <button class="type-btn ${item.type === 'material' ? 'active' : ''}" 
            onclick="updateReceiptItem(${item.id}, 'type', 'material')">材料</button>
          <button class="type-btn ${item.type === 'expense' ? 'active' : ''}" 
            onclick="updateReceiptItem(${item.id}, 'type', 'expense')">経費</button>
          <button class="type-btn ${item.type === 'exclude' ? 'active' : ''}" 
            onclick="updateReceiptItem(${item.id}, 'type', 'exclude')">除外</button>
        </div>
        ${item.type !== 'exclude' ? `
          <div class="receipt-item-category">
            <select onchange="updateReceiptItem(${item.id}, 'category', this.value)">
              ${categoryOptions.map(opt => 
                `<option value="${opt.value}" ${item.category === opt.value ? 'selected' : ''}>${opt.label}</option>`
              ).join('')}
            </select>
          </div>
        ` : ''}
      </div>
    `;
    container.innerHTML += itemHtml;
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function showSuggestions(input, itemId) {
  const value = input.value.toLowerCase();
  const dropdown = document.getElementById(`suggest-${itemId}`);
  
  if (!value || value.length < 1) {
    dropdown.classList.remove('show');
    return;
  }
  
  // 品名マスターから検索
  const matches = productMaster.filter(p => 
    p.officialName.toLowerCase().includes(value) ||
    p.aliases.some(a => a.toLowerCase().includes(value))
  ).slice(0, 5);
  
  if (matches.length === 0) {
    dropdown.classList.remove('show');
    return;
  }
  
  dropdown.innerHTML = matches.map(p => `
    <div class="suggest-item" onclick="selectSuggestion(${itemId}, '${escapeHtml(p.officialName)}', '${p.category}', ${p.defaultPrice || 0})">
      <span class="suggest-item-price">${p.defaultPrice ? '¥' + p.defaultPrice.toLocaleString() : ''}</span>
      <div class="suggest-item-name">${p.officialName}</div>
      <div class="suggest-item-category">${getCategoryLabel(p.category)}</div>
    </div>
  `).join('');
  
  dropdown.classList.add('show');
}

function hideSuggestions(itemId) {
  const dropdown = document.getElementById(`suggest-${itemId}`);
  if (dropdown) {
    dropdown.classList.remove('show');
  }
}

function selectSuggestion(itemId, name, category, price) {
  const item = receiptItems.find(i => i.id === itemId);
  if (item) {
    item.name = name;
    item.category = category;
    if (price > 0 && !item.price) {
      item.price = price;
    }
    // カテゴリに応じてタイプを設定
    item.type = categories.expense.find(c => c.value === category) ? 'expense' : 'material';
    item.matched = true;
    renderReceiptItems();
    updateReceiptTotal();
  }
}

function registerToMaster(itemId, name, category) {
  const item = receiptItems.find(i => i.id === itemId);
  if (!item) return;
  
  const officialName = prompt('正式名称を入力してください:', name);
  if (!officialName) return;
  
  const aliases = [];
  if (item.originalName && item.originalName !== officialName) {
    aliases.push(item.originalName);
  }
  if (name !== officialName && !aliases.includes(name)) {
    aliases.push(name);
  }
  
  addToProductMaster(officialName, category, aliases);
  
  // 品目を更新
  item.name = officialName;
  item.matched = true;
  renderReceiptItems();
  
  alert(`「${officialName}」を品名マスターに登録しました！`);
}

function updateReceiptTotal() {
  const total = receiptItems
    .filter(item => item.type !== 'exclude')
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);
  document.getElementById('receiptTotal').textContent = '¥' + total.toLocaleString();
}

function saveReceipt() {
  const storeName = document.getElementById('receiptStoreName').value;
  const date = document.getElementById('receiptDate').value;
  const saveImage = document.getElementById('saveReceiptImage').checked;
  
  if (!storeName) {
    alert('店名を入力してください');
    return;
  }
  
  if (receiptItems.filter(i => i.type !== 'exclude' && i.name).length === 0) {
    alert('品目を1つ以上入力してください');
    return;
  }
  
  // 材料と経費に分けて保存
  const materials = receiptItems.filter(i => i.type === 'material' && i.name);
  const expenses = receiptItems.filter(i => i.type === 'expense' && i.name);
  
  // 材料を保存
  if (materials.length > 0) {
    const savedMaterials = JSON.parse(localStorage.getItem('reform_app_materials') || '[]');
    materials.forEach(m => {
      savedMaterials.push({
        id: Date.now() + Math.random(),
        name: m.name,
        price: m.price,
        quantity: m.quantity,
        category: m.category,
        storeName: storeName,
        date: date,
        createdAt: new Date().toISOString()
      });
    });
    localStorage.setItem('reform_app_materials', JSON.stringify(savedMaterials));
  }
  
  // 経費を保存
  if (expenses.length > 0) {
    const savedExpenses = JSON.parse(localStorage.getItem('reform_app_expenses') || '[]');
    expenses.forEach(e => {
      savedExpenses.push({
        id: Date.now() + Math.random(),
        name: e.name,
        price: e.price * e.quantity,
        category: e.category,
        storeName: storeName,
        date: date,
        image: saveImage ? receiptImageData : null,
        createdAt: new Date().toISOString()
      });
    });
    localStorage.setItem('reform_app_expenses', JSON.stringify(savedExpenses));
  }
  
  // 完了メッセージ
  const materialCount = materials.length;
  const expenseCount = expenses.length;
  let message = '保存しました！\n';
  if (materialCount > 0) message += `材料: ${materialCount}件\n`;
  if (expenseCount > 0) message += `経費: ${expenseCount}件`;
  alert(message);
  
  // リセット
  resetReceiptForm();
}

function resetReceiptForm() {
  document.getElementById('receiptStoreName').value = '';
  document.getElementById('receiptDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('imagePlaceholder').style.display = 'flex';
  document.getElementById('processedImagePreview').style.display = 'none';
  document.getElementById('ocrBtn').disabled = true;
  document.getElementById('aiBtn').disabled = true;
  receiptImageData = null;
  receiptItems = [];
  addReceiptItem();
  updateReceiptTotal();
}

// ==========================================
// Gemini API（AI読み取り）
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
