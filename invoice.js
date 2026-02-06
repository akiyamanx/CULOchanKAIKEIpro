// ==========================================
// 請求書作成機能
// Reform App Pro v0.95
// ==========================================


// 請求書作成機能
// ==========================================
// invoiceMaterials は globals.js で定義
// invoiceWorks は globals.js で定義
// invWorkType は globals.js で定義

function initInvoiceScreen() {
  // 今日の日付をセット
  const today = new Date();
  document.getElementById('invDate').value = today.toISOString().split('T')[0];
  
  // 支払期限（設定から取得）
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const paymentTerms = settings.paymentTerms || '翌月末';
  let dueDate = new Date(today);
  
  if (paymentTerms === '翌月末') {
    dueDate.setMonth(dueDate.getMonth() + 2);
    dueDate.setDate(0); // 翌月末
  } else if (paymentTerms === '翌々月末') {
    dueDate.setMonth(dueDate.getMonth() + 3);
    dueDate.setDate(0);
  } else if (paymentTerms === '30日以内') {
    dueDate.setDate(dueDate.getDate() + 30);
  }
  // 即日の場合はそのまま
  
  document.getElementById('invDueDate').value = dueDate.toISOString().split('T')[0];
  
  // 税率を表示
  document.getElementById('invTaxRateDisplay').textContent = settings.taxRate || 10;
  
  // 振込先情報を表示
  updateBankInfo();
  
  // 初期データ
  if (invoiceMaterials.length === 0) {
    addInvoiceMaterial();
  }
  if (invoiceWorks.length === 0) {
    addInvoiceWork();
  }
  
  renderInvoiceMaterials();
  renderInvoiceWorks();
  calculateInvoiceTotal();
}

function updateBankInfo() {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const container = document.getElementById('invBankInfo');
  
  if (settings.bankName) {
    container.innerHTML = `
      <div><strong>${settings.bankName}</strong> ${settings.branchName || ''}</div>
      <div>${settings.accountType || '普通'} ${settings.accountNumber || ''}</div>
      <div>口座名義: ${settings.accountHolder || ''}</div>
    `;
  } else {
    container.innerHTML = '<div style="color: #9ca3af;">振込先が設定されていません</div>';
  }
}

// v0.94.1修正: タイプ切り替え時に作業データのvalue/unit/quantityをリセット
function setInvWorkType(type) {
  const prevType = invWorkType;
  invWorkType = type;
  document.getElementById('invWorkTypeConstruction').classList.toggle('active', type === 'construction');
  document.getElementById('invWorkTypeDaily').classList.toggle('active', type === 'daily');
  
  // タイプが変わった場合、既存の作業データを新しいタイプ用にリセット
  if (prevType !== type) {
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    const dailyRate = settings.dailyRate || 18000;
    invoiceWorks = invoiceWorks.map(w => ({
      id: w.id,
      name: w.name || '',
      value: type === 'daily' ? dailyRate : 0,
      unit: type === 'daily' ? '日' : '式',
      quantity: type === 'daily' ? 1 : (w.quantity || 1)
    }));
  }
  
  renderInvoiceWorks();
}

function addInvoiceMaterial(name = '', quantity = 1, price = 0) {
  invoiceMaterials.push({
    id: Date.now() + Math.random(),
    name: name,
    quantity: quantity,
    price: price
  });
  renderInvoiceMaterials();
}

function removeInvoiceMaterial(id) {
  invoiceMaterials = invoiceMaterials.filter(m => m.id !== id);
  renderInvoiceMaterials();
  calculateInvoiceTotal();
}

function updateInvoiceMaterial(id, field, value) {
  const item = invoiceMaterials.find(m => m.id === id);
  if (item) {
    item[field] = value;
    renderInvoiceMaterials();
    calculateInvoiceTotal();
  }
}

function renderInvoiceMaterials() {
  const container = document.getElementById('invMaterialsList');
  container.innerHTML = invoiceMaterials.map((item, index) => {
    const amount = (item.quantity || 0) * (item.price || 0);
    return `
      <div class="estimate-item">
        <div class="estimate-item-header">
          <span style="font-size: 12px; color: #6b7280;">材料 #${index + 1}</span>
          <button class="receipt-item-delete" onclick="removeInvoiceMaterial(${item.id})">削除</button>
        </div>
        <div class="estimate-item-row">
          <div class="suggest-container">
            <input type="text" placeholder="品名" value="${escapeHtml(item.name)}"
              oninput="showInvSuggestions(this, ${item.id})"
              onfocus="showInvSuggestions(this, ${item.id})"
              onblur="setTimeout(() => hideInvSuggestions(${item.id}), 200)"
              onchange="updateInvoiceMaterial(${item.id}, 'name', this.value)">
            <div class="suggest-dropdown" id="inv-suggest-${item.id}"></div>
          </div>
          <input type="number" placeholder="数量" value="${item.quantity}" min="1"
            onchange="updateInvoiceMaterial(${item.id}, 'quantity', parseInt(this.value) || 1)">
          <input type="number" placeholder="単価" value="${item.price || ''}"
            onchange="updateInvoiceMaterial(${item.id}, 'price', parseInt(this.value) || 0)">
          <div class="estimate-item-amount">¥${amount.toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join('');
  
  const subtotal = invoiceMaterials.reduce((sum, m) => sum + (m.quantity || 0) * (m.price || 0), 0);
  document.getElementById('invMaterialSubtotal').textContent = '¥' + subtotal.toLocaleString();
}

function showInvSuggestions(input, itemId) {
  const value = input.value.toLowerCase();
  const dropdown = document.getElementById(`inv-suggest-${itemId}`);
  
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
    <div class="suggest-item" onclick="selectInvMaterial(${itemId}, '${escapeHtml(p.officialName)}', ${p.defaultPrice || 0})">
      <span class="suggest-item-price">${p.defaultPrice ? '¥' + p.defaultPrice.toLocaleString() : ''}</span>
      <div class="suggest-item-name">${p.officialName}</div>
      <div class="suggest-item-category">${getCategoryLabel(p.category)}</div>
    </div>
  `).join('');
  
  dropdown.classList.add('show');
}

function hideInvSuggestions(itemId) {
  const dropdown = document.getElementById(`inv-suggest-${itemId}`);
  if (dropdown) dropdown.classList.remove('show');
}

function selectInvMaterial(itemId, name, price) {
  const item = invoiceMaterials.find(m => m.id === itemId);
  if (item) {
    item.name = name;
    if (price > 0) item.price = price;
    renderInvoiceMaterials();
    calculateInvoiceTotal();
  }
}

function addInvoiceWork(name = '', value = 0, unit = '') {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  invoiceWorks.push({
    id: Date.now() + Math.random(),
    name: name,
    value: value || (invWorkType === 'daily' ? (settings.dailyRate || 18000) : 0),
    unit: unit || (invWorkType === 'daily' ? '日' : '式'),
    quantity: 1
  });
  renderInvoiceWorks();
  calculateInvoiceTotal(); // v0.94.1追加: 作業費を合計に反映
}

function removeInvoiceWork(id) {
  invoiceWorks = invoiceWorks.filter(w => w.id !== id);
  renderInvoiceWorks();
  calculateInvoiceTotal();
}

function updateInvoiceWork(id, field, value) {
  const item = invoiceWorks.find(w => w.id === id);
  if (item) {
    item[field] = value;
    renderInvoiceWorks();
    calculateInvoiceTotal();
  }
}

function renderInvoiceWorks() {
  const container = document.getElementById('invWorksList');
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const dailyRate = settings.dailyRate || 18000;
  
  if (invWorkType === 'construction') {
    container.innerHTML = invoiceWorks.map((item, index) => {
      return `
        <div class="estimate-item">
          <div class="estimate-item-header">
            <span style="font-size: 12px; color: #6b7280;">作業 #${index + 1}</span>
            <button class="receipt-item-delete" onclick="removeInvoiceWork(${item.id})">削除</button>
          </div>
          <div class="estimate-item-row work-row">
            <input type="text" placeholder="作業内容" value="${escapeHtml(item.name)}"
              onchange="updateInvoiceWork(${item.id}, 'name', this.value)">
            <input type="text" placeholder="単位" value="${item.unit}" style="text-align: center;"
              onchange="updateInvoiceWork(${item.id}, 'unit', this.value)">
            <input type="number" placeholder="金額" value="${item.value || ''}"
              onchange="updateInvoiceWork(${item.id}, 'value', parseInt(this.value) || 0)">
          </div>
        </div>
      `;
    }).join('');
  } else {
    container.innerHTML = invoiceWorks.map((item, index) => {
      const amount = (item.quantity || 0) * (item.value || dailyRate);
      return `
        <div class="estimate-item">
          <div class="estimate-item-header">
            <span style="font-size: 12px; color: #6b7280;">作業員 #${index + 1}</span>
            <button class="receipt-item-delete" onclick="removeInvoiceWork(${item.id})">削除</button>
          </div>
          <div class="estimate-item-row">
            <input type="text" placeholder="作業員名" value="${escapeHtml(item.name || '作業員')}"
              onchange="updateInvoiceWork(${item.id}, 'name', this.value)">
            <input type="number" placeholder="日数" value="${item.quantity}" min="1"
              onchange="updateInvoiceWork(${item.id}, 'quantity', parseInt(this.value) || 1)">
            <input type="number" placeholder="日当" value="${item.value || dailyRate}"
              onchange="updateInvoiceWork(${item.id}, 'value', parseInt(this.value) || 0)">
            <div class="estimate-item-amount">¥${amount.toLocaleString()}</div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  const subtotal = invoiceWorks.reduce((sum, w) => {
    if (invWorkType === 'construction') {
      return sum + (w.value || 0);
    } else {
      return sum + (w.quantity || 1) * (w.value || 0);
    }
  }, 0);
  document.getElementById('invWorkSubtotal').textContent = '¥' + subtotal.toLocaleString();
  calculateInvoiceTotal(); // v0.94.1追加: 作業費変更時に合計も更新
}

function calculateInvoiceTotal() {
  const materialSubtotal = invoiceMaterials.reduce((sum, m) => sum + (m.quantity || 0) * (m.price || 0), 0);
  const workSubtotal = invoiceWorks.reduce((sum, w) => {
    if (invWorkType === 'construction') {
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
  
  document.getElementById('invSubtotalDisplay').textContent = '¥' + subtotal.toLocaleString();
  document.getElementById('invTaxDisplay').textContent = '¥' + tax.toLocaleString();
  document.getElementById('invTotalDisplay').textContent = '¥' + total.toLocaleString();
}

// 見積書から請求書を作成
function showEstimatePicker() {
  const estimates = JSON.parse(localStorage.getItem('reform_app_estimates') || '[]');
  const container = document.getElementById('estimatePickerList');
  
  if (estimates.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 20px;">保存された見積書がありません</div>';
  } else {
    container.innerHTML = estimates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(e => `
      <div class="picker-item" onclick="loadFromEstimate('${e.id}')">
        <div class="picker-item-name">${e.number || '番号なし'}</div>
        <div class="picker-item-detail">
          ${e.customerName || '顧客名なし'} - ${e.subject || '件名なし'}
        </div>
        <div class="picker-item-detail">
          <span>${formatDate(e.date)}</span>
          <span class="picker-item-price" style="float: right;">¥${(e.total || 0).toLocaleString()}</span>
        </div>
      </div>
    `).join('');
  }
  
  document.getElementById('estimatePickerModal').classList.remove('hidden');
}

function closeEstimatePicker() {
  document.getElementById('estimatePickerModal').classList.add('hidden');
}

function loadFromEstimate(estimateId) {
  const estimates = JSON.parse(localStorage.getItem('reform_app_estimates') || '[]');
  const estimate = estimates.find(e => String(e.id) === String(estimateId));
  
  if (!estimate) {
    alert('見積書が見つかりません');
    return;
  }
  
  // 基本情報を反映
  document.getElementById('invCustomerName').value = estimate.customerName || '';
  document.getElementById('invSubject').value = estimate.subject || '';
  
  // 材料を反映（v0.94.1修正: sellingPriceをpriceにマッピング）
  invoiceMaterials = (estimate.materials || []).map(m => ({
    ...m,
    price: m.sellingPrice || m.price || 0,
    id: Date.now() + Math.random()
  }));
  
  // 作業を反映
  invoiceWorks = (estimate.works || []).map(w => ({
    ...w,
    id: Date.now() + Math.random()
  }));
  
  // 作業タイプを反映
  invWorkType = estimate.workType || 'construction';
  setInvWorkType(invWorkType);
  
  // 備考
  document.getElementById('invNotes').value = estimate.notes || '';
  
  renderInvoiceMaterials();
  renderInvoiceWorks();
  calculateInvoiceTotal();
  
  closeEstimatePicker();
  alert('見積書の内容を読み込みました！');
}

// 材料選択モーダル（請求書用）
function showInvMaterialPicker() {
  document.getElementById('invMaterialPickerSearch').value = '';
  filterInvMaterialPicker();
  document.getElementById('invMaterialPickerModal').classList.remove('hidden');
}

function closeInvMaterialPicker() {
  document.getElementById('invMaterialPickerModal').classList.add('hidden');
}

function filterInvMaterialPicker() {
  const search = document.getElementById('invMaterialPickerSearch').value.toLowerCase();
  let filtered = productMaster;
  
  if (search) {
    filtered = filtered.filter(p => 
      p.officialName.toLowerCase().includes(search) ||
      p.aliases.some(a => a.toLowerCase().includes(search))
    );
  }
  
  const container = document.getElementById('invMaterialPickerList');
  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 20px;">該当する品名がありません</div>';
    return;
  }
  
  container.innerHTML = filtered.map(p => `
    <div class="picker-item" onclick="pickInvMaterial('${escapeHtml(p.officialName)}', ${p.defaultPrice || 0})">
      <div class="picker-item-name">${p.officialName}</div>
      <div class="picker-item-detail">
        <span>${getCategoryLabel(p.category)}</span>
        ${p.defaultPrice ? `<span class="picker-item-price" style="float: right;">¥${p.defaultPrice.toLocaleString()}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function pickInvMaterial(name, price) {
  addInvoiceMaterial(name, 1, price);
  calculateInvoiceTotal();
  closeInvMaterialPicker();
}

// 下書き保存
function saveInvoiceDraft() {
  try {
  const invoice = getInvoiceData();
  invoice.status = 'draft';
  invoice.id = Date.now();
  invoice.number = generateInvoiceNumber();
  
  const invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
  invoices.push(invoice);
  localStorage.setItem('reform_app_invoices', JSON.stringify(invoices));
  
  alert('下書きを保存しました！\n請求番号: ' + invoice.number);
  } catch (e) {
    console.error('[saveInvoiceDraft] エラー:', e);
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      alert('❌ ストレージ容量が不足しています\n\n設定画面から不要なデータを削除するか、バックアップ後にデータを整理してください。');
    } else {
      alert('❌ 保存に失敗しました\n\n' + e.message);
    }
  }
}

function getInvoiceData() {
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const taxRate = parseFloat(settings.taxRate) || 10;
  
  const materialSubtotal = invoiceMaterials.reduce((sum, m) => sum + (m.quantity || 0) * (m.price || 0), 0);
  const workSubtotal = invoiceWorks.reduce((sum, w) => {
    if (invWorkType === 'construction') {
      return sum + (w.value || 0);
    } else {
      return sum + (w.quantity || 1) * (w.value || 0);
    }
  }, 0);
  const subtotal = materialSubtotal + workSubtotal;
  const tax = Math.floor(subtotal * taxRate / 100);
  
  return {
    customerName: document.getElementById('invCustomerName').value,
    subject: document.getElementById('invSubject').value,
    date: document.getElementById('invDate').value,
    dueDate: document.getElementById('invDueDate').value,
    materials: [...invoiceMaterials],
    works: [...invoiceWorks],
    workType: invWorkType,
    notes: document.getElementById('invNotes').value,
    materialSubtotal: materialSubtotal,
    workSubtotal: workSubtotal,
    subtotal: subtotal,
    taxRate: taxRate,
    tax: tax,
    total: subtotal + tax,
    createdAt: new Date().toISOString()
  };
}

function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
  const count = invoices.filter(i => i.number && i.number.startsWith('I-' + year)).length + 1;
  return `I-${year}-${String(count).padStart(4, '0')}`;
}

// 出力モーダル
function showInvoiceOutput() {
  const data = getInvoiceData();
  
  if (!data.customerName) {
    alert('お客様名を入力してください');
    return;
  }
  if (!data.subject) {
    alert('件名を入力してください');
    return;
  }
  
  document.getElementById('invOutputSummary').innerHTML = `
    <div><strong>${data.customerName}</strong> 様</div>
    <div>${data.subject}</div>
    <div style="font-size: 18px; font-weight: bold; color: #3b82f6; margin-top: 8px;">
      ご請求金額: ¥${data.total.toLocaleString()}
    </div>
  `;
  
  document.getElementById('invOutputModal').classList.remove('hidden');
}

function closeInvOutputModal() {
  document.getElementById('invOutputModal').classList.add('hidden');
}

// v0.95: PDF出力はdoc-template.jsに移行（exportInvoicePDF関数）

// v0.95: Excel出力はexcel-template.jsに移行（exportInvoiceExcelStyled関数）
// 互換性のため旧関数名もエイリアスとして残す
function exportInvoiceExcel() {
  exportInvoiceExcelStyled();
}

// ==========================================
// 経費一覧機能
// ==========================================
