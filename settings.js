// ==========================================
// 設定管理（ロゴ・印鑑・パスワード含む）
// Reform App Pro v0.91
// ==========================================

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
  const settings = {
    geminiApiKey: document.getElementById('geminiApiKey').value,
    useGeminiForVoice: document.getElementById('useGeminiForVoice').checked,
    template: document.querySelector('input[name="template"]:checked')?.value || 'simple',
    companyLogo: localStorage.getItem('reform_app_logo') || '',
    companyStamp: localStorage.getItem('reform_app_stamp') || '',
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
}

// ==========================================
// パスワード管理
// ==========================================
function checkPasswordOnLoad() { return; // パスワード無効化
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
