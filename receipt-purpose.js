// ==========================================
// receipt-purpose.js v1.0 — 駐車場レシート目的入力モーダル
// Phase1.7: 駐車場レシートに目的＋現場を紐付ける
// 依存: receipt-store.js（getReceiptById, updateReceipt）
//       receipt-viewer.js（renderReceiptCards, _rvCurrentDate）
//       receipt-core.js（loadProjects, addProject, escapeHtml）
// ==========================================

var _rvPurposeReceiptId = null; // 現在編集中のレシートID

// v1.7: 定型文リスト（よく使う目的）
var PURPOSE_PRESETS = ['材料搬入', '現場作業', '打ち合わせ', '現場調査', '引き渡し', '見積調査'];


/**
 * v1.7: 目的入力モーダルを開く
 * @param {string} receiptId - レシートID
 */
async function openPurposeModal(receiptId) {
  _rvPurposeReceiptId = receiptId;

  var modal = document.getElementById('rvPurposeModal');
  if (!modal) return;

  try {
    var receipt = await getReceiptById(receiptId);
    if (!receipt) {
      alert('レシートが見つかりません');
      return;
    }

    // レシート情報表示
    var infoEl = document.getElementById('rvPurposeReceiptInfo');
    if (infoEl) {
      var info = '🅿️ ' + (receipt.store || '不明') + ' / ¥' + Number(receipt.total || 0).toLocaleString();
      if (receipt.date) info += ' / ' + receipt.date;
      if (receipt.entryTime) info += ' / 入庫 ' + receipt.entryTime;
      if (receipt.exitTime) info += ' → ' + receipt.exitTime;
      infoEl.textContent = info;
    }

    // 既存の目的を入力欄にセット
    var purposeInput = document.getElementById('rvPurposeInput');
    if (purposeInput) {
      purposeInput.value = receipt.purpose || '';
    }

    // 定型文ボタン生成
    renderPurposePresets(receipt.purpose);

    // 現場セレクト生成
    renderSiteSelect(receipt.siteName);

    // モーダル表示
    modal.style.display = 'flex';

  } catch (e) {
    console.error('[receipt-purpose] 目的モーダルエラー:', e);
    alert('エラー: ' + e.message);
  }
}

/**
 * v1.7: 定型文ボタンを描画
 */
function renderPurposePresets(currentPurpose) {
  var container = document.getElementById('rvPurposePresets');
  if (!container) return;

  // カスタム定型文をlocalStorageから取得
  var customPresets = [];
  try {
    var saved = localStorage.getItem('culo_purpose_presets');
    if (saved) customPresets = JSON.parse(saved);
  } catch (e) { /* ignore */ }

  var allPresets = PURPOSE_PRESETS.concat(customPresets);

  var html = '';
  for (var i = 0; i < allPresets.length; i++) {
    var p = allPresets[i];
    var isActive = (currentPurpose === p);
    html += '<button onclick="selectPurposePreset(\'' + escapeHtml(p) + '\')" '
      + 'style="padding: 8px 14px; border-radius: 20px; font-size: 13px; cursor: pointer; '
      + 'border: 1px solid ' + (isActive ? '#3b82f6' : '#d1d5db') + '; '
      + 'background: ' + (isActive ? '#dbeafe' : 'white') + '; '
      + 'color: ' + (isActive ? '#1d4ed8' : '#374151') + '; '
      + 'font-weight: ' + (isActive ? '600' : '400') + ';">'
      + escapeHtml(p) + '</button>';
  }
  container.innerHTML = html;
}

/**
 * v1.7: 定型文を選択→入力欄にセット
 */
function selectPurposePreset(text) {
  var input = document.getElementById('rvPurposeInput');
  if (input) {
    // 同じものをタップしたらトグル（解除）
    if (input.value === text) {
      input.value = '';
    } else {
      input.value = text;
    }
  }
  // ボタンのアクティブ状態更新
  renderPurposePresets(input ? input.value : '');
}

/**
 * v1.7: 現場セレクトを描画
 */
function renderSiteSelect(currentSite) {
  var select = document.getElementById('rvSiteSelect');
  if (!select) return;

  // projectsリストを取得
  var siteList = [];
  if (typeof loadProjects === 'function') {
    siteList = loadProjects();
  } else if (typeof projects !== 'undefined' && Array.isArray(projects)) {
    siteList = projects;
  }

  var html = '<option value="">（現場なし）</option>';
  for (var i = 0; i < siteList.length; i++) {
    var s = siteList[i];
    var selected = (s === currentSite) ? ' selected' : '';
    html += '<option value="' + escapeHtml(s) + '"' + selected + '>' + escapeHtml(s) + '</option>';
  }
  select.innerHTML = html;
}

/**
 * v1.7: モーダルから新規現場を追加
 */
function addSiteFromPurposeModal() {
  var input = document.getElementById('rvNewSiteName');
  if (!input) return;
  var name = input.value.trim();
  if (!name) {
    alert('現場名を入力してください');
    return;
  }

  // 既存のaddProject関数を使う
  if (typeof addProject === 'function') {
    var added = addProject(name);
    if (!added) {
      alert('この現場名は既に登録されています');
      return;
    }
  } else {
    // addProjectが使えない場合の直接追加
    if (typeof projects !== 'undefined' && Array.isArray(projects)) {
      if (projects.indexOf(name) >= 0) {
        alert('この現場名は既に登録されています');
        return;
      }
      projects.push(name);
      localStorage.setItem('reform_app_projects', JSON.stringify(projects));
    }
  }

  input.value = '';
  // セレクト再描画して新しい現場を選択状態に
  renderSiteSelect(name);
  alert('✅ 「' + name + '」を追加しました');
}

/**
 * v1.7: 目的＋現場を保存
 */
async function savePurposeFromModal() {
  if (!_rvPurposeReceiptId) return;

  var purposeInput = document.getElementById('rvPurposeInput');
  var siteSelect = document.getElementById('rvSiteSelect');

  var purpose = purposeInput ? purposeInput.value.trim() : '';
  var siteName = siteSelect ? siteSelect.value : '';

  try {
    await updateReceipt(_rvPurposeReceiptId, {
      purpose: purpose,
      siteName: siteName,
      siteId: siteName // siteIdは現時点では現場名と同じ
    });

    console.log('[receipt-purpose] 目的保存: id=' + _rvPurposeReceiptId + ', purpose=' + purpose + ', site=' + siteName);

    // モーダル閉じる
    closePurposeModal();

    // カード一覧を再描画（目的表示を更新）
    if (typeof _rvCurrentDate !== 'undefined' && _rvCurrentDate) {
      await renderReceiptCards(_rvCurrentDate);
    }

    // 保存完了の通知
    var msg = '✅ 保存しました';
    if (purpose) msg += '（' + purpose + '）';
    alert(msg);

  } catch (e) {
    console.error('[receipt-purpose] 目的保存エラー:', e);
    alert('保存に失敗しました: ' + e.message);
  }
}

/**
 * v1.7: モーダルを閉じる
 */
function closePurposeModal() {
  var modal = document.getElementById('rvPurposeModal');
  if (modal) modal.style.display = 'none';
  _rvPurposeReceiptId = null;
}


// ==========================================
// グローバル公開
// ==========================================
window.openPurposeModal = openPurposeModal;
window.selectPurposePreset = selectPurposePreset;
window.addSiteFromPurposeModal = addSiteFromPurposeModal;
window.savePurposeFromModal = savePurposeFromModal;
window.closePurposeModal = closePurposeModal;

console.log('[receipt-purpose.js] ✓ 駐車場目的入力モジュール読み込み完了');
