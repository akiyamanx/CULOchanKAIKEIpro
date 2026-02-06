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
// v0.96: IndexedDBに保存
// ==========================================
function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const logoData = e.target.result;
    
    // v0.96: IDBに保存（フォールバック: LocalStorage）
    try {
      await saveLogoToIDB(logoData);
    } catch (err) {
      console.warn('[settings] IDBロゴ保存失敗、LSにフォールバック:', err);
      localStorage.setItem('reform_app_logo', logoData);
    }
    
    document.getElementById('logoPreview').src = logoData;
    document.getElementById('logoPreview').style.display = 'block';
    document.getElementById('logoPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function clearLogo() {
  // v0.96: IDB + LS両方削除
  try { await deleteLogoFromIDB(); } catch(e) {}
  localStorage.removeItem('reform_app_logo');
  document.getElementById('logoPreview').style.display = 'none';
  document.getElementById('logoPlaceholder').style.display = 'block';
  document.getElementById('companyLogoInput').value = '';
}

// ==========================================
// 印鑑アップロード・背景透過処理
// v0.96: IndexedDBに保存
// ==========================================
function handleStampUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const stampData = e.target.result;
    
    // v0.96: オリジナルをIDBに保存
    try {
      await saveImageToIDB('app_stamp_original', stampData);
    } catch (err) {
      console.warn('[settings] IDB印鑑原本保存失敗、LSにフォールバック:', err);
      localStorage.setItem('reform_app_stamp_original', stampData);
    }
    
    document.getElementById('stampOriginal').src = stampData;
    document.getElementById('stampOriginal').style.display = 'block';
    document.getElementById('stampPlaceholder').style.display = 'none';
    
    // 背景透過処理
    processStampImage(stampData);
  };
  reader.readAsDataURL(file);
}

async function reprocessStamp() {
  // v0.96: IDB優先で原本を取得
  let originalData = null;
  try {
    originalData = await getStampOriginalFromIDB();
  } catch(e) {}
  if (!originalData) {
    originalData = localStorage.getItem('reform_app_stamp_original');
  }
  if (originalData) {
    processStampImage(originalData);
  }
}

function processStampImage(imageData) {
  const img = new Image();
  img.onload = async () => {
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
    
    // v0.96: IDBに保存
    try {
      await saveImageToIDB('app_stamp', processedData);
    } catch (err) {
      console.warn('[settings] IDB印鑑保存失敗、LSにフォールバック:', err);
      localStorage.setItem('reform_app_stamp', processedData);
    }
    
    document.getElementById('stampProcessed').src = processedData;
    document.getElementById('stampProcessed').style.display = 'block';
  };
  img.src = imageData;
}

async function clearStamp() {
  // v0.96: IDB + LS両方削除
  try { await deleteStampFromIDB(); } catch(e) {}
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
    // v0.96: ロゴ調整
    logoWidth: document.getElementById('logoWidth').value,
    logoOffsetX: document.getElementById('logoOffsetX').value,
    logoOffsetY: document.getElementById('logoOffsetY').value,
    // v0.96: 印鑑調整
    stampSize: document.getElementById('stampSize').value,
    stampOffsetX: document.getElementById('stampOffsetX').value,
    stampOffsetY: document.getElementById('stampOffsetY').value,
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
  
  // ロゴ（v0.96: IDB対応）
  getLogoFromIDB().then(function(logoData) {
    if (logoData) {
      document.getElementById('logoPreview').src = logoData;
      document.getElementById('logoPreview').style.display = 'block';
      document.getElementById('logoPlaceholder').style.display = 'none';
    }
  }).catch(function() {});
  
  // 印鑑（v0.96: IDB対応）
  getStampFromIDB().then(function(stampData) {
    if (stampData) {
      document.getElementById('stampProcessed').src = stampData;
      document.getElementById('stampProcessed').style.display = 'block';
    }
  }).catch(function() {});
  
  getStampOriginalFromIDB().then(function(stampOriginalData) {
    if (stampOriginalData) {
      document.getElementById('stampOriginal').src = stampOriginalData;
      document.getElementById('stampOriginal').style.display = 'block';
      document.getElementById('stampPlaceholder').style.display = 'none';
    }
  }).catch(function() {});
  
  // 透過感度
  document.getElementById('stampThreshold').value = settings.stampThreshold || 200;
  
  // v0.96: ロゴ調整値の復元
  var logoW = settings.logoWidth || 35;
  var logoOX = settings.logoOffsetX || 0;
  var logoOY = settings.logoOffsetY || 0;
  document.getElementById('logoWidth').value = logoW;
  document.getElementById('logoOffsetX').value = logoOX;
  document.getElementById('logoOffsetY').value = logoOY;
  document.getElementById('logoWidthValue').textContent = logoW;
  document.getElementById('logoOffsetXValue').textContent = logoOX;
  document.getElementById('logoOffsetYValue').textContent = logoOY;
  
  // v0.96: 印鑑調整値の復元
  var stSize = settings.stampSize || 22;
  var stOX = settings.stampOffsetX || 0;
  var stOY = settings.stampOffsetY || -5;
  document.getElementById('stampSize').value = stSize;
  document.getElementById('stampOffsetX').value = stOX;
  document.getElementById('stampOffsetY').value = stOY;
  document.getElementById('stampSizeValue').textContent = stSize;
  document.getElementById('stampOffsetXValue').textContent = stOX;
  document.getElementById('stampOffsetYValue').textContent = stOY;
  
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
 * v0.96: IndexedDB使用量も表示
 */
async function updateStorageUsageDisplay() {
  var displayEl = document.getElementById('storageUsageDisplay');
  if (!displayEl) return;
  
  var usage = calculateStorageUsage();
  var usedMB = (usage.totalBytes / (1024 * 1024)).toFixed(2);
  var maxMB = (usage.maxBytes / (1024 * 1024)).toFixed(0);
  var percent = Math.min(100, Math.round(usage.totalBytes / usage.maxBytes * 100));
  
  var barColor = percent > 80 ? '#ef4444' : percent > 60 ? '#f59e0b' : '#22c55e';
  var statusText = percent > 80 ? '⚠️ 容量が逼迫しています' : percent > 60 ? '💡 余裕はありますが注意' : '✅ 余裕あり';
  
  // メインバー（LocalStorage）
  var html = '';
  html += '<div style="margin-bottom: 8px;">';
  html += '  <div style="font-size: 12px; font-weight: bold; color: #0369a1; margin-bottom: 6px;">📦 LocalStorage</div>';
  html += '  <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">';
  html += '    <span>使用量: ' + usedMB + ' MB / 約' + maxMB + ' MB</span>';
  html += '    <span>' + percent + '%</span>';
  html += '  </div>';
  html += '  <div style="background: #e0f2fe; border-radius: 4px; height: 10px; overflow: hidden;">';
  html += '    <div style="background: ' + barColor + '; height: 100%; width: ' + percent + '%; transition: width 0.3s; border-radius: 4px;"></div>';
  html += '  </div>';
  html += '  <div style="font-size: 11px; color: #64748b; margin-top: 4px;">' + statusText + '</div>';
  html += '</div>';
  
  // v0.96: IndexedDB使用量
  try {
    var idbEst = await getIDBStorageEstimate();
    if (idbEst) {
      html += '<div style="margin-top: 12px; padding: 10px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">';
      html += '  <div style="font-size: 12px; font-weight: bold; color: #166534; margin-bottom: 4px;">🗄️ IndexedDB（画像データ）</div>';
      html += '  <div style="font-size: 11px; color: #374151;">使用量: ' + idbEst.usageMB + ' MB / ' + idbEst.quotaMB + ' MB</div>';
      html += '  <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">💡 レシート画像・ロゴ・印鑑はここに保存されます（容量たっぷり！）</div>';
      html += '</div>';
    }
  } catch(e) {}
  
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


// ==========================================
// IndexedDB診断ツール（v0.96追加）
// ==========================================

/**
 * IDBの中身を確認して結果を表示する診断関数
 */
async function runIDBDiagnostic() {
  var resultEl = document.getElementById('idbDiagnosticResult');
  if (!resultEl) return;
  
  resultEl.innerHTML = '<div style="font-size: 12px; color: #6b7280; padding: 8px;">🔍 診断中...</div>';
  
  try {
    var html = '';
    
    // 1. IDB接続チェック
    var db = await getDB();
    html += '<div style="padding: 2px 0; font-size: 12px;">✅ IndexedDB接続: OK</div>';
    
    // 2. 保存済み画像キー一覧
    var keys = await getAllImageKeys();
    html += '<div style="padding: 2px 0; font-size: 12px;">📦 IDB保存画像: <strong>' + keys.length + '件</strong></div>';
    
    if (keys.length > 0) {
      // キーを分類表示
      var logoKeys = keys.filter(function(k) { return k === 'app_logo'; });
      var stampKeys = keys.filter(function(k) { return k.startsWith('app_stamp'); });
      var receiptKeys = keys.filter(function(k) { return k.startsWith('receipt_img_'); });
      var otherKeys = keys.filter(function(k) { return !k.startsWith('app_') && !k.startsWith('receipt_img_'); });
      
      html += '<div style="margin: 6px 0; padding: 8px; background: #f0fdf4; border-radius: 6px; font-size: 11px; line-height: 1.8;">';
      html += '  🖼️ ロゴ: ' + (logoKeys.length > 0 ? '<span style="color:#166534;">IDBに保存済み ✓</span>' : '<span style="color:#9ca3af;">なし</span>') + '<br>';
      html += '  🔏 印鑑: ' + (stampKeys.length > 0 ? '<span style="color:#166534;">IDBに保存済み ✓ (' + stampKeys.length + '件)</span>' : '<span style="color:#9ca3af;">なし</span>') + '<br>';
      html += '  📷 レシート画像: <span style="color:#166534;">' + receiptKeys.length + '件</span>';
      if (otherKeys.length > 0) {
        html += '<br>  📋 その他: ' + otherKeys.length + '件';
      }
      html += '</div>';
    }
    
    // 3. LocalStorageの旧画像データ残存チェック
    var lsLogo = localStorage.getItem('reform_app_logo');
    var lsStamp = localStorage.getItem('reform_app_stamp');
    var lsStampOrig = localStorage.getItem('reform_app_stamp_original');
    
    // レシート履歴のimageData残存チェック
    var lsHistRaw = localStorage.getItem('reform_app_receipt_history');
    var oldImageCount = 0;
    var newRefCount = 0;
    if (lsHistRaw) {
      var histories = JSON.parse(lsHistRaw);
      for (var i = 0; i < histories.length; i++) {
        if (histories[i].imageData) oldImageCount++;
        if (histories[i].imageRef) newRefCount++;
      }
    }
    
    var hasLegacy = lsLogo || lsStamp || lsStampOrig || oldImageCount > 0;
    
    if (hasLegacy) {
      html += '<div style="margin: 6px 0; padding: 8px; background: #fef3c7; border-radius: 6px; font-size: 11px; line-height: 1.8; color: #92400e;">';
      html += '  ⚠️ LocalStorageに残っている旧画像データ:<br>';
      if (lsLogo) html += '  ・ロゴ (' + Math.round(lsLogo.length / 1024) + 'KB)<br>';
      if (lsStamp) html += '  ・印鑑 (' + Math.round(lsStamp.length / 1024) + 'KB)<br>';
      if (lsStampOrig) html += '  ・印鑑原本 (' + Math.round(lsStampOrig.length / 1024) + 'KB)<br>';
      if (oldImageCount > 0) html += '  ・レシート画像(旧形式): ' + oldImageCount + '件<br>';
      html += '</div>';
    } else {
      html += '<div style="margin: 6px 0; padding: 8px; background: #f0fdf4; border-radius: 6px; font-size: 11px; color: #166534;">';
      html += '  ✅ LocalStorageに旧画像データなし（移行完了！）';
      html += '</div>';
    }
    
    // 4. レシート履歴のimageRef対応状況
    if (lsHistRaw) {
      var totalHist = JSON.parse(lsHistRaw).length;
      html += '<div style="padding: 2px 0; font-size: 11px; color: #6b7280;">';
      html += '📋 レシート履歴: ' + totalHist + '件（うちIDB参照: ' + newRefCount + '件、旧形式: ' + oldImageCount + '件）';
      html += '</div>';
    }
    
    // 5. 移行フラグ
    var migFlag = localStorage.getItem('reform_app_idb_migration_v1');
    html += '<div style="padding: 2px 0; font-size: 11px; color: #6b7280;">🏷️ 移行フラグ: ' + (migFlag === 'done' ? '✅ 完了' : '⏳ 未完了') + '</div>';
    
    resultEl.innerHTML = '<div style="padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">' +
      '<div style="font-size: 13px; font-weight: bold; color: #0369a1; margin-bottom: 6px;">🔍 IndexedDB 診断結果</div>' +
      html + '</div>';
    
  } catch (e) {
    resultEl.innerHTML = '<div style="padding: 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; font-size: 12px; color: #dc2626;">❌ 診断エラー: ' + e.message + '</div>';
  }
}


// ==========================================
// レイアウト調整モーダル（v0.96）
// プレビュー付きでロゴ・印鑑のサイズ＆位置を調整
// ==========================================

/**
 * プレビュー付きレイアウト調整モーダルを開く
 */
async function openLayoutAdjuster() {
  // 既存モーダルがあれば削除
  var existing = document.getElementById('layoutAdjusterModal');
  if (existing) existing.remove();

  // 現在の設定値を取得
  var logoW = parseInt(document.getElementById('logoWidth').value) || 35;
  var logoOX = parseInt(document.getElementById('logoOffsetX').value) || 0;
  var logoOY = parseInt(document.getElementById('logoOffsetY').value) || 0;
  var stSize = parseInt(document.getElementById('stampSize').value) || 22;
  var stOX = parseInt(document.getElementById('stampOffsetX').value) || 0;
  var stOY = parseInt(document.getElementById('stampOffsetY').value) || -5;

  // IDBからロゴ・印鑑を取得
  var logoData = null;
  var stampData = null;
  try {
    logoData = await getLogoFromIDB();
    stampData = await getStampFromIDB();
  } catch(e) {}

  // 設定から会社情報を取得
  var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  var companyName = settings.companyName || '株式会社サンプル';
  var postalCode = settings.postalCode || '000-0000';
  var address = settings.address || '東京都千代田区1-1-1';
  var phone = settings.phone || '03-0000-0000';

  // モーダルHTMLを構築
  var modal = document.createElement('div');
  modal.id = 'layoutAdjusterModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;flex-direction:column;';

  modal.innerHTML = `
    <div style="background:white;flex:1;display:flex;flex-direction:column;overflow:hidden;">
      <!-- ヘッダー -->
      <div style="padding:10px 16px;background:linear-gradient(135deg,#0ea5e9,#8b5cf6);color:white;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <span style="font-size:15px;font-weight:bold;">📐 レイアウト調整</span>
        <button onclick="closeLayoutAdjuster()" style="background:rgba(255,255,255,0.2);border:none;color:white;font-size:18px;width:36px;height:36px;border-radius:50%;cursor:pointer;">✕</button>
      </div>
      
      <!-- プレビューエリア（上半分） -->
      <div style="flex:1;overflow:auto;background:#e2e8f0;padding:8px;min-height:0;">
        <div id="layoutPreview" style="background:white;margin:0 auto;padding:5mm 6mm;box-shadow:0 2px 8px rgba(0,0,0,0.15);border-radius:2px;width:100%;max-width:380px;font-family:'Hiragino Kaku Gothic Pro',sans-serif;font-size:8px;line-height:1.4;position:relative;">
          <!-- ヘッダー部（タイトル＋会社情報） -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3mm;padding-bottom:2mm;border-bottom:2px solid #2c5282;">
            <div style="flex:1;">
              <div style="font-size:16px;font-weight:bold;letter-spacing:4px;color:#1a365d;margin-bottom:1mm;">御 見 積 書</div>
              <div style="width:100%;height:2px;background:linear-gradient(to right,#2c5282,#4299e1,transparent);"></div>
            </div>
            <div id="previewCompanyBlock" style="text-align:right;font-size:7px;line-height:1.6;position:relative;min-width:45%;">
              ${logoData ? '<img id="previewLogo" src="' + logoData + '" style="max-width:' + logoW*0.5 + 'mm;display:block;margin-left:auto;margin-bottom:1mm;position:relative;">' : '<div id="previewLogo" style="display:none;"></div>'}
              <div style="font-size:9px;font-weight:bold;margin-bottom:0.5mm;">${escapeHtml(companyName)}</div>
              <div>〒${escapeHtml(postalCode)} ${escapeHtml(address)}</div>
              <div>TEL: ${escapeHtml(phone)}</div>
              ${stampData ? '<img id="previewStamp" src="' + stampData + '" style="position:absolute;bottom:' + (-stOY*0.5) + 'mm;right:' + (-stOX*0.5) + 'mm;width:' + stSize*0.5 + 'mm;height:' + stSize*0.5 + 'mm;opacity:0.85;">' : '<div id="previewStamp" style="display:none;"></div>'}
            </div>
          </div>
          <!-- 宛先 -->
          <div style="display:flex;justify-content:space-between;margin-bottom:2mm;">
            <div>
              <div style="font-size:11px;font-weight:bold;padding-bottom:1mm;border-bottom:1px solid #1a1a1a;display:inline-block;margin-bottom:1mm;">サンプル工務店 様</div>
              <div style="font-size:8px;margin-top:1mm;">件名: 設備改修工事</div>
            </div>
            <div style="text-align:right;font-size:7px;line-height:1.8;">
              <div>見積番号: EST-20260206-001</div>
              <div>見積日: 2026年02月06日</div>
            </div>
          </div>
          <!-- 合計金額枠 -->
          <div style="border:2px solid #2c5282;padding:1.5mm 3mm;margin-bottom:2mm;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:9px;font-weight:bold;color:#2c5282;">合計金額（税込）</span>
            <span style="font-size:14px;font-weight:bold;color:#2c5282;">¥1,234,567</span>
          </div>
          <!-- 明細テーブル（簡易） -->
          <table style="width:100%;border-collapse:collapse;font-size:7px;margin-bottom:2mm;">
            <thead><tr style="background:#2c5282;color:white;">
              <th style="padding:1mm;width:6mm;border:0.5px solid #ccc;">No</th>
              <th style="padding:1mm;border:0.5px solid #ccc;">品名</th>
              <th style="padding:1mm;width:8mm;border:0.5px solid #ccc;">数量</th>
              <th style="padding:1mm;width:14mm;border:0.5px solid #ccc;">単価</th>
              <th style="padding:1mm;width:14mm;border:0.5px solid #ccc;">金額</th>
            </tr></thead>
            <tbody>
              <tr><td style="text-align:center;padding:1mm;border:0.5px solid #e2e8f0;">1</td><td style="padding:1mm;border:0.5px solid #e2e8f0;">配管部材 一式</td><td style="text-align:center;padding:1mm;border:0.5px solid #e2e8f0;">1</td><td style="text-align:right;padding:1mm;border:0.5px solid #e2e8f0;">¥500,000</td><td style="text-align:right;padding:1mm;border:0.5px solid #e2e8f0;">¥500,000</td></tr>
              <tr style="background:#f7fafc;"><td style="text-align:center;padding:1mm;border:0.5px solid #e2e8f0;">2</td><td style="padding:1mm;border:0.5px solid #e2e8f0;">施工費</td><td style="text-align:center;padding:1mm;border:0.5px solid #e2e8f0;">3日</td><td style="text-align:right;padding:1mm;border:0.5px solid #e2e8f0;">¥200,000</td><td style="text-align:right;padding:1mm;border:0.5px solid #e2e8f0;">¥600,000</td></tr>
              <tr><td style="text-align:center;padding:1mm;border:0.5px solid #e2e8f0;">3</td><td style="padding:1mm;border:0.5px solid #e2e8f0;">諸経費</td><td style="text-align:center;padding:1mm;border:0.5px solid #e2e8f0;">1</td><td style="text-align:right;padding:1mm;border:0.5px solid #e2e8f0;">¥22,300</td><td style="text-align:right;padding:1mm;border:0.5px solid #e2e8f0;">¥22,300</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- 調整コントロール（下半分・スクロール可能） -->
      <div style="flex-shrink:0;max-height:50%;overflow-y:auto;padding:12px 16px;background:#f8fafc;border-top:2px solid #e2e8f0;">
        
        <!-- ロゴ調整 -->
        <div style="margin-bottom:12px;padding:10px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;">
          <div style="font-size:12px;font-weight:bold;color:#0369a1;margin-bottom:8px;">🖼️ ロゴ調整</div>
          <div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;"><span>サイズ（幅）</span><span id="adjLogoWidthValue">${logoW}mm</span></div>
            <input type="range" id="adjLogoWidth" min="10" max="70" value="${logoW}" style="width:100%;" oninput="updateLayoutPreview()">
          </div>
          <div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;"><span>上下 ↕</span><span id="adjLogoOffsetYValue">${logoOY}mm</span></div>
            <input type="range" id="adjLogoOffsetY" min="-10" max="15" value="${logoOY}" style="width:100%;" oninput="updateLayoutPreview()">
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;"><span>左右 ↔</span><span id="adjLogoOffsetXValue">${logoOX}mm</span></div>
            <input type="range" id="adjLogoOffsetX" min="-20" max="20" value="${logoOX}" style="width:100%;" oninput="updateLayoutPreview()">
          </div>
        </div>
        
        <!-- 印鑑調整 -->
        <div style="margin-bottom:12px;padding:10px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
          <div style="font-size:12px;font-weight:bold;color:#166534;margin-bottom:8px;">🔏 印鑑調整</div>
          <div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;"><span>サイズ</span><span id="adjStampSizeValue">${stSize}mm</span></div>
            <input type="range" id="adjStampSize" min="8" max="40" value="${stSize}" style="width:100%;" oninput="updateLayoutPreview()">
          </div>
          <div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;"><span>上下 ↕</span><span id="adjStampOffsetYValue">${stOY}mm</span></div>
            <input type="range" id="adjStampOffsetY" min="-20" max="10" value="${stOY}" style="width:100%;" oninput="updateLayoutPreview()">
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;"><span>左右 ↔</span><span id="adjStampOffsetXValue">${stOX}mm</span></div>
            <input type="range" id="adjStampOffsetX" min="-30" max="10" value="${stOX}" style="width:100%;" oninput="updateLayoutPreview()">
          </div>
        </div>
        
        <!-- 保存ボタン -->
        <div style="display:flex;gap:8px;">
          <button onclick="saveLayoutAdjustment()" style="flex:1;padding:12px;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:14px;font-weight:bold;cursor:pointer;">✅ この設定で保存</button>
          <button onclick="closeLayoutAdjuster()" style="padding:12px 16px;background:#e5e7eb;color:#374151;border:none;border-radius:8px;font-size:14px;cursor:pointer;">キャンセル</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

/**
 * プレビューをリアルタイム更新
 */
function updateLayoutPreview() {
  // スライダー値を読み取り
  var logoW = parseInt(document.getElementById('adjLogoWidth').value);
  var logoOX = parseInt(document.getElementById('adjLogoOffsetX').value);
  var logoOY = parseInt(document.getElementById('adjLogoOffsetY').value);
  var stSize = parseInt(document.getElementById('adjStampSize').value);
  var stOX = parseInt(document.getElementById('adjStampOffsetX').value);
  var stOY = parseInt(document.getElementById('adjStampOffsetY').value);

  // 値表示を更新
  document.getElementById('adjLogoWidthValue').textContent = logoW + 'mm';
  document.getElementById('adjLogoOffsetXValue').textContent = logoOX + 'mm';
  document.getElementById('adjLogoOffsetYValue').textContent = logoOY + 'mm';
  document.getElementById('adjStampSizeValue').textContent = stSize + 'mm';
  document.getElementById('adjStampOffsetXValue').textContent = stOX + 'mm';
  document.getElementById('adjStampOffsetYValue').textContent = stOY + 'mm';

  // プレビューのロゴを更新（縮小率0.5）
  var logoEl = document.getElementById('previewLogo');
  if (logoEl && logoEl.tagName === 'IMG') {
    logoEl.style.maxWidth = (logoW * 0.5) + 'mm';
    logoEl.style.top = (logoOY * 0.5) + 'mm';
    logoEl.style.right = (-logoOX * 0.5) + 'mm';
  }

  // プレビューの印鑑を更新（縮小率0.5）
  var stampEl = document.getElementById('previewStamp');
  if (stampEl && stampEl.tagName === 'IMG') {
    stampEl.style.width = (stSize * 0.5) + 'mm';
    stampEl.style.height = (stSize * 0.5) + 'mm';
    stampEl.style.bottom = (-stOY * 0.5) + 'mm';
    stampEl.style.right = (-stOX * 0.5) + 'mm';
  }
}

/**
 * 調整値を保存してモーダルを閉じる
 */
function saveLayoutAdjustment() {
  // モーダル内のスライダー値を設定画面のhidden inputに転送
  document.getElementById('logoWidth').value = document.getElementById('adjLogoWidth').value;
  document.getElementById('logoOffsetX').value = document.getElementById('adjLogoOffsetX').value;
  document.getElementById('logoOffsetY').value = document.getElementById('adjLogoOffsetY').value;
  document.getElementById('stampSize').value = document.getElementById('adjStampSize').value;
  document.getElementById('stampOffsetX').value = document.getElementById('adjStampOffsetX').value;
  document.getElementById('stampOffsetY').value = document.getElementById('adjStampOffsetY').value;

  // 設定を保存
  saveSettings();
  closeLayoutAdjuster();
  
  alert('✅ ロゴ＆印鑑の配置を保存しました！\n見積書・請求書に反映されます。');
}

/**
 * レイアウト調整モーダルを閉じる
 */
function closeLayoutAdjuster() {
  var modal = document.getElementById('layoutAdjusterModal');
  if (modal) modal.remove();
}
