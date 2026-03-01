// ==========================================
// receipt-multi-crop.js v2.0 — 複数レシート自動検出＆切り出し（OpenCV.js版）
// Phase2: OpenCV.jsのCanny＋findContours＋透視変換で高精度検出
// フォールバック: OpenCV未ロード時はCanvas自前処理（v1.0互換）
// 依存: receipt-crop.js（loadImageFromDataUrl, createCroppedImage等）
// ==========================================
// 処理フロー（OpenCV版）:
//   1. 画像をCanvasに描画 → cv.imread()
//   2. グレースケール → ガウシアンブラー → Cannyエッジ検出
//   3. 膨張処理でエッジの隙間を埋める
//   4. findContours()で輪郭検出
//   5. 面積フィルタ＋approxPolyDP()で四角形近似
//   6. warpPerspective()で透視変換（斜め→まっすぐ）
//   7. 各レシートを白背景に配置して返す
// ==========================================

// v2.0追加: OpenCV.js読み込み状態管理
var _opencvReady = false;

// v2.0: OpenCV.jsの読み込み完了をポーリングで検出
function _checkOpenCVReady() {
  if (typeof cv !== 'undefined' && typeof cv.Mat === 'function') {
    _opencvReady = true;
    console.log('[multi-crop] ✓ OpenCV.js 準備完了');
    return;
  }
  setTimeout(_checkOpenCVReady, 500);
}
// async読み込みなのでポーリング開始
setTimeout(_checkOpenCVReady, 1000);

/**
 * OpenCV.jsが使えるかチェック
 */
function isOpenCVAvailable() {
  return _opencvReady && typeof cv !== 'undefined' && typeof cv.Mat === 'function';
}

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
    if (isOpenCVAvailable()) {
      var singleResults = await detectWithOpenCV(imageDataUrl, 1, options);
      if (singleResults && singleResults.length > 0) return singleResults;
    }
    var single = await cropReceiptImage(imageDataUrl, options);
    return [single || imageDataUrl];
  }

  // v2.0: OpenCVが使える場合はOpenCV版で処理
  if (isOpenCVAvailable()) {
    try {
      var ocvResults = await detectWithOpenCV(imageDataUrl, expectedCount, options);
      if (ocvResults && ocvResults.length > 0) {
        console.log('[multi-crop] OpenCV版で ' + ocvResults.length + '枚検出成功');
        return ocvResults;
      }
    } catch (e) {
      console.warn('[multi-crop] OpenCV版エラー、Canvas版にフォールバック:', e);
    }
  } else {
    console.log('[multi-crop] OpenCV未ロード、Canvas版で処理');
  }

  // フォールバック: v1.0のCanvas自前処理
  return detectWithCanvas(imageDataUrl, expectedCount, options);
}


// ==========================================
// OpenCV.js版 検出＆切り出し
// ==========================================

/**
 * OpenCV.jsでレシートを検出＆切り出し
 */
async function detectWithOpenCV(imageDataUrl, expectedCount, options) {
  var opts = options || {};
  var padding = opts.padding || 15;
  var maxWidth = opts.maxWidth || 700;
  var quality = opts.quality || 0.85;

  var img = await loadImageFromDataUrl(imageDataUrl);
  var origW = img.naturalWidth;
  var origH = img.naturalHeight;

  // Canvas経由でOpenCVに読み込み
  var canvas = document.createElement('canvas');
  // v2.0: max1200pxで処理（OpenCVは高速なので大きめOK）
  var scale = Math.min(1, 1200 / Math.max(origW, origH));
  var sw = Math.round(origW * scale);
  var sh = Math.round(origH * scale);
  canvas.width = sw;
  canvas.height = sh;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, sw, sh);

  // OpenCV Mat作成
  var src = cv.imread(canvas);
  var gray = new cv.Mat();
  var blurred = new cv.Mat();
  var edges = new cv.Mat();
  var dilated = new cv.Mat();
  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();

  try {
    // グレースケール
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // ガウシアンブラー（ノイズ除去）
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Cannyエッジ検出（★Phase1.8で欲しかった機能）
    cv.Canny(blurred, edges, 50, 150);

    // 膨張処理（エッジの隙間を埋めて輪郭を閉じる）
    var kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2);
    kernel.delete();

    // 輪郭検出
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 輪郭を面積でフィルタ＋四角形近似
    var candidates = [];
    var minArea = sw * sh * 0.02; // 画像全体の2%以上

    for (var i = 0; i < contours.size(); i++) {
      var cnt = contours.get(i);
      var area = cv.contourArea(cnt);
      if (area < minArea) continue;

      // 四角形近似
      var peri = cv.arcLength(cnt, true);
      var approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      // 外接矩形
      var rect = cv.boundingRect(cnt);

      candidates.push({
        approx: approx,
        area: area,
        rect: rect,
        isQuad: approx.rows === 4
      });
    }

    // 面積の大きい順にソート
    candidates.sort(function(a, b) { return b.area - a.area; });

    // 上位N枚を採用
    var topCandidates = candidates.slice(0, expectedCount);

    console.log('[multi-crop/opencv] 輪郭: ' + contours.size()
      + '個、フィルタ後: ' + candidates.length
      + '個、採用: ' + topCandidates.length + '個');

    if (topCandidates.length === 0) {
      _cleanupOcvMats(src, gray, blurred, edges, dilated, contours, hierarchy);
      _cleanupCandidates(candidates);
      return null;
    }

    // 位置順にソート（y座標優先で左上→右下）
    topCandidates.sort(function(a, b) {
      var ay = Math.floor(a.rect.y / (sh * 0.3));
      var by = Math.floor(b.rect.y / (sh * 0.3));
      if (ay !== by) return ay - by;
      return a.rect.x - b.rect.x;
    });

    // 各候補を切り出し
    var results = [];
    for (var k = 0; k < topCandidates.length; k++) {
      var cand = topCandidates[k];
      var cropped = null;

      if (cand.isQuad) {
        // v2.0: 四角形近似成功 → 透視変換で斜め補正
        cropped = _perspectiveCrop(src, cand.approx, padding, maxWidth, quality);
      }
      if (!cropped) {
        // 四角形でない or 透視変換失敗 → 外接矩形で切り出し
        cropped = _rectCrop(img, cand.rect, scale, padding, maxWidth, quality, origW, origH);
      }

      results.push(cropped || imageDataUrl);
      console.log('[multi-crop/opencv] レシート' + (k + 1) + ': '
        + (cand.isQuad ? '透視変換' : '矩形') + ' area=' + Math.round(cand.area));
    }

    // 検出数が足りない場合、残りは元画像で埋める
    while (results.length < expectedCount) {
      results.push(imageDataUrl);
    }

    _cleanupOcvMats(src, gray, blurred, edges, dilated, contours, hierarchy);
    _cleanupCandidates(candidates);
    return results;

  } catch (e) {
    console.error('[multi-crop/opencv] エラー:', e);
    try { _cleanupOcvMats(src, gray, blurred, edges, dilated, contours, hierarchy); } catch(x){}
    return null;
  }
}

/**
 * v2.0: 透視変換でレシートを正面から見た状態に補正
 */
function _perspectiveCrop(srcMat, approx, padding, maxWidth, quality) {
  var srcPts = null, dstPts = null, M = null, warped = null;
  try {
    // 4頂点を取得
    var pts = [];
    for (var i = 0; i < 4; i++) {
      pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
    }
    var ordered = _orderPoints(pts);

    // 出力サイズを算出
    var widthA = Math.hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y);
    var widthB = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
    var dstW = Math.round(Math.max(widthA, widthB));

    var heightA = Math.hypot(ordered[1].x - ordered[2].x, ordered[1].y - ordered[2].y);
    var heightB = Math.hypot(ordered[0].x - ordered[3].x, ordered[0].y - ordered[3].y);
    var dstH = Math.round(Math.max(heightA, heightB));

    if (dstW < 50 || dstH < 50) return null;

    // 変換元＆変換先の4点
    srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      ordered[0].x, ordered[0].y, ordered[1].x, ordered[1].y,
      ordered[2].x, ordered[2].y, ordered[3].x, ordered[3].y
    ]);
    dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, dstW, 0, dstW, dstH, 0, dstH
    ]);

    // 透視変換
    M = cv.getPerspectiveTransform(srcPts, dstPts);
    warped = new cv.Mat();
    cv.warpPerspective(srcMat, warped, M, new cv.Size(dstW, dstH),
      cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

    // maxWidth制限
    var outW = dstW + padding * 2;
    var outH = dstH + padding * 2;
    if (outW > maxWidth) {
      var ratio = maxWidth / outW;
      outW = maxWidth;
      outH = Math.round(outH * ratio);
      dstW = Math.round(dstW * ratio);
      dstH = Math.round(dstH * ratio);
      var resized = new cv.Mat();
      cv.resize(warped, resized, new cv.Size(dstW, dstH));
      warped.delete();
      warped = resized;
    }

    // Canvasに描画
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
    console.warn('[multi-crop/opencv] 透視変換エラー:', e);
    try { if(srcPts) srcPts.delete(); } catch(x){}
    try { if(dstPts) dstPts.delete(); } catch(x){}
    try { if(M) M.delete(); } catch(x){}
    try { if(warped) warped.delete(); } catch(x){}
    return null;
  }
}

/**
 * 4点を左上・右上・右下・左下の順に並べ替え
 */
function _orderPoints(pts) {
  var sumSort = pts.slice().sort(function(a, b) { return (a.x + a.y) - (b.x + b.y); });
  var tl = sumSort[0]; // x+y最小 → 左上
  var br = sumSort[3]; // x+y最大 → 右下
  var diffSort = pts.slice().sort(function(a, b) { return (a.y - a.x) - (b.y - b.x); });
  var tr = diffSort[0]; // y-x最小 → 右上
  var bl = diffSort[3]; // y-x最大 → 左下
  return [tl, tr, br, bl];
}

/**
 * 外接矩形で切り出し（透視変換できない場合のフォールバック）
 */
function _rectCrop(img, rect, scale, padding, maxWidth, quality, origW, origH) {
  var cropRect = {
    x: Math.round(rect.x / scale),
    y: Math.round(rect.y / scale),
    w: Math.round(rect.width / scale),
    h: Math.round(rect.height / scale)
  };
  cropRect.x = Math.max(0, cropRect.x);
  cropRect.y = Math.max(0, cropRect.y);
  cropRect.w = Math.min(origW - cropRect.x, cropRect.w);
  cropRect.h = Math.min(origH - cropRect.y, cropRect.h);
  var mx = Math.round(cropRect.w * 0.02);
  var my = Math.round(cropRect.h * 0.02);
  cropRect.x = Math.max(0, cropRect.x - mx);
  cropRect.y = Math.max(0, cropRect.y - my);
  cropRect.w = Math.min(origW - cropRect.x, cropRect.w + mx * 2);
  cropRect.h = Math.min(origH - cropRect.y, cropRect.h + my * 2);
  return createCroppedImage(img, cropRect, padding, maxWidth, quality);
}

// v2.0: OpenCV Mat一括解放
function _cleanupOcvMats(s, g, b, e, d, c, h) {
  try{s.delete();}catch(x){}
  try{g.delete();}catch(x){}
  try{b.delete();}catch(x){}
  try{e.delete();}catch(x){}
  try{d.delete();}catch(x){}
  try{c.delete();}catch(x){}
  try{h.delete();}catch(x){}
}

function _cleanupCandidates(cands) {
  if (!cands) return;
  for (var i = 0; i < cands.length; i++) {
    try { cands[i].approx.delete(); } catch(x){}
  }
}


// ==========================================
// Canvas版 フォールバック（v1.0互換、OpenCV未ロード時）
// ==========================================

async function detectWithCanvas(imageDataUrl, expectedCount, options) {
  var opts = options || {};
  var padding = opts.padding || 15;
  var maxWidth = opts.maxWidth || 700;
  var quality = opts.quality || 0.85;

  try {
    var img = await loadImageFromDataUrl(imageDataUrl);
    var origW = img.naturalWidth;
    var origH = img.naturalHeight;
    var scale = Math.min(1, 800 / Math.max(origW, origH));
    var sw = Math.round(origW * scale);
    var sh = Math.round(origH * scale);

    var canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, sw, sh);

    var imageData = ctx.getImageData(0, 0, sw, sh);
    var data = imageData.data;
    var gray = new Uint8Array(sw * sh);
    for (var i = 0; i < gray.length; i++) {
      var idx = i * 4;
      gray[i] = Math.round(data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);
    }

    var threshold = _canvasThreshold(gray, sw, sh);
    var binary = new Uint8Array(sw * sh);
    for (var j = 0; j < gray.length; j++) binary[j] = gray[j] > threshold ? 1 : 0;

    binary = _cMorphClose(binary, sw, sh, 3);
    binary = _cMorphOpen(binary, sw, sh, 2);

    var labels = _cComponents(binary, sw, sh);
    var regions = _cRegions(labels.labelMap, labels.labelCount, sw, sh);

    var minArea = sw * sh * 0.01;
    regions = regions.filter(function(r) { return r.area >= minArea; });
    regions.sort(function(a, b) { return b.area - a.area; });
    var topRegions = regions.slice(0, expectedCount);

    console.log('[multi-crop/canvas] 検出: ' + regions.length + '個、採用: ' + topRegions.length + '個');

    if (topRegions.length === 0) {
      var fb = [];
      for (var f = 0; f < expectedCount; f++) fb.push(imageDataUrl);
      return fb;
    }

    topRegions.sort(function(a, b) {
      var ay = Math.floor(a.y / (sh * 0.3));
      var by = Math.floor(b.y / (sh * 0.3));
      if (ay !== by) return ay - by;
      return a.x - b.x;
    });

    var results = [];
    for (var k = 0; k < topRegions.length; k++) {
      var rg = topRegions[k];
      var cr = {
        x: Math.round(rg.x / scale), y: Math.round(rg.y / scale),
        w: Math.round(rg.w / scale), h: Math.round(rg.h / scale)
      };
      cr.x = Math.max(0, cr.x); cr.y = Math.max(0, cr.y);
      cr.w = Math.min(origW - cr.x, cr.w); cr.h = Math.min(origH - cr.y, cr.h);
      var mx = Math.round(cr.w * 0.02), my = Math.round(cr.h * 0.02);
      cr.x = Math.max(0, cr.x - mx); cr.y = Math.max(0, cr.y - my);
      cr.w = Math.min(origW - cr.x, cr.w + mx*2);
      cr.h = Math.min(origH - cr.y, cr.h + my*2);
      results.push(createCroppedImage(img, cr, padding, maxWidth, quality));
    }
    while (results.length < expectedCount) results.push(imageDataUrl);
    return results;
  } catch (e) {
    console.error('[multi-crop/canvas] エラー:', e);
    var ef = [];
    for (var z = 0; z < expectedCount; z++) ef.push(imageDataUrl);
    return ef;
  }
}

// === Canvas版ヘルパー（圧縮版） ===
function _canvasThreshold(g,w,h){var hi=new Array(256).fill(0);for(var i=0;i<g.length;i++)hi[g[i]]++;var tgt=g.length*0.25,cnt=0,bs=255;for(var t=255;t>=0;t--){cnt+=hi[t];if(cnt>=tgt){bs=t;break;}}var da=0,dc=0;for(var d=0;d<bs;d++){da+=d*hi[d];dc+=hi[d];}da=dc>0?da/dc:80;return Math.max(120,Math.min(200,Math.round((bs+da)/2)));}
function _cDilate(b,w,h,r){var res=new Uint8Array(w*h);for(var y=0;y<h;y++)for(var x=0;x<w;x++){var f=false;for(var dy=-r;dy<=r&&!f;dy++)for(var dx=-r;dx<=r&&!f;dx++){var ny=y+dy,nx=x+dx;if(ny>=0&&ny<h&&nx>=0&&nx<w&&b[ny*w+nx])f=true;}res[y*w+x]=f?1:0;}return res;}
function _cErode(b,w,h,r){var res=new Uint8Array(w*h);for(var y=0;y<h;y++)for(var x=0;x<w;x++){var a=true;for(var dy=-r;dy<=r&&a;dy++)for(var dx=-r;dx<=r&&a;dx++){var ny=y+dy,nx=x+dx;if(ny>=0&&ny<h&&nx>=0&&nx<w){if(!b[ny*w+nx])a=false;}else a=false;}res[y*w+x]=a?1:0;}return res;}
function _cMorphClose(b,w,h,r){return _cErode(_cDilate(b,w,h,r),w,h,r);}
function _cMorphOpen(b,w,h,r){return _cDilate(_cErode(b,w,h,r),w,h,r);}
function _cRoot(eq,l){while(eq[l]!==undefined)l=eq[l];return l;}
function _cComponents(bin,w,h){var lm=new Int32Array(w*h),nl=1,eq={};for(var y=0;y<h;y++)for(var x=0;x<w;x++){var idx=y*w+x;if(!bin[idx]){lm[idx]=0;continue;}var ab=(y>0)?lm[(y-1)*w+x]:0,lt=(x>0)?lm[y*w+(x-1)]:0;if(!ab&&!lt)lm[idx]=nl++;else if(ab&&!lt)lm[idx]=ab;else if(!ab&&lt)lm[idx]=lt;else{var mn=Math.min(ab,lt),mx=Math.max(ab,lt);lm[idx]=mn;if(mn!==mx){var rmx=_cRoot(eq,mx),rmn=_cRoot(eq,mn);if(rmx!==rmn)eq[Math.max(rmx,rmn)]=Math.min(rmx,rmn);}}}for(var i=0;i<lm.length;i++)if(lm[i]>0)lm[i]=_cRoot(eq,lm[i]);return{labelMap:lm,labelCount:nl-1};}
function _cRegions(lm,lc,w,h){var rd={};for(var i=0;i<lm.length;i++){var l=lm[i];if(!l)continue;var x=i%w,y=Math.floor(i/w);if(!rd[l])rd[l]={minX:x,minY:y,maxX:x,maxY:y,px:0};var r=rd[l];if(x<r.minX)r.minX=x;if(x>r.maxX)r.maxX=x;if(y<r.minY)r.minY=y;if(y>r.maxY)r.maxY=y;r.px++;}var regions=[],ks=Object.keys(rd);for(var k=0;k<ks.length;k++){var r2=rd[ks[k]];regions.push({x:r2.minX,y:r2.minY,w:r2.maxX-r2.minX+1,h:r2.maxY-r2.minY+1,area:r2.px});}return regions;}


// ==========================================
// グローバル公開
// ==========================================
window.detectAndCropMultipleReceipts = detectAndCropMultipleReceipts;
window.isOpenCVAvailable = isOpenCVAvailable;

console.log('[receipt-multi-crop.js] ✓ v2.0 複数レシート自動検出（OpenCV.js + Canvasフォールバック）');
