// ==========================================
// Reform App Pro - コア機能
// v0.94 - スプラッシュ修正 + async画面読み込み
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
  const targetScreen = document.getElementById(screenId + '-screen');
  if (targetScreen) {
    targetScreen.classList.add('active');
  } else {
    console.error(`画面が見つかりません: ${screenId}-screen`);
    return;
  }
  // 画面トップにスクロール
  window.scrollTo(0, 0);
  
  // バックボタン用に履歴を追加（ホーム以外）
  if (screenId !== 'home') {
    history.pushState({ screen: screenId }, '', '');
  }
  
  // 画面ごとの初期化
  if (screenId === 'materials') {
    if (typeof filterMaster === 'function') filterMaster();
  }
  if (screenId === 'estimate') {
    if (typeof initEstimateScreen === 'function') initEstimateScreen();
  }
  if (screenId === 'invoice') {
    if (typeof initInvoiceScreen === 'function') initInvoiceScreen();
  }
  if (screenId === 'expenses') {
    if (typeof initExpensesScreen === 'function') initExpensesScreen();
  }
  if (screenId === 'data') {
    if (typeof initDataScreen === 'function') initDataScreen();
  }
  if (screenId === 'receipt') {
    if (typeof initReceiptScreen === 'function') initReceiptScreen();
  }
  if (screenId === 'tax') {
    if (typeof selectTaxType === 'function') {
      const savedTaxType = localStorage.getItem('reform_app_tax_type') || 'blue';
      selectTaxType(savedTaxType);
    }
    if (typeof updateTaxSummary === 'function') updateTaxSummary();
  }
  if (screenId === 'customers') {
    if (typeof loadCustomers === 'function') loadCustomers();
  }
  if (screenId === 'settings') {
    if (typeof updateApiUsageDisplay === 'function') updateApiUsageDisplay();
  }
}

// ==========================================
// ホーム画面を表示する関数
// ==========================================
function showHomeScreen() {
  const homeScreen = document.getElementById('home-screen');
  if (homeScreen) {
    homeScreen.classList.add('active');
    console.log('✓ ホーム画面を表示しました');
  } else {
    console.error('home-screen が見つかりません - 画面がまだ読み込まれていない可能性があります');
  }
  // パスワードチェック
  if (typeof checkPasswordOnLoad === 'function') {
    checkPasswordOnLoad();
  }
}

// ==========================================
// スプラッシュシーケンス
// ★ perafca-splash が存在しなくても動作するように修正
// ==========================================
function scheduleSplashSequence() {
  // 1段階目: COCOMI CORE（4秒表示）
  setTimeout(() => {
    const cocomiSplash = document.getElementById('cocomi-splash');
    const perafcaSplash = document.getElementById('perafca-splash');
    const appSplash = document.getElementById('splash-screen');
    
    if (!cocomiSplash) {
      // COCOMI splashすらない場合は直接ホームへ
      showHomeScreen();
      return;
    }
    
    cocomiSplash.classList.add('fade-out');
    
    setTimeout(() => {
      cocomiSplash.style.display = 'none';
      
      if (perafcaSplash) {
        // ★ perafca-splash が存在する場合: 3段階スプラッシュ
        perafcaSplash.classList.add('active');
        
        setTimeout(() => {
          perafcaSplash.classList.add('fade-out');
          
          setTimeout(() => {
            perafcaSplash.style.display = 'none';
            showAppSplashThenHome(appSplash);
          }, 800);
        }, 2500);
        
      } else {
        // ★ perafca-splash が存在しない場合: 2段階スプラッシュ
        // COCOMI → アプリスプラッシュ → ホーム
        console.log('perafca-splash が存在しないため、アプリスプラッシュへスキップ');
        showAppSplashThenHome(appSplash);
      }
    }, 800);
  }, 4000);
}

// ==========================================
// アプリスプラッシュ → ホーム画面
// ==========================================
function showAppSplashThenHome(appSplash) {
  if (appSplash) {
    appSplash.classList.add('active');
    
    setTimeout(() => {
      appSplash.classList.add('fade-out');
      setTimeout(() => {
        appSplash.style.display = 'none';
        showHomeScreen();
      }, 500);
    }, 3500);
  } else {
    // アプリスプラッシュもない場合は直接ホームへ
    console.log('splash-screen が存在しないため、直接ホーム画面へ');
    showHomeScreen();
  }
}

// ==========================================
// 初期化
// ★ async/await で画面読み込み完了を待ってから初期化
// ★ スプラッシュは即座にスケジュール（awaitの影響を受けない）
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  
  // ★ スプラッシュタイマーを即座に開始（画面読み込みと並行）
  scheduleSplashSequence();
  
  // ★ 画面HTMLを読み込む（ルート直下のHTMLファイル）
  console.log('画面の読み込みを開始...');
  try {
    await loadAllScreens();
    console.log('✓ 全画面の読み込みが完了しました');
  } catch(e) {
    console.error('画面読み込みエラー:', e);
  }
  
  // ★ 画面読み込み完了後に各モジュールの初期化
  try {
    if (typeof loadSettings === 'function') loadSettings();
  } catch(e) { console.error('loadSettings error:', e); }
  
  try {
    if (typeof initReceiptScreen === 'function') initReceiptScreen();
  } catch(e) { console.error('initReceiptScreen error:', e); }
  
  try {
    if (typeof loadProductMaster === 'function') loadProductMaster();
  } catch(e) { console.error('loadProductMaster error:', e); }
  
  try {
    if (typeof loadCustomers === 'function') loadCustomers();
  } catch(e) { console.error('loadCustomers error:', e); }
  
  try {
    if (typeof updatePasswordUI === 'function') updatePasswordUI();
  } catch(e) { console.error('updatePasswordUI error:', e); }
  
  console.log('✓ アプリ初期化完了');
});

// ==========================================
// Androidバックボタン対応
// ==========================================
window.addEventListener('popstate', function(event) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  const homeScreen = document.getElementById('home-screen');
  if (homeScreen) {
    homeScreen.classList.add('active');
  }
  window.scrollTo(0, 0);
  history.pushState({ screen: 'home' }, '', '');
});

// 初期履歴を設定
history.replaceState({ screen: 'home' }, '', '');
