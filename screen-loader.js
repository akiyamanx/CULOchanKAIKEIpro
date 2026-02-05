/**
 * screen-loader.js
 * 分割された画面HTMLを動的に読み込むモジュール
 * 
 * COCOMI CORE - リフォーム見積・会計アプリ
 * v1.2 - パス修正: ルート直下のHTMLを読み込み
 * 
 * ★ v1.2変更点:
 *   - fetch先を screens/ → ルート直下に変更（GitHubリポジトリ構造に合わせる）
 *   - DOMContentLoaded自動実行を削除（app.jsから呼び出す）
 */

// 画面ファイルの定義
// v0.95追加: receipt-list（レシートリスト画面）
const SCREEN_FILES = [
  'home',
  'pricesearch', 
  'help',
  'tax',
  'settings',
  'receipt',
  'receipt-list',
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
      // ★ v1.2: ルート直下から読み込む（screens/ フォルダは存在しない）
      const response = await fetch(`${screenName}.html`);
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
  console.log(`✓ 全画面の読み込み完了: ${loadedCount}/${SCREEN_FILES.length} 画面`);
}

/**
 * 特定の画面だけを読み込む（遅延読み込み用）
 * @param {string} screenName - 画面名（拡張子なし）
 * @returns {Promise<boolean>}
 */
async function loadScreen(screenName) {
  if (document.getElementById(`${screenName}-screen`)) {
    return true;
  }

  const container = document.getElementById('screen-container');
  if (!container) {
    console.error('screen-container が見つかりません');
    return false;
  }

  try {
    // ★ v1.2: ルート直下から読み込む
    const response = await fetch(`${screenName}.html`);
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

// ★ DOMContentLoaded自動実行は削除
// ★ app.js の DOMContentLoaded で await loadAllScreens() を呼ぶ

// グローバルに公開
window.loadAllScreens = loadAllScreens;
window.loadScreen = loadScreen;
window.resetScreens = resetScreens;
