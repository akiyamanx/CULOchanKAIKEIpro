// ==========================================
// receipt-multi-crop.js v2.2 — 複数レシート自動検出＆切り出し（OpenCV.js版）
// Phase2: 白紙検出＋モルフォロジー＋minAreaRect＋透視変換＋左90度回転で縦補正
// フォールバック: OpenCV未ロード時はCanvas自前処理（v1.0互換）
// 依存: receipt-crop.js（loadImageFromDataUrl, createCroppedImage等）
// ==========================================
// 処理フロー（OpenCV版 v2.1）:
//   1. 画像をCanvasに描画 → cv.imread()
//   2. グレースケール → ガウシアンブラー
//   3. 明るさ閾値(180)で白い紙を二値化
//   4. モルフォロジー（大きめカーネルでClose→Open）
//   5. findContours()で白い紙の輪郭を検出
//   6. 面積フィルタ（2%〜80%）
//   7. minAreaRect()で回転矩形を取得
//   8. 4点順序整理→透視変換で縦方向に補正して切り出し
// ==========================================

// v2.0: OpenCV.js読み込み状態管理
var _opencvReady = false;
var _ocvCheckStart = Date.now();

function _checkOpenCVReady() {
  var sec = Math.round((Date.now() - _ocvCheckStart) / 1000);
  var bar = document.getElementById('ocvDebugBar');
  if (typeof cv !== 'undefined' && typeof cv.Mat === 'function') {
    _opencvReady = true;
    console.log('[multi-crop] ✓ OpenCV.js 準備完了 (' + sec + '秒)');
    if (bar) { bar.style.background = '#d1fae5'; bar.style.color = '#065f46'; bar.innerHTML = '✅ OpenCV.js 準備完了！（' + sec + '秒）'; }
    return;
  }
  if (sec > 30) {
    console.warn('[multi-crop] ✗ OpenCV.js 読み込み失敗 (' + sec + '秒)');
    if (bar) { bar.style.background = '#fee2e2'; bar.style.color = '#991b1b'; bar.innerHTML = '❌ OpenCV.js 読み込み失敗（' + sec + '秒）Canvas版で動作中'; }
    return;
  }
  if (bar) { bar.innerHTML = '⏳ OpenCV.js 読み込み中... ' + sec + '秒 (cv=' + (typeof cv) + ')'; }
  setTimeout(_checkOpenCVReady, 1000);
}
setTimeout(_checkOpenCVReady, 1000);

function isOpenCVAvailable() {
  return _opencvReady && typeof cv !== 'undefined' && typeof cv.Mat === 'function';
}

/**
 * 複数レシートを自動検出して個別切り出し（メインAPI）
 * @param {string} imageDataUrl - 元画像
 * @param {number} expectedCount - AIが認識したレシート枚数
 * @param {object} options - padding, maxWidth, quality
 * @returns {Promise<string[]>} 各レシートの切り出し画像DataURL配列
 */
async function detectAndCropMultipleReceipts(imageDataUrl, expectedCount, options) {
  if (!imageDataUrl || expectedCount <= 0) return [];

  if (expectedCount === 1) {
    if (isOpenCVAvailable()) {
      var singleResults = await _detectWithOpenCV(imageDataUrl, 1, options);
      if (singleResults && singleResults.length > 0) return singleResults;
    }
    var single = await cropReceiptImage(imageDataUrl, options);
    return [single || imageDataUrl];
  }

  if (isOpenCVAvailable()) {
    try {
      var ocvResults = await _detectWithOpenCV(imageDataUrl, expectedCount, options);
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
  return _detectWithCanvas(imageDataUrl, expectedCount, options);
}

// ==========================================
// OpenCV.js版 — 白紙検出＋透視変換＋縦補正
// ==========================================

async function _detectWithOpenCV(imageDataUrl, expectedCount, options) {
  var opts = options || {};
  var padding = opts.padding || 15;
  var maxWidth = opts.maxWidth || 700;
  var quality = opts.quality || 0.85;

  var img = await loadImageFromDataUrl(imageDataUrl);
  var origW = img.naturalWidth;
  var origH = img.naturalHeight;

  // Canvas経由でOpenCVに読み込み（max1200px）
  var canvas = document.createElement('canvas');
  var scale = Math.min(1, 1200 / Math.max(origW, origH));
  var sw = Math.round(origW * scale);
  var sh = Math.round(origH * scale);
  canvas.width = sw;
  canvas.height = sh;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, sw, sh);

  var src = cv.imread(canvas);
  var gray = new cv.Mat();
  var blurred = new cv.Mat();
  var binary = new cv.Mat();
  var closed = new cv.Mat();
  var opened = new cv.Mat();
  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();

  try {
    // v2.1: グレースケール → ブラー → 明るさ閾値で白い紙を検出
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // v2.1: 閾値180で白い紙を検出（Python検証で最適値確認済み）
    cv.threshold(blurred, binary, 180, 255, cv.THRESH_BINARY);

    // v2.1: 大きめモルフォロジーで穴埋め＋ノイズ除去
    var kernelClose = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
    var kernelOpen = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernelClose);
    cv.morphologyEx(closed, opened, cv.MORPH_OPEN, kernelOpen);
    kernelClose.delete();
    kernelOpen.delete();

    // 輪郭検出
    cv.findContours(opened, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 面積フィルタ（2%〜80%）
    var candidates = [];
    var totalArea = sw * sh;
    var minArea = totalArea * 0.02;
    var maxArea = totalArea * 0.80;

    for (var i = 0; i < contours.size(); i++) {
      var cnt = contours.get(i);
      var area = cv.contourArea(cnt);
      if (area >= minArea && area < maxArea) {
        candidates.push({ contour: cnt, area: area });
      }
    }

    candidates.sort(function(a, b) { return b.area - a.area; });
    var topCandidates = candidates.slice(0, expectedCount);

    console.log('[multi-crop/opencv] 輪郭: ' + contours.size()
      + '個、フィルタ後: ' + candidates.length
      + '個、採用: ' + topCandidates.length + '個');

    if (topCandidates.length === 0) {
      _cleanupAll(src, gray, blurred, binary, closed, opened, contours, hierarchy);
      return null;
    }

    // v2.1: 位置順にソート（y座標優先）
    topCandidates.sort(function(a, b) {
      var ra = cv.boundingRect(a.contour);
      var rb = cv.boundingRect(b.contour);
      var ay = Math.floor(ra.y / (sh * 0.3));
      var by = Math.floor(rb.y / (sh * 0.3));
      if (ay !== by) return ay - by;
      return ra.x - rb.x;
    });

    // v2.1: 各候補を透視変換で縦補正して切り出し
    var results = [];
    for (var k = 0; k < topCandidates.length; k++) {
      var cropped = _perspectiveCropFromContour(src, topCandidates[k].contour,
        padding, maxWidth, quality);
      if (!cropped) {
        // フォールバック: 外接矩形で切り出し
        var r = cv.boundingRect(topCandidates[k].contour);
        cropped = _rectCropOcv(img, r, scale, padding, maxWidth, quality, origW, origH);
      }
      results.push(cropped || imageDataUrl);
      console.log('[multi-crop/opencv] レシート' + (k + 1) + ' 切り出し完了');
    }

    while (results.length < expectedCount) results.push(imageDataUrl);

    _cleanupAll(src, gray, blurred, binary, closed, opened, contours, hierarchy);
    return results;

  } catch (e) {
    console.error('[multi-crop/opencv] エラー:', e);
    try { _cleanupAll(src, gray, blurred, binary, closed, opened, contours, hierarchy); } catch(x){}
    return null;
  }
}

/**
 * v2.2: minAreaRect → 透視変換で正面補正 → 縦長に回転
 * シンプルアプローチ: 1.正面にする 2.横向きなら左90度回転
 */
function _perspectiveCropFromContour(srcMat, contour, padding, maxWidth, quality) {
  var srcPts = null, dstPts = null, M = null, warped = null;
  try {
    var rect = cv.minAreaRect(contour);
    var center = rect.center;
    var size = rect.size;
    var angle = rect.angle;
    var wRect = size.width;
    var hRect = size.height;

    // boxPoints相当: 4頂点を計算
    var box = _getBoxPoints(center, size, angle);
    var ordered = _orderBoxPoints(box);
    var tl = ordered[0], tr = ordered[1], br = ordered[2], bl = ordered[3];

    // v2.2: まず元のサイズで正面に補正（回転はしない）
    var dstW = Math.round(wRect > hRect ? wRect : wRect);
    var dstH = Math.round(wRect > hRect ? hRect : hRect);
    if (dstW < 50 || dstH < 50) return null;

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

    // v2.2: 横向き（幅>高さ）なら左90度回転で縦にする
    if (dstW > dstH) {
      var rotated = new cv.Mat();
      cv.rotate(warped, rotated, cv.ROTATE_90_COUNTERCLOCKWISE);
      warped.delete();
      warped = rotated;
      var tmp = dstW; dstW = dstH; dstH = tmp; // サイズ入れ替え
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
    console.warn('[multi-crop/opencv] 透視変換エラー:', e);
    try { if(srcPts) srcPts.delete(); } catch(x){}
    try { if(dstPts) dstPts.delete(); } catch(x){}
    try { if(M) M.delete(); } catch(x){}
    try { if(warped) warped.delete(); } catch(x){}
    return null;
  }
}

/**
 * v2.1: minAreaRectの結果から4頂点を計算（cv.boxPointsの代替）
 */
function _getBoxPoints(center, size, angleDeg) {
  var angleRad = angleDeg * Math.PI / 180;
  var cos = Math.cos(angleRad);
  var sin = Math.sin(angleRad);
  var hw = size.width / 2;
  var hh = size.height / 2;
  // 4頂点: (-hw,-hh), (hw,-hh), (hw,hh), (-hw,hh) を回転
  var offsets = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  var pts = [];
  for (var i = 0; i < 4; i++) {
    var ox = offsets[i][0], oy = offsets[i][1];
    pts.push({
      x: center.x + ox * cos - oy * sin,
      y: center.y + ox * sin + oy * cos
    });
  }
  return pts;
}

/**
 * v2.1: 4点を左上→右上→右下→左下に並べ替え
 */
function _orderBoxPoints(pts) {
  // x+yの和でソート
  var sorted = pts.slice().sort(function(a, b) { return (a.x + a.y) - (b.x + b.y); });
  var tl = sorted[0]; // x+y最小
  var br = sorted[3]; // x+y最大
  // y-xの差でソート
  var diffSorted = pts.slice().sort(function(a, b) { return (a.y - a.x) - (b.y - b.x); });
  var tr = diffSorted[0]; // y-x最小
  var bl = diffSorted[3]; // y-x最大
  return [tl, tr, br, bl];
}

/**
 * 外接矩形で切り出し（フォールバック）
 */
function _rectCropOcv(img, rect, scale, padding, maxWidth, quality, origW, origH) {
  var cr = {
    x: Math.max(0, Math.round(rect.x / scale)),
    y: Math.max(0, Math.round(rect.y / scale)),
    w: Math.round(rect.width / scale),
    h: Math.round(rect.height / scale)
  };
  cr.w = Math.min(origW - cr.x, cr.w);
  cr.h = Math.min(origH - cr.y, cr.h);
  var mx = Math.round(cr.w * 0.02), my = Math.round(cr.h * 0.02);
  cr.x = Math.max(0, cr.x - mx); cr.y = Math.max(0, cr.y - my);
  cr.w = Math.min(origW - cr.x, cr.w + mx*2);
  cr.h = Math.min(origH - cr.y, cr.h + my*2);
  return createCroppedImage(img, cr, padding, maxWidth, quality);
}

function _cleanupAll(s,g,b,bi,c,o,cn,h) {
  try{s.delete();}catch(x){} try{g.delete();}catch(x){}
  try{b.delete();}catch(x){} try{bi.delete();}catch(x){}
  try{c.delete();}catch(x){} try{o.delete();}catch(x){}
  try{cn.delete();}catch(x){} try{h.delete();}catch(x){}
}

// ==========================================
// Canvas版 フォールバック（v1.0互換、OpenCV未ロード時）
// ==========================================
async function _detectWithCanvas(imageDataUrl, expectedCount, options) {
  var opts = options || {};
  var padding = opts.padding || 15;
  var maxWidth = opts.maxWidth || 700;
  var quality = opts.quality || 0.85;
  try {
    var img = await loadImageFromDataUrl(imageDataUrl);
    var origW = img.naturalWidth, origH = img.naturalHeight;
    var scale = Math.min(1, 800 / Math.max(origW, origH));
    var sw = Math.round(origW * scale), sh = Math.round(origH * scale);
    var canvas = document.createElement('canvas');
    canvas.width = sw; canvas.height = sh;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, sw, sh);
    var imageData = ctx.getImageData(0, 0, sw, sh);
    var data = imageData.data;
    var gray = new Uint8Array(sw * sh);
    for (var i = 0; i < gray.length; i++) {
      var idx = i * 4;
      gray[i] = Math.round(data[idx]*0.299 + data[idx+1]*0.587 + data[idx+2]*0.114);
    }
    var threshold = _cThresh(gray);
    var bin = new Uint8Array(sw * sh);
    for (var j = 0; j < gray.length; j++) bin[j] = gray[j] > threshold ? 1 : 0;
    bin = _cMorphClose(bin, sw, sh, 3);
    bin = _cMorphOpen(bin, sw, sh, 2);
    var labels = _cComp(bin, sw, sh);
    var regions = _cRegions(labels.labelMap, sw, sh);
    var minArea = sw * sh * 0.01;
    regions = regions.filter(function(r) { return r.area >= minArea; });
    regions.sort(function(a, b) { return b.area - a.area; });
    var top = regions.slice(0, expectedCount);
    if (top.length === 0) {
      var fb = []; for (var f = 0; f < expectedCount; f++) fb.push(imageDataUrl); return fb;
    }
    top.sort(function(a, b) {
      var ay = Math.floor(a.y / (sh * 0.3)), by = Math.floor(b.y / (sh * 0.3));
      return ay !== by ? ay - by : a.x - b.x;
    });
    var results = [];
    for (var k = 0; k < top.length; k++) {
      var rg = top[k];
      var cr = { x: Math.round(rg.x/scale), y: Math.round(rg.y/scale), w: Math.round(rg.w/scale), h: Math.round(rg.h/scale) };
      cr.x = Math.max(0, cr.x); cr.y = Math.max(0, cr.y);
      cr.w = Math.min(origW-cr.x, cr.w); cr.h = Math.min(origH-cr.y, cr.h);
      var mx = Math.round(cr.w*0.02), my = Math.round(cr.h*0.02);
      cr.x = Math.max(0, cr.x-mx); cr.y = Math.max(0, cr.y-my);
      cr.w = Math.min(origW-cr.x, cr.w+mx*2); cr.h = Math.min(origH-cr.y, cr.h+my*2);
      results.push(createCroppedImage(img, cr, padding, maxWidth, quality));
    }
    while (results.length < expectedCount) results.push(imageDataUrl);
    return results;
  } catch (e) {
    console.error('[multi-crop/canvas] エラー:', e);
    var ef = []; for (var z = 0; z < expectedCount; z++) ef.push(imageDataUrl); return ef;
  }
}

// Canvas版ヘルパー（圧縮）
function _cThresh(g){var h=new Array(256).fill(0);for(var i=0;i<g.length;i++)h[g[i]]++;var tgt=g.length*0.25,c=0,bs=255;for(var t=255;t>=0;t--){c+=h[t];if(c>=tgt){bs=t;break;}}var da=0,dc=0;for(var d=0;d<bs;d++){da+=d*h[d];dc+=h[d];}da=dc>0?da/dc:80;return Math.max(120,Math.min(200,Math.round((bs+da)/2)));}
function _cDil(b,w,h,r){var res=new Uint8Array(w*h);for(var y=0;y<h;y++)for(var x=0;x<w;x++){var f=false;for(var dy=-r;dy<=r&&!f;dy++)for(var dx=-r;dx<=r&&!f;dx++){var ny=y+dy,nx=x+dx;if(ny>=0&&ny<h&&nx>=0&&nx<w&&b[ny*w+nx])f=true;}res[y*w+x]=f?1:0;}return res;}
function _cEro(b,w,h,r){var res=new Uint8Array(w*h);for(var y=0;y<h;y++)for(var x=0;x<w;x++){var a=true;for(var dy=-r;dy<=r&&a;dy++)for(var dx=-r;dx<=r&&a;dx++){var ny=y+dy,nx=x+dx;if(ny>=0&&ny<h&&nx>=0&&nx<w){if(!b[ny*w+nx])a=false;}else a=false;}res[y*w+x]=a?1:0;}return res;}
function _cMorphClose(b,w,h,r){return _cEro(_cDil(b,w,h,r),w,h,r);}
function _cMorphOpen(b,w,h,r){return _cDil(_cEro(b,w,h,r),w,h,r);}
function _cRoot(eq,l){while(eq[l]!==undefined)l=eq[l];return l;}
function _cComp(bin,w,h){var lm=new Int32Array(w*h),nl=1,eq={};for(var y=0;y<h;y++)for(var x=0;x<w;x++){var idx=y*w+x;if(!bin[idx]){lm[idx]=0;continue;}var ab=(y>0)?lm[(y-1)*w+x]:0,lt=(x>0)?lm[y*w+(x-1)]:0;if(!ab&&!lt)lm[idx]=nl++;else if(ab&&!lt)lm[idx]=ab;else if(!ab&&lt)lm[idx]=lt;else{var mn=Math.min(ab,lt),mx=Math.max(ab,lt);lm[idx]=mn;if(mn!==mx){var rmx=_cRoot(eq,mx),rmn=_cRoot(eq,mn);if(rmx!==rmn)eq[Math.max(rmx,rmn)]=Math.min(rmx,rmn);}}}for(var i=0;i<lm.length;i++)if(lm[i]>0)lm[i]=_cRoot(eq,lm[i]);return{labelMap:lm,labelCount:nl-1};}
function _cRegions(lm,w,h){var rd={};for(var i=0;i<lm.length;i++){var l=lm[i];if(!l)continue;var x=i%w,y=Math.floor(i/w);if(!rd[l])rd[l]={minX:x,minY:y,maxX:x,maxY:y,px:0};var r=rd[l];if(x<r.minX)r.minX=x;if(x>r.maxX)r.maxX=x;if(y<r.minY)r.minY=y;if(y>r.maxY)r.maxY=y;r.px++;}var regions=[],ks=Object.keys(rd);for(var k=0;k<ks.length;k++){var r2=rd[ks[k]];regions.push({x:r2.minX,y:r2.minY,w:r2.maxX-r2.minX+1,h:r2.maxY-r2.minY+1,area:r2.px});}return regions;}

// ==========================================
// グローバル公開
// ==========================================
window.detectAndCropMultipleReceipts = detectAndCropMultipleReceipts;
window.isOpenCVAvailable = isOpenCVAvailable;

console.log('[receipt-multi-crop.js] ✓ v2.2 OpenCV.js版（白紙検出+透視変換+左90度回転補正）');
