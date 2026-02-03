// ==========================================
// 請求書作成機能
// Reform App Pro v0.91
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
  
  // 材料を反映
  invoiceMaterials = (estimate.materials || []).map(m => ({
    ...m,
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
  const invoice = getInvoiceData();
  invoice.status = 'draft';
  invoice.id = Date.now();
  invoice.number = generateInvoiceNumber();
  
  const invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
  invoices.push(invoice);
  localStorage.setItem('reform_app_invoices', JSON.stringify(invoices));
  
  alert('下書きを保存しました！\n請求番号: ' + invoice.number);
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

// PDF出力（請求書）
async function exportInvoicePDF(mode = 'download') {
  const data = getInvoiceData();
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const invoiceNumber = generateInvoiceNumber();
  const template = settings.template || 'simple';
  const logoData = localStorage.getItem('reform_app_logo');
  const stampData = localStorage.getItem('reform_app_stamp');
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFont('helvetica');
  
  // ページ管理
  let currentPage = 1;
  let totalPages = 1;
  let y = 15;
  let pageSubtotal = 0;
  const PAGE_BOTTOM = 250;
  const ITEM_HEIGHT = 6;
  
  // 全項目を配列にまとめる
  const allItems = [];
  
  // 材料費
  if (data.materials.length > 0) {
    allItems.push({ type: 'section', name: '【材料費】' });
    data.materials.forEach((m, idx) => {
      if (m.name) {
        const amount = (m.quantity || 0) * (m.sellingPrice || m.price || 0);
        allItems.push({
          type: 'item',
          no: idx + 1,
          name: m.name,
          quantity: String(m.quantity),
          price: m.sellingPrice || m.price || 0,
          amount: amount
        });
      }
    });
    allItems.push({ type: 'subtotal', name: '材料費 小計', amount: data.materialSubtotal });
  }
  
  // 作業費
  if (data.works.length > 0) {
    allItems.push({ type: 'section', name: '【作業費】' });
    const startNo = data.materials.filter(m => m.name).length + 1;
    data.works.forEach((w, idx) => {
      if (w.name || w.value) {
        let amount, qtyStr, priceStr;
        if (data.workType === 'construction') {
          amount = w.value || 0;
          qtyStr = w.unit || '1式';
          priceStr = '';
        } else {
          amount = (w.quantity || 1) * (w.value || 0);
          qtyStr = `${w.quantity || 1}日`;
          priceStr = `¥${(w.value || 0).toLocaleString()}`;
        }
        allItems.push({
          type: 'item',
          no: startNo + idx,
          name: w.name || '作業',
          quantity: qtyStr,
          priceStr: priceStr,
          amount: amount
        });
      }
    });
    allItems.push({ type: 'subtotal', name: '作業費 小計', amount: data.workSubtotal });
  }
  
  // 総ページ数を計算
  let tempY = 130;
  allItems.forEach(item => {
    tempY += ITEM_HEIGHT;
    if (tempY > PAGE_BOTTOM) {
      totalPages++;
      tempY = 50;
    }
  });
  
  // 1ページ目のヘッダー
  function drawFirstPageHeader() {
    y = 15;
    
    if (template === 'modern') {
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 0, 210, 35, 'F');
      if (logoData) {
        try { doc.addImage(logoData, 'PNG', 15, 5, 30, 15); } catch(e) {}
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('請 求 書', 105, 22, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y = 45;
    } else if (template === 'business') {
      let logoEndX = 20;
      if (logoData) {
        try { doc.addImage(logoData, 'PNG', 15, 10, 25, 12); logoEndX = 45; } catch(e) {}
      }
      doc.setFontSize(10);
      if (settings.companyName) doc.text(settings.companyName, logoEndX, 15);
      doc.setFontSize(8);
      if (settings.address) doc.text(`〒${settings.postalCode || ''} ${settings.address}`, logoEndX, 20);
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.rect(70, 28, 70, 12);
      doc.setFontSize(16);
      doc.text('御 請 求 書', 105, 36, { align: 'center' });
      y = 50;
    } else {
      if (logoData) {
        try { doc.addImage(logoData, 'PNG', 85, 5, 40, 15); y = 25; } catch(e) {}
      }
      doc.setFontSize(24);
      doc.text('請 求 書', 105, y, { align: 'center' });
      y += 15;
    }
    
    // 請求番号・日付
    doc.setFontSize(10);
    doc.text(`請求番号: ${invoiceNumber}`, 150, y);
    doc.text(`請求日: ${formatDate(data.date)}`, 150, y + 5);
    doc.text(`お支払期限: ${formatDate(data.dueDate)}`, 150, y + 10);
    
    // お客様名
    doc.setFontSize(14);
    doc.text(`${data.customerName} 様`, 20, y + 5);
    y += 20;
    
    // 件名
    doc.setFontSize(12);
    doc.text(`件名: ${data.subject}`, 20, y);
    y += 10;
    
    // 合計金額枠
    if (template === 'modern') {
      doc.setFillColor(236, 253, 245);
      doc.rect(20, y, 170, 15, 'F');
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.5);
      doc.rect(20, y, 170, 15);
    } else {
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.5);
      doc.rect(20, y, 170, 15);
    }
    doc.setFontSize(14);
    doc.text(`ご請求金額: ¥${data.total.toLocaleString()}-（税込）`, 105, y + 10, { align: 'center' });
    y += 25;
  }
  
  // 2ページ目以降のヘッダー
  function drawContinueHeader() {
    y = 15;
    doc.setFontSize(14);
    doc.text('請 求 書（続き）', 105, y, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`請求番号: ${invoiceNumber}`, 150, y);
    doc.text(`${data.customerName} 様`, 20, y);
    y += 15;
  }
  
  // テーブルヘッダー
  function drawTableHeader() {
    doc.setFontSize(10);
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    
    if (template === 'modern') {
      doc.setFillColor(16, 185, 129);
      doc.rect(20, y, 170, 8, 'F');
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setFillColor(240, 240, 240);
      doc.rect(20, y, 170, 8, 'F');
    }
    doc.text('No.', 25, y + 6);
    doc.text('品名・作業内容', 40, y + 6);
    doc.text('数量', 120, y + 6);
    doc.text('単価', 140, y + 6);
    doc.text('金額', 165, y + 6);
    doc.setTextColor(0, 0, 0);
    y += 8;
  }
  
  // ページフッター
  function drawPageFooter(isLastPage) {
    const footerY = 270;
    doc.setFontSize(9);
    doc.setDrawColor(150);
    doc.line(20, footerY - 5, 190, footerY - 5);
    doc.text(`${currentPage} / ${totalPages} ページ`, 105, footerY, { align: 'center' });
    if (!isLastPage && pageSubtotal > 0) {
      doc.text(`このページ小計: ¥${pageSubtotal.toLocaleString()}`, 170, footerY, { align: 'right' });
    }
  }
  
  // 新しいページ
  function startNewPage() {
    drawPageFooter(false);
    doc.addPage();
    currentPage++;
    pageSubtotal = 0;
    drawContinueHeader();
    drawTableHeader();
  }
  
  // 1ページ目を描画
  drawFirstPageHeader();
  drawTableHeader();
  
  // 明細を描画
  allItems.forEach((item, index) => {
    if (y > PAGE_BOTTOM - 30) {
      startNewPage();
    }
    
    doc.setFontSize(10);
    
    if (item.type === 'section') {
      doc.setFillColor(250, 250, 250);
      doc.rect(20, y, 170, 6, 'F');
      doc.text(item.name, 25, y + 4);
      y += 6;
    } else if (item.type === 'item') {
      doc.text(String(item.no), 25, y + 4);
      doc.text(item.name.substring(0, 30), 40, y + 4);
      doc.text(item.quantity, 125, y + 4);
      if (item.priceStr) {
        doc.text(item.priceStr, 140, y + 4);
      } else {
        doc.text(`¥${item.price.toLocaleString()}`, 140, y + 4);
      }
      doc.text(`¥${item.amount.toLocaleString()}`, 165, y + 4);
      pageSubtotal += item.amount;
      y += 6;
    } else if (item.type === 'subtotal') {
      doc.text(item.name, 120, y + 4);
      doc.text(`¥${item.amount.toLocaleString()}`, 165, y + 4);
      y += 8;
    }
  });
  
  // 合計欄
  if (y > PAGE_BOTTOM - 60) {
    startNewPage();
  }
  
  doc.line(20, y, 190, y);
  y += 2;
  doc.text('小計', 140, y + 4);
  doc.text(`¥${data.subtotal.toLocaleString()}`, 165, y + 4);
  y += 6;
  doc.text(`消費税（${data.taxRate}%）`, 130, y + 4);
  doc.text(`¥${data.tax.toLocaleString()}`, 165, y + 4);
  y += 6;
  doc.setFontSize(12);
  doc.text('合計', 140, y + 5);
  doc.text(`¥${data.total.toLocaleString()}`, 165, y + 5);
  y += 15;
  
  // 振込先
  if (y > PAGE_BOTTOM - 40) {
    startNewPage();
  }
  doc.setFontSize(10);
  doc.text('【お振込先】', 20, y);
  y += 5;
  if (settings.bankName) {
    doc.text(`${settings.bankName} ${settings.branchName || ''}`, 25, y);
    y += 5;
    doc.text(`${settings.accountType || '普通'} ${settings.accountNumber || ''}`, 25, y);
    y += 5;
    doc.text(`口座名義: ${settings.accountHolder || ''}`, 25, y);
    y += 8;
  }
  
  // 備考
  if (data.notes) {
    if (y > PAGE_BOTTOM - 30) {
      startNewPage();
    }
    doc.setFontSize(10);
    doc.text('【備考】', 20, y);
    y += 5;
    const notes = data.notes.split('\n');
    notes.forEach(line => {
      if (y > PAGE_BOTTOM - 10) {
        startNewPage();
      }
      doc.text(line, 25, y);
      y += 5;
    });
  }
  
  // 会社情報・印鑑（最終ページ下部）
  const companyY = 255;
  doc.setFontSize(9);
  doc.setDrawColor(0);
  doc.line(20, companyY, 190, companyY);
  let cy = companyY + 5;
  const companyStartY = cy;
  if (settings.companyName) { doc.text(settings.companyName, 20, cy); cy += 4; }
  if (settings.postalCode || settings.address) {
    doc.text(`〒${settings.postalCode || ''} ${settings.address || ''}`, 20, cy); cy += 4;
  }
  if (settings.phone || settings.fax) {
    doc.text(`TEL: ${settings.phone || ''} FAX: ${settings.fax || ''}`, 20, cy); cy += 4;
  }
  if (settings.isInvoiceRegistered && settings.invoiceNumber) {
    doc.text(`登録番号: ${settings.invoiceNumber}`, 20, cy);
  }
  
  // 印鑑
  if (stampData) {
    try { doc.addImage(stampData, 'PNG', 160, companyStartY - 5, 25, 25); } catch(e) {}
  }
  
  // ページフッター（最終ページ）
  doc.setFontSize(9);
  doc.text(`${currentPage} / ${totalPages} ページ`, 105, 285, { align: 'center' });
  
  // ファイル名
  const filename = `請求書_${data.customerName}_${data.date}.pdf`;
  
  // モードによって処理を分岐
  if (mode === 'print') {
    // 印刷
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  } else if (mode === 'share') {
    // 共有（LINE、Gmail等）
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });
    
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `請求書 - ${data.customerName}様`,
          text: `請求番号: ${invoiceNumber}\n金額: ¥${data.total.toLocaleString()}`
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          alert('共有に失敗しました。ダウンロードします。');
          doc.save(filename);
        }
      }
    } else {
      alert('このブラウザは共有機能に対応していません。\nダウンロードします。');
      doc.save(filename);
    }
  } else {
    // ダウンロード（デフォルト）
    doc.save(filename);
  }
  
  // 請求書を保存
  const invoice = data;
  invoice.status = 'completed';
  invoice.id = Date.now();
  invoice.number = invoiceNumber;
  
  const invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
  invoices.push(invoice);
  localStorage.setItem('reform_app_invoices', JSON.stringify(invoices));
  
  closeInvOutputModal();
  
  if (mode === 'download') {
    alert(`PDF出力完了！\n請求番号: ${invoiceNumber}\nファイル: ${filename}`);
  } else if (mode === 'print') {
    alert(`印刷画面を開きました！\n請求番号: ${invoiceNumber}`);
  }
}

// Excel出力（請求書）
function exportInvoiceExcel() {
  const data = getInvoiceData();
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const invoiceNumber = generateInvoiceNumber();
  
  const wb = XLSX.utils.book_new();
  
  const rows = [
    ['請求書'],
    [],
    ['請求番号', invoiceNumber],
    ['請求日', data.date],
    ['お支払期限', data.dueDate],
    [],
    ['お客様名', data.customerName + ' 様'],
    ['件名', data.subject],
    [],
    ['ご請求金額（税込）', data.total],
    [],
    ['No.', '品名・作業内容', '数量', '単価', '金額'],
  ];
  
  let no = 1;
  
  rows.push(['【材料費】', '', '', '', '']);
  data.materials.forEach(m => {
    if (m.name) {
      const amount = (m.quantity || 0) * (m.price || 0);
      rows.push([no, m.name, m.quantity, m.price, amount]);
      no++;
    }
  });
  rows.push(['', '材料費 小計', '', '', data.materialSubtotal]);
  
  rows.push(['【作業費】', '', '', '', '']);
  data.works.forEach(w => {
    if (w.name || w.value) {
      const name = w.name || '作業';
      let amount, qty, price;
      
      if (data.workType === 'construction') {
        amount = w.value || 0;
        qty = w.unit || '1式';
        price = '';
      } else {
        amount = (w.quantity || 1) * (w.value || 0);
        qty = `${w.quantity || 1}日`;
        price = w.value || 0;
      }
      
      rows.push([no, name, qty, price, amount]);
      no++;
    }
  });
  rows.push(['', '作業費 小計', '', '', data.workSubtotal]);
  
  rows.push([]);
  rows.push(['', '', '', '小計', data.subtotal]);
  rows.push(['', '', '', `消費税（${data.taxRate}%）`, data.tax]);
  rows.push(['', '', '', '合計', data.total]);
  
  // 振込先
  rows.push([]);
  rows.push(['【お振込先】']);
  if (settings.bankName) {
    rows.push([`${settings.bankName} ${settings.branchName || ''}`]);
    rows.push([`${settings.accountType || '普通'} ${settings.accountNumber || ''}`]);
    rows.push([`口座名義: ${settings.accountHolder || ''}`]);
  }
  
  // 備考
  if (data.notes) {
    rows.push([]);
    rows.push(['【備考】']);
    data.notes.split('\n').forEach(line => {
      rows.push([line]);
    });
  }
  
  // 会社情報
  rows.push([]);
  rows.push([settings.companyName || '']);
  if (settings.postalCode || settings.address) {
    rows.push([`〒${settings.postalCode || ''} ${settings.address || ''}`]);
  }
  if (settings.phone) rows.push([`TEL: ${settings.phone}`]);
  if (settings.isInvoiceRegistered && settings.invoiceNumber) {
    rows.push([`登録番号: ${settings.invoiceNumber}`]);
  }
  
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 30 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, '請求書');
  
  const filename = `請求書_${data.customerName}_${data.date}.xlsx`;
  XLSX.writeFile(wb, filename);
  
  // 請求書を保存
  const invoice = data;
  invoice.status = 'completed';
  invoice.id = Date.now();
  invoice.number = invoiceNumber;
  
  const invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
  invoices.push(invoice);
  localStorage.setItem('reform_app_invoices', JSON.stringify(invoices));
  
  closeInvOutputModal();
  alert(`Excel出力完了！\n請求番号: ${invoiceNumber}\nファイル: ${filename}`);
}

// ==========================================
// 経費一覧機能
// ==========================================
