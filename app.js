// ==========================================
// Reform App Pro - コア機能
// v0.93 - 非同期読み込み順序修正 + スプラッシュ修正
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
  if (screenId === 'receipt') {
    initReceiptScreen();
  }
  if (screenId === 'tax') {
    const savedTaxType = localStorage.getItem('reform_app_tax_type') || 'blue';
    selectTaxType(savedTaxType);
    updateTaxSummary();
  }
  if (screenId === 'customers') {
    if (typeof loadCustomers === 'function') {
      loadCustomers();
    }
  }
  if (screenId === 'settings') {
    if (typeof updateApiUsageDisplay === 'function') {
      updateApiUsageDisplay();
    }
  }
}

// ==========================================
// スプラッシュ画面シーケンス
// ==========================================
function scheduleSplashSequence() {
  // 1段階目: COCOMI CORE（4秒表示）
  setTimeout(() => {
    const cocomiSplash = document.getElementById('cocomi-splash');
    const perafcaSplash = document.getElementById('perafca-splash');
    const appSplash = document.getElementById('splash-screen');
    
    if (cocomiSplash) {
      cocomiSplash.classList.add('fade-out');
      
      setTimeout(() => {
        cocomiSplash.style.display = 'none';
        
        if (perafcaSplash) {
          // 2段階目: PERAFCAスプラッシュ
          perafcaSplash.classList.add('active');
          setTimeout(() => {
            perafcaSplash.classList.add('fade-out');
            setTimeout(() => {
              perafcaSplash.style.display = 'none';
              showAppSplashThenHome(appSplash);
            }, 800);
          }, 3500);
        } else {
          // ★ perafcaSplashがない場合 → 直接アプリスプラッシュへ
          showAppSplashThenHome(appSplash);
        }
      }, 800);
    }
  }, 4000);
}

function showAppSplashThenHome(appSplash) {
  if (appSplash) {
    // 3段階目（または2段階目）: アプリスプラッシュ
    appSplash.classList.add('active');
    setTimeout(() => {
      appSplash.classList.add('fade-out');
      setTimeout(() => {
        appSplash.style.display = 'none';
        showHomeScreen();
      }, 500);
    }, 3500);
  } else {
    // スプラッシュがない場合は直接ホーム
    showHomeScreen();
  }
}

function showHomeScreen() {
  const homeScreen = document.getElementById('home-screen');
  if (homeScreen) {
    homeScreen.classList.add('active');
  }
  // パスワードチェック
  if (typeof checkPasswordOnLoad === 'function') {
    checkPasswordOnLoad();
  }
}

// ==========================================
// 初期化
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // ★★★ スプラッシュ処理を最初に登録 ★★★
  // awaitの前に置くことで、画面読み込みの影響を受けない
  scheduleSplashSequence();

  // ★★★ 画面HTMLを全て読み込む（完了を待つ） ★★★
  try {
    await loadAllScreens();
    console.log('✓ 全画面の読み込み完了');
  } catch(e) {
    console.error('画面読み込みエラー:', e);
  }

  // 画面読み込み完了後に各種初期化
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
