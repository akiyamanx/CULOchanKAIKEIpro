// ==========================================
// グローバル変数定義
// Reform App Pro v0.92
// ==========================================

// 確定申告
let taxType = 'blue'; // 'blue' or 'white'

// 品名マスター
let productMaster = [];

// レシート関連
let receiptItems = [];
let projects = [];  // v0.92追加: 現場割り当て用
let receiptImageData = null;
let multiImageDataUrls = [];

// ==========================================
// API使用量管理
// ==========================================
const API_LIMITS = {
  dailyLimit: 50,      // 1日の上限
  monthlyLimit: 1000   // 1ヶ月の上限
};

// API使用状況を取得
function getApiUsage() {
  const data = JSON.parse(localStorage.getItem('reform_app_api_usage') || '{}');
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.slice(0, 7); // YYYY-MM
  
  // 日付が変わったらリセット
  if (data.lastDate !== today) {
    data.dailyCount = 0;
    data.lastDate = today;
  }
  
  // 月が変わったらリセット
  if (data.lastMonth !== thisMonth) {
    data.monthlyCount = 0;
    data.lastMonth = thisMonth;
  }
  
  return {
    dailyCount: data.dailyCount || 0,
    monthlyCount: data.monthlyCount || 0,
    dailyLimit: API_LIMITS.dailyLimit,
    monthlyLimit: API_LIMITS.monthlyLimit,
    lastDate: data.lastDate || today,
    lastMonth: data.lastMonth || thisMonth
  };
}

// API使用回数を記録
function recordApiUsage() {
  const usage = getApiUsage();
  usage.dailyCount++;
  usage.monthlyCount++;
  
  localStorage.setItem('reform_app_api_usage', JSON.stringify({
    dailyCount: usage.dailyCount,
    monthlyCount: usage.monthlyCount,
    lastDate: usage.lastDate,
    lastMonth: usage.lastMonth
  }));
  
  return usage;
}

// API使用可能かチェック
function canUseApi() {
  const usage = getApiUsage();
  
  if (usage.dailyCount >= usage.dailyLimit) {
    return { 
      allowed: false, 
      reason: `本日のAPI使用上限（${usage.dailyLimit}回）に達しました。\n明日またお使いください。`
    };
  }
  
  if (usage.monthlyCount >= usage.monthlyLimit) {
    return { 
      allowed: false, 
      reason: `今月のAPI使用上限（${usage.monthlyLimit}回）に達しました。\n来月またお使いください。`
    };
  }
  
  return { allowed: true };
}

// API使用量をリセット（設定画面用）
function resetApiUsage() {
  if (confirm('API使用量カウントをリセットしますか？')) {
    localStorage.removeItem('reform_app_api_usage');
    alert('リセットしました');
    if (typeof updateApiUsageDisplay === 'function') {
      updateApiUsageDisplay();
    }
  }
}

// カテゴリ定義（レシート・経費用）
const categories = {
  material: [
    { value: 'pipes', label: '配管材' },
    { value: 'fittings', label: '継手' },
    { value: 'valves', label: 'バルブ' },
    { value: 'electrical', label: '電材' },
    { value: 'tools', label: '工具' },
    { value: 'consumables', label: '消耗品' },
    { value: 'equipment', label: '設備機器' },
    { value: 'building', label: '建材' },
    { value: 'other_material', label: 'その他材料' }
  ],
  expense: [
    { value: 'travel', label: '旅費交通費' },
    { value: 'communication', label: '通信費' },
    { value: 'utilities', label: '水道光熱費' },
    { value: 'entertainment', label: '接待交際費' },
    { value: 'supplies', label: '消耗品費' },
    { value: 'repair', label: '修繕費' },
    { value: 'insurance', label: '保険料' },
    { value: 'tax', label: '租税公課' },
    { value: 'depreciation', label: '減価償却費' },
    { value: 'welfare', label: '福利厚生費' },
    { value: 'advertising', label: '広告宣伝費' },
    { value: 'outsource', label: '外注費' },
    { value: 'rent', label: '地代家賃' },
    { value: 'other_expense', label: 'その他経費' }
  ]
};

// 顧客管理
let customers = [];
let customerPickerCallback = null;

// 品名マスター編集
let editingAliases = [];

// 見積書関連
let estimateMaterials = [];
let estimateWorks = [];
let workType = 'construction'; // 'construction' or 'daily'

// 材料ピッカー状態
let materialPickerState = {
  step: 1,
  selectedCategory: null,
  selectedSubCategory: null,
  selectedItem: null
};

// 保存済み材料選択
let selectedSavedMaterials = new Set();

// ネット商品読込
let netProductImageData = null;
let netProductImageDataUrls = [];

// 請求書関連
let invoiceMaterials = [];
let invoiceWorks = [];
let invWorkType = 'construction';

// 価格検索サイト
const searchSites = {
  monotaro: {
    name: 'モノタロウ',
    url: 'https://www.monotaro.com/s/?c=&q=',
    icon: '🔧'
  },
  amazon: {
    name: 'Amazon',
    url: 'https://www.amazon.co.jp/s?k=',
    icon: '📦'
  },
  askul: {
    name: 'アスクル',
    url: 'https://www.askul.co.jp/s/?searchWord=',
    icon: '🏢'
  },
  komeri: {
    name: 'コメリ',
    url: 'https://www.komeri.com/contents/search/search.aspx?searchword=',
    icon: '🏠'
  }
};

// 音声認識
let recognition = null;
let currentVoiceContext = null; // 'receipt', 'expense', etc.
let isListening = false;
let equalizerInterval = null;

// 経費カテゴリ
const expenseCategories = {
  income: {
    '売上': ['工事代金', '追加工事', 'その他売上'],
    '雑収入': ['材料売却', '紹介料', '還付金', 'その他収入']
  },
  expense: {
    '交通費': ['ガソリン代', '駐車場代', '高速道路代', '電車・バス代', 'その他交通費'],
    '車両費': ['車検代', '自動車保険', '車修理代', 'タイヤ交換', 'その他車両費'],
    '通信費': ['携帯電話代', 'インターネット代', 'その他通信費'],
    '光熱費': ['電気代', 'ガス代', '水道代', 'その他光熱費'],
    '消耗品費': ['工具', '作業着・安全靴', '文房具', 'その他消耗品'],
    '接待交際費': ['飲食代', 'お中元・お歳暮', '差し入れ', 'その他接待費'],
    '会議費': ['打ち合わせ飲食', '弁当代', 'その他会議費'],
    '外注費': ['電気工事外注', '水道工事外注', '大工工事外注', 'その他外注費'],
    '材料費': ['電気部材', '水道部材', '内装材', '木材', 'その他材料'],
    '雑費': ['振込手数料', '郵送代', '事務用品', 'その他雑費']
  }
};

// 経費入力
let currentExpenseType = 'expense'; // 'income' or 'expense'
let editingExpenseId = null;

// データ管理画面
let currentDataTab = 'estimates';

// 下書きレシート（通知用）
let pendingDraftReceipt = null;

// ==========================================
// ユーティリティ関数
// ==========================================

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
