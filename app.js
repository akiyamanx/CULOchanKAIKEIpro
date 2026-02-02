// ==========================================
// Reform App Pro - コア機能
// v0.91
// ==========================================

// ==========================================
// 画面切り替え
// ==========================================
function showScreen(screenId) {
  // 全画面を非表示
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  // 指定画面を表示
  document.getElementById(screenId + '-screen').classList.add('active');
  // 画面トップにスクロール
  window.scrollTo(0, 0);
  
  // バックボタン用に履歴を追加（ホーム以外）
  if (screenId !== 'home') {
    history.pushState({ screen: screenId }, '', '');
  }
  
  // 画面ごとの初期化
  if (screenId === 'materials') {
    filterMaster();
  }
  if (screenId === 'estimate') {
    initEstimateScreen();
  }
  if (screenId === 'invoice') {
    initInvoiceScreen();
  }
  if (screenId === 'expenses') {
    initExpensesScreen();
  }
  if (screenId === 'data') {
    initDataScreen();
  }
  if (screenId === 'tax') {
    // 確定申告画面の初期化
    const savedTaxType = localStorage.getItem('reform_app_tax_type') || 'blue';
    selectTaxType(savedTaxType);
    updateTaxSummary();
  }
  if (screenId === 'customers') {
    // 顧客管理画面の初期化
    if (typeof loadCustomers === 'function') {
      loadCustomers();
    }
  }
  if (screenId === 'settings') {
    // 設定画面の初期化
    if (typeof updateApiUsageDisplay === 'function') {
      updateApiUsageDisplay();
    }
  }
}

// ==========================================
// 初期化
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 初期化処理（エラーがあってもスプラッシュは動くように）
  try {
    loadSettings();
  } catch(e) { console.error('loadSettings error:', e); }
  
  try {
    initReceiptScreen();
  } catch(e) { console.error('initReceiptScreen error:', e); }
  
  try {
    loadProductMaster();
  } catch(e) { console.error('loadProductMaster error:', e); }
  
  try {
    loadCustomers();
  } catch(e) { console.error('loadCustomers error:', e); }
  
  try {
    updatePasswordUI();
  } catch(e) { console.error('updatePasswordUI error:', e); }
  
  // 3段階スプラッシュ画面
  // 1段階目: COCOMI CORE（4秒）
  setTimeout(() => {
    const cocomiSplash = document.getElementById('cocomi-splash');
    const perafcaSplash = document.getElementById('perafca-splash');
    const appSplash = document.getElementById('splash-screen');
    
    if (cocomiSplash) {
      cocomiSplash.classList.add('fade-out');
      
      // 2段階目: PERAFCAスプラッシュを表示
      setTimeout(() => {
        cocomiSplash.style.display = 'none';
        if (perafcaSplash) {
          perafcaSplash.classList.add('active');
          
          // 2.5秒後にPERAFCAスプラッシュをフェードアウト
          setTimeout(() => {
            perafcaSplash.classList.add('fade-out');
            
            // 3段階目: アプリスプラッシュを表示
            setTimeout(() => {
              perafcaSplash.style.display = 'none';
              if (appSplash) {
                appSplash.classList.add('active');
                
                // 3.5秒後にアプリスプラッシュをフェードアウト
                setTimeout(() => {
                  appSplash.classList.add('fade-out');
                  setTimeout(() => {
                    appSplash.style.display = 'none';
                    // ホーム画面を表示
                    document.getElementById('home-screen').classList.add('active');
                    // スプラッシュ後にパスワードチェック
                    checkPasswordOnLoad();
                  }, 500);
                }, 3500);
              }
            }, 800);
          }, 3500);
        }
      }, 800);
    }
  }, 4000); // 4秒後にCOCOMI COREフェードアウト
});

// ==========================================
// Androidバックボタン対応
// ==========================================
window.addEventListener('popstate', function(event) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById('home-screen').classList.add('active');
  window.scrollTo(0, 0);
  history.pushState({ screen: 'home' }, '', '');
});

// 初期履歴を設定
history.replaceState({ screen: 'home' }, '', '');
