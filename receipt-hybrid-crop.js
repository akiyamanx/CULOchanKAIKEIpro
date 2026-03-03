// receipt-hybrid-crop.js v4.0 — Gemini bounds方式切り出し
// Gemini bounds(%)で各レシート領域を分離→OpenCVで白紙検出＋透視変換
// v3.x: corners方式（Gemini精度不足で断念）
// v4.0: bounds方式メイン（Geminiの得意な大まかな領域指定を活用）
// 依存: receipt-multi-crop.js（isOpenCVAvailable）

console.log('[receipt-hybrid-crop.js] ✓ v4.0 bounds方式（Gemini領域分離→OpenCV精密切り出し）');

// ==========================================
// v4.0: 公開チェック関数
// ==========================================

// v4.0: receipts配列にbounds座標が含まれるかチェック
function _hasBounds(receipts) {
  for (var i = 0; i < receipts.length; i++) {
    if (receipts[i].bounds && typeof receipts[i].bounds.x === 'number') return true;
  }
  return false;
}
// v3.x互換 — receipt-multi-crop.jsから呼ばれる
function _hasCorners(receipts) { return _hasBounds(receipts); }

// ==========================================
// v4.0: メイン処理
// ==========================================

// v4.0: Gemini bounds方式メイン
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
    console.log('[hybrid-crop] v4.0 bounds方式 (' + receipts.length + '枚, ' + sw + 'x' + sh + ')');
    return _cropBoundsWithOpenCV(canvas, receipts, padding, maxWidth, quality, sw, sh);
  }
  console.log('[hybrid-crop] OpenCV未ロード → Canvas切り出し');
  return _cropBoundsWithCanvas(img, receipts, padding, maxWidth, quality, origW, origH);
}

// ==========================================
// v4.0: OpenCVでbounds領域ごとに精密切り出し
// ==========================================

async function _cropBoundsWithOpenCV(canvas, receipts, padding, maxWidth, quality, sw, sh) {
  var src = cv.imread(canvas);
  var results = [];
  try {
    for (var i = 0; i < receipts.length; i++) {
      var r = receipts[i];
      var cropped = null;
      if (r.bounds) {
        // v4.1: boundsそのまま使用（shrinkなし）
        var bx = Math.max(0, Math.round(sw * r.bounds.x / 100));
        var by = Math.max(0, Math.round(sh * r.bounds.y / 100));
        var bw = Math.min(sw - bx, Math.round(sw * r.bounds.w / 100));
        var bh = Math.min(sh - by, Math.round(sh * r.bounds.h / 100));
        if (bw > 30 && bh > 30) {
          cropped = _cropBoundsRegion(src, bx, by, bw, bh, padding, maxWidth, quality);
        }
      }
      // OpenCV失敗時→bounds矩形そのままCanvas切り出し
      if (!cropped && r.bounds) {
        cropped = _cropBoundsSimple(canvas, r.bounds, padding, maxWidth, quality, sw, sh);
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
// v4.0: bounds領域内でOpenCV白紙検出→透視変換
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
// v4.0: 透視変換＋回転補正
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
    // cv.imshowでwarped→tempCanvasに描画→outCにpadding付きで配置
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
// v4.0: フォールバック — bounds矩形Canvas切り出し
// ==========================================

function _cropBoundsSimple(canvas, bounds, padding, maxWidth, quality, sw, sh) {
  try {
    var bx = Math.max(0, Math.round(sw * bounds.x / 100));
    var by = Math.max(0, Math.round(sh * bounds.y / 100));
    var bw = Math.min(sw - bx, Math.round(sw * bounds.w / 100));
    var bh = Math.min(sh - by, Math.round(sh * bounds.h / 100));
    if (bw < 20 || bh < 20) return null;
    var c = document.createElement('canvas');
    c.width = bw + padding * 2; c.height = bh + padding * 2;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, bx, by, bw, bh, padding, padding, bw, bh);
    return c.toDataURL('image/jpeg', quality);
  } catch (e) { return null; }
}

// ==========================================
// v4.0: OpenCV未ロード時のCanvas切り出し
// ==========================================

function _cropBoundsWithCanvas(img, receipts, padding, maxWidth, quality, origW, origH) {
  var results = [];
  for (var i = 0; i < receipts.length; i++) {
    var r = receipts[i], cropped = null;
    if (r.bounds) {
      var bx = Math.max(0, Math.round(origW * r.bounds.x / 100));
      var by = Math.max(0, Math.round(origH * r.bounds.y / 100));
      var bw = Math.min(origW - bx, Math.round(origW * r.bounds.w / 100));
      var bh = Math.min(origH - by, Math.round(origH * r.bounds.h / 100));
      if (bw > 20 && bh > 20) {
        var c = document.createElement('canvas');
        c.width = bw + padding * 2; c.height = bh + padding * 2;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, bx, by, bw, bh, padding, padding, bw, bh);
        cropped = c.toDataURL('image/jpeg', quality);
      }
    }
    results.push(cropped);
  }
  return results;
}

// v4.0: グローバル公開
window._hasCorners = _hasCorners;
window._hasBounds = _hasBounds;
window._cropWithGeminiCorners = _cropWithGeminiCorners;
