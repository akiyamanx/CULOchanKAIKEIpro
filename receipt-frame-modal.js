// ==========================================
// receipt-frame-modal.js v1.1
// 手動枠指定モーダル — 複数レシート一括撮影→個別切り出し
// v1.0: デモv3.4のUI実績ベースで実装
//
// 使い方:
//   openFrameModal(imageDataUrl, callback)
//   callback(croppedImages) — 切り出し済みDataURL配列が返る
//
// 依存: receipt-core.js（escapeHtml）
// ==========================================

(function() {

// ==========================================
// 内部状態
// ==========================================
var _imgEl = null;
var _dispScale = 1;
var _receipts = [];
var _selectedId = null;
var _nextId = 1;
var _pts = [];
var _dragging = null;
var _callback = null;

var COLORS = ['#7eb8ff','#ff7e7e','#7effb8','#ffcc44','#cc7eff',
              '#ff9e44','#7effe0','#ff7eba','#aeff7e','#ffbb7e'];
var HANDLE = 11; // v1.1: 反応範囲を縮小（隣枠への誤反応防止）
var LBLS = ['左上','右上','右下','左下'];

// ==========================================
// モーダル初期化（DOM生成）
// ==========================================
function _createModal() {
  if (document.getElementById('frameModal')) return;

  var style = document.createElement('style');
  style.textContent = [
    '#frameModal{display:none;position:fixed;inset:0;z-index:9000;background:#0f0f13;flex-direction:column;overflow:hidden;}',
    '#frameModal.open{display:flex;}',
    '#fmHeader{background:#1a1a22;border-bottom:1px solid #2a2a38;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
    '#fmTitle{font-size:14px;font-weight:700;color:#f0ede8;}',
    '#fmBadge{background:#e84545;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;}',
    '#fmGuide{background:#1a1a22;border-bottom:1px solid #2a2a38;padding:8px 14px;display:flex;align-items:center;gap:6px;flex-shrink:0;}',
    '.fmGs{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;opacity:.3;transition:opacity .2s;}',
    '.fmGs.active{opacity:1;}.fmGs.done{opacity:.65;}',
    '.fmGsDot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:#2a2a38;color:#888899;}',
    '.fmGs.active .fmGsDot{background:#ffcc44;color:#0f0f13;}.fmGs.done .fmGsDot{background:#4ecb71;color:#0f0f13;}',
    '.fmGsLbl{font-size:9px;color:#888899;font-weight:700;}',
    '.fmGs.active .fmGsLbl{color:#ffcc44;}.fmGs.done .fmGsLbl{color:#4ecb71;}',
    '.fmArr{color:#2a2a38;font-size:13px;flex-shrink:0;}',
    '#fmMode{display:flex;background:#1a1a22;border-bottom:1px solid #2a2a38;flex-shrink:0;}',
    '.fmModeBtn{flex:1;padding:9px 6px;border:none;font-size:12px;font-weight:700;cursor:pointer;background:transparent;color:#555566;}',
    '.fmModeBtn.active{background:#ffcc4422;color:#ffcc44;}',
    '.fmModeBtn.scrollActive{background:#7eb8ff22;color:#7eb8ff;}',
    '#fmHint{padding:8px 14px;font-size:12px;font-weight:600;color:#ffcc44;background:#1e1e10;border-bottom:1px solid #ffcc4433;flex-shrink:0;}',
    '#fmHint.ok{color:#4ecb71;background:#0e1e12;border-color:#4ecb7133;}',
    '#fmHint.blue{color:#7eb8ff;background:#0e1020;border-color:#7eb8ff33;}',
    '#fmCanvasWrap{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;background:#000;position:relative;min-height:0;}',
    '#fmCanvas{display:block;touch-action:none;user-select:none;-webkit-user-select:none;}',
    '#fmActions{display:flex;gap:6px;padding:8px 12px;background:#1a1a22;border-top:1px solid #2a2a38;flex-shrink:0;flex-wrap:nowrap;}',
    '#fmActions button{flex:1;padding:10px 4px;border:none;border-radius:9px;font-size:11px;font-weight:700;cursor:pointer;min-width:0;white-space:nowrap;}',
    '#fmBtnUndo{background:#2a2010;color:#ffcc44;border:1px solid #ffcc4444;}',
    '#fmBtnDel{background:#2a1515;color:#e84545;border:1px solid #e8454544;}',
    '#fmBtnCancel{background:#2a2a38;color:#f0ede8;}',
    '#fmList{overflow-y:auto;max-height:130px;padding:8px 12px;background:#0f0f13;flex-shrink:0;}',
    '.fmItem{display:flex;align-items:center;gap:8px;padding:7px 10px;background:#1a1a22;border:1px solid #2a2a38;border-radius:9px;margin-bottom:6px;cursor:pointer;}',
    '.fmItem.sel{border-color:#7eb8ff;background:#101828;}',
    '.fmThumb{width:36px;height:50px;border-radius:5px;object-fit:cover;background:#333;flex-shrink:0;}',
    '.fmItemNum{font-size:11px;font-weight:700;}',
    '.fmItemSub{font-size:10px;color:#666677;}',
    '.fmItemDel{width:24px;height:24px;border-radius:50%;border:none;background:#2a1515;color:#e84545;font-size:12px;cursor:pointer;flex-shrink:0;}',
    '#fmFooter{padding:10px 12px 14px;background:#1a1a22;border-top:1px solid #2a2a38;flex-shrink:0;}',
    '#fmBtnOk{width:100%;padding:14px;border:none;border-radius:11px;font-size:15px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#7eb8ff,#5090e0);color:#0f0f13;}',
    '#fmBtnOk:disabled{background:#2a2a38;color:#555566;cursor:not-allowed;}'
  ].join('');
  document.head.appendChild(style);

  var html = [
    '<div id="frameModal">',
    ' <div id="fmHeader">',
    '  <div id="fmTitle">📄 レシート枠指定</div>',
    '  <div id="fmBadge">MULTI</div>',
    ' </div>',
    ' <div id="fmGuide">',
    '  <div class="fmGs" id="fmGs0"><div class="fmGsDot">左上</div><div class="fmGsLbl">1点目</div></div>',
    '  <div class="fmArr">›</div>',
    '  <div class="fmGs" id="fmGs1"><div class="fmGsDot">右上</div><div class="fmGsLbl">2点目</div></div>',
    '  <div class="fmArr">›</div>',
    '  <div class="fmGs" id="fmGs2"><div class="fmGsDot">右下</div><div class="fmGsLbl">3点目</div></div>',
    '  <div class="fmArr">›</div>',
    '  <div class="fmGs" id="fmGs3"><div class="fmGsDot">左下</div><div class="fmGsLbl">4点目</div></div>',
    ' </div>',
    ' <div id="fmMode">',
    '  <button class="fmModeBtn active" id="fmBtnEdit" onclick="window._fm.setMode(\'edit\')">✏️ 枠を描く</button>',
    '  <button class="fmModeBtn" id="fmBtnScroll" onclick="window._fm.setMode(\'scroll\')">👆 スクロール</button>',
    ' </div>',
    ' <div id="fmHint">レシートの左上角をタップ！</div>',
    ' <div id="fmCanvasWrap"><canvas id="fmCanvas"></canvas></div>',
    ' <div id="fmActions">',
    '  <button id="fmBtnUndo" onclick="window._fm.undo()">↩ 1点戻す</button>',
    '  <button id="fmBtnDel"  onclick="window._fm.delSelected()">🗑 枠削除</button>',
    '  <button id="fmBtnCancel" onclick="window._fm.cancel()">✕ キャンセル</button>',
    ' </div>',
    ' <div id="fmList"></div>',
    ' <div id="fmFooter">',
    '  <button id="fmBtnOk" onclick="window._fm.confirm()" disabled>レシートを囲んでから確定</button>',
    ' </div>',
    '</div>'
  ].join('');

  var wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstChild);

  // タッチイベント登録
  var canvas = document.getElementById('fmCanvas');
  canvas.addEventListener('touchstart', _onStart, {passive:false});
  canvas.addEventListener('mousedown',  _onStart);
  canvas.addEventListener('touchmove',  _onMove,  {passive:false});
  canvas.addEventListener('mousemove',  _onMove);
  canvas.addEventListener('touchend',   _onEnd,   {passive:false});
  canvas.addEventListener('mouseup',    _onEnd);
}

// ==========================================
// 公開API
// ==========================================
function openFrameModal(imageDataUrl, callback) {
  _createModal();
  _callback  = callback;
  _receipts  = [];
  _selectedId = null;
  _nextId    = 1;
  _pts       = [];
  _dragging  = null;

  _imgEl = new Image();
  _imgEl.onload = function() {
    _setupCanvas();
    _setMode('edit');
    _updateGuide();
    _updateHint();
    _updateList();
    _draw();
    document.getElementById('frameModal').classList.add('open');
  };
  _imgEl.onerror = function() { alert('画像の読み込みに失敗しました'); };
  _imgEl.src = imageDataUrl;
}

// ==========================================
// Canvas セットアップ
// ==========================================
function _setupCanvas() {
  var wrap   = document.getElementById('fmCanvasWrap');
  var maxW   = wrap.clientWidth || (window.innerWidth - 24);
  var canvas = document.getElementById('fmCanvas');
  canvas.width  = _imgEl.naturalWidth;
  canvas.height = _imgEl.naturalHeight;
  canvas.style.width  = maxW + 'px';
  canvas.style.height = Math.round(maxW * _imgEl.naturalHeight / _imgEl.naturalWidth) + 'px';
  _dispScale = _imgEl.naturalWidth / maxW;
}

// ==========================================
// モード切替
// ==========================================
var _tapMode = 'edit';
function _setMode(m) {
  _tapMode = m;
  var canvas = document.getElementById('fmCanvas');
  var btnEdit   = document.getElementById('fmBtnEdit');
  var btnScroll = document.getElementById('fmBtnScroll');
  if (m === 'scroll') {
    canvas.style.pointerEvents = 'none';
    btnEdit.className   = 'fmModeBtn';
    btnScroll.className = 'fmModeBtn scrollActive';
    var hint = document.getElementById('fmHint');
    hint.className   = 'blue';
    hint.textContent = '👆 スクロールモード — 「枠を描く」で戻してね';
    if (_pts.length > 0) { _pts = []; _updateGuide(); _draw(); }
  } else {
    canvas.style.pointerEvents = 'auto';
    btnEdit.className   = 'fmModeBtn active';
    btnScroll.className = 'fmModeBtn';
    _updateHint();
  }
}

// ==========================================
// タッチ/マウス操作
// ==========================================
function _getPos(e) {
  var rect = document.getElementById('fmCanvas').getBoundingClientRect();
  var s = e.touches ? e.touches[0] : e;
  return { x: (s.clientX - rect.left) * _dispScale,
           y: (s.clientY - rect.top)  * _dispScale };
}

function _findHandle(pos) {
  var r = HANDLE * _dispScale * 2.5; // v1.1: 当たり判定を縮小
  for (var i = 0; i < _receipts.length; i++) {
    for (var j = 0; j < 4; j++) {
      var c = _receipts[i].corners[j];
      if (Math.hypot(pos.x - c.x, pos.y - c.y) < r)
        return { id: _receipts[i].id, idx: j };
    }
  }
  return null;
}

function _onStart(e) {
  e.preventDefault();
  if (_tapMode === 'scroll') return;
  var pos = _getPos(e);
  if (_pts.length === 0) {
    var h = _findHandle(pos);
    if (h) { _dragging = h; _selectedId = h.id; _draw(); return; }
    for (var i = 0; i < _receipts.length; i++) {
      var r = _receipts[i];
      var xs = r.corners.map(function(c){return c.x;});
      var ys = r.corners.map(function(c){return c.y;});
      if (pos.x >= Math.min.apply(null,xs) && pos.x <= Math.max.apply(null,xs) &&
          pos.y >= Math.min.apply(null,ys) && pos.y <= Math.max.apply(null,ys)) {
        _selectedId = (_selectedId === r.id) ? null : r.id;
        _draw(); _updateList(); return;
      }
    }
    _selectedId = null;
  }
  _pts.push(pos);
  if (_pts.length === 4) {
    _receipts.push({ id: _nextId++, corners: _pts.slice() });
    _pts = [];
    _updateList();
  }
  _updateGuide(); _updateHint(); _draw();
}

function _onMove(e) {
  e.preventDefault();
  if (!_dragging || _tapMode === 'scroll') return;
  var pos = _getPos(e);
  var rec = _receipts.filter(function(r){return r.id===_dragging.id;})[0];
  if (rec) { rec.corners[_dragging.idx] = pos; _updateThumb(rec); }
  _draw();
}

function _onEnd(e) {
  e.preventDefault();
  if (_dragging) { _dragging = null; _updateList(); }
}

// ==========================================
// 描画
// ==========================================
function _draw() {
  var canvas = document.getElementById('fmCanvas');
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (_imgEl) ctx.drawImage(_imgEl, 0, 0);
  if (_receipts.length > 0 || _pts.length > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  _receipts.forEach(function(r, i) {
    var col = COLORS[i % COLORS.length];
    var sel = r.id === _selectedId;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(r.corners[0].x, r.corners[0].y);
    r.corners.forEach(function(c){ ctx.lineTo(c.x, c.y); });
    ctx.closePath(); ctx.clip(); ctx.drawImage(_imgEl, 0, 0); ctx.restore();
    ctx.beginPath();
    ctx.moveTo(r.corners[0].x, r.corners[0].y);
    r.corners.forEach(function(c){ ctx.lineTo(c.x, c.y); });
    ctx.closePath();
    ctx.strokeStyle = sel ? '#fff' : col;
    ctx.lineWidth = sel ? 5 : 3; ctx.stroke();
    var cx = r.corners.reduce(function(s,c){return s+c.x;},0)/4;
    var cy = r.corners.reduce(function(s,c){return s+c.y;},0)/4;
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(i+1, cx, cy); ctx.textAlign = 'left';
    r.corners.forEach(function(c) {
      ctx.beginPath(); ctx.arc(c.x, c.y, HANDLE * 1.5, 0, Math.PI*2); // v1.1: 描画は少し大きめ
      ctx.fillStyle = sel ? '#ffffff33' : col+'44'; ctx.fill();
      ctx.strokeStyle = sel ? '#fff' : col; ctx.lineWidth = 3; ctx.stroke();
    });
  });
  if (_pts.length > 0) {
    ctx.beginPath(); ctx.moveTo(_pts[0].x, _pts[0].y);
    _pts.forEach(function(p){ ctx.lineTo(p.x, p.y); });
    ctx.strokeStyle = '#ffcc4488'; ctx.lineWidth = 2;
    ctx.setLineDash([8,4]); ctx.stroke(); ctx.setLineDash([]);
    _pts.forEach(function(p, i) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI*2);
      ctx.fillStyle = '#ffcc4466'; ctx.fill();
      ctx.strokeStyle = '#ffcc44'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#ffcc44';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(LBLS[i], p.x, p.y-22); ctx.textAlign = 'left';
    });
    if (_pts.length < 4) {
      ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#ffcc44cc';
      ctx.textAlign = 'center';
      ctx.fillText('次→' + LBLS[_pts.length], _imgEl.naturalWidth/2, 50);
      ctx.textAlign = 'left';
    }
  }
}

// ==========================================
// ガイド・ヒント更新
// ==========================================
function _updateGuide() {
  for (var i = 0; i < 4; i++) {
    var el = document.getElementById('fmGs' + i);
    if (!el) continue;
    el.className = 'fmGs' +
      (i < _pts.length ? ' done' : i === _pts.length ? ' active' : '');
  }
}

function _updateHint() {
  var hint = document.getElementById('fmHint');
  if (!hint || _tapMode === 'scroll') return;
  if (_pts.length === 0 && _receipts.length === 0) {
    hint.className = ''; hint.textContent = '👆 レシートの左上角をタップ！';
  } else if (_pts.length === 0) {
    hint.className = 'ok';
    hint.textContent = '✅ ' + _receipts.length + '枚指定済み！続けて囲むか「確定」を押してね';
  } else {
    hint.className = '';
    hint.textContent = '👆 ' + LBLS[_pts.length] + 'をタップ（' + _pts.length + '/4）';
  }
}

// ==========================================
// サムネイル生成（バウンディングボックスクロップ）
// ==========================================
function _cropToDataUrl(corners, outW, outH) {
  var xs = corners.map(function(c){return c.x;});
  var ys = corners.map(function(c){return c.y;});
  var x = Math.max(0, Math.min.apply(null, xs));
  var y = Math.max(0, Math.min.apply(null, ys));
  var w = Math.min(_imgEl.naturalWidth  - x, Math.max.apply(null, xs) - x);
  var h = Math.min(_imgEl.naturalHeight - y, Math.max.apply(null, ys) - y);
  if (w <= 0 || h <= 0) return null;
  var off = document.createElement('canvas');
  off.width = outW; off.height = outH;
  off.getContext('2d').drawImage(_imgEl, x, y, w, h, 0, 0, outW, outH);
  try { return off.toDataURL('image/jpeg', 0.85); } catch(e) { return null; }
}

function _cropFull(corners) {
  // 解析用（高解像度）
  var xs = corners.map(function(c){return c.x;});
  var ys = corners.map(function(c){return c.y;});
  var x = Math.max(0, Math.min.apply(null, xs));
  var y = Math.max(0, Math.min.apply(null, ys));
  var w = Math.min(_imgEl.naturalWidth  - x, Math.max.apply(null, xs) - x);
  var h = Math.min(_imgEl.naturalHeight - y, Math.max.apply(null, ys) - y);
  if (w <= 0 || h <= 0) return null;
  var off = document.createElement('canvas');
  off.width  = Math.round(w);
  off.height = Math.round(h);
  off.getContext('2d').drawImage(_imgEl, x, y, w, h, 0, 0, off.width, off.height);
  try { return off.toDataURL('image/jpeg', 0.92); } catch(e) { return null; }
}

function _updateThumb(rec) {
  var el = document.getElementById('fmThumb-' + rec.id);
  if (!el) return;
  var url = _cropToDataUrl(rec.corners, 36, 50);
  if (url) el.src = url;
}

// ==========================================
// リスト更新
// ==========================================
function _updateList() {
  var listEl = document.getElementById('fmList');
  var btnOk  = document.getElementById('fmBtnOk');
  if (!listEl || !btnOk) return;

  if (_receipts.length === 0) {
    listEl.innerHTML = '';
    btnOk.disabled = true;
    btnOk.textContent = 'レシートを囲んでから確定';
    return;
  }

  btnOk.disabled = false;
  btnOk.textContent = '✅ ' + _receipts.length + '枚を確定する！';

  listEl.innerHTML = _receipts.map(function(r, i) {
    var url = _cropToDataUrl(r.corners, 36, 50) || '';
    var col = COLORS[i % COLORS.length];
    var sel = r.id === _selectedId ? ' sel' : '';
    return '<div class="fmItem' + sel + '" onclick="window._fm.selItem(' + r.id + ')">'
      + '<img class="fmThumb" id="fmThumb-' + r.id + '" src="' + url + '">'
      + '<div style="flex:1">'
      + '<div class="fmItemNum" style="color:' + col + '">No.' + (i+1) + '</div>'
      + '<div class="fmItemSub">ハンドルで微調整できるよ</div>'
      + '</div>'
      + '<button class="fmItemDel" onclick="window._fm.delItem(' + r.id + ',event)">✕</button>'
      + '</div>';
  }).join('');
}

// ==========================================
// 操作ハンドラ（window._fm経由で呼ぶ）
// ==========================================
function selItem(id) {
  _selectedId = (_selectedId === id) ? null : id;
  _draw(); _updateList();
}

function delItem(id, e) {
  if (e) e.stopPropagation();
  _receipts = _receipts.filter(function(r){ return r.id !== id; });
  if (_selectedId === id) _selectedId = null;
  _draw(); _updateHint(); _updateList();
}

function delSelected() {
  if (_selectedId) { delItem(_selectedId, null); return; }
  if (_receipts.length > 0) delItem(_receipts[_receipts.length-1].id, null);
}

function undo() {
  if (_pts.length > 0) { _pts.pop(); _updateGuide(); _updateHint(); _draw(); }
  else if (_receipts.length > 0) delItem(_receipts[_receipts.length-1].id, null);
}

function cancel() {
  document.getElementById('frameModal').classList.remove('open');
  _callback = null;
}

function confirm() {
  if (_receipts.length === 0) return;
  var croppedImages = _receipts.map(function(r) {
    return _cropFull(r.corners);
  }).filter(Boolean);

  document.getElementById('frameModal').classList.remove('open');

  if (_callback) {
    _callback(croppedImages);
    _callback = null;
  }
}

// ==========================================
// グローバル公開
// ==========================================
window._fm = {
  setMode:     _setMode,
  selItem:     selItem,
  delItem:     delItem,
  delSelected: delSelected,
  undo:        undo,
  cancel:      cancel,
  confirm:     confirm
};

window.openFrameModal = openFrameModal;
console.log('[receipt-frame-modal.js] ✓ v1.0 手動枠指定モーダル 読み込み完了');

})();
