// ==========================================
// データ管理画面
// Reform App Pro v0.95.1
// ==========================================
// v0.95.1改善:
//   - 保存データ一覧に時刻表示を追加
//   - formatDateTime関数を追加（日付+時刻）
//   - createdAtを使って保存した時刻を表示
// ==========================================


function initDataScreen() {
  switchDataTab('estimates');
}

function switchDataTab(tab) {
  currentDataTab = tab;
  
  document.getElementById('dataTabEstimates').classList.toggle('active', tab === 'estimates');
  document.getElementById('dataTabInvoices').classList.toggle('active', tab === 'invoices');
  document.getElementById('dataTabMaterials').classList.toggle('active', tab === 'materials');
  
  document.getElementById('dataSearch').value = '';
  filterDataList();
}

function filterDataList() {
  const search = document.getElementById('dataSearch').value.toLowerCase();
  
  if (currentDataTab === 'estimates') {
    renderEstimatesList(search);
  } else if (currentDataTab === 'invoices') {
    renderInvoicesList(search);
  } else if (currentDataTab === 'materials') {
    renderMaterialsDataList(search);
  }
}

// ==========================================
// v0.95.1追加: 日付+時刻フォーマット関数
// ==========================================

/**
 * 日時を「2026年2月5日 18:34」形式でフォーマット
 * @param {string|Date} dateTime - ISO形式の日時文字列またはDateオブジェクト
 * @returns {string} フォーマットされた日時文字列
 */
function formatDateTime(dateTime) {
  if (!dateTime) return '';
  
  const d = new Date(dateTime);
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

/**
 * 日時を短縮形式「2/5 18:34」でフォーマット（一覧用）
 * @param {string|Date} dateTime - ISO形式の日時文字列またはDateオブジェクト
 * @returns {string} フォーマットされた日時文字列
 */
function formatDateTimeShort(dateTime) {
  if (!dateTime) return '';
  
  const d = new Date(dateTime);
  if (isNaN(d.getTime())) return '';
  
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  
  return `${month}/${day} ${hours}:${minutes}`;
}


// ==========================================
// 見積書一覧
// ==========================================
function renderEstimatesList(search = '') {
  let estimates = JSON.parse(localStorage.getItem('reform_app_estimates') || '[]');
  
  if (search) {
    estimates = estimates.filter(e => 
      (e.customerName || '').toLowerCase().includes(search) ||
      (e.subject || '').toLowerCase().includes(search) ||
      (e.number || '').toLowerCase().includes(search)
    );
  }
  
  estimates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  const container = document.getElementById('dataListContainer');
  
  if (estimates.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div>見積書がありません</div>
      </div>
    `;
    return;
  }
  
  // v0.95.1: createdAtで保存時刻を表示
  container.innerHTML = estimates.map(e => `
    <div class="data-list-item" onclick="viewEstimateDetail('${e.id}')">
      <div class="data-list-item-header">
        <span class="data-list-item-number">${e.number || '番号なし'}</span>
        <span class="data-list-item-status ${e.status || 'draft'}">${e.status === 'completed' ? '出力済' : '下書き'}</span>
      </div>
      <div class="data-list-item-title">${e.customerName || '顧客名なし'}</div>
      <div class="data-list-item-detail">${e.subject || '件名なし'} | ${formatDate(e.date)}</div>
      <div class="data-list-item-time">保存: ${formatDateTimeShort(e.createdAt)}</div>
      <div class="data-list-item-amount">¥${(e.total || 0).toLocaleString()}</div>
    </div>
  `).join('');
}


// ==========================================
// 請求書一覧
// ==========================================
function renderInvoicesList(search = '') {
  let invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
  
  if (search) {
    invoices = invoices.filter(i => 
      (i.customerName || '').toLowerCase().includes(search) ||
      (i.subject || '').toLowerCase().includes(search) ||
      (i.number || '').toLowerCase().includes(search)
    );
  }
  
  invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  const container = document.getElementById('dataListContainer');
  
  if (invoices.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📄</div>
        <div>請求書がありません</div>
      </div>
    `;
    return;
  }
  
  // v0.95.1: createdAtで保存時刻を表示
  container.innerHTML = invoices.map(i => `
    <div class="data-list-item" onclick="viewInvoiceDetail('${i.id}')">
      <div class="data-list-item-header">
        <span class="data-list-item-number">${i.number || '番号なし'}</span>
        <span class="data-list-item-status ${i.status || 'draft'}">${i.status === 'completed' ? '出力済' : '下書き'}</span>
      </div>
      <div class="data-list-item-title">${i.customerName || '顧客名なし'}</div>
      <div class="data-list-item-detail">${i.subject || '件名なし'} | ${formatDate(i.date)}</div>
      <div class="data-list-item-time">保存: ${formatDateTimeShort(i.createdAt)}</div>
      <div class="data-list-item-amount">¥${(i.total || 0).toLocaleString()}</div>
    </div>
  `).join('');
}


// ==========================================
// 材料一覧
// ==========================================
function renderMaterialsDataList(search = '') {
  let materials = JSON.parse(localStorage.getItem('reform_app_materials') || '[]');
  
  if (search) {
    materials = materials.filter(m => 
      (m.name || '').toLowerCase().includes(search) ||
      (m.storeName || '').toLowerCase().includes(search)
    );
  }
  
  materials.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  const container = document.getElementById('dataListContainer');
  
  if (materials.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <div>材料データがありません</div>
      </div>
    `;
    return;
  }
  
  // v0.95.1: createdAtで保存時刻を表示
  container.innerHTML = materials.map(m => `
    <div class="data-list-item">
      <div class="data-list-item-title">${m.name || '名称なし'}</div>
      <div class="data-list-item-detail">
        ${formatDate(m.date)} | ${m.storeName || '店舗不明'} | ${getCategoryLabel(m.category)}
      </div>
      <div class="data-list-item-detail">
        数量: ${m.quantity || 1} | 単価: ¥${(m.price || 0).toLocaleString()}
      </div>
      <div class="data-list-item-time">保存: ${formatDateTimeShort(m.createdAt)}</div>
      <div class="data-list-item-amount">¥${((m.price || 0) * (m.quantity || 1)).toLocaleString()}</div>
    </div>
  `).join('');
}


// ==========================================
// 詳細表示
// ==========================================
function viewEstimateDetail(estimateId) {
  const estimates = JSON.parse(localStorage.getItem('reform_app_estimates') || '[]');
  const estimate = estimates.find(e => String(e.id) === String(estimateId));
  
  if (!estimate) {
    alert('見積書が見つかりません');
    return;
  }
  
  // 見積書作成画面に読み込んで遷移
  estimateMaterials = (estimate.materials || []).map(m => ({...m, id: Date.now() + Math.random()}));
  estimateWorks = (estimate.works || []).map(w => ({...w, id: Date.now() + Math.random()}));
  workType = estimate.workType || 'construction';
  
  showScreen('estimate');
  
  document.getElementById('estCustomerName').value = estimate.customerName || '';
  document.getElementById('estSubject').value = estimate.subject || '';
  document.getElementById('estDate').value = estimate.date || '';
  document.getElementById('estValidDate').value = estimate.validDate || '';
  document.getElementById('estNotes').value = estimate.notes || '';
  
  setWorkType(workType);
  renderEstimateMaterials();
  renderEstimateWorks();
  calculateEstimateTotal();
}

function viewInvoiceDetail(invoiceId) {
  const invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
  const invoice = invoices.find(i => String(i.id) === String(invoiceId));
  
  if (!invoice) {
    alert('請求書が見つかりません');
    return;
  }
  
  // 請求書作成画面に読み込んで遷移
  invoiceMaterials = (invoice.materials || []).map(m => ({...m, id: Date.now() + Math.random()}));
  invoiceWorks = (invoice.works || []).map(w => ({...w, id: Date.now() + Math.random()}));
  invWorkType = invoice.workType || 'construction';
  
  showScreen('invoice');
  
  document.getElementById('invCustomerName').value = invoice.customerName || '';
  document.getElementById('invSubject').value = invoice.subject || '';
  document.getElementById('invDate').value = invoice.date || '';
  document.getElementById('invDueDate').value = invoice.dueDate || '';
  document.getElementById('invNotes').value = invoice.notes || '';
  
  setInvWorkType(invWorkType);
  renderInvoiceMaterials();
  renderInvoiceWorks();
  calculateInvoiceTotal();
}

// ==========================================
