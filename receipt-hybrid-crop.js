// receipt-hybrid-crop.js v5.0 — Gemini公式box_2d座標系対応
// Gemini box_2d（0-1000正規化, [ymin,xmin,ymax,xmax]）で各レシート領域を分離
// →OpenCVで白紙検出＋透視変換
// v3.x: corners方式（Gemini精度不足で断念）
// v4.0: bounds方式（%指定、隣接混入問題あり）
// v5.0: Gemini公式box_2d座標系（0-1000正規化, Y座標が先）
// 依存: receipt-multi-crop.js（isOpenCVAvailable）

console.log('[receipt-hybrid-crop.js] ✓ v5.0 box_2d方式（Gemini公式0-1000正規化→OpenCV精密切り出し）');

// ==========================================
// v5.0: 公開チェック関数
// ==========================================

// v5.0: receipts配列にbox_2d座標が含まれるかチェック
function _hasBox2d(receipts) {
  for (var i = 0; i < receipts.length; i++) {
    if (receipts[i].box_2d && Array.isArray(receipts[i].box_2d) && receipts[i].box_2d.length === 4) return true;
  }
  return false;
}
// v4.0互換 — _hasBounds/_hasCornersとして呼ばれる場合も対応
function _hasBounds(receipts) { return _hasBox2d(receipts); }
function _hasCorners(receipts) { return _hasBox2d(receipts); }

// ==========================================
// v5.0: box_2d座標変換ヘルパー
// ==========================================

// v5.0: box_2d [ymin, xmin, ymax, xmax]（0-1000）をピクセル矩形に変換
function _box2dToPixel(box2d, sw, sh) {
  var ymin = box2d[0], xmin = box2d[1], ymax = box2d[2], xmax = box2d[3];
  var bx = Math.max(0, Math.round(xmin / 1000 * sw));
  var by = Math.max(0, Math.round(ymin / 1000 * sh));
  var bw = Math.min(sw - bx, Math.round((xmax - xmin) / 1000 * sw));
  var bh = Math.min(sh - by, Math.round((ymax - ymin) / 1000 * sh));
  return { bx: bx, by: by, bw: bw, bh: bh };
}

// ==========================================
// v5.0: メイン処理
// ==========================================

// v5.0: Gemini box_2d方式メイン
async function _cropWithGeminiCorners(imageDataUrl, receipts, options) {
  var opts = options || {};
  var padding = opts.padding || 15;
  var maxWidth = opts.maxWidth || 700;
  var quality = opts.quality || 0.85;
  var img = await loadImageFromDataUrl(imageDataUrl);
  var origW = img.naturalWidth;
  var origH = img.naturalHeight;
  // 1200pxリサイズ（receipt-ai.jsと同じ座標系）
  var canvas = document.createElement('canvas');
  var scale = Math.min(1, 1200 / Math.max(origW, origH));
  var sw = Math.round(origW * scale);
  var sh = Math.round(origH * scale);
  canvas.width = sw; canvas.height = sh;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, sw, sh);
  if (isOpenCVAvailable()) {
    console.log('[hybrid-crop] v5.0 box_2d方式 (' + receipts.length + '枚, ' + sw + 'x' + sh + ')');
    return _cropBox2dWithOpenCV(canvas, receipts, padding, maxWidth, quality, sw, sh);
  }
  console.log('[hybrid-crop] OpenCV未ロード → Canvas切り出し');
  return _cropBox2dWithCanvas(img, receipts, padding, maxWidth, quality, origW, origH);
}

// ==========================================
// v5.0: OpenCVでbox_2d領域ごとに精密切り出し
// ==========================================

async function _cropBox2dWithOpenCV(canvas, receipts, padding, maxWidth, quality, sw, sh) {
  var src = cv.imread(canvas);
  var results = [];
  try {
    for (var i = 0; i < receipts.length; i++) {
      var r = receipts[i];
      var cropped = null;
      if (r.box_2d && Array.isArray(r.box_2d) && r.box_2d.length === 4) {
        // v5.0: box_2d [ymin, xmin, ymax, xmax] → ピクセル座標変換
        var pix = _box2dToPixel(r.box_2d, sw, sh);
        if (pix.bw > 30 && pix.bh > 30) {
          cropped = _cropBoundsRegion(src, pix.bx, pix.by, pix.bw, pix.bh, padding, maxWidth, quality);
        }
      }
      // OpenCV失敗時→box_2d矩形そのままCanvas切り出し
      if (!cropped && r.box_2d && Array.isArray(r.box_2d)) {
        cropped = _cropBox2dSimple(canvas, r.box_2d, padding, maxWidth, quality, sw, sh);
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

// ==========================================
// v5.0: bounds領域内でOpenCV白紙検出→透視変換（v4.0から継続）
// ==========================================

function _cropBoundsRegion(srcMat, bx, by, bw, bh, padding, maxWidth, quality) {
  var mats = [];
  try {
    var roi = srcMat.roi(new cv.Rect(bx, by, bw, bh)); mats.push(roi);
    // グレースケール→ブラー→閾値→モルフォロジー→輪郭
    var gray = new cv.Mat(); mats.push(gray);
    cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
    var blur = new cv.Mat(); mats.push(blur);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    var thresh = new cv.Mat(); mats.push(thresh);
    cv.threshold(blur, thresh, 170, 255, cv.THRESH_BINARY);
    var k1 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(11, 11)); mats.push(k1);
    var closed = new cv.Mat(); mats.push(closed);
    cv.morphologyEx(thresh, closed, cv.MORPH_CLOSE, k1);
    var k2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)); mats.push(k2);
    var opened = new cv.Mat(); mats.push(opened);
    cv.morphologyEx(closed, opened, cv.MORPH_OPEN, k2);
    var contours = new cv.MatVector(); mats.push(contours);
    var hier = new cv.Mat(); mats.push(hier);
    cv.findContours(opened, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    // 最大面積の輪郭（ROI面積の10%以上）
    var maxA = 0, maxI = -1, roiA = bw * bh;
    for (var c = 0; c < contours.size(); c++) {
      var a = cv.contourArea(contours.get(c));
      if (a > maxA && a > roiA * 0.1) { maxA = a; maxI = c; }
    }
    var result = null;
    if (maxI >= 0) {
      var rect = cv.minAreaRect(contours.get(maxI));
      var pts4 = cv.RotatedRect.points(rect);
      var ordered = _orderCornersTLTRBRBL(pts4);
      result = _warpAndRotate(roi, ordered, padding, maxWidth, quality, bw, bh);
      console.log('[hybrid-crop] OpenCV検出 (面積' + Math.round(maxA/roiA*100) + '%)');
    }
    mats.forEach(function(m) { try { m.delete(); } catch(x){} });
    return result;
  } catch (e) {
    console.warn('[hybrid-crop] boundsRegionエラー:', e);
    mats.forEach(function(m) { try { m.delete(); } catch(x){} });
    return null;
  }
}

// ==========================================
// v4.0: 透視変換＋回転補正（変更なし）
// ==========================================

function _warpAndRotate(srcMat, corners, padding, maxWidth, quality, imgW, imgH) {
  var srcPts = null, dstPts = null, M = null, warped = null;
  try {
    var tl = corners[0], tr = corners[1], br = corners[2], bl = corners[3];
    var dstW = Math.round(Math.max(
      Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y)));
    var dstH = Math.round(Math.max(
      Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y)));
    if (dstW < 30 || dstH < 30) return null;
    // 境界クランプ
    [tl, tr, br, bl].forEach(function(p) {
      p.x = Math.max(0, Math.min(imgW - 1, p.x));
      p.y = Math.max(0, Math.min(imgH - 1, p.y));
    });
    srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, dstW, 0, dstW, dstH, 0, dstH]);
    M = cv.getPerspectiveTransform(srcPts, dstPts);
    warped = new cv.Mat();
    cv.warpPerspective(srcMat, warped, M, new cv.Size(dstW, dstH),
      cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    // 横向き→縦回転
    if (warped.cols > warped.rows) {
      var rot = new cv.Mat();
      cv.rotate(warped, rot, cv.ROTATE_90_CLOCKWISE);
      warped.delete(); warped = rot;
      var tmp = dstW; dstW = dstH; dstH = tmp;
    }
    // maxWidth制限
    if (dstW + padding * 2 > maxWidth) {
      var ratio = maxWidth / (dstW + padding * 2);
      var rW = Math.round(dstW * ratio), rH = Math.round(dstH * ratio);
      var resized = new cv.Mat();
      cv.resize(warped, resized, new cv.Size(rW, rH));
      warped.delete(); warped = resized; dstW = rW; dstH = rH;
    }
    // 白背景Canvas出力
    var outC = document.createElement('canvas');
    outC.width = dstW + padding * 2; outC.height = dstH + padding * 2;
    var oCtx = outC.getContext('2d');
    oCtx.fillStyle = '#FFFFFF';
    oCtx.fillRect(0, 0, outC.width, outC.height);
    var tempC = document.createElement('canvas');
    cv.imshow(tempC, warped);
    oCtx.drawImage(tempC, padding, padding, dstW, dstH);
    srcPts.delete(); dstPts.delete(); M.delete(); warped.delete();
    return outC.toDataURL('image/jpeg', quality);
  } catch (e) {
    console.warn('[hybrid-crop] warpエラー:', e);
    [srcPts, dstPts, M, warped].forEach(function(m) { try { if(m) m.delete(); } catch(x){} });
    return null;
  }
}

// ==========================================
// v4.0: 順序正規化（お姉ちゃん提案のsum/diffヒューリスティクス）
// ==========================================

function _orderCornersTLTRBRBL(pts) {
  var sums = pts.map(function(p) { return p.x + p.y; });
  var diffs = pts.map(function(p) { return p.x - p.y; });
  var tl = pts[sums.indexOf(Math.min.apply(null, sums))];
  var br = pts[sums.indexOf(Math.max.apply(null, sums))];
  var tr = pts[diffs.indexOf(Math.min.apply(null, diffs))];
  var bl = pts[diffs.indexOf(Math.max.apply(null, diffs))];
  return [tl, tr, br, bl];
}

// ==========================================
// v5.0: フォールバック — box_2d矩形Canvas切り出し
// ==========================================

function _cropBox2dSimple(canvas, box2d, padding, maxWidth, quality, sw, sh) {
  try {
    var pix = _box2dToPixel(box2d, sw, sh);
    if (pix.bw < 20 || pix.bh < 20) return null;
    var c = document.createElement('canvas');
    c.width = pix.bw + padding * 2; c.height = pix.bh + padding * 2;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, pix.bx, pix.by, pix.bw, pix.bh, padding, padding, pix.bw, pix.bh);
    return c.toDataURL('image/jpeg', quality);
  } catch (e) { return null; }
}

// v4.0互換フォールバック
function _cropBoundsSimple(canvas, bounds, padding, maxWidth, quality, sw, sh) {
  return _cropBox2dSimple(canvas, bounds, padding, maxWidth, quality, sw, sh);
}

// ==========================================
// v5.0: OpenCV未ロード時のCanvas切り出し
// ==========================================

function _cropBox2dWithCanvas(img, receipts, padding, maxWidth, quality, origW, origH) {
  var results = [];
  for (var i = 0; i < receipts.length; i++) {
    var r = receipts[i], cropped = null;
    if (r.box_2d && Array.isArray(r.box_2d) && r.box_2d.length === 4) {
      var pix = _box2dToPixel(r.box_2d, origW, origH);
      if (pix.bw > 20 && pix.bh > 20) {
        var c = document.createElement('canvas');
        c.width = pix.bw + padding * 2; c.height = pix.bh + padding * 2;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, pix.bx, pix.by, pix.bw, pix.bh, padding, padding, pix.bw, pix.bh);
        cropped = c.toDataURL('image/jpeg', quality);
      }
    }
    results.push(cropped);
  }
  return results;
}

// v4.0互換
function _cropBoundsWithCanvas(img, receipts, padding, maxWidth, quality, origW, origH) {
  return _cropBox2dWithCanvas(img, receipts, padding, maxWidth, quality, origW, origH);
}

// v5.0: グローバル公開
window._hasCorners = _hasCorners;
window._hasBounds = _hasBounds;
window._hasBox2d = _hasBox2d;
window._cropWithGeminiCorners = _cropWithGeminiCorners;
