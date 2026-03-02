// ==========================================
// receipt-hybrid-crop.js v3.1 — ハイブリッド方式切り出し
// このファイルはGemini AIが返すcorners座標を使って
// OpenCV.jsで透視変換＋回転補正する機能を提供する
//
// v3.0新規作成: Gemini座標検出＋OpenCV精密切り出し
// v3.1修正: Geminiは1200px座標系で返すのでscale掛け算を削除（二重スケーリング修正）
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
      if (!r.corners || r.corners.length !== 4) {
        console.warn('[hybrid-crop] レシート' + (i+1) + ': corners不正、スキップ');
        results.push(null);
        continue;
      }
      // v3.1修正: Geminiは1200pxリサイズ後の座標系で返すのでscale不要
      var corners = r.corners.map(function(pt) {
        return { x: pt[0], y: pt[1] };
      });
      var cropped = _perspectiveCropFromCorners(src, corners, padding, maxWidth, quality, sw, sh);
      results.push(cropped);
      console.log('[hybrid-crop] レシート' + (i+1) + ' (' + (r.store||'不明') + ') ' + (cropped ? '✅成功' : '❌失敗'));
    }
    src.delete();
    return results;
  } catch (e) {
    console.error('[hybrid-crop] OpenCV切り出しエラー:', e);
    try { src.delete(); } catch(x){}
    return null;
  }
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
      cv.rotate(warped, rotated, cv.ROTATE_90_COUNTERCLOCKWISE);
      warped.delete();
      warped = rotated;
      var tmp = dstW; dstW = dstH; dstH = tmp;
      console.log('[hybrid-crop] → 左90度回転適用');
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

console.log('[receipt-hybrid-crop.js] ✓ v3.1 ハイブリッド方式（Gemini1200px座標→OpenCV透視変換）');
