// ==========================================
// 価格比較検索機能
// Reform App Pro v0.95
// ==========================================
// このファイルは価格比較検索画面の
// サイト別検索・音声入力・クリア機能を提供する
//
// v0.95新規作成:
//   - 全10サイトの検索URL定義
//   - 大手サイトは直接検索URL、小規模サイトはGoogle経由
//   - 音声入力対応（voice.jsのstartVoiceInput利用）
//   - 入力クリア機能
//
// 依存ファイル:
//   - voice.js (startVoiceInput)
// ==========================================


// ==========================================
// サイト別検索URL定義
// ==========================================

/**
 * 各サイトの検索URLを生成する
 * @param {string} siteKey - サイト識別キー
 * @param {string} keyword - 検索キーワード（URLエンコード済み）
 * @returns {string} 検索URL
 */
function getSiteSearchUrl(siteKey, keyword) {
  const q = encodeURIComponent(keyword);

  // v0.95: サイト別URL定義
  const siteUrls = {

    // ── プロ向け資材サイト ──

    // モノタロウ（直接検索）
    monotaro: `https://www.monotaro.com/s/?q=${q}`,

    // アウンワークス（Google経由 - 検索パス未公開のため）
    aunworks: `https://www.google.com/search?q=site:aunworks.jp+${q}`,

    // ビルディ（Google経由 - 確実に検索結果を表示するため）
    bildy: `https://www.google.com/search?q=site:bildy.jp+${q}`,

    // 施主の味方 総本山（Google経由）
    seshunomikata: `https://www.google.com/search?q=site:seshuno-mikata.com+${q}`,

    // ── ホームセンター ──

    // 電材ネット（Google経由）
    denzai: `https://www.google.com/search?q=site:denzai-net.jp+${q}`,

    // カインズ（直接検索）
    cainz: `https://www.cainz.com/search/?q=${q}`,

    // ビバホーム（Google経由）
    vivahome: `https://www.google.com/search?q=site:vivahome.co.jp+${q}`,

    // ── 総合通販 ──

    // Amazon.co.jp（直接検索）
    amazon: `https://www.amazon.co.jp/s?k=${q}`,

    // 楽天市場（直接検索）
    rakuten: `https://search.rakuten.co.jp/search/mall/${q}/`,

    // Yahoo!ショッピング（直接検索）
    yahoo: `https://shopping.yahoo.co.jp/search?p=${q}`
  };

  return siteUrls[siteKey] || null;
}


// ==========================================
// サイト検索実行
// ==========================================

/**
 * 指定サイトで商品を検索（新しいタブで開く）
 * pricesearch.htmlのボタンから呼ばれる
 * @param {string} siteKey - サイト識別キー
 */
function searchOnSite(siteKey) {
  const input = document.getElementById('priceSearchKeyword');
  if (!input) return;

  const keyword = input.value.trim();
  if (!keyword) {
    alert('商品名を入力してください');
    input.focus();
    return;
  }

  const url = getSiteSearchUrl(siteKey, keyword);
  if (!url) {
    alert('このサイトの検索URLが未設定です');
    return;
  }

  // 新しいタブで開く
  window.open(url, '_blank');
}


// ==========================================
// 検索キーワードクリア
// ==========================================

/**
 * 検索キーワード入力欄をクリア
 */
function clearPriceSearch() {
  const input = document.getElementById('priceSearchKeyword');
  if (input) {
    input.value = '';
    input.focus();
  }
}


// ==========================================
// 音声入力で検索キーワードを入力
// ==========================================

/**
 * 音声入力で検索キーワードを入力する
 * voice.jsのstartVoiceInputを利用
 */
function startVoiceSearch() {
  if (typeof startVoiceInput === 'function') {
    startVoiceInput('priceSearchKeyword');
  } else {
    alert('音声入力機能が読み込まれていません');
  }
}


// ==========================================
// グローバル公開
// ==========================================
window.searchOnSite = searchOnSite;
window.clearPriceSearch = clearPriceSearch;
window.startVoiceSearch = startVoiceSearch;
