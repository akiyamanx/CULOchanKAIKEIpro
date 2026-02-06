// ==========================================
// ヘルプ画面 JavaScript
// Reform App Pro v0.95
// ==========================================
// screen-loader.jsで動的読み込みされるため
// scriptタグではなく別ファイルとして定義
//
// 機能:
//   - タブ切替（クイックスタート/機能説明/FAQ/API設定）
//   - 機能説明のアコーディオン開閉
//   - FAQのアコーディオン開閉
// ==========================================


// ==========================================
// タブ切替
// ==========================================

/**
 * ヘルプ画面のタブを切り替える
 * @param {string} tabName - タブ名（quickstart/features/faq/api）
 */
function switchHelpTab(tabName) {
  // 全タブコンテンツを非表示
  document.querySelectorAll('.help-tab-content').forEach(function(el) {
    el.style.display = 'none';
  });
  // 全タブボタンを非アクティブ
  document.querySelectorAll('.help-tab').forEach(function(btn) {
    btn.style.background = 'white';
    btn.style.color = '#374151';
    btn.style.borderColor = '#d1d5db';
    btn.classList.remove('active');
  });
  // 選択されたタブを表示
  var content = document.getElementById('helpTab-' + tabName);
  if (content) content.style.display = 'block';
  // 選択されたボタンをアクティブ
  var btn = document.querySelector('.help-tab[data-tab="' + tabName + '"]');
  if (btn) {
    btn.style.background = '#3b82f6';
    btn.style.color = 'white';
    btn.style.borderColor = '#3b82f6';
    btn.classList.add('active');
  }
  // ヘルプ画面内のスクロールをトップに
  var helpScreen = document.getElementById('help-screen');
  if (helpScreen) helpScreen.scrollTop = 0;
}


// ==========================================
// 機能説明のアコーディオン開閉
// ==========================================

/**
 * 機能説明セクションの開閉を切り替える
 * @param {HTMLElement} header - クリックされたヘッダー要素
 */
function toggleHelpSection(header) {
  var body = header.nextElementSibling;
  var icon = header.querySelector('.help-toggle-icon');
  if (!body) return;
  
  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (icon) icon.textContent = '▲';
  } else {
    body.style.display = 'none';
    if (icon) icon.textContent = '▼';
  }
}


// ==========================================
// FAQのアコーディオン開閉
// ==========================================

/**
 * FAQ項目の開閉を切り替える
 * @param {HTMLElement} questionEl - クリックされた質問要素
 */
function toggleFaq(questionEl) {
  var answer = questionEl.nextElementSibling;
  var toggle = questionEl.querySelector('.help-faq-toggle');
  if (!answer) return;
  
  if (answer.style.display === 'block') {
    answer.style.display = 'none';
    if (toggle) toggle.textContent = '＋';
  } else {
    answer.style.display = 'block';
    if (toggle) toggle.textContent = '−';
  }
}


// ==========================================
// グローバル公開
// ==========================================
window.switchHelpTab = switchHelpTab;
window.toggleHelpSection = toggleHelpSection;
window.toggleFaq = toggleFaq;
