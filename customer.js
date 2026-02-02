// ==========================================
// 顧客管理
// Reform App Pro v0.91
// ==========================================

function loadCustomers() {
  const data = localStorage.getItem('reform_app_customers');
  if (data) {
    customers = JSON.parse(data);
  }
  renderCustomerList();
}

function saveCustomersToStorage() {
  localStorage.setItem('reform_app_customers', JSON.stringify(customers));
}

function renderCustomerList() {
  const container = document.getElementById('customerList');
  const search = document.getElementById('customerSearch')?.value?.toLowerCase() || '';
  
  let filtered = customers;
  if (search) {
    filtered = customers.filter(c => 
      c.name.toLowerCase().includes(search) ||
      (c.address && c.address.toLowerCase().includes(search)) ||
      (c.phone && c.phone.includes(search))
    );
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👤</div>
        <div>${search ? '該当する顧客がありません' : '顧客が登録されていません'}</div>
        <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">「＋ 新規顧客を追加」から登録してください</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(c => `
    <div class="master-item">
      <div class="master-item-header">
        <span class="master-item-name">👤 ${escapeHtml(c.name)}</span>
        <div>
          <button class="master-btn edit" onclick="editCustomer(${c.id})">編集</button>
          <button class="master-btn delete" onclick="deleteCustomer(${c.id})">削除</button>
        </div>
      </div>
      <div class="master-item-detail">
        ${c.address ? `<div>📍 ${escapeHtml(c.address)}</div>` : ''}
        ${c.phone ? `<div>📞 ${escapeHtml(c.phone)}</div>` : ''}
        ${c.memo ? `<div style="color: #6b7280; font-size: 11px; margin-top: 4px;">💬 ${escapeHtml(c.memo)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function filterCustomers() {
  renderCustomerList();
}

function showCustomerForm(customerId = null) {
  document.getElementById('editingCustomerId').value = customerId || '';
  document.getElementById('customerFormTitle').textContent = customerId ? '顧客を編集' : '顧客を追加';
  
  if (customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      document.getElementById('custName').value = customer.name || '';
      document.getElementById('custPostalCode').value = customer.postalCode || '';
      document.getElementById('custAddress').value = customer.address || '';
      document.getElementById('custPhone').value = customer.phone || '';
      document.getElementById('custEmail').value = customer.email || '';
      document.getElementById('custMemo').value = customer.memo || '';
    }
  } else {
    document.getElementById('custName').value = '';
    document.getElementById('custPostalCode').value = '';
    document.getElementById('custAddress').value = '';
    document.getElementById('custPhone').value = '';
    document.getElementById('custEmail').value = '';
    document.getElementById('custMemo').value = '';
  }
  
  document.getElementById('customerFormModal').classList.remove('hidden');
}

function closeCustomerForm() {
  document.getElementById('customerFormModal').classList.add('hidden');
}

function saveCustomer() {
  const name = document.getElementById('custName').value.trim();
  if (!name) {
    alert('お客様名を入力してください');
    return;
  }
  
  const customerId = document.getElementById('editingCustomerId').value;
  const customerData = {
    name: name,
    postalCode: document.getElementById('custPostalCode').value.trim(),
    address: document.getElementById('custAddress').value.trim(),
    phone: document.getElementById('custPhone').value.trim(),
    email: document.getElementById('custEmail').value.trim(),
    memo: document.getElementById('custMemo').value.trim()
  };
  
  if (customerId) {
    // 編集
    const index = customers.findIndex(c => c.id === parseInt(customerId));
    if (index !== -1) {
      customers[index] = { ...customers[index], ...customerData };
    }
  } else {
    // 新規追加
    customerData.id = Date.now();
    customerData.createdAt = new Date().toISOString();
    customers.push(customerData);
  }
  
  saveCustomersToStorage();
  renderCustomerList();
  closeCustomerForm();
  alert(customerId ? '顧客情報を更新しました！' : '顧客を追加しました！');
}

function editCustomer(id) {
  showCustomerForm(id);
}

function deleteCustomer(id) {
  const customer = customers.find(c => c.id === id);
  if (!customer) return;
  
  if (confirm(`「${customer.name}」を削除しますか？`)) {
    customers = customers.filter(c => c.id !== id);
    saveCustomersToStorage();
    renderCustomerList();
  }
}

// 顧客選択ピッカー（見積書・請求書用）
function showCustomerPicker(callback) {
  customerPickerCallback = callback;
  document.getElementById('customerPickerSearch').value = '';
  filterCustomerPicker();
  document.getElementById('customerPickerModal').classList.remove('hidden');
}

function closeCustomerPicker() {
  document.getElementById('customerPickerModal').classList.add('hidden');
  customerPickerCallback = null;
}

function filterCustomerPicker() {
  const search = document.getElementById('customerPickerSearch').value.toLowerCase();
  let filtered = customers;
  
  if (search) {
    filtered = customers.filter(c => 
      c.name.toLowerCase().includes(search) ||
      (c.address && c.address.toLowerCase().includes(search))
    );
  }
  
  const container = document.getElementById('customerPickerList');
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #9ca3af; padding: 20px;">
        ${search ? '該当する顧客がありません' : '顧客が登録されていません'}
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(c => `
    <div class="picker-item" onclick="pickCustomer(${c.id})" style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; cursor: pointer;">
      <div style="font-weight: 500;">👤 ${escapeHtml(c.name)}</div>
      ${c.address ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">📍 ${escapeHtml(c.address)}</div>` : ''}
      ${c.phone ? `<div style="font-size: 12px; color: #6b7280;">📞 ${escapeHtml(c.phone)}</div>` : ''}
    </div>
  `).join('');
}

function pickCustomer(id) {
  const customer = customers.find(c => c.id === id);
  if (customer && customerPickerCallback) {
    customerPickerCallback(customer);
  }
  closeCustomerPicker();
}

// 見積書用の顧客選択コールバック
function selectCustomerForEstimate(customer) {
  document.getElementById('estCustomerName').value = customer.name;
  if (customer.address) {
    document.getElementById('estCustomerAddress').value = 
      (customer.postalCode ? '〒' + customer.postalCode + ' ' : '') + customer.address;
    document.getElementById('estCustomerAddressGroup').style.display = 'block';
  } else {
    document.getElementById('estCustomerAddressGroup').style.display = 'none';
  }
}

// 請求書用の顧客選択コールバック
function selectCustomerForInvoice(customer) {
  document.getElementById('invCustomerName').value = customer.name;
  if (customer.address) {
    document.getElementById('invCustomerAddress').value = 
      (customer.postalCode ? '〒' + customer.postalCode + ' ' : '') + customer.address;
    document.getElementById('invCustomerAddressGroup').style.display = 'block';
  } else {
    document.getElementById('invCustomerAddressGroup').style.display = 'none';
  }
}
