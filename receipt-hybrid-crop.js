// ==========================================
// receipt-hybrid-crop.js v3.3 — ハイブリッド方式切り出し
// v3.0: Gemini座標検出＋OpenCV精密切り出し
// v3.1: 二重スケーリング修正
// v3.2: boundsフォールバック＋面積チェック
// v3.3: お姉ちゃん提案統合 — 順序正規化(sum/diff)を必ず挟む
//
// 依存: receipt-crop.js（loadImageFromDataUrl, createCroppedImage）
//       receipt-multi-crop.js（isOpenCVAvailable）
// ==========================================

/**
 * v3.0: receipts配列にcorners座標が含まれるかチェック
 */
function _hasCorners(receipts) {
  for (var i = 0; i < receipts.length; i++) {
    if (receipts[i].corners && Array.isArray(receipts[i].corners)
        && receipts[i].corners.length === 4) {
      return true;
    }
  }
  return false;
}

/**
 * v3.0: Gemini corners座標を使って透視変換で切り出し（ハイブリッド方式のコア）
 * 処理フロー: Gemini corners → 1200pxリサイズ画像 → OpenCV透視変換 → 回転補正
 */
async function _cropWithGeminiCorners(imageDataUrl, receipts, options) {
  var opts = options || {};
  var padding = opts.padding || 15;
  var maxWidth = opts.maxWidth || 700;
  var quality = opts.quality || 0.85;

  var img = await loadImageFromDataUrl(imageDataUrl);
  var origW = img.naturalWidth;
  var origH = img.naturalHeight;

  // Canvas経由でOpenCVに読み込み（max1200px — receipt-ai.jsと同じリサイズ）
  var canvas = document.createElement('canvas');
  var scale = Math.min(1, 1200 / Math.max(origW, origH));
  var sw = Math.round(origW * scale);
  var sh = Math.round(origH * scale);
  canvas.width = sw;
  canvas.height = sh;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, sw, sh);

  // OpenCV使用可能ならcv.imreadで高精度透視変換
  if (isOpenCVAvailable()) {
    return _cropCornersWithOpenCV(canvas, receipts, scale, padding, maxWidth, quality, sw, sh);
  }
  // OpenCV未ロード時はCanvas切り出しにフォールバック
  return _cropCornersWithCanvas(img, receipts, scale, padding, maxWidth, quality, origW, origH);
}

/**
 * v3.0: OpenCV透視変換でGemini corners切り出し
 */
async function _cropCornersWithOpenCV(canvas, receipts, scale, padding, maxWidth, quality, sw, sh) {
  var src = cv.imread(canvas);
  var results = [];
  try {
    for (var i = 0; i < receipts.length; i++) {
      var r = receipts[i];
      var cropped = null;

      // v3.3: お姉ちゃん提案 — corners順序正規化を必ず挟む（Geminiの順序を信頼しない）
      if (r.corners && r.corners.length === 4) {
        var rawCorners = r.corners.map(function(pt) {
          return { x: pt[0], y: pt[1] };
        });
        // 順序正規化: sum/diffヒューリスティクスでTL→TR→BR→BL
        var corners = _orderCornersTLTRBRBL(rawCorners);
        // v3.2: corners座標の妥当性チェック（面積が画像の0.5%未満なら不正）
        var area = _calcQuadArea(corners);
        var imgArea = sw * sh;
        if (area > imgArea * 0.005 && area < imgArea * 0.9) {
          cropped = _perspectiveCropFromCorners(src, corners, padding, maxWidth, quality, sw, sh);
        } else {
          console.warn('[hybrid-crop] R' + (i+1) + ' corners面積不正: ' + Math.round(area) + ' (画像: ' + imgArea + ')');
        }
      }

      // v3.2: corners失敗時 → boundsでCanvas矩形切り出し
      if (!cropped && r.bounds) {
        console.log('[hybrid-crop] R' + (i+1) + ' → boundsフォールバック');
        var bx = Math.round(sw * r.bounds.x / 100);
        var by = Math.round(sh * r.bounds.y / 100);
        var bw = Math.round(sw * r.bounds.w / 100);
        var bh = Math.round(sh * r.bounds.h / 100);
        bx = Math.max(0, bx); by = Math.max(0, by);
        bw = Math.min(sw - bx, bw); bh = Math.min(sh - by, bh);
        if (bw > 30 && bh > 30) {
          // bounds領域を切り出してOpenCVで白紙検出→透視変換
          cropped = _cropBoundsRegion(src, bx, by, bw, bh, padding, maxWidth, quality);
        }
      }

      results.push(cropped);
      console.log('[hybrid-crop] R' + (i+1) + ' ' + (r.store||'?') + ': ' + (cropped ? '✅' : '❌'));
    }
    src.delete();
    return results;
  } catch (e) {
    console.error('[hybrid-crop] エラー:', e);
    try { src.delete(); } catch(x){}
    return null;
  }
}

/**
 * v3.2: 四角形の面積計算（Shoelace formula）
 */
function _calcQuadArea(pts) {
  var n = pts.length;
  var area = 0;
  for (var i = 0; i < n; i++) {
    var j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2);
}

/**
 * v3.2: bounds矩形領域を切り出し→OpenCVで白紙検出して透視変換
 */
function _cropBoundsRegion(srcMat, bx, by, bw, bh, padding, maxWidth, quality) {
  var roi = null, gray = null, blur = null, thresh = null;
  var morphK1 = null, morphK2 = null, closed = null, opened = null;
  try {
    // bounds領域をROIとして切り出し
    roi = srcMat.roi(new cv.Rect(bx, by, bw, bh));

    // v2.5と同じ白紙検出処理: グレースケール→ブラー→閾値→モルフォロジー→輪郭
    gray = new cv.Mat();
    cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
    blur = new cv.Mat();
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    thresh = new cv.Mat();
    cv.threshold(blur, thresh, 170, 255, cv.THRESH_BINARY);

    // モルフォロジー（Close→Open）
    morphK1 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(11, 11));
    closed = new cv.Mat();
    cv.morphologyEx(thresh, closed, cv.MORPH_CLOSE, morphK1);
    morphK2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    opened = new cv.Mat();
    cv.morphologyEx(closed, opened, cv.MORPH_OPEN, morphK2);

    // 輪郭検出
    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();
    cv.findContours(opened, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 最大面積の輪郭を選択
    var maxArea = 0, maxIdx = -1;
    var roiArea = bw * bh;
    for (var c = 0; c < contours.size(); c++) {
      var a = cv.contourArea(contours.get(c));
      if (a > maxArea && a > roiArea * 0.1) { maxArea = a; maxIdx = c; }
    }

    var result = null;
    if (maxIdx >= 0) {
      // minAreaRect→4点取得→透視変換（v2.5と同じ）
      var rect = cv.minAreaRect(contours.get(maxIdx));
      var pts4 = cv.RotatedRect.points(rect);
      var ordered = _orderCornersTLTRBRBL(pts4);
      var corners = ordered.map(function(p) { return { x: p.x, y: p.y }; });
      result = _perspectiveCropFromCorners(roi, corners, padding, maxWidth, quality, bw, bh);
    }

    // クリーンアップ
    roi.delete(); gray.delete(); blur.delete(); thresh.delete();
    morphK1.delete(); morphK2.delete(); closed.delete(); opened.delete();
    contours.delete(); hierarchy.delete();
    return result;
  } catch (e) {
    console.warn('[hybrid-crop] boundsRegionエラー:', e);
    try { if(roi) roi.delete(); } catch(x){}
    try { if(gray) gray.delete(); } catch(x){}
    try { if(blur) blur.delete(); } catch(x){}
    try { if(thresh) thresh.delete(); } catch(x){}
    try { if(morphK1) morphK1.delete(); } catch(x){}
    try { if(morphK2) morphK2.delete(); } catch(x){}
    try { if(closed) closed.delete(); } catch(x){}
    try { if(opened) opened.delete(); } catch(x){}
    return null;
  }
}

/**
 * v3.3: 4点を画像座標系でTL→TR→BR→BLに並べ替え（お姉ちゃん提案のsum/diffヒューリスティクス）
 * TL: min(x+y), BR: max(x+y), TR: min(x-y), BL: max(x-y)
 */
function _orderCornersTLTRBRBL(pts) {
  var sums = pts.map(function(p) { return p.x + p.y; });
  var diffs = pts.map(function(p) { return p.x - p.y; });
  var minSum = Math.min.apply(null, sums);
  var maxSum = Math.max.apply(null, sums);
  var minDiff = Math.min.apply(null, diffs);
  var maxDiff = Math.max.apply(null, diffs);
  var tl = pts[sums.indexOf(minSum)];
  var br = pts[sums.indexOf(maxSum)];
  var tr = pts[diffs.indexOf(minDiff)];
  var bl = pts[diffs.indexOf(maxDiff)];
  return [tl, tr, br, bl];
}

/**
 * v3.0: Gemini corners 4点座標から透視変換で正面補正＋縦回転
 * corners: [{x,y},{x,y},{x,y},{x,y}] 左上→右上→右下→左下
 */
function _perspectiveCropFromCorners(srcMat, corners, padding, maxWidth, quality, imgW, imgH) {
  var srcPts = null, dstPts = null, M = null, warped = null;
  try {
    var tl = corners[0], tr = corners[1], br = corners[2], bl = corners[3];

    // 4点距離からdstW/dstH計算（v2.5で確立した方法）
    var distTop = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
    var distBottom = Math.sqrt(Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2));
    var distLeft = Math.sqrt(Math.pow(bl.x - tl.x, 2) + Math.pow(bl.y - tl.y, 2));
    var distRight = Math.sqrt(Math.pow(br.x - tr.x, 2) + Math.pow(br.y - tr.y, 2));
    var dstW = Math.round(Math.max(distTop, distBottom));
    var dstH = Math.round(Math.max(distLeft, distRight));
    if (dstW < 50 || dstH < 50) return null;

    // 境界クランプ（画像外にはみ出さないように — v2.4で確立）
    tl.x = Math.max(0, Math.min(imgW - 1, tl.x));
    tl.y = Math.max(0, Math.min(imgH - 1, tl.y));
    tr.x = Math.max(0, Math.min(imgW - 1, tr.x));
    tr.y = Math.max(0, Math.min(imgH - 1, tr.y));
    br.x = Math.max(0, Math.min(imgW - 1, br.x));
    br.y = Math.max(0, Math.min(imgH - 1, br.y));
    bl.x = Math.max(0, Math.min(imgW - 1, bl.x));
    bl.y = Math.max(0, Math.min(imgH - 1, bl.y));

    // OpenCV透視変換
    srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y
    ]);
    dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, dstW, 0, dstW, dstH, 0, dstH
    ]);

    M = cv.getPerspectiveTransform(srcPts, dstPts);
    warped = new cv.Mat();
    cv.warpPerspective(srcMat, warped, M, new cv.Size(dstW, dstH),
      cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

    // 横向き判定 — warped画像の実サイズで判定（v2.5で確立、レシートは基本縦長）
    var warpedW = warped.cols;
    var warpedH = warped.rows;
    console.log('[hybrid-crop] warped: ' + warpedW + 'x' + warpedH + ' (W>H=' + (warpedW > warpedH) + ')');
    if (warpedW > warpedH) {
      var rotated = new cv.Mat();
      cv.rotate(warped, rotated, cv.ROTATE_90_CLOCKWISE);
      warped.delete();
      warped = rotated;
      var tmp = dstW; dstW = dstH; dstH = tmp;
      console.log('[hybrid-crop] → 右90度回転適用（お姉ちゃん提案）');
    }

    // maxWidth制限
    var outW = dstW + padding * 2;
    var outH = dstH + padding * 2;
    if (outW > maxWidth) {
      var ratio = maxWidth / outW;
      outW = maxWidth;
      outH = Math.round(outH * ratio);
      var newW = Math.round(dstW * ratio);
      var newH = Math.round(dstH * ratio);
      var resized = new cv.Mat();
      cv.resize(warped, resized, new cv.Size(newW, newH));
      warped.delete();
      warped = resized;
      dstW = newW;
      dstH = newH;
    }

    // 白背景Canvas出力
    var warpCanvas = document.createElement('canvas');
    warpCanvas.width = dstW;
    warpCanvas.height = dstH;
    cv.imshow(warpCanvas, warped);
    var outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    var outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, outW, outH);
    outCtx.drawImage(warpCanvas, padding, padding);
    var dataUrl = outCanvas.toDataURL('image/jpeg', quality);

    srcPts.delete(); dstPts.delete(); M.delete(); warped.delete();
    return dataUrl;
  } catch (e) {
    console.warn('[hybrid-crop] 透視変換エラー:', e);
    try { if(srcPts) srcPts.delete(); } catch(x){}
    try { if(dstPts) dstPts.delete(); } catch(x){}
    try { if(M) M.delete(); } catch(x){}
    try { if(warped) warped.delete(); } catch(x){}
    return null;
  }
}

/**
 * v3.0: OpenCV未ロード時のCanvas切り出しフォールバック（bounds%座標を使用）
 */
async function _cropCornersWithCanvas(img, receipts, scale, padding, maxWidth, quality, origW, origH) {
  var results = [];
  for (var i = 0; i < receipts.length; i++) {
    var r = receipts[i];
    if (r.bounds) {
      var cr = {
        x: Math.round(origW * r.bounds.x / 100),
        y: Math.round(origH * r.bounds.y / 100),
        w: Math.round(origW * r.bounds.w / 100),
        h: Math.round(origH * r.bounds.h / 100)
      };
      cr.x = Math.max(0, cr.x); cr.y = Math.max(0, cr.y);
      cr.w = Math.min(origW - cr.x, cr.w); cr.h = Math.min(origH - cr.y, cr.h);
      results.push(createCroppedImage(img, cr, padding, maxWidth, quality));
    } else {
      results.push(null);
    }
  }
  return results;
}

// ==========================================
// グローバル公開
// ==========================================
window._hasCorners = _hasCorners;
window._cropWithGeminiCorners = _cropWithGeminiCorners;

console.log('[receipt-hybrid-crop.js] ✓ v3.3 ハイブリッド（順序正規化＋boundsフォールバック）');
