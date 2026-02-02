/**
 * screen-loader.js
 * 分割された画面HTMLを動的に読み込むモジュール
 * 
 * COCOMI CORE - リフォーム見積・会計アプリ
 * 
 * 使い方:
 *   アプリ起動時に loadAllScreens() を呼び出すと
 *   screens/ フォルダ内のHTMLファイルがすべて読み込まれます
 */

// 画面ファイルの定義
const SCREEN_FILES = [
  'home',
  'pricesearch', 
  'help',
  'tax',
  'settings',
  'receipt',
  'estimate',
  'invoice',
  'customers',
  'materials',
  'expenses',
  'data'
];

// 読み込み済みフラグ
let screensLoaded = false;

/**
 * すべての画面を読み込む
 * @returns {Promise<void>}
 */
async function loadAllScreens() {
  if (screensLoaded) {
    console.log('画面は既に読み込み済みです');
    return;
  }

  const container = document.getElementById('screen-container');
  if (!container) {
    console.error('screen-container が見つかりません');
    return;
  }

  console.log('画面の読み込みを開始します...');
  
  const loadPromises = SCREEN_FILES.map(async (screenName) => {
    try {
      const response = await fetch(`screens/${screenName}.html`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      return { screenName, html, success: true };
    } catch (error) {
      console.error(`${screenName}.html の読み込みに失敗:`, error);
      return { screenName, html: '', success: false };
    }
  });

  const results = await Promise.all(loadPromises);
  
  // 読み込んだHTMLをコンテナに追加
  let loadedCount = 0;
  results.forEach(({ screenName, html, success }) => {
    if (success && html) {
      container.insertAdjacentHTML('beforeend', html);
      loadedCount++;
      console.log(`✓ ${screenName} 画面を読み込みました`);
    }
  });

  screensLoaded = true;
  console.log(`画面の読み込み完了: ${loadedCount}/${SCREEN_FILES.length} 画面`);
}

/**
 * 特定の画面だけを読み込む（遅延読み込み用）
 * @param {string} screenName - 画面名（拡張子なし）
 * @returns {Promise<boolean>}
 */
async function loadScreen(screenName) {
  // 既に読み込み済みかチェック
  if (document.getElementById(`${screenName}-screen`)) {
    return true;
  }

  const container = document.getElementById('screen-container');
  if (!container) {
    console.error('screen-container が見つかりません');
    return false;
  }

  try {
    const response = await fetch(`screens/${screenName}.html`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    container.insertAdjacentHTML('beforeend', html);
    console.log(`✓ ${screenName} 画面を動的に読み込みました`);
    return true;
  } catch (error) {
    console.error(`${screenName}.html の読み込みに失敗:`, error);
    return false;
  }
}

/**
 * 画面読み込み状態をリセット（デバッグ用）
 */
function resetScreens() {
  const container = document.getElementById('screen-container');
  if (container) {
    container.innerHTML = '';
    screensLoaded = false;
    console.log('画面をリセットしました');
  }
}

// DOMContentLoaded で自動読み込み
document.addEventListener('DOMContentLoaded', () => {
  // 画面読み込みを開始
  loadAllScreens().then(() => {
    console.log('全画面の読み込みが完了しました');
    // 必要に応じてアプリの初期化処理をここで呼び出す
    // initApp() など
  });
});

// グローバルに公開
window.loadAllScreens = loadAllScreens;
window.loadScreen = loadScreen;
window.resetScreens = resetScreens;
