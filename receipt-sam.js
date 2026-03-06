// ==========================================
// receipt-sam.js v1.0 — SAM2.1レシート自動切り抜き
// CULOchanKAIKEIpro SAM2.1統合モジュール
// ==========================================
// このファイルは何をするか:
//   SAM2.1-tiny ONNXモデルでレシート写真から個別レシートを
//   タップ→マスク→切り抜きする。結果はmultiImageDataUrlsに格納し
//   既存のAI解析フローに合流する。
//   SAM未ロード時は手動枠指定にフォールバック。
//
// 特徴:
//   - スプラッシュ裏でモデル読込（非同期）
//   - 画像選択時にエンコーダー事前実行（体感待ち時間ゼロ）
//   - Service Workerキャッシュ対応（初回後は2秒でロード）
//
// 依存: ONNX Runtime Web (ort.min.js), globals.js, receipt-core.js
// ==========================================

// v1.0 - SAM2.1統合初版（エンコーダー事前実行＋SWキャッシュ対応）

(function() {
  'use strict';

  // 定数
  var ENC_URL = 'https://huggingface.co/akiyamanx/sam2.1-hiera-tiny-onnx/resolve/main/sam2.1_hiera_tiny.encoder.ort';
  var DEC_URL = 'https://huggingface.co/akiyamanx/sam2.1-hiera-tiny-onnx/resolve/main/sam2.1_hiera_tiny.decoder.onnx';
  var SZ = 1024;      // SAM2.1入力サイズ
  var MSZ = 256;       // デコーダー出力マスクサイズ
  var MCOL = [128, 0, 128, 100]; // 紫色半透明マスク(RGBA)

  // 状態
  var encSession = null;   // エンコーダーセッション
  var decSession = null;   // デコーダーセッション
  var encOut = null;       // エンコーダー出力（image_embed等）
  var imgInfo = null;      // 前処理画像情報
  var curMask = null;      // 最新マスク(256x256)
  var cropList = [];       // SAM切り抜き画像配列
  var encoding = false;    // エンコーダー実行中フラグ
  var preEncDataUrl = null; // 事前エンコード済みの画像DataURL

  // グローバルフラグ
  window._samReady = false;

  // ==========================================
  // モデル読込（スプラッシュ裏で非同期実行）
  // ==========================================
  async function initSAM() {
    if (typeof ort === 'undefined') {
      console.warn('[SAM] ort未読込。SAM機能無効。');
      return;
    }
    console.log('[SAM] モデル読込開始...');
    var t0 = Date.now();
    try {
      // v1.0: wasmのみ（Galaxy S22で安定動作確認済み）
      var opts = { executionProviders: ['wasm'] };
      encSession = await ort.InferenceSession.create(ENC_URL, opts);
      console.log('[SAM] エンコーダー読込: ' + _sec(t0) + '秒');
      var t1 = Date.now();
      decSession = await ort.InferenceSession.create(DEC_URL, opts);
      console.log('[SAM] デコーダー読込: ' + _sec(t1) + '秒');
      window._samReady = true;
      console.log('[SAM] ✅ 準備完了（合計: ' + _sec(t0) + '秒）');
    } catch (e) {
      console.error('[SAM] 読込エラー:', e.toString());
      window._samReady = false;
    }
  }

  // ==========================================
  // エンコーダー事前実行
  // v1.0: 画像選択時に呼ばれる→SAMモーダル時には推論済み
  // ==========================================
  async function preEncode(dataUrl) {
    if (!encSession || encoding || !dataUrl) return;
    // 同じ画像なら二重実行しない
    if (preEncDataUrl === dataUrl && encOut) return;
    encoding = true;
    console.log('[SAM] エンコーダー事前実行開始...');
    var t0 = Date.now();
    try {
      var img = await _loadImg(dataUrl);
      var tensor = _preprocess(img);
      var res = await encSession.run({ image: tensor });
      var keys = Object.keys(res);
      encOut = {
        image_embed: res.image_embed || res[keys[0]],
        high_res_feats_0: res.high_res_feats_0 || res[keys[1]],
        high_res_feats_1: res.high_res_feats_1 || res[keys[2]]
      };
      preEncDataUrl = dataUrl;
      console.log('[SAM] ✅ エンコーダー事前実行完了: ' + _sec(t0) + '秒');
    } catch (e) {
      console.error('[SAM] エンコーダーエラー:', e.toString());
      encOut = null;
      preEncDataUrl = null;
    }
    encoding = false;
  }

  // ==========================================
  // 画像前処理（1024x1024にリサイズ＋パディング）
  // ==========================================
  function _preprocess(img) {
    var ow = img.naturalWidth || img.width;
    var oh = img.naturalHeight || img.height;
    var sc = SZ / Math.max(ow, oh);
    var nw = Math.round(ow * sc), nh = Math.round(oh * sc);
    var c = document.createElement('canvas');
    c.width = SZ; c.height = SZ;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SZ, SZ);
    ctx.drawImage(img, 0, 0, nw, nh);
    var px = ctx.getImageData(0, 0, SZ, SZ).data;
    var tot = SZ * SZ;
    var f = new Float32Array(3 * tot);
    for (var i = 0; i < tot; i++) {
      var idx = i * 4;
      // v1.0: RGB正規化 (px/255)*2-1
      f[i] = (px[idx] / 255) * 2 - 1;
      f[tot + i] = (px[idx + 1] / 255) * 2 - 1;
      f[2 * tot + i] = (px[idx + 2] / 255) * 2 - 1;
    }
    imgInfo = { sc: sc, ox: 0, oy: 0, ow: ow, oh: oh, nw: nw, nh: nh, img: img };
    return new ort.Tensor('float32', f, [1, 3, SZ, SZ]);
  }

  // ==========================================
  // デコーダー推論（タップ座標→マスク）
  // ==========================================
  async function _decode(tapX, tapY) {
    if (!decSession || !encOut) return null;
    var px = tapX * imgInfo.sc + imgInfo.ox;
    var py = tapY * imgInfo.sc + imgInfo.oy;
    var t0 = Date.now();
    try {
      var feeds = {
        image_embed: encOut.image_embed,
        high_res_feats_0: encOut.high_res_feats_0,
        high_res_feats_1: encOut.high_res_feats_1,
        point_coords: new ort.Tensor('float32', new Float32Array([px, py]), [1, 1, 2]),
        point_labels: new ort.Tensor('float32', new Float32Array([1]), [1, 1]),
        mask_input: new ort.Tensor('float32', new Float32Array(MSZ * MSZ).fill(0), [1, 1, MSZ, MSZ]),
        has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1])
      };
      var r = await decSession.run(feeds);
      var sc = r.iou_predictions.data;
      // v1.0: 最高スコアのマスクを選択
      var bi = 0;
      for (var i = 1; i < sc.length; i++) { if (sc[i] > sc[bi]) bi = i; }
      var md = new Float32Array(MSZ * MSZ);
      var off = bi * MSZ * MSZ;
      for (var j = 0; j < MSZ * MSZ; j++) md[j] = r.masks.data[off + j];
      curMask = md;
      var score = (sc[bi] * 100).toFixed(1);
      console.log('[SAM] デコーダー: ' + (Date.now() - t0) + 'ms, スコア: ' + score + '%');
      return { mask: md, score: parseFloat(score) };
    } catch (e) {
      console.error('[SAM] デコーダーエラー:', e.toString());
      return null;
    }
  }

  // ==========================================
  // マスク描画（Canvasオーバーレイ）
  // ==========================================
  function _drawMask(ovl, md) {
    if (!md || !imgInfo) return;
    ovl.width = imgInfo.ow; ovl.height = imgInfo.oh;
    var ctx = ovl.getContext('2d');
    ctx.clearRect(0, 0, imgInfo.ow, imgInfo.oh);
    var id = ctx.createImageData(imgInfo.ow, imgInfo.oh);
    var d = id.data;
    for (var y = 0; y < imgInfo.oh; y++) {
      for (var x = 0; x < imgInfo.ow; x++) {
        var mx = Math.floor((x * imgInfo.sc + imgInfo.ox) * MSZ / SZ);
        var my = Math.floor((y * imgInfo.sc + imgInfo.oy) * MSZ / SZ);
        if (mx >= 0 && mx < MSZ && my >= 0 && my < MSZ && md[my * MSZ + mx] > 0) {
          var idx = (y * imgInfo.ow + x) * 4;
          d[idx] = MCOL[0]; d[idx+1] = MCOL[1]; d[idx+2] = MCOL[2]; d[idx+3] = MCOL[3];
        }
      }
    }
    ctx.putImageData(id, 0, 0);
  }

  // ==========================================
  // マスクから切り抜き
  // ==========================================
  function _crop(md) {
    if (!md || !imgInfo) return null;
    var mnX = imgInfo.ow, mnY = imgInfo.oh, mxX = 0, mxY = 0;
    // v1.0: バウンディングボックス算出
    for (var my = 0; my < MSZ; my++) {
      for (var mx = 0; mx < MSZ; mx++) {
        if (md[my * MSZ + mx] > 0) {
          var ox = ((mx + 0.5) * SZ / MSZ - imgInfo.ox) / imgInfo.sc;
          var oy = ((my + 0.5) * SZ / MSZ - imgInfo.oy) / imgInfo.sc;
          if (ox >= 0 && ox < imgInfo.ow && oy >= 0 && oy < imgInfo.oh) {
            mnX = Math.min(mnX, ox); mnY = Math.min(mnY, oy);
            mxX = Math.max(mxX, ox); mxY = Math.max(mxY, oy);
          }
        }
      }
    }
    var mg = Math.max(imgInfo.ow, imgInfo.oh) * 0.01;
    mnX = Math.max(0, Math.floor(mnX - mg));
    mnY = Math.max(0, Math.floor(mnY - mg));
    mxX = Math.min(imgInfo.ow, Math.ceil(mxX + mg));
    mxY = Math.min(imgInfo.oh, Math.ceil(mxY + mg));
    var cw = mxX - mnX, ch = mxY - mnY;
    if (cw < 10 || ch < 10) return null;
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(imgInfo.img, mnX, mnY, cw, ch, 0, 0, cw, ch);
    console.log('[SAM] 切り抜き: ' + cw + 'x' + ch + 'px');
    return cv.toDataURL('image/jpeg', 0.85);
  }

  // ==========================================
  // SAMモーダルUI
  // ==========================================
  function openSamModal(dataUrl) {
    if (!window._samReady || !dataUrl) {
      // v1.0 フォールバック: 手動枠指定
      console.log('[SAM] 未準備 or 画像なし→手動枠指定フォールバック');
      if (typeof openFrameModal === 'function' && dataUrl) {
        openFrameModal(dataUrl, function(imgs) {
          multiImageDataUrls = imgs;
          renderMultiImageThumbnails();
          _showMulti();
        });
      } else if (!dataUrl) {
        alert('先にレシート画像を選択してください');
      }
      return;
    }
    cropList = [];
    _buildUI(dataUrl);
  }

  // v1.0 モーダル構築
  function _buildUI(dataUrl) {
    var old = document.getElementById('samModal');
    if (old) old.remove();
    var m = document.createElement('div');
    m.id = 'samModal';
    m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;flex-direction:column;';
    m.innerHTML =
      // ヘッダー
      '<div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:center;color:#fff;">'
      + '<div id="samSt" style="font-size:13px;font-weight:600;">🔄 準備中...</div>'
      + '<div style="display:flex;gap:8px;align-items:center;">'
      + '<span id="samCt" style="font-size:12px;opacity:0.7;">0枚</span>'
      + '<button onclick="window._samClose()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;">✕</button>'
      + '</div></div>'
      // キャンバスエリア
      + '<div style="flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;">'
      + '<canvas id="samIC" style="max-width:100%;max-height:100%;"></canvas>'
      + '<canvas id="samOC" style="position:absolute;pointer-events:none;"></canvas>'
      + '</div>'
      // フッター
      + '<div style="padding:10px 16px;display:flex;gap:8px;">'
      + '<button id="samCB" onclick="window._samCrop()" disabled style="flex:1;padding:12px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;opacity:0.5;cursor:pointer;">✂️ 切り抜き</button>'
      + '<button onclick="window._samDone()" style="flex:1;padding:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">✅ 完了</button>'
      + '</div>';
    document.body.appendChild(m);

    // v1.0 画像描画
    var el = new Image();
    el.onload = function() {
      var ic = document.getElementById('samIC');
      ic.width = el.naturalWidth; ic.height = el.naturalHeight;
      ic.getContext('2d').drawImage(el, 0, 0);
      var oc = document.getElementById('samOC');
      oc.width = el.naturalWidth; oc.height = el.naturalHeight;
      ic.style.cursor = 'crosshair';
      ic.addEventListener('click', _onTap);
      // v1.0: 事前エンコード済みか判定
      if (preEncDataUrl === dataUrl && encOut) {
        _setSt('👆 レシートをタップして選択');
      } else {
        _startEnc(dataUrl);
      }
    };
    el.src = dataUrl;
  }

  // v1.0 エンコーダー推論（モーダル内）
  async function _startEnc(dataUrl) {
    _setSt('🔄 エンコーダー推論中...（約20秒）');
    await preEncode(dataUrl);
    if (encOut) {
      _setSt('👆 レシートをタップして選択');
    } else {
      _setSt('❌ エンコーダーエラー');
    }
  }

  // v1.0 タップ→デコーダー→マスク
  async function _onTap(e) {
    if (!encOut) return;
    var ic = document.getElementById('samIC');
    var r = ic.getBoundingClientRect();
    var tx = (e.clientX - r.left) * (ic.width / r.width);
    var ty = (e.clientY - r.top) * (ic.height / r.height);
    _setSt('🔄 マスク生成中...');
    var res = await _decode(tx, ty);
    if (res && res.mask) {
      var oc = document.getElementById('samOC');
      _drawMask(oc, res.mask);
      // v1.0 オーバーレイ位置合わせ
      var ic2 = document.getElementById('samIC');
      oc.style.width = ic2.offsetWidth + 'px';
      oc.style.height = ic2.offsetHeight + 'px';
      oc.style.left = ic2.offsetLeft + 'px';
      oc.style.top = ic2.offsetTop + 'px';
      _setSt('✅ スコア: ' + res.score + '% — 切り抜きで確定');
      var cb = document.getElementById('samCB');
      if (cb) { cb.disabled = false; cb.style.opacity = '1'; }
    } else {
      _setSt('❌ 失敗。別の場所をタップしてください');
    }
  }

  // v1.0 切り抜きボタン
  window._samCrop = function() {
    if (!curMask) return;
    var img = _crop(curMask);
    if (img) {
      cropList.push(img);
      _setCt(cropList.length + '枚');
      var oc = document.getElementById('samOC');
      if (oc) oc.getContext('2d').clearRect(0, 0, oc.width, oc.height);
      curMask = null;
      var cb = document.getElementById('samCB');
      if (cb) { cb.disabled = true; cb.style.opacity = '0.5'; }
      _setSt('👆 次のレシートをタップ（完了で終了）');
    }
  };

  // v1.0 完了→CULOchanフローに渡す
  window._samDone = function() {
    if (curMask) {
      var c = _crop(curMask);
      if (c) cropList.push(c);
    }
    _removeModal();
    if (cropList.length > 0) {
      multiImageDataUrls = cropList.slice();
      renderMultiImageThumbnails();
      _showMulti();
      console.log('[SAM] ✅ 切り抜き完了: ' + cropList.length + '枚');
    }
    _reset();
  };

  // v1.0 閉じる
  window._samClose = function() {
    _removeModal();
    _reset();
  };

  // ==========================================
  // ヘルパー
  // ==========================================
  function _removeModal() {
    var m = document.getElementById('samModal');
    if (m) m.remove();
  }
  function _reset() {
    cropList = []; curMask = null;
    // encOutは保持（同じ画像で再度開く時のため）
  }
  function _setSt(txt) {
    var el = document.getElementById('samSt');
    if (el) el.textContent = txt;
  }
  function _setCt(txt) {
    var el = document.getElementById('samCt');
    if (el) el.textContent = txt;
  }
  function _showMulti() {
    var pa = document.getElementById('imagePreviewArea');
    var ma = document.getElementById('multiImageArea');
    if (pa) pa.style.display = 'none';
    if (ma) ma.style.display = 'block';
    var s = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    var ab = document.getElementById('aiBtn');
    if (ab) ab.disabled = !s.geminiApiKey;
  }
  function _loadImg(url) {
    return new Promise(function(ok, ng) {
      var img = new Image();
      img.onload = function() { ok(img); };
      img.onerror = function() { ng(new Error('画像読み込み失敗')); };
      img.src = url;
    });
  }
  function _sec(t0) { return ((Date.now() - t0) / 1000).toFixed(1); }

  // ==========================================
  // グローバル公開
  // ==========================================
  window.initSAM = initSAM;
  window.openSamModal = openSamModal;
  window.samPreEncode = preEncode; // 画像選択時の事前エンコード用

  console.log('[receipt-sam.js] ✓ SAM2.1モジュール読込完了 (v1.0)');
})();
