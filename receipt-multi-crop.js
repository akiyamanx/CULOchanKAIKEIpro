// ==========================================
// receipt-multi-crop.js v1.0 — 複数レシート自動検出＆切り出し
// Phase1.8: Canvas画像処理で白い紙（レシート）を自動検出
// 依存: receipt-crop.js（loadImageFromDataUrl, createCroppedImage等）
// ==========================================
// 処理フロー:
//   1. 画像を縮小してCanvas描画
//   2. グレースケール化→二値化（白い紙=255, 背景=0）
//   3. 連結成分ラベリングで白い塊を検出
//   4. 面積フィルタ＋外接矩形を取得
//   5. Geminiの認識枚数とマッチング（面積大きい順にN枚採用）
//   6. 各矩形で切り出し→白背景配置
// ==========================================

/**
 * 複数レシートを画像処理で自動検出して個別切り出し
 * @param {string} imageDataUrl - 元画像（複数レシートが写っている）
 * @param {number} expectedCount - AIが認識したレシート枚数
 * @param {object} options - padding, maxWidth, quality
 * @returns {Promise<string[]>} 各レシートの切り出し画像DataURL配列
 */
async function detectAndCropMultipleReceipts(imageDataUrl, expectedCount, options) {
  if (!imageDataUrl || expectedCount <= 0) return [];

  // 1枚の場合は既存の角検出にフォールバック
  if (expectedCount === 1) {
    var single = await cropReceiptImage(imageDataUrl, options);
    return [single || imageDataUrl];
  }

  var opts = options || {};
  var padding = opts.padding || 15;
  var maxWidth = opts.maxWidth || 700;
  var quality = opts.quality || 0.85;

  try {
    var img = await loadImageFromDataUrl(imageDataUrl);
    var origW = img.naturalWidth;
    var origH = img.naturalHeight;

    // 処理用に縮小（max800pxで高速化）
    var scale = Math.min(1, 800 / Math.max(origW, origH));
    var sw = Math.round(origW * scale);
    var sh = Math.round(origH * scale);

    var canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, sw, sh);

    // グレースケール化
    var imageData = ctx.getImageData(0, 0, sw, sh);
    var data = imageData.data;
    var gray = new Uint8Array(sw * sh);
    for (var i = 0; i < gray.length; i++) {
      var idx = i * 4;
      gray[i] = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
    }

    // 白い紙を検出する二値化（明るい部分=レシート候補）
    var threshold = findWhitePaperThreshold(gray, sw, sh);
    var binary = new Uint8Array(sw * sh);
    for (var j = 0; j < gray.length; j++) {
      binary[j] = gray[j] > threshold ? 1 : 0;
    }

    // モルフォロジー処理（ノイズ除去＋隙間埋め）
    binary = morphClose(binary, sw, sh, 3);
    binary = morphOpen(binary, sw, sh, 2);

    // 連結成分ラベリング
    var labels = connectedComponents(binary, sw, sh);

    // 各ラベルの外接矩形と面積を算出
    var regions = extractRegions(labels.labelMap, labels.labelCount, sw, sh);

    // 面積でフィルタ（画像全体の1%未満は除外）
    var minArea = sw * sh * 0.01;
    regions = regions.filter(function(r) { return r.area >= minArea; });

    // 面積の大きい順にソート
    regions.sort(function(a, b) { return b.area - a.area; });

    // 上位N枚を採用（expectedCountに合わせる）
    var topRegions = regions.slice(0, expectedCount);

    console.log('[multi-crop] 検出領域: ' + regions.length + '個、採用: ' + topRegions.length + '個（期待: ' + expectedCount + '枚）');

    if (topRegions.length === 0) {
      // 検出失敗→元画像をそのまま返す
      console.warn('[multi-crop] レシート領域検出失敗、元画像で代替');
      var fallback = [];
      for (var f = 0; f < expectedCount; f++) fallback.push(imageDataUrl);
      return fallback;
    }

    // 位置順にソート（左上から右下へ。y座標優先）
    topRegions.sort(function(a, b) {
      var ay = Math.floor(a.y / (sh * 0.3));
      var by = Math.floor(b.y / (sh * 0.3));
      if (ay !== by) return ay - by;
      return a.x - b.x;
    });

    // 各領域を切り出し
    var results = [];
    for (var k = 0; k < topRegions.length; k++) {
      var region = topRegions[k];
      // 元画像スケールに戻す
      var cropRect = {
        x: Math.round(region.x / scale),
        y: Math.round(region.y / scale),
        w: Math.round(region.w / scale),
        h: Math.round(region.h / scale)
      };
      // はみ出し防止
      cropRect.x = Math.max(0, cropRect.x);
      cropRect.y = Math.max(0, cropRect.y);
      cropRect.w = Math.min(origW - cropRect.x, cropRect.w);
      cropRect.h = Math.min(origH - cropRect.y, cropRect.h);
      // 小さいマージン追加（紙端が切れないように）
      var mx = Math.round(cropRect.w * 0.02);
      var my = Math.round(cropRect.h * 0.02);
      cropRect.x = Math.max(0, cropRect.x - mx);
      cropRect.y = Math.max(0, cropRect.y - my);
      cropRect.w = Math.min(origW - cropRect.x, cropRect.w + mx * 2);
      cropRect.h = Math.min(origH - cropRect.y, cropRect.h + my * 2);

      var cropped = createCroppedImage(img, cropRect, padding, maxWidth, quality);
      results.push(cropped);
      console.log('[multi-crop] レシート' + (k + 1) + ': ' + cropRect.x + ',' + cropRect.y + ' ' + cropRect.w + 'x' + cropRect.h);
    }

    // 検出数が足りない場合、残りは元画像で埋める
    while (results.length < expectedCount) {
      results.push(imageDataUrl);
    }

    return results;

  } catch (e) {
    console.error('[multi-crop] 検出エラー:', e);
    var errFallback = [];
    for (var ef = 0; ef < expectedCount; ef++) errFallback.push(imageDataUrl);
    return errFallback;
  }
}

/**
 * 白い紙の閾値を算出（ヒストグラム分析）
 * レシートは白い紙なので、明るいピーク付近を閾値にする
 */
function findWhitePaperThreshold(gray, w, h) {
  // ヒストグラム作成
  var hist = new Array(256).fill(0);
  for (var i = 0; i < gray.length; i++) hist[gray[i]]++;

  // 上位25%の明るさの平均を基準に閾値を決める
  var total = gray.length;
  var target = total * 0.25;
  var count = 0;
  var brightStart = 255;
  for (var t = 255; t >= 0; t--) {
    count += hist[t];
    if (count >= target) { brightStart = t; break; }
  }

  // 閾値: 明るい領域の開始点から少し下（背景との境界）
  // 明るい部分と暗い部分の中間くらい
  var darkAvg = 0;
  var darkCount = 0;
  for (var d = 0; d < brightStart; d++) {
    darkAvg += d * hist[d];
    darkCount += hist[d];
  }
  darkAvg = darkCount > 0 ? darkAvg / darkCount : 80;

  var threshold = Math.round((brightStart + darkAvg) / 2);
  // 最低でも120、最高でも200に制限
  threshold = Math.max(120, Math.min(200, threshold));

  console.log('[multi-crop] 白紙閾値: ' + threshold + ' (明るい領域開始: ' + brightStart + ')');
  return threshold;
}

/**
 * モルフォロジー膨張（白い領域を広げる）
 */
function dilate(binary, w, h, radius) {
  var result = new Uint8Array(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var found = false;
      for (var dy = -radius; dy <= radius && !found; dy++) {
        for (var dx = -radius; dx <= radius && !found; dx++) {
          var ny = y + dy;
          var nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            if (binary[ny * w + nx]) found = true;
          }
        }
      }
      result[y * w + x] = found ? 1 : 0;
    }
  }
  return result;
}

/**
 * モルフォロジー収縮（白い領域を縮める）
 */
function erode(binary, w, h, radius) {
  var result = new Uint8Array(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var allWhite = true;
      for (var dy = -radius; dy <= radius && allWhite; dy++) {
        for (var dx = -radius; dx <= radius && allWhite; dx++) {
          var ny = y + dy;
          var nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            if (!binary[ny * w + nx]) allWhite = false;
          } else {
            allWhite = false;
          }
        }
      }
      result[y * w + x] = allWhite ? 1 : 0;
    }
  }
  return result;
}

// v1.0: クロージング（膨張→収縮）小さい穴を埋める
function morphClose(binary, w, h, radius) {
  return erode(dilate(binary, w, h, radius), w, h, radius);
}

// v1.0: オープニング（収縮→膨張）小さいノイズ除去
function morphOpen(binary, w, h, radius) {
  return dilate(erode(binary, w, h, radius), w, h, radius);
}

/**
 * 連結成分ラベリング（4連結）
 * @returns {{labelMap: Int32Array, labelCount: number}}
 */
function connectedComponents(binary, w, h) {
  var labelMap = new Int32Array(w * h);
  var nextLabel = 1;
  var equivalences = {}; // ラベル統合用

  // 第1パス: 仮ラベル付け
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = y * w + x;
      if (!binary[idx]) { labelMap[idx] = 0; continue; }
      var above = (y > 0) ? labelMap[(y - 1) * w + x] : 0;
      var left = (x > 0) ? labelMap[y * w + (x - 1)] : 0;

      if (above === 0 && left === 0) {
        labelMap[idx] = nextLabel++;
      } else if (above > 0 && left === 0) {
        labelMap[idx] = above;
      } else if (above === 0 && left > 0) {
        labelMap[idx] = left;
      } else {
        // 両方ラベルあり→小さい方を採用、統合記録
        var minL = Math.min(above, left);
        var maxL = Math.max(above, left);
        labelMap[idx] = minL;
        if (minL !== maxL) {
          // Union-Find的にルートを追跡
          var rootMax = findRoot(equivalences, maxL);
          var rootMin = findRoot(equivalences, minL);
          if (rootMax !== rootMin) {
            equivalences[Math.max(rootMax, rootMin)] = Math.min(rootMax, rootMin);
          }
        }
      }
    }
  }

  // 第2パス: ラベル統合
  for (var i = 0; i < labelMap.length; i++) {
    if (labelMap[i] > 0) {
      labelMap[i] = findRoot(equivalences, labelMap[i]);
    }
  }

  return { labelMap: labelMap, labelCount: nextLabel - 1 };
}

// Union-Findのルート検索
function findRoot(eq, label) {
  while (eq[label] !== undefined) { label = eq[label]; }
  return label;
}

/**
 * ラベルマップから各領域の外接矩形と面積を算出
 */
function extractRegions(labelMap, labelCount, w, h) {
  // 各ラベルのmin/max座標を収集
  var regionData = {};
  for (var i = 0; i < labelMap.length; i++) {
    var lbl = labelMap[i];
    if (lbl === 0) continue;
    var x = i % w;
    var y = Math.floor(i / w);
    if (!regionData[lbl]) {
      regionData[lbl] = { minX: x, minY: y, maxX: x, maxY: y, pixels: 0 };
    }
    var rd = regionData[lbl];
    if (x < rd.minX) rd.minX = x;
    if (x > rd.maxX) rd.maxX = x;
    if (y < rd.minY) rd.minY = y;
    if (y > rd.maxY) rd.maxY = y;
    rd.pixels++;
  }

  // 外接矩形に変換
  var regions = [];
  var keys = Object.keys(regionData);
  for (var k = 0; k < keys.length; k++) {
    var rd2 = regionData[keys[k]];
    regions.push({
      x: rd2.minX,
      y: rd2.minY,
      w: rd2.maxX - rd2.minX + 1,
      h: rd2.maxY - rd2.minY + 1,
      area: rd2.pixels
    });
  }
  return regions;
}


// ==========================================
// グローバル公開
// ==========================================
window.detectAndCropMultipleReceipts = detectAndCropMultipleReceipts;

console.log('[receipt-multi-crop.js] ✓ 複数レシート自動検出モジュール読み込み完了');
