// ==========================================
// 見積書作成機能
// Reform App Pro v0.95
// ==========================================


// 見積書作成機能
// ==========================================
// estimateMaterials は globals.js で定義
// estimateWorks は globals.js で定義
// workType は globals.js で定義

function initEstimateScreen() {
  // 今日の日付をセット
  const today = new Date();
  document.getElementById('estDate').value = today.toISOString().split('T')[0];
  
  // 有効期限（設定から取得）
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const validDays = parseInt(settings.estimateValidDays) || 30;
  const validDate = new Date(today);
  validDate.setDate(validDate.getDate() + validDays);
  document.getElementById('estValidDate').value = validDate.toISOString().split('T')[0];
  
  // 税率を表示
  document.getElementById('estTaxRateDisplay').textContent = settings.taxRate || 10;
  
  // 初期データ
  if (estimateMaterials.length === 0) {
    addEstimateMaterial();
  }
  if (estimateWorks.length === 0) {
    addEstimateWork();
  }
  
  renderEstimateMaterials();
  renderEstimateWorks();
  calculateEstimateTotal();
}

// v0.94.1修正: タイプ切り替え時に作業データのvalue/unit/quantityをリセット
function setWorkType(type) {
  const prevType = workType;
  workType = type;
  document.getElementById('workTypeConstruction').classList.toggle('active', type === 'construction');
  document.getElementById('workTypeDaily').classList.toggle('active', type === 'daily');
  
  // タイプが変わった場合、既存の作業データを新しいタイプ用にリセット
  if (prevType !== type) {
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    const dailyRate = parseInt(settings.dailyRate) || 18000;
    estimateWorks = estimateWorks.map(w => ({
      id: w.id,
      name: w.name || '',
      value: type === 'daily' ? dailyRate : 0,
      unit: type === 'daily' ? '日' : '式',
      quantity: type === 'daily' ? 1 : (w.quantity || 1)
    }));
  }
  
  renderEstimateWorks();
}

function addEstimateMaterial(name = '', quantity = 1, costPrice = 0, profitRate = null) {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const defaultRate = profitRate !== null ? profitRate : (parseFloat(settings.defaultProfitRate) || 20);
  
  estimateMaterials.push({
    id: Date.now() + Math.random(),
    name: name,
    quantity: quantity,
    costPrice: costPrice,  // 仕入単価
    profitRate: defaultRate,  // 利益率
    sellingPrice: Math.ceil(costPrice * (1 + defaultRate / 100))  // 売値単価
  });
  renderEstimateMaterials();
}

function removeEstimateMaterial(id) {
  estimateMaterials = estimateMaterials.filter(m => m.id !== id);
  renderEstimateMaterials();
  calculateEstimateTotal();
}

function updateEstimateMaterial(id, field, value) {
  const item = estimateMaterials.find(m => m.id === id);
  if (item) {
    item[field] = value;
    
    // 仕入単価または利益率が変更されたら売値を再計算
    if (field === 'costPrice' || field === 'profitRate') {
      if (item.costPrice > 0) {
        // 仕入単価がある場合は、仕入単価から売値を計算
        item.sellingPrice = Math.ceil((item.costPrice || 0) * (1 + (item.profitRate || 0) / 100));
      } else if (item.sellingPrice > 0 && field === 'profitRate') {
        // 仕入単価が0で売値がある場合は、売値から仕入単価を逆算
        item.costPrice = Math.floor(item.sellingPrice / (1 + (item.profitRate || 0) / 100));
      }
    }
    
    // 売値単価が直接変更された場合
    if (field === 'sellingPrice') {
      // 売値が変更されたら、仕入単価と利益率から逆算はしない（そのまま）
    }
    
    renderEstimateMaterials();
    calculateEstimateTotal();
  }
}

function renderEstimateMaterials() {
  const container = document.getElementById('estMaterialsList');
  container.innerHTML = estimateMaterials.map((item, index) => {
    const sellingAmount = (item.quantity || 0) * (item.sellingPrice || 0);
    const costAmount = (item.quantity || 0) * (item.costPrice || 0);
    return `
      <div class="estimate-item">
        <div class="estimate-item-header">
          <span style="font-size: 12px; color: #6b7280;">材料 #${index + 1}</span>
          <div style="display: flex; gap: 6px;">
            <button onclick="showMaterialVoiceEdit(${item.id})" style="padding: 4px 8px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer;" title="音声で修正">🎤修正</button>
            <button class="receipt-item-delete" onclick="removeEstimateMaterial(${item.id})">削除</button>
          </div>
        </div>
        <div class="estimate-item-row" style="grid-template-columns: 2fr 1fr;">
          <div class="suggest-container">
            <input type="text" placeholder="品名" value="${escapeHtml(item.name)}" id="est-name-${item.id}"
              oninput="showEstimateSuggestions(this, ${item.id})"
              onfocus="showEstimateSuggestions(this, ${item.id})"
              onblur="setTimeout(() => hideEstimateSuggestions(${item.id}), 200)"
              onchange="if(!_suggestJustSelected) updateEstimateMaterial(${item.id}, 'name', this.value)">
            <div class="suggest-dropdown" id="est-suggest-${item.id}"></div>
          </div>
          <input type="number" placeholder="数量" value="${item.quantity}" min="1" id="est-qty-${item.id}"
            onchange="updateEstimateMaterial(${item.id}, 'quantity', parseInt(this.value) || 1)">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-top: 8px; align-items: center;">
          <div>
            <div style="font-size: 10px; color: #6b7280;">仕入単価</div>
            <input type="number" placeholder="仕入" value="${item.costPrice || ''}" style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; width: 100%;"
              onchange="updateEstimateMaterial(${item.id}, 'costPrice', parseInt(this.value) || 0)">
          </div>
          <div>
            <div style="font-size: 10px; color: #6b7280;">利益率</div>
            <div style="display: flex; align-items: center;">
              <input type="number" value="${item.profitRate || 0}" min="0" max="200" style="padding: 8px; border: 1px solid #fcd34d; border-radius: 6px; font-size: 14px; width: 60px; background: #fffbeb;"
                onchange="updateEstimateMaterial(${item.id}, 'profitRate', parseInt(this.value) || 0)">
              <span style="font-size: 12px; margin-left: 2px;">%</span>
            </div>
          </div>
          <div>
            <div style="font-size: 10px; color: #6b7280;">売値単価</div>
            <input type="number" placeholder="売値" value="${item.sellingPrice || ''}" id="est-price-${item.id}" style="padding: 8px; border: 1px solid #3b82f6; border-radius: 6px; font-size: 14px; width: 100%; background: #eff6ff; color: #3b82f6; font-weight: bold;"
              onchange="updateEstimateMaterial(${item.id}, 'sellingPrice', parseInt(this.value) || 0)">
          </div>
          <div>
            <div style="font-size: 10px; color: #6b7280;">金額</div>
            <div class="estimate-item-amount" style="padding: 8px;">¥${sellingAmount.toLocaleString()}</div>
          </div>
        </div>
        <!-- 音声修正用入力欄（非表示） -->
        <div id="voice-edit-${item.id}" style="display: none; margin-top: 8px; padding: 8px; background: linear-gradient(135deg, #001520, #002530); border: 1px solid #00d4ff; border-radius: 8px;">
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="voice-edit-input-${item.id}" placeholder="🎤 例：塩ビ管、3本、500円" style="flex: 1; padding: 8px; border: 1px solid #00d4ff; border-radius: 6px; font-size: 14px;">
            <button onclick="applyMaterialVoiceEdit(${item.id})" style="padding: 8px 12px; background: linear-gradient(135deg, #00d4ff, #0099cc); color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">適用</button>
            <button onclick="hideMaterialVoiceEdit(${item.id})" style="padding: 8px; background: rgba(239, 68, 68, 0.3); color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; font-size: 12px; cursor: pointer;">✕</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // 材料費小計（売値ベース）
  const sellingSubtotal = estimateMaterials.reduce((sum, m) => sum + (m.quantity || 0) * (m.sellingPrice || 0), 0);
  const costSubtotal = estimateMaterials.reduce((sum, m) => sum + (m.quantity || 0) * (m.costPrice || 0), 0);
  const profitSubtotal = sellingSubtotal - costSubtotal;
  
  document.getElementById('estMaterialSubtotal').textContent = '¥' + sellingSubtotal.toLocaleString();
  document.getElementById('estMaterialCost').textContent = '¥' + costSubtotal.toLocaleString();
  document.getElementById('estMaterialProfit').textContent = '¥' + profitSubtotal.toLocaleString();
}

// 材料音声修正欄を表示
function showMaterialVoiceEdit(itemId) {
  const editArea = document.getElementById(`voice-edit-${itemId}`);
  if (editArea) {
    editArea.style.display = 'block';
    const input = document.getElementById(`voice-edit-input-${itemId}`);
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

// 材料音声修正欄を非表示
function hideMaterialVoiceEdit(itemId) {
  const editArea = document.getElementById(`voice-edit-${itemId}`);
  if (editArea) {
    editArea.style.display = 'none';
  }
}

// 材料音声修正を適用（AI解析）
async function applyMaterialVoiceEdit(itemId) {
  const input = document.getElementById(`voice-edit-input-${itemId}`);
  if (!input || !input.value.trim()) {
    alert('修正内容を入力してください');
    return;
  }
  
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  if (!settings.geminiApiKey) {
    alert('この機能にはGemini APIキーが必要です。\n設定画面からAPIキーを入力してください。');
    return;
  }
  
  const transcript = input.value.trim();
  input.disabled = true;
  input.placeholder = '解析中...';
  
  try {
    const prompt = `以下の音声から材料情報を抽出してください。

音声: "${transcript}"

以下のJSON形式で返してください（説明不要）:
{
  "name": "品名",
  "quantity": 数量（数値）,
  "price": 単価（数値）
}

【例】
「塩ビ管、3本、500円」→ {"name": "塩ビ管", "quantity": 3, "price": 500}
「便器1個3万円」→ {"name": "便器", "quantity": 1, "price": 30000}
「エルボ5個200円」→ {"name": "エルボ", "quantity": 5, "price": 200}

言及されていない項目はnullにしてください。`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        // 該当の材料を更新
        const item = estimateMaterials.find(m => m.id === itemId);
        if (item) {
          if (result.name) item.name = result.name;
          if (result.quantity) item.quantity = result.quantity;
          if (result.price) item.sellingPrice = result.price;
          item.subtotal = (item.quantity || 1) * (item.sellingPrice || 0);
          
          renderEstimateMaterials();
          calculateEstimateTotal();
          
          alert(`✅ 更新しました！\n品名: ${result.name || '変更なし'}\n数量: ${result.quantity || '変更なし'}\n単価: ${result.price ? '¥' + result.price.toLocaleString() : '変更なし'}`);
        }
      }
    } else {
      throw new Error('API error');
    }
  } catch (e) {
    console.error('Material voice edit error:', e);
    alert('解析に失敗しました');
  } finally {
    input.disabled = false;
    input.placeholder = '🎤 例：塩ビ管、3本、500円';
    hideMaterialVoiceEdit(itemId);
  }
}

// 利益率一括適用
function applyBulkProfitRate() {
  const rate = parseInt(document.getElementById('estBulkProfitRate').value) || 0;
  
  estimateMaterials.forEach(item => {
    item.profitRate = rate;
    if (item.costPrice > 0) {
      item.sellingPrice = Math.ceil(item.costPrice * (1 + rate / 100));
    } else if (item.sellingPrice > 0) {
      item.costPrice = Math.floor(item.sellingPrice / (1 + rate / 100));
    }
  });
  
  renderEstimateMaterials();
  calculateEstimateTotal();
}

function showEstimateSuggestions(input, itemId) {
  const value = input.value.toLowerCase();
  const dropdown = document.getElementById(`est-suggest-${itemId}`);
  
  if (!value || value.length < 1) {
    dropdown.classList.remove('show');
    return;
  }
  
  const matches = productMaster.filter(p => 
    p.officialName.toLowerCase().includes(value) ||
    p.aliases.some(a => a.toLowerCase().includes(value))
  ).slice(0, 5);
  
  if (matches.length === 0) {
    dropdown.classList.remove('show');
    return;
  }
  
  dropdown.innerHTML = matches.map(p => `
    <div class="suggest-item" onclick="selectEstimateMaterial(${itemId}, '${escapeHtml(p.officialName)}', ${p.defaultPrice || 0})">
      <span class="suggest-item-price">${p.defaultPrice ? '¥' + p.defaultPrice.toLocaleString() : ''}</span>
      <div class="suggest-item-name">${p.officialName}</div>
      <div class="suggest-item-category">${getCategoryLabel(p.category)}</div>
    </div>
  `).join('');
  
  dropdown.classList.add('show');
}

function hideEstimateSuggestions(itemId) {
  const dropdown = document.getElementById(`est-suggest-${itemId}`);
  if (dropdown) dropdown.classList.remove('show');
}

// v0.97修正: フラグを立ててonchangeの上書きを防止
function selectEstimateMaterial(itemId, name, price) {
  _suggestJustSelected = true;
  const item = estimateMaterials.find(m => m.id === itemId);
  if (item) {
    item.name = name;
    if (price > 0) {
      item.costPrice = price;  // 仕入単価として設定
      item.sellingPrice = Math.ceil(price * (1 + (item.profitRate || 0) / 100));  // 売値を計算
    }
    renderEstimateMaterials();
    calculateEstimateTotal();
  }
  // 300ms後にフラグ解除（onchangeイベントが処理された後）
  setTimeout(() => { _suggestJustSelected = false; }, 300);
}

function addEstimateWork(name = '', value = 0, unit = '') {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  estimateWorks.push({
    id: Date.now() + Math.random(),
    name: name,
    value: value || (workType === 'daily' ? (parseInt(settings.dailyRate) || 18000) : 0),
    unit: unit || (workType === 'daily' ? '日' : '式'),
    quantity: 1
  });
  renderEstimateWorks();
  calculateEstimateTotal(); // v0.94.1追加: 作業費を合計に反映
}

function removeEstimateWork(id) {
  estimateWorks = estimateWorks.filter(w => w.id !== id);
  renderEstimateWorks();
  calculateEstimateTotal();
}

function updateEstimateWork(id, field, value) {
  const item = estimateWorks.find(w => w.id === id);
  if (item) {
    item[field] = value;
    renderEstimateWorks();
    calculateEstimateTotal();
  }
}

function renderEstimateWorks() {
  const container = document.getElementById('estWorksList');
  
  if (workType === 'construction') {
    container.innerHTML = estimateWorks.map((item, index) => {
      return `
        <div class="estimate-item">
          <div class="estimate-item-header">
            <span style="font-size: 12px; color: #6b7280;">作業 #${index + 1}</span>
            <button class="receipt-item-delete" onclick="removeEstimateWork(${item.id})">削除</button>
          </div>
          <div class="estimate-item-row work-row">
            <input type="text" placeholder="作業内容" value="${escapeHtml(item.name)}"
              onchange="updateEstimateWork(${item.id}, 'name', this.value)">
            <input type="text" placeholder="単位" value="${item.unit}" style="text-align: center;"
              onchange="updateEstimateWork(${item.id}, 'unit', this.value)">
            <input type="number" placeholder="金額" value="${item.value || ''}"
              onchange="updateEstimateWork(${item.id}, 'value', parseInt(this.value) || 0)">
          </div>
        </div>
      `;
    }).join('');
  } else {
    // 日当計算
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    const dailyRate = parseInt(settings.dailyRate) || 18000;
    
    container.innerHTML = estimateWorks.map((item, index) => {
      const amount = (item.quantity || 0) * (item.value || dailyRate);
      return `
        <div class="estimate-item">
          <div class="estimate-item-header">
            <span style="font-size: 12px; color: #6b7280;">作業員 #${index + 1}</span>
            <button class="receipt-item-delete" onclick="removeEstimateWork(${item.id})">削除</button>
          </div>
          <div class="estimate-item-row">
            <input type="text" placeholder="作業員名" value="${escapeHtml(item.name || '作業員')}"
              onchange="updateEstimateWork(${item.id}, 'name', this.value)">
            <input type="number" placeholder="日数" value="${item.quantity}" min="1"
              onchange="updateEstimateWork(${item.id}, 'quantity', parseInt(this.value) || 1)">
            <input type="number" placeholder="日当" value="${item.value || dailyRate}"
              onchange="updateEstimateWork(${item.id}, 'value', parseInt(this.value) || 0)">
            <div class="estimate-item-amount">¥${amount.toLocaleString()}</div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  // 作業費小計
  const subtotal = estimateWorks.reduce((sum, w) => {
    if (workType === 'construction') {
      return sum + (w.value || 0);
    } else {
      return sum + (w.quantity || 1) * (w.value || 0);
    }
  }, 0);
  document.getElementById('estWorkSubtotal').textContent = '¥' + subtotal.toLocaleString();
  calculateEstimateTotal(); // v0.94.1追加: 作業費変更時に合計も更新
}

function calculateEstimateTotal() {
  // 材料費小計（sellingPriceを使用）
  const materialSubtotal = estimateMaterials.reduce((sum, m) => sum + (m.quantity || 0) * (m.sellingPrice || m.price || 0), 0);
  
  // 作業費小計
  const workSubtotal = estimateWorks.reduce((sum, w) => {
    if (workType === 'construction') {
      return sum + (w.value || 0);
    } else {
      return sum + (w.quantity || 1) * (w.value || 0);
    }
  }, 0);
  
  const subtotal = materialSubtotal + workSubtotal;
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const taxRate = parseFloat(settings.taxRate) || 10;
  const tax = Math.floor(subtotal * taxRate / 100);
  const total = subtotal + tax;
  
  // 表示を更新
  document.getElementById('estSubtotalDisplay').textContent = '¥' + subtotal.toLocaleString();
  document.getElementById('estTaxDisplay').textContent = '¥' + tax.toLocaleString();
  document.getElementById('estTaxRateDisplay').textContent = taxRate;
  document.getElementById('estTotalDisplay').textContent = '¥' + total.toLocaleString();
}

// 材料選択モーダル
// 現在の選択状態
// materialPickerState は globals.js で定義

function showMaterialPicker() {
  document.getElementById('materialPickerSearch').value = '';
  materialPickerState = { step: 1, selectedCategory: null, selectedSubCategory: null, selectedItem: null };
  showMaterialCategory();
  document.getElementById('materialPickerModal').classList.remove('hidden');
}

function closeMaterialPicker() {
  document.getElementById('materialPickerModal').classList.add('hidden');
}

// カテゴリ一覧を表示
function showMaterialCategory() {
  materialPickerState = { category: null, subCategory: null };
  updateMaterialBreadcrumb();
  
  const container = document.getElementById('materialPickerList');
  const categories = [
    { id: 'pvc-pipe', name: '🔧 塩ビ管', desc: 'VP管・VU管・HI管' },
    { id: 'pvc-joint', name: '🔧 塩ビ継手', desc: 'エルボ・チーズ・ソケット等' },
    { id: 'poly-pipe', name: '🔧 架橋ポリ・ポリブデン管', desc: '給水給湯用' },
    { id: 'poly-joint', name: '🔧 架橋ポリ継手', desc: 'エルボ・チーズ等' },
    { id: 'aircon', name: '❄️ エアコン配管', desc: 'ペアコイル・銅管・ドレン' },
    { id: 'electric', name: '⚡ 電気部材', desc: 'VVFケーブル・同軸' },
    { id: 'support', name: '🔩 支持金具', desc: 'T足・サドルバンド・吊バンド' },
    { id: 'insulation', name: '🧴 保温材', desc: '保温チューブ・キャンバステープ' },
    { id: 'consumable', name: '🧹 消耗品', desc: 'コーキング・テープ・接着剤' },
  ];
  
  container.innerHTML = categories.map(cat => `
    <div class="material-category-item" onclick="showMaterialSubCategory('${cat.id}')" 
         style="padding: 14px; margin: 4px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: bold; font-size: 15px; color: #1e293b;">${cat.name}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${cat.desc}</div>
      </div>
      <div style="color: #94a3b8; font-size: 20px;">›</div>
    </div>
  `).join('');
}

// サブカテゴリ一覧を表示
function showMaterialSubCategory(categoryId) {
  materialPickerState.category = categoryId;
  materialPickerState.subCategory = null;
  updateMaterialBreadcrumb();
  
  const container = document.getElementById('materialPickerList');
  
  // このカテゴリの商品からサブカテゴリを抽出
  const subCategories = [...new Set(
    productMaster
      .filter(p => p.category === categoryId && p.subCategory)
      .map(p => p.subCategory)
  )];
  
  if (subCategories.length === 0) {
    // サブカテゴリがない場合は直接商品を表示
    showMaterialProducts(categoryId, null);
    return;
  }
  
  container.innerHTML = subCategories.map(sub => {
    const count = productMaster.filter(p => p.category === categoryId && p.subCategory === sub).length;
    return `
      <div class="material-subcategory-item" onclick="showMaterialProducts('${categoryId}', '${sub}')"
           style="padding: 12px 14px; margin: 4px 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 500; font-size: 14px; color: #334155;">${sub}</div>
          <div style="font-size: 11px; color: #94a3b8;">${count}件</div>
        </div>
        <div style="color: #94a3b8; font-size: 18px;">›</div>
      </div>
    `;
  }).join('');
}

// 商品一覧を表示
function showMaterialProducts(categoryId, subCategory) {
  materialPickerState.category = categoryId;
  materialPickerState.subCategory = subCategory;
  updateMaterialBreadcrumb();
  
  const container = document.getElementById('materialPickerList');
  
  let products = productMaster.filter(p => p.category === categoryId);
  if (subCategory) {
    products = products.filter(p => p.subCategory === subCategory);
  }
  
  if (products.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 20px;">商品がありません</div>';
    return;
  }
  
  container.innerHTML = products.map(p => `
    <div class="material-product-item" onclick="pickMaterial('${escapeHtml(p.officialName)}', ${p.defaultPrice || 0})"
         style="padding: 12px; margin: 3px 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer;">
      <div style="font-weight: 500; font-size: 14px; color: #1f2937;">${p.officialName}</div>
      <div style="display: flex; justify-content: space-between; margin-top: 4px;">
        <span style="font-size: 11px; color: #6b7280;">${p.size || ''}</span>
        <span style="font-size: 12px; color: #3b82f6; font-weight: bold;">
          ${p.defaultPrice ? '¥' + p.defaultPrice.toLocaleString() : '価格未設定'}
        </span>
      </div>
    </div>
  `).join('');
}

// パンくずナビを更新
function updateMaterialBreadcrumb() {
  const breadcrumb = document.getElementById('materialBreadcrumb');
  let html = '<span onclick="showMaterialCategory()" style="color: #3b82f6; cursor: pointer;">🏠 全カテゴリ</span>';
  
  if (materialPickerState.category) {
    const catName = productCategories[materialPickerState.category]?.name || materialPickerState.category;
    html += ' <span style="color: #9ca3af;">›</span> ';
    html += `<span onclick="showMaterialSubCategory('${materialPickerState.category}')" style="color: #3b82f6; cursor: pointer;">${catName}</span>`;
  }
  
  if (materialPickerState.subCategory) {
    html += ' <span style="color: #9ca3af;">›</span> ';
    html += `<span style="color: #1f2937;">${materialPickerState.subCategory}</span>`;
  }
  
  breadcrumb.innerHTML = html;
}

// 検索機能（全商品から検索）
function filterMaterialPicker() {
  const search = document.getElementById('materialPickerSearch').value.toLowerCase().trim();
  
  if (!search) {
    // 検索欄が空なら現在の階層を表示
    if (materialPickerState.subCategory) {
      showMaterialProducts(materialPickerState.category, materialPickerState.subCategory);
    } else if (materialPickerState.category) {
      showMaterialSubCategory(materialPickerState.category);
    } else {
      showMaterialCategory();
    }
    return;
  }
  
  // 検索時はパンくずを更新
  document.getElementById('materialBreadcrumb').innerHTML = 
    '<span onclick="showMaterialCategory()" style="color: #3b82f6; cursor: pointer;">🏠 全カテゴリ</span>' +
    ' <span style="color: #9ca3af;">›</span> <span style="color: #1f2937;">🔍 検索結果</span>';
  
  // 全商品から検索
  const filtered = productMaster.filter(p => 
    p.officialName.toLowerCase().includes(search) ||
    (p.subCategory && p.subCategory.toLowerCase().includes(search)) ||
    (p.aliases && p.aliases.some(a => a.toLowerCase().includes(search)))
  );
  
  const container = document.getElementById('materialPickerList');
  
  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 20px;">該当する商品がありません</div>';
    return;
  }
  
  // カテゴリ別にグループ化して表示
  const grouped = {};
  filtered.forEach(p => {
    const cat = p.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });
  
  let html = '';
  for (const [cat, products] of Object.entries(grouped)) {
    const catName = productCategories[cat]?.name || cat;
    html += `<div style="font-size: 12px; color: #6b7280; padding: 8px 4px 4px; font-weight: bold;">${catName}（${products.length}件）</div>`;
    html += products.slice(0, 20).map(p => `
      <div class="material-product-item" onclick="pickMaterial('${escapeHtml(p.officialName)}', ${p.defaultPrice || 0})"
           style="padding: 10px 12px; margin: 2px 0; background: white; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer;">
        <div style="font-size: 13px; color: #1f2937;">${p.officialName}</div>
        <div style="font-size: 11px; color: #3b82f6;">${p.defaultPrice ? '¥' + p.defaultPrice.toLocaleString() : '価格未設定'}</div>
      </div>
    `).join('');
    if (products.length > 20) {
      html += `<div style="font-size: 11px; color: #9ca3af; text-align: center; padding: 4px;">...他${products.length - 20}件</div>`;
    }
  }
  
  container.innerHTML = html;
}

function pickMaterial(name, price) {
  addEstimateMaterial(name, 1, price);
  calculateEstimateTotal();
  closeMaterialPicker();
}

// ==========================================
// レシート材料から取り込み
// ==========================================
// selectedSavedMaterials は globals.js で定義

function showSavedMaterialsPicker() {
  selectedSavedMaterials.clear();
  document.getElementById('savedMaterialsSearch').value = '';
  filterSavedMaterialsPicker();
  updateSelectedCount();
  document.getElementById('savedMaterialsPickerModal').classList.remove('hidden');
}

function closeSavedMaterialsPicker() {
  document.getElementById('savedMaterialsPickerModal').classList.add('hidden');
}

function filterSavedMaterialsPicker() {
  const search = document.getElementById('savedMaterialsSearch').value.toLowerCase();
  let materials = JSON.parse(localStorage.getItem('reform_app_materials') || '[]');
  
  // 日付順にソート（新しい順）
  materials.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  
  if (search) {
    materials = materials.filter(m => 
      (m.name || '').toLowerCase().includes(search) ||
      (m.storeName || '').toLowerCase().includes(search)
    );
  }
  
  const container = document.getElementById('savedMaterialsPickerList');
  
  if (materials.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📷</div>
        <div>保存された材料がありません</div>
        <div style="font-size: 12px; margin-top: 8px;">レシート読込で材料を保存してください</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = materials.map(m => {
    const isSelected = selectedSavedMaterials.has(String(m.id));
    return `
      <div class="picker-item ${isSelected ? 'selected' : ''}" 
           style="${isSelected ? 'background: #eff6ff; border-color: #3b82f6;' : ''}"
           onclick="toggleSavedMaterial('${m.id}')">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 24px; height: 24px; border: 2px solid ${isSelected ? '#3b82f6' : '#d1d5db'}; border-radius: 4px; display: flex; align-items: center; justify-content: center; background: ${isSelected ? '#3b82f6' : 'white'};">
            ${isSelected ? '<span style="color: white; font-size: 14px;">✓</span>' : ''}
          </div>
          <div style="flex: 1;">
            <div class="picker-item-name">${m.name || '名称なし'}</div>
            <div class="picker-item-detail">
              ${formatDate(m.date)} | ${m.storeName || '店舗不明'}
            </div>
            <div class="picker-item-detail">
              数量: ${m.quantity || 1} | 単価: ¥${(m.price || 0).toLocaleString()}
            </div>
          </div>
          <div style="text-align: right;">
            <div class="picker-item-price">¥${((m.price || 0) * (m.quantity || 1)).toLocaleString()}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleSavedMaterial(materialId) {
  const id = String(materialId);
  if (selectedSavedMaterials.has(id)) {
    selectedSavedMaterials.delete(id);
  } else {
    selectedSavedMaterials.add(id);
  }
  filterSavedMaterialsPicker();
  updateSelectedCount();
}

function toggleAllSavedMaterials() {
  const materials = JSON.parse(localStorage.getItem('reform_app_materials') || '[]');
  
  if (selectedSavedMaterials.size === materials.length) {
    // 全選択解除
    selectedSavedMaterials.clear();
  } else {
    // 全選択
    materials.forEach(m => selectedSavedMaterials.add(String(m.id)));
  }
  
  filterSavedMaterialsPicker();
  updateSelectedCount();
}

function updateSelectedCount() {
  document.getElementById('savedMaterialsSelectedCount').textContent = 
    `${selectedSavedMaterials.size}件選択中`;
}

function addSelectedMaterialsToEstimate() {
  if (selectedSavedMaterials.size === 0) {
    alert('材料を選択してください');
    return;
  }
  
  const materials = JSON.parse(localStorage.getItem('reform_app_materials') || '[]');
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const defaultRate = parseFloat(settings.defaultProfitRate) || 20;
  
  let addedCount = 0;
  
  selectedSavedMaterials.forEach(id => {
    const material = materials.find(m => String(m.id) === id);
    if (material) {
      const costPrice = material.price || 0;
      const sellingPrice = Math.ceil(costPrice * (1 + defaultRate / 100));
      
      estimateMaterials.push({
        id: Date.now() + Math.random(),
        name: material.name || '',
        quantity: material.quantity || 1,
        costPrice: costPrice,
        profitRate: defaultRate,
        sellingPrice: sellingPrice,
        fromReceipt: true,  // レシートから取り込んだフラグ
        originalMaterialId: material.id
      });
      addedCount++;
    }
  });
  
  renderEstimateMaterials();
  calculateEstimateTotal();
  closeSavedMaterialsPicker();
  
  alert(`${addedCount}件の材料を追加しました！\n利益率 ${defaultRate}% が自動適用されています。`);
}

// ==========================================
// ネット商品追加機能
// ==========================================
// netProductImageData は globals.js で定義
// netProductImageDataUrls は globals.js で定義

function showNetProductPicker() {
  // フォームをリセット
  netProductImageData = null;
  netProductImageDataUrls = [];
  document.getElementById('netProductImagePreview').style.display = 'none';
  document.getElementById('netProductImagePlaceholder').style.display = 'block';
  document.getElementById('netProductImageArea').style.display = 'block';
  document.getElementById('netProductMultiImageArea').style.display = 'none';
  document.getElementById('netProductThumbnails').innerHTML = '';
  document.getElementById('netProductAiBtn').disabled = true;
  document.getElementById('netProductName').value = '';
  document.getElementById('netProductPrice').value = '';
  document.getElementById('netProductQty').value = '1';
  document.getElementById('netProductUrl').value = '';
  document.getElementById('netProductSeller').value = '';
  
  document.getElementById('netProductPickerModal').classList.remove('hidden');
}

function closeNetProductPicker() {
  document.getElementById('netProductPickerModal').classList.add('hidden');
}

function handleNetProductImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // 複数画像モードをリセット
  netProductImageDataUrls = [];
  document.getElementById('netProductMultiImageArea').style.display = 'none';
  document.getElementById('netProductThumbnails').innerHTML = '';
  
  const reader = new FileReader();
  reader.onload = (e) => {
    netProductImageData = e.target.result;
    document.getElementById('netProductImagePreview').src = netProductImageData;
    document.getElementById('netProductImagePreview').style.display = 'block';
    document.getElementById('netProductImagePlaceholder').style.display = 'none';
    document.getElementById('netProductImageArea').style.display = 'block';
    
    // AIボタンを有効化（APIキーがあれば）
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    document.getElementById('netProductAiBtn').disabled = !settings.geminiApiKey;
    
    if (!settings.geminiApiKey) {
      alert('AI読み取りを使うには、設定画面でGemini APIキーを入力してください。\n\n手動入力は使えます。');
    }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// 画像を追加（複数画像モード）
function handleNetProductAddImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // 最大3枚まで
  if (netProductImageDataUrls.length >= 3) {
    alert('最大3枚まで追加できます');
    event.target.value = '';
    return;
  }
  
  // 既存の単一画像があれば複数画像モードに移行
  if (netProductImageDataUrls.length === 0 && netProductImageData) {
    netProductImageDataUrls.push(netProductImageData);
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    netProductImageDataUrls.push(e.target.result);
    
    // 単一画像プレビューを非表示、複数画像モードを表示
    document.getElementById('netProductImageArea').style.display = 'none';
    document.getElementById('netProductMultiImageArea').style.display = 'block';
    
    renderNetProductThumbnails();
    
    // AIボタンを有効化（APIキーがあれば）
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    document.getElementById('netProductAiBtn').disabled = !settings.geminiApiKey;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// サムネイル表示
function renderNetProductThumbnails() {
  const container = document.getElementById('netProductThumbnails');
  container.innerHTML = '';
  
  netProductImageDataUrls.forEach((dataUrl, index) => {
    const thumb = document.createElement('div');
    thumb.style.cssText = 'position: relative; width: 60px; height: 60px;';
    thumb.innerHTML = `
      <img src="${dataUrl}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 2px solid #e5e7eb;">
      <div onclick="removeNetProductImage(${index})" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; background: #ef4444; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">×</div>
      <div style="position: absolute; bottom: 2px; left: 2px; background: rgba(0,0,0,0.6); color: white; padding: 1px 4px; border-radius: 4px; font-size: 9px;">${index + 1}</div>
    `;
    container.appendChild(thumb);
  });
  
  // 追加ボタン（3枚未満の場合）
  if (netProductImageDataUrls.length < 3) {
    const addBtn = document.createElement('div');
    addBtn.style.cssText = 'width: 60px; height: 60px; border: 2px dashed #10b981; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #10b981; font-size: 20px; background: white;';
    addBtn.innerHTML = '＋';
    addBtn.onclick = () => document.getElementById('netProductAddImage').click();
    container.appendChild(addBtn);
  }
}

// 画像を削除
function removeNetProductImage(index) {
  netProductImageDataUrls.splice(index, 1);
  
  if (netProductImageDataUrls.length === 0) {
    // 全部削除したら単一画像モードに戻る
    document.getElementById('netProductMultiImageArea').style.display = 'none';
    document.getElementById('netProductImageArea').style.display = 'block';
    document.getElementById('netProductImagePlaceholder').style.display = 'block';
    document.getElementById('netProductImagePreview').style.display = 'none';
    document.getElementById('netProductAiBtn').disabled = true;
    netProductImageData = null;
  } else if (netProductImageDataUrls.length === 1) {
    // 1枚だけになったら単一画像モードに戻る
    netProductImageData = netProductImageDataUrls[0];
    document.getElementById('netProductMultiImageArea').style.display = 'none';
    document.getElementById('netProductImageArea').style.display = 'block';
    document.getElementById('netProductImagePreview').src = netProductImageData;
    document.getElementById('netProductImagePreview').style.display = 'block';
    document.getElementById('netProductImagePlaceholder').style.display = 'none';
    netProductImageDataUrls = [];
  } else {
    renderNetProductThumbnails();
  }
}

// 全画像クリア
function clearNetProductImages() {
  netProductImageDataUrls = [];
  netProductImageData = null;
  document.getElementById('netProductMultiImageArea').style.display = 'none';
  document.getElementById('netProductThumbnails').innerHTML = '';
  document.getElementById('netProductImageArea').style.display = 'block';
  document.getElementById('netProductImagePlaceholder').style.display = 'block';
  document.getElementById('netProductImagePreview').style.display = 'none';
  document.getElementById('netProductAiBtn').disabled = true;
}

async function readNetProductImage() {
  // 複数画像がある場合は結合
  let imageDataToUse = netProductImageData;
  
  if (netProductImageDataUrls.length > 1) {
    try {
      imageDataToUse = await mergeImages(netProductImageDataUrls);
      netProductImageData = imageDataToUse;
    } catch (error) {
      console.error('画像結合エラー:', error);
      alert('❌ 画像の結合に失敗しました');
      return;
    }
  }
  
  if (!imageDataToUse) {
    alert('先に画像を選択してください');
    return;
  }
  
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const apiKey = settings.geminiApiKey;
  
  if (!apiKey) {
    alert('設定画面でGemini APIキーを入力してください');
    return;
  }
  
  const loading = document.getElementById('netProductLoading');
  const progress = document.getElementById('netProductProgress');
  loading.classList.remove('hidden');
  progress.textContent = '商品情報を読み取り中...';
  
  try {
    const base64Image = imageDataToUse.split(',')[1];
    const mimeType = imageDataToUse.split(';')[0].split(':')[1];
    
    const prompt = `この商品ページのスクリーンショットから、以下の情報を読み取ってJSON形式で返してください。
必ず有効なJSONのみを返してください。説明文は不要です。
複数の画像が結合されている場合は、全体から商品情報を読み取ってください。

{
  "productName": "商品名（できるだけ正確に）",
  "price": 価格（数字のみ、税込価格を優先）,
  "seller": "販売元（Amazon、モノタロウ、楽天など）",
  "quantity": 数量（記載があれば、なければ1）
}

注意：
- 商品名は正確に読み取ってください
- 価格は数字のみ（カンマや円マークは除く）
- 税込価格を優先してください
- 読み取れない場合はnullを入れてください`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API呼び出しに失敗しました');
    }
    
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log('Gemini応答:', text);
    
    // JSONを抽出
    let jsonStr = text;
    const jsonMatch = text.match(/```json?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const data = JSON.parse(jsonStr.trim());
    
    // フォームに反映
    if (data.productName) {
      document.getElementById('netProductName').value = data.productName;
    }
    if (data.price) {
      document.getElementById('netProductPrice').value = data.price;
    }
    if (data.seller) {
      document.getElementById('netProductSeller').value = data.seller;
    }
    if (data.quantity) {
      document.getElementById('netProductQty').value = data.quantity;
    }
    
    alert('✅ 読み取り完了！\n内容を確認して「追加する」を押してください。');
    
  } catch (error) {
    console.error('AI読み取りエラー:', error);
    alert('❌ 読み取りに失敗しました\n' + error.message + '\n\n手動で入力してください。');
  } finally {
    loading.classList.add('hidden');
  }
}

function addNetProductToEstimate() {
  const name = document.getElementById('netProductName').value.trim();
  const price = parseInt(document.getElementById('netProductPrice').value) || 0;
  const quantity = parseInt(document.getElementById('netProductQty').value) || 1;
  const url = document.getElementById('netProductUrl').value.trim();
  const seller = document.getElementById('netProductSeller').value.trim();
  
  if (!name) {
    alert('商品名を入力してください');
    return;
  }
  if (price <= 0) {
    alert('価格を入力してください');
    return;
  }
  
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const defaultRate = parseFloat(settings.defaultProfitRate) || 20;
  const sellingPrice = Math.ceil(price * (1 + defaultRate / 100));
  
  estimateMaterials.push({
    id: Date.now() + Math.random(),
    name: name,
    quantity: quantity,
    costPrice: price,
    profitRate: defaultRate,
    sellingPrice: sellingPrice,
    fromNet: true,
    url: url,
    seller: seller
  });
  
  renderEstimateMaterials();
  calculateEstimateTotal();
  closeNetProductPicker();
  
  alert(`「${name}」を追加しました！\n仕入: ¥${price.toLocaleString()} → 売値: ¥${sellingPrice.toLocaleString()}（利益率 ${defaultRate}%）`);
}

// 下書き保存
function saveEstimateDraft() {
  try {
  const estimate = getEstimateData();
  estimate.status = 'draft';
  estimate.id = Date.now();
  estimate.number = generateEstimateNumber();
  
  const estimates = JSON.parse(localStorage.getItem('reform_app_estimates') || '[]');
  estimates.push(estimate);
  localStorage.setItem('reform_app_estimates', JSON.stringify(estimates));
  
  alert('下書きを保存しました！\n見積番号: ' + estimate.number);
  } catch (e) {
    console.error('[saveEstimateDraft] エラー:', e);
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      alert('❌ ストレージ容量が不足しています\n\n設定画面から不要なデータを削除するか、バックアップ後にデータを整理してください。');
    } else {
      alert('❌ 保存に失敗しました\n\n' + e.message);
    }
  }
}

function getEstimateData() {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const taxRate = parseFloat(settings.taxRate) || 10;
  
  // v0.94.1修正: sellingPriceを優先的に使う
  const materialSubtotal = estimateMaterials.reduce((sum, m) => sum + (m.quantity || 0) * (m.sellingPrice || m.price || 0), 0);
  const workSubtotal = estimateWorks.reduce((sum, w) => {
    if (workType === 'construction') {
      return sum + (w.value || 0);
    } else {
      return sum + (w.quantity || 1) * (w.value || 0);
    }
  }, 0);
  const subtotal = materialSubtotal + workSubtotal;
  const tax = Math.floor(subtotal * taxRate / 100);
  
  return {
    customerName: document.getElementById('estCustomerName').value,
    subject: document.getElementById('estSubject').value,
    date: document.getElementById('estDate').value,
    validDate: document.getElementById('estValidDate').value,
    materials: [...estimateMaterials],
    works: [...estimateWorks],
    workType: workType,
    notes: document.getElementById('estNotes').value,
    materialSubtotal: materialSubtotal,
    workSubtotal: workSubtotal,
    subtotal: subtotal,
    taxRate: taxRate,
    tax: tax,
    total: subtotal + tax,
    createdAt: new Date().toISOString()
  };
}

function generateEstimateNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const estimates = JSON.parse(localStorage.getItem('reform_app_estimates') || '[]');
  const count = estimates.filter(e => e.number && e.number.startsWith('E-' + year)).length + 1;
  return `E-${year}-${String(count).padStart(4, '0')}`;
}

// 出力モーダル
function showEstimateOutput() {
  const data = getEstimateData();
  
  if (!data.customerName) {
    alert('お客様名を入力してください');
    return;
  }
  if (!data.subject) {
    alert('件名を入力してください');
    return;
  }
  
  document.getElementById('outputSummary').innerHTML = `
    <div><strong>${data.customerName}</strong> 様</div>
    <div>${data.subject}</div>
    <div style="font-size: 18px; font-weight: bold; color: #3b82f6; margin-top: 8px;">
      合計: ¥${data.total.toLocaleString()}
    </div>
  `;
  
  document.getElementById('outputModal').classList.remove('hidden');
}

function closeOutputModal() {
  document.getElementById('outputModal').classList.add('hidden');
}

// v0.95: PDF出力はdoc-template.jsに移行（exportEstimatePDF関数）

// v0.95: Excel出力はexcel-template.jsに移行（exportEstimateExcelStyled関数）
// 互換性のため旧関数名もエイリアスとして残す
function exportEstimateExcel() {
  exportEstimateExcelStyled();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// ==========================================
