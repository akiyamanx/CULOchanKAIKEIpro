// ==========================================
// レシート読込 - OCR機能
// Reform App Pro v0.91
// ==========================================
// Tesseract OCR、画像前処理、OCR結果解析
// 
// 依存ファイル:
//   - globals.js (receiptItems, receiptImageData, categories, productMaster)
//   - receipt-core.js (renderReceiptItems, updateReceiptTotal)
//   - Tesseract.js (外部ライブラリ)
// ==========================================


// ==========================================
// OCR実行
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


// ==========================================
// 画像前処理
// ==========================================
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


// ==========================================
// OCR結果解析
// ==========================================
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
