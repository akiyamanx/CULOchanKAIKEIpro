// ==========================================
// 品名マスター管理
// Reform App Pro v0.91
// ==========================================

// ==========================================
// 品名マスター読込・保存
// ==========================================
function loadProductMaster() {
  const data = localStorage.getItem('reform_app_product_master');
  if (data) {
    productMaster = JSON.parse(data);
  } else {
    // 初期データ（products.jsのgetDefaultProductMasterを使用）
    productMaster = getDefaultProductMaster();
    saveProductMaster();
  }
}

function saveProductMaster() {
  localStorage.setItem('reform_app_product_master', JSON.stringify(productMaster));
}

function findMatchingProduct(text) {
  if (!text) return null;
  const normalizedText = text.toLowerCase().replace(/\s+/g, '');
  
  for (const product of productMaster) {
    // 正式名称で一致
    if (product.officialName.toLowerCase().replace(/\s+/g, '').includes(normalizedText) ||
        normalizedText.includes(product.officialName.toLowerCase().replace(/\s+/g, ''))) {
      return product;
    }
    // 別名で一致
    for (const alias of product.aliases) {
      if (alias.toLowerCase().replace(/\s+/g, '').includes(normalizedText) ||
          normalizedText.includes(alias.toLowerCase().replace(/\s+/g, ''))) {
        return product;
      }
    }
  }
  return null;
}

function addToProductMaster(name, category, aliases = []) {
  const newProduct = {
    id: Date.now(),
    officialName: name,
    category: category,
    aliases: aliases,
    defaultPrice: 0
  };
  productMaster.push(newProduct);
  saveProductMaster();
  return newProduct;
}

// ==========================================
// 品名マスター管理画面
// ==========================================
function getCategoryLabel(categoryValue) {
  // 新しいカテゴリシステム
  if (productCategories[categoryValue]) {
    return productCategories[categoryValue].name;
  }
  // 旧カテゴリシステム（互換性維持）
  const allCategories = [...categories.material, ...categories.expense];
  const found = allCategories.find(c => c.value === categoryValue);
  return found ? found.label : categoryValue;
}

function filterMaster() {
  const search = document.getElementById('masterSearch').value.toLowerCase();
  const categoryFilter = document.getElementById('masterCategoryFilter').value;
  
  let filtered = productMaster;
  
  if (search) {
    filtered = filtered.filter(p => 
      p.officialName.toLowerCase().includes(search) ||
      (p.subCategory && p.subCategory.toLowerCase().includes(search)) ||
      (p.aliases && p.aliases.some(a => a.toLowerCase().includes(search)))
    );
  }
  
  if (categoryFilter) {
    filtered = filtered.filter(p => p.category === categoryFilter);
  }
  
  // 商品数を更新
  const countEl = document.getElementById('masterCount');
  if (countEl) {
    countEl.textContent = `${filtered.length}件の商品（全${productMaster.length}件）`;
  }
  
  renderMasterList(filtered);
}

// 品名マスターを初期データにリセット
// 新しい商品だけを追加（既存データを保持）
function addNewDefaultProducts() {
  const defaultProducts = getDefaultProductMaster();
  const existingNames = new Set(productMaster.map(p => p.officialName));
  
  let addedCount = 0;
  let maxId = Math.max(...productMaster.map(p => p.id), 0);
  
  defaultProducts.forEach(product => {
    if (!existingNames.has(product.officialName)) {
      productMaster.push({
        ...product,
        id: ++maxId
      });
      addedCount++;
    }
  });
  
  if (addedCount > 0) {
    saveProductMaster();
    filterMaster();
    alert(`✅ 新しい商品を追加しました！\n\n追加: ${addedCount}件\n合計: ${productMaster.length}件\n\n※ 既存の商品と価格設定はそのまま保持されています。`);
  } else {
    alert('追加できる新しい商品はありませんでした。\n\n全ての初期商品が既に登録されています。');
  }
}

// 完全リセット（2段階確認）
function resetProductMaster() {
  // 1段階目
  if (!confirm('⚠️ 品名マスターを初期データにリセットしますか？\n\n【警告】\n・追加した商品は削除されます\n・編集した価格は元に戻ります\n・この操作は取り消せません')) {
    return;
  }
  
  // 2段階目（より強い確認）
  const currentCount = productMaster.length;
  const priceSetCount = productMaster.filter(p => p.defaultPrice > 0).length;
  
  if (!confirm(`【最終確認】本当にリセットしますか？\n\n現在のデータ:\n・商品数: ${currentCount}件\n・価格設定済み: ${priceSetCount}件\n\nこれらが全て失われます。\n\n本当によろしいですか？`)) {
    return;
  }
  
  productMaster = getDefaultProductMaster();
  saveProductMaster();
  filterMaster();
  alert('✅ 品名マスターを初期データにリセットしました！\n\n' + productMaster.length + '件の商品が登録されています。');
}

function renderMasterList(items = productMaster) {
  const container = document.getElementById('masterList');
  
  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #9ca3af; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 8px;">📦</div>
        <div>品名が登録されていません</div>
      </div>
    `;
    return;
  }
  
  // サブカテゴリでグループ化
  const grouped = {};
  items.forEach(p => {
    const key = p.subCategory || p.category || 'その他';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });
  
  let html = '';
  for (const [groupName, products] of Object.entries(grouped)) {
    html += `<div style="font-size: 12px; color: #6b7280; padding: 12px 4px 6px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">${groupName}（${products.length}件）</div>`;
    html += products.map(product => `
      <div class="master-item" style="padding: 10px; border-bottom: 1px solid #f3f4f6;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1;">
            <div class="master-item-name" style="font-size: 14px;">${product.officialName}</div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">
              ${product.size || ''} 
              ${product.defaultPrice > 0 ? `<span style="color: #3b82f6;">¥${product.defaultPrice.toLocaleString()}</span>` : '<span style="color: #d1d5db;">価格未設定</span>'}
            </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="master-btn edit" style="padding: 6px 10px; font-size: 11px;" onclick="editMasterItem(${product.id})">編集</button>
            <button class="master-btn delete" style="padding: 6px 10px; font-size: 11px;" onclick="deleteMasterItem(${product.id})">削除</button>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  container.innerHTML = html;
}

function showAddMasterForm() {
  document.getElementById('masterModalTitle').textContent = '品名を追加';
  document.getElementById('masterEditId').value = '';
  document.getElementById('masterEditName').value = '';
  document.getElementById('masterEditCategory').value = 'pipe';
  document.getElementById('masterEditPrice').value = '';
  editingAliases = [];
  renderAliases();
  document.getElementById('masterModal').classList.remove('hidden');
}

function editMasterItem(id) {
  const product = productMaster.find(p => p.id === id);
  if (!product) return;
  
  document.getElementById('masterModalTitle').textContent = '品名を編集';
  document.getElementById('masterEditId').value = id;
  document.getElementById('masterEditName').value = product.officialName;
  document.getElementById('masterEditCategory').value = product.category;
  document.getElementById('masterEditPrice').value = product.defaultPrice || '';
  editingAliases = [...product.aliases];
  renderAliases();
  document.getElementById('masterModal').classList.remove('hidden');
}

function closeMasterModal() {
  document.getElementById('masterModal').classList.add('hidden');
}

function renderAliases() {
  const container = document.getElementById('aliasContainer');
  container.innerHTML = editingAliases.map((alias, index) => `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
      <span class="alias-tag" style="flex: 1;">${alias}</span>
      <button class="master-btn delete" style="flex: 0; width: auto; padding: 4px 8px;" onclick="removeAlias(${index})">×</button>
    </div>
  `).join('');
}

function addAlias() {
  const input = document.getElementById('newAliasInput');
  const alias = input.value.trim();
  if (alias && !editingAliases.includes(alias)) {
    editingAliases.push(alias);
    renderAliases();
    input.value = '';
  }
}

function removeAlias(index) {
  editingAliases.splice(index, 1);
  renderAliases();
}

function saveMasterItem() {
  const id = document.getElementById('masterEditId').value;
  const name = document.getElementById('masterEditName').value.trim();
  const category = document.getElementById('masterEditCategory').value;
  const price = parseInt(document.getElementById('masterEditPrice').value) || 0;
  
  if (!name) {
    alert('正式名称を入力してください');
    return;
  }
  
  if (id) {
    // 編集
    const product = productMaster.find(p => p.id === parseInt(id));
    if (product) {
      product.officialName = name;
      product.category = category;
      product.defaultPrice = price;
      product.aliases = [...editingAliases];
    }
  } else {
    // 新規追加
    productMaster.push({
      id: Date.now(),
      officialName: name,
      category: category,
      defaultPrice: price,
      aliases: [...editingAliases]
    });
  }
  
  saveProductMaster();
  closeMasterModal();
  filterMaster();
  alert('保存しました！');
}

function deleteMasterItem(id) {
  if (!confirm('この品名を削除しますか？')) return;
  
  productMaster = productMaster.filter(p => p.id !== id);
  saveProductMaster();
  filterMaster();
}
