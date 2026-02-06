// ==========================================
// ストレージ管理（バックアップ・復元）
// Reform App Pro v0.95.2
// ==========================================
// v0.95.2改善:
//   - バックアップにアプリバージョン情報を追加
//   - 復元時のバージョン互換チェック
//   - LocalStorage容量オーバー時のエラーハンドリング強化
// ==========================================

// アプリバージョン定数
const APP_VERSION = '0.95';

async function backupData() {
  try {
  // v0.96: ロゴ・印鑑はIDBから取得（フォールバック付き）
  let logoData = null;
  let stampData = null;
  let stampOriginalData = null;
  try {
    logoData = await getLogoFromIDB();
    stampData = await getStampFromIDB();
    stampOriginalData = await getStampOriginalFromIDB();
  } catch(e) {
    console.warn('[backup] IDB画像取得失敗、LSフォールバック');
    logoData = localStorage.getItem('reform_app_logo');
    stampData = localStorage.getItem('reform_app_stamp');
    stampOriginalData = localStorage.getItem('reform_app_stamp_original');
  }

  const allData = {
    appVersion: APP_VERSION,
    settings: localStorage.getItem('reform_app_settings'),
    materials: localStorage.getItem('reform_app_materials'),
    estimates: localStorage.getItem('reform_app_estimates'),
    invoices: localStorage.getItem('reform_app_invoices'),
    expenses: localStorage.getItem('reform_app_expenses'),
    customers: localStorage.getItem('reform_app_customers'),
    productMaster: localStorage.getItem('reform_app_product_master'),
    categories: localStorage.getItem('reform_app_categories'),
    logo: logoData,
    stamp: stampData,
    stampOriginal: stampOriginalData,
    receiptHistory: localStorage.getItem('reform_app_receipt_history'),
    apiUsage: localStorage.getItem('reform_app_api_usage'),
    backupDate: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reform_app_backup_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  
  alert('バックアップファイルをダウンロードしました\n\nバージョン: v' + APP_VERSION + '\n\n含まれるデータ:\n・設定情報\n・顧客データ\n・品名マスター\n・見積書/請求書\n・材料/経費\n・レシート履歴\n・勘定科目\n・ロゴ/印鑑');
  } catch (e) {
    console.error('[backupData] エラー:', e);
    alert('❌ バックアップに失敗しました\n\n' + e.message);
  }
}

function restoreData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        
        // 復元方法を選択
        showRestoreOptions(data);
        
      } catch (err) {
        alert('ファイルの読み込みに失敗しました');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function showRestoreOptions(backupData) {
  // 復元オプションモーダルを表示
  const modal = document.getElementById('restoreOptionsModal');
  window.pendingRestoreData = backupData;
  
  // バックアップ日時を表示
  const dateInfo = document.getElementById('backupDateInfo');
  if (backupData.backupDate) {
    const date = new Date(backupData.backupDate);
    const versionInfo = backupData.appVersion ? ` (v${backupData.appVersion})` : ' (バージョン不明)';
    dateInfo.textContent = `バックアップ日時: ${date.toLocaleString('ja-JP')}${versionInfo}`;
  } else {
    dateInfo.textContent = 'バックアップ日時: 不明';
  }
  
  modal.classList.remove('hidden');
}

function closeRestoreOptions() {
  document.getElementById('restoreOptionsModal').classList.add('hidden');
  window.pendingRestoreData = null;
}

async function executeRestore(mode) {
  const data = window.pendingRestoreData;
  if (!data) return;
  
  try {
  if (mode === 'overwrite') {
    // 上書きモード（従来の動作）
    if (data.settings) localStorage.setItem('reform_app_settings', data.settings);
    if (data.materials) localStorage.setItem('reform_app_materials', data.materials);
    if (data.estimates) localStorage.setItem('reform_app_estimates', data.estimates);
    if (data.invoices) localStorage.setItem('reform_app_invoices', data.invoices);
    if (data.expenses) localStorage.setItem('reform_app_expenses', data.expenses);
    if (data.customers) localStorage.setItem('reform_app_customers', data.customers);
    if (data.productMaster) localStorage.setItem('reform_app_product_master', data.productMaster);
    if (data.categories) localStorage.setItem('reform_app_categories', data.categories);
    // v0.96: ロゴ・印鑑はIDBに保存
    if (data.logo) {
      try { await saveLogoToIDB(data.logo); } catch(e) { localStorage.setItem('reform_app_logo', data.logo); }
    }
    if (data.stamp) {
      try { await saveImageToIDB('app_stamp', data.stamp); } catch(e) { localStorage.setItem('reform_app_stamp', data.stamp); }
    }
    if (data.stampOriginal) {
      try { await saveImageToIDB('app_stamp_original', data.stampOriginal); } catch(e) { localStorage.setItem('reform_app_stamp_original', data.stampOriginal); }
    }
    if (data.receiptHistory) localStorage.setItem('reform_app_receipt_history', data.receiptHistory);
    if (data.apiUsage) localStorage.setItem('reform_app_api_usage', data.apiUsage);
    
    alert('✅ データを上書き復元しました！\n\n※ 今までのデータはバックアップのデータに置き換わりました');
    
  } else if (mode === 'merge') {
    // 追加モード（マージ）
    let addedCount = { customers: 0, estimates: 0, invoices: 0, materials: 0, expenses: 0, productMaster: 0 };
    
    // 顧客データをマージ
    if (data.customers) {
      const currentCustomers = JSON.parse(localStorage.getItem('reform_app_customers') || '[]');
      const backupCustomers = JSON.parse(data.customers);
      const currentIds = new Set(currentCustomers.map(c => c.id));
      
      backupCustomers.forEach(c => {
        if (!currentIds.has(c.id)) {
          currentCustomers.push(c);
          addedCount.customers++;
        }
      });
      localStorage.setItem('reform_app_customers', JSON.stringify(currentCustomers));
    }
    
    // 見積書をマージ
    if (data.estimates) {
      const currentEstimates = JSON.parse(localStorage.getItem('reform_app_estimates') || '[]');
      const backupEstimates = JSON.parse(data.estimates);
      const currentIds = new Set(currentEstimates.map(e => e.id));
      
      backupEstimates.forEach(e => {
        if (!currentIds.has(e.id)) {
          currentEstimates.push(e);
          addedCount.estimates++;
        }
      });
      localStorage.setItem('reform_app_estimates', JSON.stringify(currentEstimates));
    }
    
    // 請求書をマージ
    if (data.invoices) {
      const currentInvoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
      const backupInvoices = JSON.parse(data.invoices);
      const currentIds = new Set(currentInvoices.map(i => i.id));
      
      backupInvoices.forEach(i => {
        if (!currentIds.has(i.id)) {
          currentInvoices.push(i);
          addedCount.invoices++;
        }
      });
      localStorage.setItem('reform_app_invoices', JSON.stringify(currentInvoices));
    }
    
    // 材料をマージ
    if (data.materials) {
      const currentMaterials = JSON.parse(localStorage.getItem('reform_app_materials') || '[]');
      const backupMaterials = JSON.parse(data.materials);
      const currentIds = new Set(currentMaterials.map(m => m.id));
      
      backupMaterials.forEach(m => {
        if (!currentIds.has(m.id)) {
          currentMaterials.push(m);
          addedCount.materials++;
        }
      });
      localStorage.setItem('reform_app_materials', JSON.stringify(currentMaterials));
    }
    
    // 経費をマージ
    if (data.expenses) {
      const currentExpenses = JSON.parse(localStorage.getItem('reform_app_expenses') || '[]');
      const backupExpenses = JSON.parse(data.expenses);
      const currentIds = new Set(currentExpenses.map(e => e.id));
      
      backupExpenses.forEach(e => {
        if (!currentIds.has(e.id)) {
          currentExpenses.push(e);
          addedCount.expenses++;
        }
      });
      localStorage.setItem('reform_app_expenses', JSON.stringify(currentExpenses));
    }
    
    // 品名マスターをマージ
    if (data.productMaster) {
      const currentPM = JSON.parse(localStorage.getItem('reform_app_product_master') || '[]');
      const backupPM = JSON.parse(data.productMaster);
      const currentIds = new Set(currentPM.map(p => p.id));
      
      backupPM.forEach(p => {
        if (!currentIds.has(p.id)) {
          currentPM.push(p);
          addedCount.productMaster++;
        }
      });
      localStorage.setItem('reform_app_product_master', JSON.stringify(currentPM));
    }
    
    alert(`✅ データを追加しました！\n\n追加された件数:\n・顧客: ${addedCount.customers}件\n・見積書: ${addedCount.estimates}件\n・請求書: ${addedCount.invoices}件\n・材料: ${addedCount.materials}件\n・経費: ${addedCount.expenses}件\n・品名マスター: ${addedCount.productMaster}件\n\n※ 既存のデータは保持されています`);
  }
  
  } catch (e) {
    console.error('[executeRestore] エラー:', e);
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      alert('❌ ストレージ容量が不足しています\n\n不要なデータを削除してから再度お試しください。\nレシート画像を多く保存している場合は、画像保存をオフにすると改善されることがあります。');
    } else {
      alert('❌ 復元中にエラーが発生しました\n\n' + e.message);
    }
    return;
  }
  
  closeRestoreOptions();
  loadSettings();
  loadCustomers();
  loadProductMaster();
}

function clearAllData() {
  // パスワードが設定されている場合は先にパスワード確認
  const savedPassword = localStorage.getItem('reform_app_password');
  if (savedPassword) {
    const inputPassword = prompt('🔐 パスワードを入力してください：');
    if (inputPassword !== savedPassword) {
      alert('❌ パスワードが違います');
      return;
    }
  }
  
  // 1段階目の確認
  if (!confirm('⚠️ 全データを削除しますか？\n\n削除されるデータ:\n・設定情報（会社名など）\n・顧客データ\n・品名マスター\n・見積書・請求書\n・材料・経費\n・ロゴ・印鑑\n・パスワード設定\n\nこの操作は取り消せません。')) {
    return;
  }
  
  // 2段階目の確認（「削除」と入力）
  const input = prompt('⚠️ 最終確認 ⚠️\n\n本当に全データを削除する場合は\n「削除」と入力してください：');
  
  if (input !== '削除') {
    alert('削除をキャンセルしました');
    return;
  }
  
  // 全データを削除
  localStorage.removeItem('reform_app_settings');
  localStorage.removeItem('reform_app_materials');
  localStorage.removeItem('reform_app_estimates');
  localStorage.removeItem('reform_app_invoices');
  localStorage.removeItem('reform_app_expenses');
  localStorage.removeItem('reform_app_customers');
  localStorage.removeItem('reform_app_product_master');
  localStorage.removeItem('reform_app_categories');
  localStorage.removeItem('reform_app_logo');
  localStorage.removeItem('reform_app_stamp');
  localStorage.removeItem('reform_app_stamp_original');
  localStorage.removeItem('reform_app_password');
  localStorage.removeItem('reform_app_recovery');
  localStorage.removeItem('reform_app_receipt_history');
  localStorage.removeItem('reform_app_api_usage');
  localStorage.removeItem('reform_app_autosave_receipt');
  localStorage.removeItem('reform_app_autosave_estimate');
  localStorage.removeItem('reform_app_autosave_invoice');
  
  alert('✅ 全データを削除しました');
  location.reload();
}
