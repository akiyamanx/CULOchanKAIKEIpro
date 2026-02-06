// ==========================================
// 設定管理（ロゴ・印鑑・パスワード含む）
// Reform App Pro v0.95.1
// ==========================================
// v0.95.1修正:
//   - saveSettings()からcompanyLogo/companyStampを削除
//     （別キーに保存済みなのに2重保存していた問題を修正）
//   - LocalStorage容量オーバー対策
//   - 起動時に古いsettingsデータをクリーンアップ
// ==========================================

// v0.95.1追加: 起動時に古いsettingsの肥大化データを削除
function cleanupOldSettings() {
  try {
    const data = localStorage.getItem('reform_app_settings');
    if (!data) return;
    
    const settings = JSON.parse(data);
    let needsSave = false;
    
    // companyLogo/companyStampが含まれていたら削除
    if (settings.companyLogo) {
      delete settings.companyLogo;
      needsSave = true;
      console.log('[cleanupOldSettings] companyLogoを削除');
    }
    if (settings.companyStamp) {
      delete settings.companyStamp;
      needsSave = true;
      console.log('[cleanupOldSettings] companyStampを削除');
    }
    
    if (needsSave) {
      localStorage.setItem('reform_app_settings', JSON.stringify(settings));
      console.log('[cleanupOldSettings] settingsをクリーンアップしました');
    }
  } catch (e) {
    console.warn('[cleanupOldSettings] エラー:', e);
  }
}

// ページ読み込み時にクリーンアップを実行
if (typeof window !== 'undefined') {
  cleanupOldSettings();
}

// ==========================================
// インボイス番号表示切り替え
// ==========================================
function toggleInvoiceNumber() {
  const checkbox = document.getElementById('isInvoiceRegistered');
  const group = document.getElementById('invoiceNumberGroup');
  group.style.display = checkbox.checked ? 'block' : 'none';
}

// ==========================================
// テンプレート設定
// ==========================================
function updateTemplateSetting() {
  // 保存時に反映されるので何もしなくてOK
}

// ==========================================
// ロゴアップロード
// ==========================================
function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const logoData = e.target.result;
    localStorage.setItem('reform_app_logo', logoData);
    
    document.getElementById('logoPreview').src = logoData;
    document.getElementById('logoPreview').style.display = 'block';
    document.getElementById('logoPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function clearLogo() {
  localStorage.removeItem('reform_app_logo');
  document.getElementById('logoPreview').style.display = 'none';
  document.getElementById('logoPlaceholder').style.display = 'block';
  document.getElementById('companyLogoInput').value = '';
}

// ==========================================
// 印鑑アップロード・背景透過処理
// ==========================================
function handleStampUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const stampData = e.target.result;
    localStorage.setItem('reform_app_stamp_original', stampData);
    
    document.getElementById('stampOriginal').src = stampData;
    document.getElementById('stampOriginal').style.display = 'block';
    document.getElementById('stampPlaceholder').style.display = 'none';
    
    // 背景透過処理
    processStampImage(stampData);
  };
  reader.readAsDataURL(file);
}

function reprocessStamp() {
  const originalData = localStorage.getItem('reform_app_stamp_original');
  if (originalData) {
    processStampImage(originalData);
  }
}

function processStampImage(imageData) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    const threshold = parseInt(document.getElementById('stampThreshold').value) || 200;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // 白っぽい部分（明るい部分）を透明にする
      const brightness = (r + g + b) / 3;
      
      if (brightness > threshold) {
        // 白っぽい → 透明に
        data[i + 3] = 0;
      } else {
        // 赤みを強調（印鑑は赤いことが多い）
        if (r > g && r > b) {
          data[i] = Math.min(255, r * 1.2);
          data[i + 1] = Math.floor(g * 0.8);
          data[i + 2] = Math.floor(b * 0.8);
        }
        data[i + 3] = 255;
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
    
    // 処理後の画像を保存
    const processedData = canvas.toDataURL('image/png');
    localStorage.setItem('reform_app_stamp', processedData);
    
    document.getElementById('stampProcessed').src = processedData;
    document.getElementById('stampProcessed').style.display = 'block';
  };
  img.src = imageData;
}

function clearStamp() {
  localStorage.removeItem('reform_app_stamp');
  localStorage.removeItem('reform_app_stamp_original');
  document.getElementById('stampOriginal').style.display = 'none';
  document.getElementById('stampProcessed').style.display = 'none';
  document.getElementById('stampPlaceholder').style.display = 'block';
  document.getElementById('stampInput').value = '';
}

// ==========================================
// Gemini API 接続テスト（v0.95追加）
// ==========================================

/**
 * Gemini APIキーの接続テストを実行
 * 設定画面の「🔍 接続テスト」ボタンから呼ばれる
 */
async function testGeminiApi() {
  const apiKeyEl = document.getElementById('geminiApiKey');
  if (!apiKeyEl) return;

  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) {
    alert('❌ APIキーが入力されていません。\n\nGoogle AI Studio で取得したキーを入力してください。');
    apiKeyEl.focus();
    return;
  }

  // テスト中の表示
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '⏳ テスト中...';
  btn.disabled = true;

  try {
    // Gemini APIに簡単なリクエストを送信
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'テスト。「OK」とだけ返してください。' }] }]
        })
      }
    );

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      alert(`✅ 接続成功！\n\nGemini APIが正常に応答しました。\n応答: ${text.slice(0, 50)}`);
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `HTTPエラー: ${response.status}`;

      if (response.status === 400) {
        alert(`❌ APIキーが無効です。\n\n${errorMsg}\n\nキーを確認してください。`);
      } else if (response.status === 403) {
        alert(`❌ APIキーの権限がありません。\n\n${errorMsg}\n\nGemini APIが有効になっているか確認してください。`);
      } else if (response.status === 429) {
        alert(`⚠️ API使用回数の上限に達しています。\n\n${errorMsg}\n\nしばらく待ってからお試しください。`);
      } else {
        alert(`❌ 接続エラー\n\n${errorMsg}`);
      }
    }
  } catch (e) {
    alert(`❌ 通信エラー\n\nインターネット接続を確認してください。\n\nエラー: ${e.message}`);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ==========================================
// 設定の保存・読み込み
// ==========================================
function saveSettings() {
  // v0.95.1: デバッグ用
  console.log('[saveSettings] 開始');
  try {
  // v0.95.1修正: companyLogoとcompanyStampを削除
  // → これらは reform_app_logo, reform_app_stamp に別途保存済み
  // → settingsに含めると2重保存で容量を圧迫する原因になる
  const settings = {
    geminiApiKey: document.getElementById('geminiApiKey').value,
    useGeminiForVoice: document.getElementById('useGeminiForVoice').checked,
    template: document.querySelector('input[name="template"]:checked')?.value || 'simple',
    // companyLogo: 削除（reform_app_logoに保存済み）
    // companyStamp: 削除（reform_app_stampに保存済み）
    stampThreshold: document.getElementById('stampThreshold').value,
    companyName: document.getElementById('companyName').value,
    postalCode: document.getElementById('postalCode').value,
    address: document.getElementById('address').value,
    phone: document.getElementById('phone').value,
    fax: document.getElementById('fax').value,
    email: document.getElementById('email').value,
    isInvoiceRegistered: document.getElementById('isInvoiceRegistered').checked,
    invoiceNumber: document.getElementById('invoiceNumber').value,
    taxRate: document.getElementById('taxRate').value,
    bankName: document.getElementById('bankName').value,
    branchName: document.getElementById('branchName').value,
    accountType: document.getElementById('accountType').value,
    accountNumber: document.getElementById('accountNumber').value,
    accountHolder: document.getElementById('accountHolder').value,
    estimateValidDays: document.getElementById('estimateValidDays').value,
    paymentTerms: document.getElementById('paymentTerms').value,
    dailyRate: document.getElementById('dailyRate').value,
    defaultProfitRate: document.getElementById('defaultProfitRate').value,
  };
  
  localStorage.setItem('reform_app_settings', JSON.stringify(settings));
  
  // 保存完了表示
  const btn = document.getElementById('saveBtn');
  btn.textContent = '✓ 保存しました！';
  btn.classList.add('saved');
  
  setTimeout(() => {
    btn.textContent = '保存';
    btn.classList.remove('saved');
  }, 2000);
  
  // v0.95.1: デバッグ用
  console.log('[saveSettings] 完了');
  } catch (e) {
    // v0.95.1: エラーをアラートで表示（デバッグ用）
    alert('❌ 設定保存エラー:\n' + e.message + '\n\n' + e.stack);
    console.error('[saveSettings] エラー:', e);
  }
}

function loadSettings() {
  const data = localStorage.getItem('reform_app_settings');
  if (!data) return;
  
  const settings = JSON.parse(data);
  
  // テンプレート
  const templateRadio = document.querySelector(`input[name="template"][value="${settings.template || 'simple'}"]`);
  if (templateRadio) templateRadio.checked = true;
  
  // ロゴ
  const logoData = localStorage.getItem('reform_app_logo');
  if (logoData) {
    document.getElementById('logoPreview').src = logoData;
    document.getElementById('logoPreview').style.display = 'block';
    document.getElementById('logoPlaceholder').style.display = 'none';
  }
  
  // 印鑑
  const stampData = localStorage.getItem('reform_app_stamp');
  const stampOriginalData = localStorage.getItem('reform_app_stamp_original');
  if (stampOriginalData) {
    document.getElementById('stampOriginal').src = stampOriginalData;
    document.getElementById('stampOriginal').style.display = 'block';
    document.getElementById('stampPlaceholder').style.display = 'none';
  }
  if (stampData) {
    document.getElementById('stampProcessed').src = stampData;
    document.getElementById('stampProcessed').style.display = 'block';
  }
  
  // 透過感度
  document.getElementById('stampThreshold').value = settings.stampThreshold || 200;
  
  document.getElementById('geminiApiKey').value = settings.geminiApiKey || '';
  document.getElementById('useGeminiForVoice').checked = settings.useGeminiForVoice || false;
  document.getElementById('companyName').value = settings.companyName || '';
  document.getElementById('postalCode').value = settings.postalCode || '';
  document.getElementById('address').value = settings.address || '';
  document.getElementById('phone').value = settings.phone || '';
  document.getElementById('fax').value = settings.fax || '';
  document.getElementById('email').value = settings.email || '';
  document.getElementById('isInvoiceRegistered').checked = settings.isInvoiceRegistered || false;
  document.getElementById('invoiceNumber').value = settings.invoiceNumber || '';
  document.getElementById('taxRate').value = settings.taxRate || '10';
  document.getElementById('bankName').value = settings.bankName || '';
  document.getElementById('branchName').value = settings.branchName || '';
  document.getElementById('accountType').value = settings.accountType || '普通';
  document.getElementById('accountNumber').value = settings.accountNumber || '';
  document.getElementById('accountHolder').value = settings.accountHolder || '';
  document.getElementById('estimateValidDays').value = settings.estimateValidDays || '30';
  document.getElementById('paymentTerms').value = settings.paymentTerms || '翌月末';
  document.getElementById('dailyRate').value = settings.dailyRate || '18000';
  document.getElementById('defaultProfitRate').value = settings.defaultProfitRate || '20';
  
  toggleInvoiceNumber();
  
  // v0.95.2: ストレージ使用量を表示
  updateStorageUsageDisplay();
}

// ==========================================
// パスワード管理
// ==========================================
function checkPasswordOnLoad() { return; // ★ パスワード無効化中（将来有効化を検討）
  const savedPassword = localStorage.getItem('reform_app_password');
  if (savedPassword) {
    document.getElementById('lock-screen').classList.remove('hidden');
    document.getElementById('lockPassword').focus();
  }
}

function unlockApp() {
  const inputPassword = document.getElementById('lockPassword').value;
  const savedPassword = localStorage.getItem('reform_app_password');
  
  if (inputPassword === savedPassword) {
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('lockError').style.display = 'none';
    document.getElementById('lockPassword').value = '';
  } else {
    document.getElementById('lockError').style.display = 'block';
    document.getElementById('lockPassword').value = '';
    document.getElementById('lockPassword').focus();
  }
}

function setPassword() {
  const newPass = document.getElementById('newPassword').value;
  const confirmPass = document.getElementById('confirmPassword').value;
  const recoveryWord = document.getElementById('recoveryWord').value;
  
  if (newPass.length < 4) {
    alert('パスワードは4文字以上で設定してください');
    return;
  }
  
  if (newPass !== confirmPass) {
    alert('パスワードが一致しません');
    return;
  }
  
  if (!recoveryWord || recoveryWord.length < 2) {
    alert('合言葉を設定してください（2文字以上）');
    return;
  }
  
  localStorage.setItem('reform_app_password', newPass);
  localStorage.setItem('reform_app_recovery', recoveryWord);
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  document.getElementById('recoveryWord').value = '';
  updatePasswordUI();
  alert('✅ パスワードを設定しました\n\n次回起動時からパスワード入力が必要になります\n\n※パスワードを忘れた場合は合言葉で解除できます');
}

function showRecoveryScreen() {
  const savedRecovery = localStorage.getItem('reform_app_recovery');
  if (!savedRecovery) {
    alert('合言葉が設定されていません。\n\n全データ削除でリセットするしかありません。');
    if (confirm('全データを削除してリセットしますか？\n\n⚠️ すべてのデータが消えます')) {
      if (prompt('「削除」と入力してください：') === '削除') {
        clearAllDataForReset();
      }
    }
    return;
  }
  document.getElementById('lock-screen').classList.add('hidden');
  document.getElementById('recovery-screen').classList.remove('hidden');
  document.getElementById('recoveryInput').focus();
}

function hideRecoveryScreen() {
  document.getElementById('recovery-screen').classList.add('hidden');
  document.getElementById('lock-screen').classList.remove('hidden');
  document.getElementById('recoveryInput').value = '';
  document.getElementById('recoveryError').style.display = 'none';
}

function checkRecoveryWord() {
  const input = document.getElementById('recoveryInput').value;
  const savedRecovery = localStorage.getItem('reform_app_recovery');
  
  if (input === savedRecovery) {
    // 合言葉が正しい → パスワードリセット
    const newPass = prompt('新しいパスワードを入力してください（4文字以上）：');
    if (!newPass || newPass.length < 4) {
      alert('パスワードは4文字以上で設定してください');
      return;
    }
    
    const confirmPass = prompt('新しいパスワードをもう一度入力してください：');
    if (newPass !== confirmPass) {
      alert('パスワードが一致しません');
      return;
    }
    
    localStorage.setItem('reform_app_password', newPass);
    alert('✅ パスワードをリセットしました！');
    document.getElementById('recovery-screen').classList.add('hidden');
    document.getElementById('recoveryInput').value = '';
  } else {
    document.getElementById('recoveryError').style.display = 'block';
    document.getElementById('recoveryInput').value = '';
    document.getElementById('recoveryInput').focus();
  }
}

function clearAllDataForReset() {
  localStorage.removeItem('reform_app_settings');
  localStorage.removeItem('reform_app_materials');
  localStorage.removeItem('reform_app_estimates');
  localStorage.removeItem('reform_app_invoices');
  localStorage.removeItem('reform_app_expenses');
  localStorage.removeItem('reform_app_customers');
  localStorage.removeItem('reform_app_product_master');
  localStorage.removeItem('reform_app_logo');
  localStorage.removeItem('reform_app_stamp');
  localStorage.removeItem('reform_app_stamp_original');
  localStorage.removeItem('reform_app_password');
  localStorage.removeItem('reform_app_recovery');
  alert('✅ リセットしました');
  location.reload();
}

function showChangePassword() {
  const currentPass = prompt('現在のパスワードを入力してください：');
  const savedPassword = localStorage.getItem('reform_app_password');
  
  if (currentPass !== savedPassword) {
    alert('❌ パスワードが違います');
    return;
  }
  
  const newPass = prompt('新しいパスワードを入力してください（4文字以上）：');
  if (!newPass || newPass.length < 4) {
    alert('パスワードは4文字以上で設定してください');
    return;
  }
  
  const confirmPass = prompt('新しいパスワードをもう一度入力してください：');
  if (newPass !== confirmPass) {
    alert('パスワードが一致しません');
    return;
  }
  
  localStorage.setItem('reform_app_password', newPass);
  alert('✅ パスワードを変更しました');
}

function showChangeRecoveryWord() {
  const currentPass = prompt('現在のパスワードを入力してください：');
  const savedPassword = localStorage.getItem('reform_app_password');
  
  if (currentPass !== savedPassword) {
    alert('❌ パスワードが違います');
    return;
  }
  
  const newWord = prompt('新しい合言葉を入力してください：');
  if (!newWord || newWord.length < 2) {
    alert('合言葉は2文字以上で設定してください');
    return;
  }
  
  localStorage.setItem('reform_app_recovery', newWord);
  alert('✅ 合言葉を変更しました');
}

function removePassword() {
  const currentPass = prompt('現在のパスワードを入力してください：');
  const savedPassword = localStorage.getItem('reform_app_password');
  
  if (currentPass !== savedPassword) {
    alert('❌ パスワードが違います');
    return;
  }
  
  if (!confirm('パスワードを解除しますか？\n\n解除すると誰でもアプリを開けるようになります。')) {
    return;
  }
  
  localStorage.removeItem('reform_app_password');
  localStorage.removeItem('reform_app_recovery');
  updatePasswordUI();
  alert('✅ パスワードを解除しました');
}

function updatePasswordUI() {
  const savedPassword = localStorage.getItem('reform_app_password');
  if (savedPassword) {
    document.getElementById('passwordNotSet').style.display = 'none';
    document.getElementById('passwordSet').style.display = 'block';
  } else {
    document.getElementById('passwordNotSet').style.display = 'block';
    document.getElementById('passwordSet').style.display = 'none';
  }
}

// API使用量の表示を更新
function updateApiUsageDisplay() {
  const displayEl = document.getElementById('apiUsageDisplay');
  if (!displayEl) return;
  
  const usage = getApiUsage();
  const dailyPercent = Math.round((usage.dailyCount / usage.dailyLimit) * 100);
  const monthlyPercent = Math.round((usage.monthlyCount / usage.monthlyLimit) * 100);
  
  displayEl.innerHTML = `
    <div style="margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>今日: ${usage.dailyCount} / ${usage.dailyLimit}回</span>
        <span>${dailyPercent}%</span>
      </div>
      <div style="background: #e0f2fe; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: ${dailyPercent > 80 ? '#ef4444' : '#3b82f6'}; height: 100%; width: ${dailyPercent}%; transition: width 0.3s;"></div>
      </div>
    </div>
    <div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>今月: ${usage.monthlyCount} / ${usage.monthlyLimit}回</span>
        <span>${monthlyPercent}%</span>
      </div>
      <div style="background: #e0f2fe; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: ${monthlyPercent > 80 ? '#ef4444' : '#3b82f6'}; height: 100%; width: ${monthlyPercent}%; transition: width 0.3s;"></div>
      </div>
    </div>
  `;
}


// ==========================================
// v0.95.2追加: ストレージ使用量の見える化
// ==========================================

/**
 * LocalStorageの使用量を計算してカテゴリ別に表示
 */
function updateStorageUsageDisplay() {
  var displayEl = document.getElementById('storageUsageDisplay');
  if (!displayEl) return;
  
  // 全LocalStorageキーのサイズを計算
  var totalBytes = 0;
  var breakdown = {};
  
  // アプリ関連キーのカテゴリ分類
  var keyCategories = {
    'reform_app_receipt_history': 'レシート履歴',
    'reform_app_logo': 'ロゴ画像',
    'reform_app_stamp': '印鑑（透過後）',
    'reform_app_stamp_original': '印鑑（元画像）',
    'reform_app_product_master': '品名マスター',
    'reform_app_estimates': '見積書',
    'reform_app_invoices': '請求書',
    'reform_app_materials': '材料データ',
    'reform_app_expenses': '経費データ',
    'reform_app_customers': '顧客データ',
    'reform_app_settings': '設定',
    'reform_app_categories': '勘定科目',
    'reform_app_autosave_receipt': '自動保存（レシート）',
    'reform_app_autosave_estimate': '自動保存（見積書）',
    'reform_app_autosave_invoice': '自動保存（請求書）',
    'reform_app_api_usage': 'API使用量',
    'reform_app_password': 'パスワード',
    'reform_app_recovery': '合言葉'
  };
  
  // 各キーのサイズを計算
  var items = [];
  for (var key in keyCategories) {
    var data = localStorage.getItem(key);
    if (data) {
      var bytes = new Blob([data]).size;
      totalBytes += bytes;
      items.push({
        label: keyCategories[key],
        bytes: bytes
      });
    }
  }
  
  // その他のreform_appキー
  var otherBytes = 0;
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith('reform_app_') && !keyCategories[k]) {
      var d = localStorage.getItem(k);
      if (d) {
        var b = new Blob([d]).size;
        totalBytes += b;
        otherBytes += b;
      }
    }
  }
  if (otherBytes > 0) {
    items.push({ label: 'その他', bytes: otherBytes });
  }
  
  // サイズの大きい順にソート
  items.sort(function(a, b) { return b.bytes - a.bytes; });
  
  // 推定上限（通常5MB）
  var estimatedLimit = 5 * 1024 * 1024;
  var usagePercent = Math.round((totalBytes / estimatedLimit) * 100);
  var usageMB = (totalBytes / (1024 * 1024)).toFixed(2);
  var limitMB = (estimatedLimit / (1024 * 1024)).toFixed(0);
  
  // バーの色
  var barColor = '#3b82f6';
  if (usagePercent > 80) barColor = '#f59e0b';
  if (usagePercent > 95) barColor = '#ef4444';
  
  // HTML生成
  var html = '';
  
  // 全体バー
  html += '<div style="margin-bottom: 12px;">';
  html += '  <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">';
  html += '    <span style="font-weight: bold; color: #1e3a5f;">使用量: ' + usageMB + ' MB / 約' + limitMB + ' MB</span>';
  html += '    <span style="color: ' + barColor + '; font-weight: bold;">' + usagePercent + '%</span>';
  html += '  </div>';
  html += '  <div style="background: #e5e7eb; border-radius: 6px; height: 12px; overflow: hidden;">';
  html += '    <div style="background: ' + barColor + '; height: 100%; width: ' + Math.min(usagePercent, 100) + '%; transition: width 0.3s; border-radius: 6px;"></div>';
  html += '  </div>';
  html += '</div>';
  
  // 警告メッセージ
  if (usagePercent > 80) {
    html += '<div style="background: #fef3c7; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: #92400e;">';
    if (usagePercent > 95) {
      html += '⚠️ <strong>容量が非常に少なくなっています！</strong><br>バックアップを取ってから不要なデータを削除してください。';
    } else {
      html += '💡 容量が少なくなってきています。定期的にバックアップをお取りください。';
    }
    html += '</div>';
  }
  
  // 内訳（上位5件＋その他）
  html += '<div style="font-size: 12px; font-weight: bold; color: #374151; margin-bottom: 6px;">📊 内訳</div>';
  
  var showCount = Math.min(items.length, 6);
  for (var j = 0; j < showCount; j++) {
    var item = items[j];
    var sizeStr = formatStorageSize(item.bytes);
    var itemPercent = totalBytes > 0 ? Math.round((item.bytes / totalBytes) * 100) : 0;
    
    html += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 12px; color: #475569; border-bottom: 1px solid #f3f4f6;">';
    html += '  <span>' + item.label + '</span>';
    html += '  <span style="font-weight: 500;">' + sizeStr + ' (' + itemPercent + '%)</span>';
    html += '</div>';
  }
  
  if (items.length > showCount) {
    html += '<div style="text-align: center; font-size: 11px; color: #9ca3af; padding: 4px 0;">他 ' + (items.length - showCount) + ' 項目</div>';
  }
  
  displayEl.innerHTML = html;
}

/**
 * バイト数を読みやすい単位に変換
 */
function formatStorageSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}


// ==========================================
// v0.95.2追加: ストレージ使用量の見える化
// ==========================================

/**
 * LocalStorageの使用量を計算
 * @returns {Object} { totalBytes, items: [{key, bytes, label}], maxBytes }
 */
function calculateStorageUsage() {
  var items = [];
  var totalBytes = 0;
  
  // LocalStorageの全キーを走査
  var keyLabels = {
    'reform_app_settings': '⚙️ 設定情報',
    'reform_app_materials': '📦 材料データ',
    'reform_app_estimates': '📝 見積書',
    'reform_app_invoices': '📄 請求書',
    'reform_app_expenses': '💰 経費データ',
    'reform_app_customers': '👤 顧客データ',
    'reform_app_product_master': '📦 品名マスター',
    'reform_app_categories': '📋 勘定科目',
    'reform_app_logo': '🖼️ 会社ロゴ',
    'reform_app_stamp': '🔴 印鑑（処理済）',
    'reform_app_stamp_original': '🔴 印鑑（原本）',
    'reform_app_receipt_history': '📷 レシート履歴',
    'reform_app_password': '🔒 パスワード',
    'reform_app_recovery': '🔒 合言葉',
    'reform_app_api_usage': '📊 API使用量',
    'reform_app_autosave_receipt': '💾 自動保存（レシート）',
    'reform_app_autosave_estimate': '💾 自動保存（見積書）',
    'reform_app_autosave_invoice': '💾 自動保存（請求書）'
  };
  
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    var value = localStorage.getItem(key);
    // UTF-16の場合: 1文字 = 2bytes
    var bytes = (key.length + value.length) * 2;
    totalBytes += bytes;
    
    // reform_appのキーのみ詳細表示
    if (key.startsWith('reform_app')) {
      items.push({
        key: key,
        bytes: bytes,
        label: keyLabels[key] || key
      });
    }
  }
  
  // サイズ順にソート（大きいものから）
  items.sort(function(a, b) { return b.bytes - a.bytes; });
  
  return {
    totalBytes: totalBytes,
    items: items,
    // LocalStorageの一般的な上限（ブラウザにより5〜10MB）
    maxBytes: 5 * 1024 * 1024  // 5MB を基準に表示
  };
}

/**
 * バイト数を見やすい文字列に変換
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * ストレージ使用量の表示を更新
 */
function updateStorageUsageDisplay() {
  var displayEl = document.getElementById('storageUsageDisplay');
  if (!displayEl) return;
  
  var usage = calculateStorageUsage();
  var usedMB = (usage.totalBytes / (1024 * 1024)).toFixed(2);
  var maxMB = (usage.maxBytes / (1024 * 1024)).toFixed(0);
  var percent = Math.min(100, Math.round(usage.totalBytes / usage.maxBytes * 100));
  
  var barColor = percent > 80 ? '#ef4444' : percent > 60 ? '#f59e0b' : '#22c55e';
  var statusText = percent > 80 ? '⚠️ 容量が逼迫しています' : percent > 60 ? '💡 余裕はありますが注意' : '✅ 余裕あり';
  
  // メインバー
  var html = '';
  html += '<div style="margin-bottom: 8px;">';
  html += '  <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">';
  html += '    <span>使用量: ' + usedMB + ' MB / 約' + maxMB + ' MB</span>';
  html += '    <span>' + percent + '%</span>';
  html += '  </div>';
  html += '  <div style="background: #e0f2fe; border-radius: 4px; height: 10px; overflow: hidden;">';
  html += '    <div style="background: ' + barColor + '; height: 100%; width: ' + percent + '%; transition: width 0.3s; border-radius: 4px;"></div>';
  html += '  </div>';
  html += '  <div style="font-size: 11px; color: #64748b; margin-top: 4px;">' + statusText + '</div>';
  html += '</div>';
  
  // 内訳（上位5件＋画像系のみ表示）
  html += '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #bae6fd;">';
  html += '  <div style="font-size: 11px; font-weight: bold; color: #0369a1; margin-bottom: 6px;">内訳（上位）</div>';
  
  var showCount = Math.min(usage.items.length, 7);
  for (var i = 0; i < showCount; i++) {
    var item = usage.items[i];
    var itemPercent = Math.round(item.bytes / usage.totalBytes * 100);
    var itemBarColor = item.key.includes('receipt_history') || item.key.includes('logo') || item.key.includes('stamp') ? '#f59e0b' : '#3b82f6';
    
    html += '<div style="margin-bottom: 6px;">';
    html += '  <div style="display: flex; justify-content: space-between; font-size: 11px;">';
    html += '    <span>' + item.label + '</span>';
    html += '    <span style="color: #64748b;">' + formatBytes(item.bytes) + '</span>';
    html += '  </div>';
    html += '  <div style="background: #f1f5f9; border-radius: 2px; height: 4px; overflow: hidden; margin-top: 2px;">';
    html += '    <div style="background: ' + itemBarColor + '; height: 100%; width: ' + itemPercent + '%;"></div>';
    html += '  </div>';
    html += '</div>';
  }
  
  html += '</div>';
  
  // 容量が逼迫時の対策ヒント
  if (percent > 60) {
    html += '<div style="margin-top: 10px; padding: 10px; background: #fef3c7; border-radius: 8px; font-size: 11px; color: #92400e; line-height: 1.6;">';
    html += '💡 容量を節約するには:<br>';
    html += '・レシート保存時に「画像を保存」のチェックを外す<br>';
    html += '・古い見積書やレシート履歴を削除する<br>';
    html += '・定期的にバックアップを取ってデータを整理する';
    html += '</div>';
  }
  
  displayEl.innerHTML = html;
}

// 設定画面表示時に自動更新
(function autoHookStorageDisplay() {
  if (typeof window.showScreen === 'function' && !window._storageDisplayHooked) {
    var _origShowScreen2 = window.showScreen;
    window.showScreen = function(screenName) {
      _origShowScreen2(screenName);
      if (screenName === 'settings') {
        // 少し遅延して描画後に計算
        setTimeout(updateStorageUsageDisplay, 100);
      }
    };
    window._storageDisplayHooked = true;
    console.log('✓ ストレージ使用量: showScreenフック完了');
  } else {
    setTimeout(autoHookStorageDisplay, 300);
  }
})();
