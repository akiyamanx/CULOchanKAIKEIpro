// ==========================================
// レシート読込 - コア機能
// Reform App Pro v0.93
// ==========================================
// 画面初期化、画像管理、品目UI、保存機能
// + チェックボックス、現場割り当て機能（v0.92追加）
// + 勘定科目カスタマイズ対応（v0.93追加）
// 
// 依存ファイル:
//   - globals.js (receiptItems, receiptImageData, multiImageDataUrls, categories, productMaster, projects)
//   - receipt-ocr.js (runOCR)
//   - receipt-ai.js (runAiOcr)
// ==========================================


// ==========================================
// 画面初期化
// ==========================================
function initReceiptScreen() {
  // 今日の日付をセット
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('receiptDate').value = today;
  // 複数画像をリセット
  multiImageDataUrls = [];
  receiptImageData = null;
  if (document.getElementById('multiImageArea')) {
    document.getElementById('multiImageArea').style.display = 'none';
    document.getElementById('multiImageThumbnails').innerHTML = '';
  }
  if (document.getElementById('imagePreviewArea')) {
    document.getElementById('imagePreviewArea').style.display = 'block';
  }
  if (document.getElementById('imagePlaceholder')) {
    document.getElementById('imagePlaceholder').style.display = 'block';
  }
  if (document.getElementById('imagePreview')) {
    document.getElementById('imagePreview').style.display = 'none';
  }
  // 現場セレクトボックスを初期化
  initProjectSelect();
  // 最初の品目を追加
  addReceiptItem();
}


// ==========================================
// 現場（プロジェクト）管理
// ==========================================
function initProjectSelect() {
  const select = document.getElementById('projectSelect');
  if (!select) return;
  
  // projectsがなければ初期化
  if (typeof projects === 'undefined' || !Array.isArray(projects)) {
    window.projects = loadProjects();
  }
  
  // セレクトボックスを更新
  select.innerHTML = '<option value="">現場を選択...</option>';
  projects.forEach(p => {
    select.innerHTML += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
  });
}

function loadProjects() {
  const saved = localStorage.getItem('reform_app_projects');
  if (saved) {
    return JSON.parse(saved);
  }
  // デフォルトの現場リスト
  return ['現場A', '現場B', '自宅用', '在庫'];
}

function saveProjects() {
  localStorage.setItem('reform_app_projects', JSON.stringify(projects));
}

function addProject(name) {
  if (!name || projects.includes(name)) return false;
  projects.push(name);
  saveProjects();
  initProjectSelect();
  return true;
}

// ★ 新規現場入力欄から追加する関数
function addNewProject() {
  const input = document.getElementById('newProjectName');
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    alert('現場名を入力してください');
    return;
  }
  if (addProject(name)) {
    // セレクトボックスで新しい現場を選択
    const select = document.getElementById('projectSelect');
    if (select) select.value = name;
    input.value = '';
    alert(`「${name}」を追加しました`);
  } else {
    alert('同じ名前の現場が既に存在します');
  }
}


// ==========================================
// 画像選択・管理
// ==========================================
function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // 複数画像モードをリセットして単一画像モードに
  multiImageDataUrls = [];
  document.getElementById('multiImageArea').style.display = 'none';
  document.getElementById('multiImageThumbnails').innerHTML = '';
  
  const reader = new FileReader();
  reader.onload = (e) => {
    receiptImageData = e.target.result;
    document.getElementById('imagePreview').src = receiptImageData;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
    // OCRボタンを有効化
    document.getElementById('ocrBtn').disabled = false;
    // AIボタンを有効化（APIキーがあれば）
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    document.getElementById('aiBtn').disabled = !settings.geminiApiKey;
    if (!settings.geminiApiKey) {
      document.getElementById('aiBtn').title = '設定画面でGemini APIキーを入力してください';
    }
  };
  reader.readAsDataURL(file);
  // inputをリセット（同じファイルを再選択できるように）
  event.target.value = '';
}

// 画像を追加（1枚ずつ追加する方式）
function handleAddImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // 最大3枚まで
  if (multiImageDataUrls.length >= 3) {
    alert('最大3枚まで追加できます');
    event.target.value = '';
    return;
  }
  
  // 最初の追加の場合、既存の単一画像があれば複数画像モードに移行
  if (multiImageDataUrls.length === 0 && receiptImageData) {
    // 既存の画像を複数画像配列に追加
    multiImageDataUrls.push(receiptImageData);
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    multiImageDataUrls.push(e.target.result);
    
    // 単一画像プレビューを非表示
    document.getElementById('imagePreviewArea').style.display = 'none';
    document.getElementById('multiImageArea').style.display = 'block';
    
    renderMultiImageThumbnails();
    
    // ボタン有効化
    document.getElementById('ocrBtn').disabled = true; // OCRは単一のみ
    const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    document.getElementById('aiBtn').disabled = !settings.geminiApiKey;
  };
  reader.readAsDataURL(file);
  // inputをリセット
  event.target.value = '';
}

// 複数画像サムネイル表示
function renderMultiImageThumbnails() {
  const container = document.getElementById('multiImageThumbnails');
  container.innerHTML = '';
  
  multiImageDataUrls.forEach((dataUrl, index) => {
    const thumb = document.createElement('div');
    thumb.style.cssText = 'position: relative; width: 80px; height: 80px;';
    thumb.innerHTML = `
      <img src="${dataUrl}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid #e5e7eb;">
      <div onclick="removeMultiImage(${index})" style="position: absolute; top: -8px; right: -8px; width: 24px; height: 24px; background: #ef4444; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">×</div>
      <div style="position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.6); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${index + 1}枚目</div>
    `;
    container.appendChild(thumb);
  });
  
  // 追加ボタン（3枚未満の場合）
  if (multiImageDataUrls.length < 3) {
    const addBtn = document.createElement('div');
    addBtn.style.cssText = 'width: 80px; height: 80px; border: 2px dashed #d1d5db; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #9ca3af; font-size: 24px;';
    addBtn.innerHTML = '＋';
    addBtn.onclick = () => document.getElementById('receiptAddImage').click();
    container.appendChild(addBtn);
  }
}

// 複数画像から削除
function removeMultiImage(index) {
  multiImageDataUrls.splice(index, 1);
  
  if (multiImageDataUrls.length === 0) {
    // 全部削除したら単一画像モードに戻る
    document.getElementById('multiImageArea').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'block';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('aiBtn').disabled = true;
    document.getElementById('ocrBtn').disabled = true;
    receiptImageData = null;
  } else if (multiImageDataUrls.length === 1) {
    // 1枚だけになったら単一画像モードに戻る
    receiptImageData = multiImageDataUrls[0];
    document.getElementById('multiImageArea').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
    document.getElementById('imagePreview').src = receiptImageData;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'none';
    document.getElementById('ocrBtn').disabled = false;
    multiImageDataUrls = [];
  } else {
    renderMultiImageThumbnails();
  }
}

// 全画像クリア
function clearAllImages() {
  multiImageDataUrls = [];
  receiptImageData = null;
  document.getElementById('multiImageArea').style.display = 'none';
  document.getElementById('multiImageThumbnails').innerHTML = '';
  document.getElementById('imagePreviewArea').style.display = 'block';
  document.getElementById('imagePlaceholder').style.display = 'block';
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('aiBtn').disabled = true;
  document.getElementById('ocrBtn').disabled = true;
}

// 複数画像を縦に結合
async function mergeImages(dataUrls) {
  const images = await Promise.all(
    dataUrls.map(dataUrl => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = dataUrl;
      });
    })
  );
  
  // 最大幅を基準にする
  const maxWidth = Math.max(...images.map(img => img.width));
  const totalHeight = images.reduce((sum, img) => {
    // アスペクト比を維持してリサイズした高さを計算
    const scale = maxWidth / img.width;
    return sum + (img.height * scale);
  }, 0);
  
  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  
  // 白背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 縦に並べて描画
  let y = 0;
  for (const img of images) {
    const scale = maxWidth / img.width;
    const scaledHeight = img.height * scale;
    ctx.drawImage(img, 0, y, maxWidth, scaledHeight);
    y += scaledHeight;
  }
  
  // base64で返す（品質0.85で圧縮）
  return canvas.toDataURL('image/jpeg', 0.85);
}


// ==========================================
// 品目リスト操作
// ==========================================
function addReceiptItem() {
  const itemId = Date.now();
  receiptItems.push({
    id: itemId,
    name: '',
    quantity: 1,
    price: 0,
    type: 'material', // material, expense, exclude
    category: categories.material.length > 0 ? categories.material[0].value : '',
    checked: false,      // v0.92追加: チェック状態
    projectName: ''      // v0.92追加: 割り当て現場
  });
  renderReceiptItems();
}

function removeReceiptItem(itemId) {
  receiptItems = receiptItems.filter(item => item.id !== itemId);
  renderReceiptItems();
  updateReceiptTotal();
}

function updateReceiptItem(itemId, field, value) {
  const item = receiptItems.find(i => i.id === itemId);
  if (item) {
    item[field] = value;
    if (field === 'type') {
      // タイプが変わったらカテゴリを先頭のものにリセット
      const catList = categories[value];
      item.category = catList && catList.length > 0 ? catList[0].value : '';
      renderReceiptItems();
    }
    updateReceiptTotal();
  }
}

function renderReceiptItems() {
  const container = document.getElementById('receiptItemsList');
  container.innerHTML = '';
  
  // 割り当てセクションの表示制御（品目が2つ以上あるとき表示）
  const assignSection = document.getElementById('assignSection');
  if (assignSection) {
    assignSection.style.display = receiptItems.length >= 1 ? 'block' : 'none';
  }
  
  receiptItems.forEach((item, index) => {
    const categoryOptions = item.type === 'material' ? categories.material :
                           item.type === 'expense' ? categories.expense : [];
    
    // OCRマッチング情報
    let matchInfo = '';
    if (item.originalName && item.originalName !== item.name) {
      matchInfo = `
        <div class="name-suggest">
          <div class="name-suggest-title">✅ 品名マスターと一致</div>
          <div style="font-size: 11px; color: #6b7280;">
            「${item.originalName}」→「${item.name}」に変換
          </div>
        </div>
      `;
    } else if (item.originalName && !item.matched) {
      matchInfo = `
        <div class="name-suggest" style="background: #fef3c7; border-color: #f59e0b;">
          <div class="name-suggest-title" style="color: #d97706;">⚠️ 新しい品名</div>
          <button class="master-btn edit" style="width: 100%; margin-top: 4px;" 
            onclick="registerToMaster(${item.id}, '${escapeHtml(item.name)}', '${item.category}')">
            品名マスターに登録
          </button>
        </div>
      `;
    }
    
    // 現場割り当て表示（v0.92追加）
    const projectBadge = item.projectName ? 
      `<span class="project-badge">📍 ${escapeHtml(item.projectName)}</span>` : '';
    
    const itemHtml = `
      <div class="receipt-item ${item.checked ? 'checked' : ''}" data-id="${item.id}">
        <div class="receipt-item-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" class="item-checkbox" 
              ${item.checked ? 'checked' : ''} 
              onchange="toggleItemCheck(${item.id}, this.checked)"
              style="width: 20px; height: 20px; accent-color: #3b82f6; cursor: pointer;">
            <span class="receipt-item-number">#${index + 1}</span>
            ${projectBadge}
          </div>
          <button class="receipt-item-delete" onclick="removeReceiptItem(${item.id})">削除</button>
        </div>
        <div class="receipt-item-labels" style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-bottom: 4px;">
          <span style="font-size: 11px; color: #6b7280; padding-left: 4px;">品名</span>
          <span style="font-size: 11px; color: #6b7280; padding-left: 4px;">数量</span>
          <span style="font-size: 11px; color: #6b7280; padding-left: 4px;">金額</span>
        </div>
        <div class="receipt-item-row">
          <div class="suggest-container">
            <input type="text" placeholder="品名" value="${escapeHtml(item.name)}" 
              oninput="showSuggestions(this, ${item.id})"
              onfocus="showSuggestions(this, ${item.id})"
              onblur="setTimeout(() => hideSuggestions(${item.id}), 200)"
              onchange="updateReceiptItem(${item.id}, 'name', this.value)">
            <div class="suggest-dropdown" id="suggest-${item.id}"></div>
          </div>
          <input type="number" placeholder="数量" value="${item.quantity}" min="1"
            onchange="updateReceiptItem(${item.id}, 'quantity', parseInt(this.value) || 1)">
          <input type="number" placeholder="金額" value="${item.price || ''}" 
            onchange="updateReceiptItem(${item.id}, 'price', parseInt(this.value) || 0)">
        </div>
        ${matchInfo}
        <div class="receipt-item-type">
          <button class="type-btn ${item.type === 'material' ? 'active' : ''}" 
            onclick="updateReceiptItem(${item.id}, 'type', 'material')">材料</button>
          <button class="type-btn ${item.type === 'expense' ? 'active' : ''}" 
            onclick="updateReceiptItem(${item.id}, 'type', 'expense')">経費</button>
          <button class="type-btn ${item.type === 'exclude' ? 'active' : ''}" 
            onclick="updateReceiptItem(${item.id}, 'type', 'exclude')">除外</button>
        </div>
        ${item.type !== 'exclude' ? `
          <div class="receipt-item-category">
            <select onchange="updateReceiptItem(${item.id}, 'category', this.value)">
              ${categoryOptions.map(opt => 
                `<option value="${opt.value}" ${item.category === opt.value ? 'selected' : ''}>${opt.label}</option>`
              ).join('')}
            </select>
          </div>
        ` : ''}
      </div>
    `;
    container.innerHTML += itemHtml;
  });
  
  // 割り当て状況を更新
  updateAssignedCount();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}


// ==========================================
// チェックボックス・現場割り当て（v0.92追加）
// ==========================================
function toggleItemCheck(itemId, checked) {
  const item = receiptItems.find(i => i.id === itemId);
  if (item) {
    item.checked = checked;
    // チェック状態のスタイル更新
    const itemEl = document.querySelector(`.receipt-item[data-id="${itemId}"]`);
    if (itemEl) {
      itemEl.classList.toggle('checked', checked);
    }
    // 全選択チェックボックスの状態を更新
    updateSelectAllCheckbox();
    updateAssignedCount();
  }
}

function toggleAllCheckboxes(checked) {
  receiptItems.forEach(item => {
    item.checked = checked;
  });
  renderReceiptItems();
}

function updateSelectAllCheckbox() {
  const selectAll = document.getElementById('selectAllItems');
  if (selectAll) {
    const allChecked = receiptItems.length > 0 && receiptItems.every(item => item.checked);
    const someChecked = receiptItems.some(item => item.checked);
    selectAll.checked = allChecked;
    selectAll.indeterminate = someChecked && !allChecked;
  }
}

function updateAssignedCount() {
  const countEl = document.getElementById('assignedCount');
  if (!countEl) return;
  
  const checkedCount = receiptItems.filter(i => i.checked).length;
  const assignedCount = receiptItems.filter(i => i.projectName).length;
  
  let text = '';
  if (checkedCount > 0) {
    text += `✓ ${checkedCount}件選択中`;
  }
  if (assignedCount > 0) {
    text += text ? ' / ' : '';
    text += `📍 ${assignedCount}件割当済`;
  }
  countEl.textContent = text;
}

function assignSelectedItems() {
  const select = document.getElementById('projectSelect');
  const projectName = select.value;
  
  if (!projectName) {
    // 新規現場を追加するか確認
    const newProject = prompt('現場名を入力してください（新規追加も可）:');
    if (newProject) {
      addProject(newProject);
      select.value = newProject;
      assignSelectedItems(); // 再帰呼び出し
    }
    return;
  }
  
  const checkedItems = receiptItems.filter(i => i.checked);
  if (checkedItems.length === 0) {
    alert('品目を選択してください');
    return;
  }
  
  checkedItems.forEach(item => {
    item.projectName = projectName;
    item.checked = false; // 割り当て後はチェックを外す
  });
  
  renderReceiptItems();
  alert(`${checkedItems.length}件を「${projectName}」に割り当てました`);
}

function clearSelectedAssignments() {
  const checkedItems = receiptItems.filter(i => i.checked);
  
  if (checkedItems.length === 0) {
    // チェックがない場合は全部の割り当てを解除するか確認
    if (confirm('すべての現場割り当てを解除しますか？')) {
      receiptItems.forEach(item => {
        item.projectName = '';
      });
      renderReceiptItems();
    }
    return;
  }
  
  checkedItems.forEach(item => {
    item.projectName = '';
    item.checked = false;
  });
  
  renderReceiptItems();
  alert(`${checkedItems.length}件の割り当てを解除しました`);
}


// ==========================================
// サジェスト機能
// ==========================================
function showSuggestions(input, itemId) {
  const value = input.value.toLowerCase();
  const dropdown = document.getElementById(`suggest-${itemId}`);
  
  if (!value || value.length < 1) {
    dropdown.classList.remove('show');
    return;
  }
  
  // 品名マスターから検索
  const matches = productMaster.filter(p => 
    p.officialName.toLowerCase().includes(value) ||
    p.aliases.some(a => a.toLowerCase().includes(value))
  ).slice(0, 5);
  
  if (matches.length === 0) {
    dropdown.classList.remove('show');
    return;
  }
  
  dropdown.innerHTML = matches.map(p => `
    <div class="suggest-item" onclick="selectSuggestion(${itemId}, '${escapeHtml(p.officialName)}', '${p.category}', ${p.defaultPrice || 0})">
      <span class="suggest-item-price">${p.defaultPrice ? '¥' + p.defaultPrice.toLocaleString() : ''}</span>
      <div class="suggest-item-name">${p.officialName}</div>
      <div class="suggest-item-category">${getCategoryLabel(p.category)}</div>
    </div>
  `).join('');
  
  dropdown.classList.add('show');
}

function hideSuggestions(itemId) {
  const dropdown = document.getElementById(`suggest-${itemId}`);
  if (dropdown) {
    dropdown.classList.remove('show');
  }
}

function selectSuggestion(itemId, name, category, price) {
  const item = receiptItems.find(i => i.id === itemId);
  if (item) {
    item.name = name;
    item.category = category;
    if (price > 0 && !item.price) {
      item.price = price;
    }
    // カテゴリに応じてタイプを設定
    item.type = categories.expense.find(c => c.value === category) ? 'expense' : 'material';
    item.matched = true;
    renderReceiptItems();
    updateReceiptTotal();
  }
}

function registerToMaster(itemId, name, category) {
  const item = receiptItems.find(i => i.id === itemId);
  if (!item) return;
  
  const officialName = prompt('正式名称を入力してください:', name);
  if (!officialName) return;
  
  const aliases = [];
  if (item.originalName && item.originalName !== officialName) {
    aliases.push(item.originalName);
  }
  if (name !== officialName && !aliases.includes(name)) {
    aliases.push(name);
  }
  
  addToProductMaster(officialName, category, aliases);
  
  // 品目を更新
  item.name = officialName;
  item.matched = true;
  renderReceiptItems();
  
  alert(`「${officialName}」を品名マスターに登録しました！`);
}


// ==========================================
// 合計計算
// ==========================================
function updateReceiptTotal() {
  const total = receiptItems
    .filter(item => item.type !== 'exclude')
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);
  document.getElementById('receiptTotal').textContent = '¥' + total.toLocaleString();
}


// ==========================================
// 保存・リセット
// ==========================================
function saveReceipt() {
  const storeName = document.getElementById('receiptStoreName').value;
  const date = document.getElementById('receiptDate').value;
  const saveImage = document.getElementById('saveReceiptImage').checked;
  
  if (!storeName) {
    alert('店名を入力してください');
    return;
  }
  
  if (receiptItems.filter(i => i.type !== 'exclude' && i.name).length === 0) {
    alert('品目を1つ以上入力してください');
    return;
  }
  
  // 材料と経費に分けて保存
  const materials = receiptItems.filter(i => i.type === 'material' && i.name);
  const expenses = receiptItems.filter(i => i.type === 'expense' && i.name);
  
  // 材料を保存
  if (materials.length > 0) {
    const savedMaterials = JSON.parse(localStorage.getItem('reform_app_materials') || '[]');
    materials.forEach(m => {
      savedMaterials.push({
        id: Date.now() + Math.random(),
        name: m.name,
        price: m.price,
        quantity: m.quantity,
        category: m.category,
        projectName: m.projectName || '',  // v0.92追加
        storeName: storeName,
        date: date,
        createdAt: new Date().toISOString()
      });
    });
    localStorage.setItem('reform_app_materials', JSON.stringify(savedMaterials));
  }
  
  // 経費を保存
  if (expenses.length > 0) {
    const savedExpenses = JSON.parse(localStorage.getItem('reform_app_expenses') || '[]');
    expenses.forEach(e => {
      savedExpenses.push({
        id: Date.now() + Math.random(),
        name: e.name,
        price: e.price * e.quantity,
        category: e.category,
        projectName: e.projectName || '',  // v0.92追加
        storeName: storeName,
        date: date,
        image: saveImage ? receiptImageData : null,
        createdAt: new Date().toISOString()
      });
    });
    localStorage.setItem('reform_app_expenses', JSON.stringify(savedExpenses));
  }
  
  // 完了メッセージ
  const materialCount = materials.length;
  const expenseCount = expenses.length;
  let message = '保存しました！\n';
  if (materialCount > 0) message += `材料: ${materialCount}件\n`;
  if (expenseCount > 0) message += `経費: ${expenseCount}件`;
  alert(message);
  
  // リセット
  resetReceiptForm();
}

function resetReceiptForm() {
  document.getElementById('receiptStoreName').value = '';
  document.getElementById('receiptDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('imagePlaceholder').style.display = 'flex';
  document.getElementById('processedImagePreview').style.display = 'none';
  document.getElementById('ocrBtn').disabled = true;
  document.getElementById('aiBtn').disabled = true;
  receiptImageData = null;
  receiptItems = [];
  addReceiptItem();
  updateReceiptTotal();
}
