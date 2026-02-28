// ==========================================
// receipt-crop.js v1.0 — レシート画像切り出し
// Phase1.8: 角検出＆白背景配置
// 依存: なし（Canvas APIのみ使用）
// ==========================================
// 処理フロー:
//   1. 画像をCanvasに描画
//   2. グレースケール化→エッジ検出→輪郭抽出
//   3. 最大矩形（レシート領域）を推定
//   4. 透視変換（簡易版）で切り出し
//   5. 白背景の上にレシートを配置
//   6. 失敗時は元画像に白余白を付けてフォールバック
// ==========================================

/**
 * レシート画像を切り出して白背景に配置
 * @param {string} imageDataUrl - 元画像のDataURL
 * @param {object} options - オプション
 * @param {number} options.padding - 余白(px) デフォルト20
 * @param {number} options.maxWidth - 最大幅(px) デフォルト800
 * @param {number} options.quality - JPEG品質 デフォルト0.85
 * @returns {Promise<string>} 切り出し後のDataURL
 */
async function cropReceiptImage(imageDataUrl, options) {
  if (!imageDataUrl) return null;

  var opts = options || {};
  var padding = opts.padding || 20;
  var maxWidth = opts.maxWidth || 800;
  var quality = opts.quality || 0.85;

  try {
    // 画像読み込み
    var img = await loadImageFromDataUrl(imageDataUrl);
    var w = img.naturalWidth;
    var h = img.naturalHeight;

    // 処理用Canvas（縮小して高速化）
    var scale = Math.min(1, 600 / Math.max(w, h));
    var sw = Math.round(w * scale);
    var sh = Math.round(h * scale);

    var procCanvas = document.createElement('canvas');
    procCanvas.width = sw;
    procCanvas.height = sh;
    var procCtx = procCanvas.getContext('2d');
    procCtx.drawImage(img, 0, 0, sw, sh);

    // エッジ検出→矩形検出
    var rect = detectReceiptRect(procCtx, sw, sh);

    if (rect) {
      // 元画像スケールに戻す
      var cropRect = {
        x: Math.round(rect.x / scale),
        y: Math.round(rect.y / scale),
        w: Math.round(rect.w / scale),
        h: Math.round(rect.h / scale)
      };

      // 範囲チェック（はみ出し防止）
      cropRect.x = Math.max(0, cropRect.x);
      cropRect.y = Math.max(0, cropRect.y);
      cropRect.w = Math.min(w - cropRect.x, cropRect.w);
      cropRect.h = Math.min(h - cropRect.y, cropRect.h);

      // 切り出しが元画像の20%以下 or 95%以上なら失敗扱い
      var areaRatio = (cropRect.w * cropRect.h) / (w * h);
      if (areaRatio < 0.2 || areaRatio > 0.95) {
        console.log('[receipt-crop] 検出領域が不適切(' + Math.round(areaRatio * 100) + '%)、フォールバック');
        return createWhiteBgImage(img, w, h, padding, maxWidth, quality);
      }

      // 切り出し＋白背景配置
      return createCroppedImage(img, cropRect, padding, maxWidth, quality);
    } else {
      console.log('[receipt-crop] 矩形検出失敗、フォールバック');
      return createWhiteBgImage(img, w, h, padding, maxWidth, quality);
    }

  } catch (e) {
    console.warn('[receipt-crop] 切り出しエラー、元画像を返却:', e);
    return imageDataUrl; // エラー時は元画像をそのまま返す
  }
}

/**
 * レシート矩形を検出（エッジベース）
 * @returns {object|null} {x, y, w, h} or null
 */
function detectReceiptRect(ctx, w, h) {
  // ピクセルデータ取得
  var imageData = ctx.getImageData(0, 0, w, h);
  var data = imageData.data;

  // グレースケール化
  var gray = new Uint8Array(w * h);
  for (var i = 0; i < gray.length; i++) {
    var idx = i * 4;
    gray[i] = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
  }

  // ガウシアンブラー（3x3簡易版、ノイズ除去）
  var blurred = gaussianBlur3x3(gray, w, h);

  // Sobelエッジ検出
  var edges = sobelEdgeDetect(blurred, w, h);

  // 二値化（Otsu閾値）
  var threshold = otsuThreshold(edges);
  var binary = new Uint8Array(w * h);
  for (var j = 0; j < edges.length; j++) {
    binary[j] = edges[j] > threshold ? 255 : 0;
  }

  // 射影法でレシート領域を推定
  // 水平・垂直の射影ヒストグラムから境界を見つける
  var rect = findRectByProjection(binary, w, h);

  return rect;
}

/**
 * 3x3ガウシアンブラー
 */
function gaussianBlur3x3(gray, w, h) {
  var result = new Uint8Array(w * h);
  // カーネル: [1,2,1; 2,4,2; 1,2,1] / 16
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      var sum =
        gray[(y - 1) * w + (x - 1)] * 1 + gray[(y - 1) * w + x] * 2 + gray[(y - 1) * w + (x + 1)] * 1 +
        gray[y * w + (x - 1)] * 2 + gray[y * w + x] * 4 + gray[y * w + (x + 1)] * 2 +
        gray[(y + 1) * w + (x - 1)] * 1 + gray[(y + 1) * w + x] * 2 + gray[(y + 1) * w + (x + 1)] * 1;
      result[y * w + x] = Math.round(sum / 16);
    }
  }
  return result;
}

/**
 * Sobelエッジ検出
 */
function sobelEdgeDetect(gray, w, h) {
  var edges = new Uint8Array(w * h);
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      // Gx
      var gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] +
        -2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)] +
        -gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      // Gy
      var gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] +
        gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
      // 勾配の大きさ
      var mag = Math.sqrt(gx * gx + gy * gy);
      edges[y * w + x] = Math.min(255, Math.round(mag));
    }
  }
  return edges;
}

/**
 * 大津の閾値
 */
function otsuThreshold(data) {
  // ヒストグラム
  var hist = new Array(256).fill(0);
  for (var i = 0; i < data.length; i++) {
    hist[data[i]]++;
  }
  var total = data.length;
  var sumAll = 0;
  for (var t = 0; t < 256; t++) sumAll += t * hist[t];

  var sumB = 0, wB = 0;
  var maxVariance = 0, bestThreshold = 0;

  for (var t2 = 0; t2 < 256; t2++) {
    wB += hist[t2];
    if (wB === 0) continue;
    var wF = total - wB;
    if (wF === 0) break;
    sumB += t2 * hist[t2];
    var mB = sumB / wB;
    var mF = (sumAll - sumB) / wF;
    var variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) {
      maxVariance = variance;
      bestThreshold = t2;
    }
  }
  return bestThreshold;
}

/**
 * 射影法でレシート矩形を推定
 * エッジ画素の水平・垂直ヒストグラムから境界を検出
 */
function findRectByProjection(binary, w, h) {
  // 水平射影（各行のエッジ画素数）
  var hProj = new Array(h).fill(0);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      if (binary[y * w + x] > 0) hProj[y]++;
    }
  }

  // 垂直射影（各列のエッジ画素数）
  var vProj = new Array(w).fill(0);
  for (var x2 = 0; x2 < w; x2++) {
    for (var y2 = 0; y2 < h; y2++) {
      if (binary[y2 * w + x2] > 0) vProj[x2]++;
    }
  }

  // 射影値のしきい値（平均の30%）
  var hAvg = hProj.reduce(function(a, b) { return a + b; }, 0) / h;
  var vAvg = vProj.reduce(function(a, b) { return a + b; }, 0) / w;
  var hThresh = hAvg * 0.3;
  var vThresh = vAvg * 0.3;

  // 境界を見つける（外側からスキャン）
  var top = 0, bottom = h - 1, left = 0, right = w - 1;

  // 上端: 最初にしきい値を超える行
  for (var t = 0; t < h; t++) {
    if (hProj[t] > hThresh) { top = t; break; }
  }
  // 下端: 最後にしきい値を超える行
  for (var b = h - 1; b >= 0; b--) {
    if (hProj[b] > hThresh) { bottom = b; break; }
  }
  // 左端
  for (var l = 0; l < w; l++) {
    if (vProj[l] > vThresh) { left = l; break; }
  }
  // 右端
  for (var r = w - 1; r >= 0; r--) {
    if (vProj[r] > vThresh) { right = r; break; }
  }

  // マージン追加（検出の外側を少し含める）
  var marginX = Math.round(w * 0.02);
  var marginY = Math.round(h * 0.02);
  top = Math.max(0, top - marginY);
  bottom = Math.min(h - 1, bottom + marginY);
  left = Math.max(0, left - marginX);
  right = Math.min(w - 1, right + marginX);

  var rectW = right - left;
  var rectH = bottom - top;

  // 最小サイズチェック（幅・高さが画像の15%未満なら失敗）
  if (rectW < w * 0.15 || rectH < h * 0.15) {
    return null;
  }

  return { x: left, y: top, w: rectW, h: rectH };
}

/**
 * 検出した矩形で切り出し→白背景に配置
 */
function createCroppedImage(img, cropRect, padding, maxWidth, quality) {
  // 出力サイズ計算
  var outW = cropRect.w + padding * 2;
  var outH = cropRect.h + padding * 2;

  // maxWidth制限
  if (outW > maxWidth) {
    var ratio = maxWidth / outW;
    outW = maxWidth;
    outH = Math.round(outH * ratio);
    cropRect.w = Math.round(cropRect.w * ratio);
    cropRect.h = Math.round(cropRect.h * ratio);
  }

  var canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  var ctx = canvas.getContext('2d');

  // 白背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);

  // 切り出し画像を描画
  ctx.drawImage(img,
    cropRect.x, cropRect.y, cropRect.w, cropRect.h, // ソース
    padding, padding, cropRect.w, cropRect.h          // 配置先
  );

  console.log('[receipt-crop] 切り出し成功: ' + cropRect.w + 'x' + cropRect.h + ' → ' + outW + 'x' + outH);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * フォールバック: 元画像に白余白を追加
 */
function createWhiteBgImage(img, w, h, padding, maxWidth, quality) {
  // maxWidth制限
  var scale = Math.min(1, maxWidth / (w + padding * 2));
  var outW = Math.round((w + padding * 2) * scale);
  var outH = Math.round((h + padding * 2) * scale);
  var drawW = Math.round(w * scale);
  var drawH = Math.round(h * scale);
  var drawPad = Math.round(padding * scale);

  var canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  var ctx = canvas.getContext('2d');

  // 白背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);

  // 元画像を中央に配置
  ctx.drawImage(img, drawPad, drawPad, drawW, drawH);

  console.log('[receipt-crop] フォールバック: 白余白追加 ' + outW + 'x' + outH);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * DataURLからImageオブジェクトを読み込む
 */
function loadImageFromDataUrl(dataUrl) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() { resolve(img); };
    img.onerror = function() { reject(new Error('画像読み込み失敗')); };
    img.src = dataUrl;
  });
}


// ==========================================
// グローバル公開
// ==========================================
window.cropReceiptImage = cropReceiptImage;
window.loadImageFromDataUrl = loadImageFromDataUrl;

console.log('[receipt-crop.js] ✓ レシート画像切り出しモジュール読み込み完了');
