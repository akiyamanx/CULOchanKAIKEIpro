// ==========================================
// レシート読込 - コア機能
// Reform App Pro v0.95
// ==========================================
// 画面初期化、画像管理、品目UI、保存機能
// + チェックボックス、現場割り当て機能（v0.92追加）
// + 勘定科目カスタマイズ対応（v0.93追加）
// + v0.94修正:
//   - 連携フローの金額渡しをintに確実に変換
//   - 新規書類にお客様名（_docFlowCustomerName）を反映
//   - openDocScreen後にLocalStorageから画面にデータ読み込み
// + v0.94.1修正:
//   - 連携後にレシート画面をリセットしない（内容を残す）
//   - saveReceipt時にレシート履歴を保存（receipt-history.jsに依存）
// + v0.95修正:
//   - OCR機能削除（AI解析に一本化）
//   - 複数枚一括選択機能追加（handleMultiImageSelect）
// + v0.95.2追加:
//   - レシート画像の自動圧縮（compressImage）
//   - 最大幅1200px、JPEG品質0.7でLocalStorage容量を大幅節約
// 
// 依存ファイル:
//   - globals.js (receiptItems, receiptImageData, multiImageDataUrls, categories, productMaster, projects)
//   - receipt-ai.js (runAiOcr)
//   - receipt-history.js (saveReceiptHistory, v0.94.1追加)
// ==========================================


// ==========================================
// v0.95.2追加: 画像圧縮ユーティリティ
// ==========================================
/**
 * Base64画像をCanvasで圧縮する
 * @param {string} dataUrl - 元のBase64画像データ
 * @param {number} maxWidth - 最大幅（デフォルト1200px）
 * @param {number} quality - JPEG品質 0.0〜1.0（デフォルト0.7）
 * @returns {Promise<string>} 圧縮後のBase64画像データ
 */
function compressImage(dataUrl, maxWidth, quality) {
  maxWidth = maxWidth || 1200;
  quality = quality || 0.7;
  
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      
      // 元のサイズが最大幅以下ならリサイズ不要
      var width = img.width;
      var height = img.height;
      
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      // JPEG形式で圧縮（PNG透過は不要なので）
      var compressed = canvas.toDataURL('image/jpeg', quality);
      
      // 圧縮後のほうが大きくなる場合は元のを返す（稀だが安全策）
      if (compressed.length >= dataUrl.length) {
        resolve(dataUrl);
      } else {
        var savedKB = Math.round((dataUrl.length - compressed.length) / 1024);
        console.log('[compressImage] ' + width + 'x' + height + ' 圧縮: ' + savedKB + 'KB削減');
        resolve(compressed);
      }
    };
    img.onerror = function() {
      // エラー時は元のデータをそのまま返す
      console.warn('[compressImage] 画像の読み込みに失敗、元データを使用');
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}
// ==========================================


// ==========================================
// 画面初期化
// ==========================================
// v0.94.1修正: 初回のみフルリセット、以降は現場セレクトの更新だけ
// （他の画面から戻った時にデータが消えないようにする）
let _receiptScreenInitialized = false;

function initReceiptScreen() {
  // 現場セレクトは毎回更新（新しい現場が追加されてる可能性がある）
  initProjectSelect();

  // 初回のみフルリセット
  if (_receiptScreenInitialized) return;
  _receiptScreenInitialized = true;

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
    // v0.95.2: 画像を圧縮してから保存
    compressImage(e.target.result).then(function(compressed) {
      receiptImageData = compressed;
      document.getElementById('imagePreview').src = receiptImageData;
      document.getElementById('imagePreview').style.display = 'block';
      document.getElementById('imagePlaceholder').style.display = 'none';
      document.getElementById('imagePreviewArea').style.display = 'block';
      // v0.95: OCRボタン削除のため、ocrBtn操作を削除
      // AIボタンを有効化（APIキーがあれば）
      const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
      document.getElementById('aiBtn').disabled = !settings.geminiApiKey;
      if (!settings.geminiApiKey) {
        document.getElementById('aiBtn').title = '設定画面でGemini APIキーを入力してください';
      }
    });
  };
  reader.readAsDataURL(file);
  // inputをリセット（同じファイルを再選択できるように）
  event.target.value = '';
}

// 画像を追加（1枚ずつ追加する方式）
function handleAddImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // 最大10枚まで（v0.95: 3枚→10枚に拡張）
  if (multiImageDataUrls.length >= 10) {
    alert('最大10枚まで追加できます');
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
    // v0.95.2: 画像を圧縮してから保存
    compressImage(e.target.result).then(function(compressed) {
      multiImageDataUrls.push(compressed);
      
      // 単一画像プレビューを非表示
      document.getElementById('imagePreviewArea').style.display = 'none';
      document.getElementById('multiImageArea').style.display = 'block';
      
      renderMultiImageThumbnails();
      
      // v0.95: OCRボタン削除
      const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
      document.getElementById('aiBtn').disabled = !settings.geminiApiKey;
    });
  };
  reader.readAsDataURL(file);
  // inputをリセット
  event.target.value = '';
}

// v0.95追加: 複数枚一括選択
function handleMultiImageSelect(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  
  // 最大10枚まで
  const maxFiles = 10;
  const filesToProcess = Array.from(files).slice(0, maxFiles);
  
  if (files.length > maxFiles) {
    alert(`最大${maxFiles}枚まで選択できます。最初の${maxFiles}枚を読み込みます。`);
  }
  
  // 既存の画像をクリア
  multiImageDataUrls = [];
  receiptImageData = null;
  
  // 読み込みカウンター
  let loadedCount = 0;
  
  filesToProcess.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // v0.95.2: 画像を圧縮してから保存
      compressImage(e.target.result).then(function(compressed) {
        multiImageDataUrls[index] = compressed;
        loadedCount++;
        
        // 全部読み込み完了したら表示更新
        if (loadedCount === filesToProcess.length) {
          // null/undefinedを除去
          multiImageDataUrls = multiImageDataUrls.filter(Boolean);
          
          // 単一画像プレビューを非表示
          document.getElementById('imagePreviewArea').style.display = 'none';
          document.getElementById('multiImageArea').style.display = 'block';
          
          renderMultiImageThumbnails();
          
          // AIボタン有効化
          const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
          document.getElementById('aiBtn').disabled = !settings.geminiApiKey;
          
          if (!settings.geminiApiKey) {
            alert('Gemini APIキーが設定されていません。\n設定画面からAPIキーを入力してください。');
          }
        }
      });
    };
    reader.readAsDataURL(file);
  });
  
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
  
  // 追加ボタン（10枚未満の場合）
  if (multiImageDataUrls.length < 10) {
    const addBtn = document.createElement('div');
    addBtn.style.cssText = 'width: 80px; height: 80px; border: 2px dashed #d1d5db; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #9ca3af; font-size: 24px;';
    addBtn.innerHTML = '＋';
    addBtn.onclick = () => document.getElementById('receiptAddImage').click();
    container.appendChild(addBtn);
  }
  
  // 枚数表示更新
  const countEl = container.parentElement.querySelector('div:first-child');
  if (countEl) {
    countEl.innerHTML = `📸 選択した画像（${multiImageDataUrls.length}枚）×で削除`;
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
    receiptImageData = null;
  } else if (multiImageDataUrls.length === 1) {
    // 1枚だけになったら単一画像モードに戻る
    receiptImageData = multiImageDataUrls[0];
    document.getElementById('multiImageArea').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
    document.getElementById('imagePreview').src = receiptImageData;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imagePlaceholder').style.display = 'none';
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
  // v0.95: ocrBtn削除
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
    // v0.95追加: 自動保存トリガー
    if (typeof markDirty === 'function') markDirty();
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
    
    // AIマッチング情報（v0.95: OCR→AI）
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
        <div class="receipt-item-fields" style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px;">
          <input type="text" value="${escapeHtml(item.name)}" placeholder="品名" 
            oninput="updateReceiptItem(${item.id}, 'name', this.value)">
          <input type="number" value="${item.quantity}" min="1" placeholder="数量"
            oninput="updateReceiptItem(${item.id}, 'quantity', parseInt(this.value) || 1)">
          <input type="number" value="${item.price}" min="0" placeholder="金額"
            oninput="updateReceiptItem(${item.id}, 'price', parseInt(this.value) || 0)">
        </div>
        ${matchInfo}
        <div class="receipt-item-type">
          <select onchange="updateReceiptItem(${item.id}, 'type', this.value)">
            <option value="material" ${item.type === 'material' ? 'selected' : ''}>材料費</option>
            <option value="expense" ${item.type === 'expense' ? 'selected' : ''}>経費</option>
            <option value="exclude" ${item.type === 'exclude' ? 'selected' : ''}>除外</option>
          </select>
          ${item.type !== 'exclude' ? `
            <select onchange="updateReceiptItem(${item.id}, 'category', this.value)">
              ${categoryOptions.map(cat => 
                `<option value="${cat.value}" ${item.category === cat.value ? 'selected' : ''}>${cat.label}</option>`
              ).join('')}
            </select>
          ` : ''}
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', itemHtml);
  });
}

function updateReceiptTotal() {
  const total = receiptItems
    .filter(item => item.type !== 'exclude')
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);
  document.getElementById('receiptTotal').textContent = `¥${total.toLocaleString()}`;
}


// ==========================================
// チェックボックス・現場割り当て（v0.92追加）
// ==========================================
function toggleItemCheck(itemId, checked) {
  const item = receiptItems.find(i => i.id === itemId);
  if (item) {
    item.checked = checked;
    // 見た目の更新
    const el = document.querySelector(`.receipt-item[data-id="${itemId}"]`);
    if (el) el.classList.toggle('checked', checked);
    updateAssignedCount();
  }
}

function toggleAllCheckboxes(checked) {
  receiptItems.forEach(item => {
    item.checked = checked;
  });
  renderReceiptItems();
  updateAssignedCount();
}

function assignSelectedItems() {
  const select = document.getElementById('projectSelect');
  const projectName = select.value;
  if (!projectName) {
    alert('現場を選択してください');
    return;
  }
  
  let count = 0;
  receiptItems.forEach(item => {
    if (item.checked) {
      item.projectName = projectName;
      item.checked = false;
      count++;
    }
  });
  
  if (count === 0) {
    alert('チェックされた品目がありません');
    return;
  }
  
  // 全選択チェックボックスをリセット
  document.getElementById('selectAllItems').checked = false;
  
  renderReceiptItems();
  updateAssignedCount();
  alert(`${count}件を「${projectName}」に割り当てました`);
}

function clearSelectedAssignments() {
  let count = 0;
  receiptItems.forEach(item => {
    if (item.checked && item.projectName) {
      item.projectName = '';
      item.checked = false;
      count++;
    }
  });
  
  if (count === 0) {
    alert('解除できる品目がありません\n（チェック＋現場割り当て済みの品目）');
    return;
  }
  
  document.getElementById('selectAllItems').checked = false;
  renderReceiptItems();
  updateAssignedCount();
  alert(`${count}件の現場割り当てを解除しました`);
}

function updateAssignedCount() {
  const el = document.getElementById('assignedCount');
  if (!el) return;
  
  const checkedCount = receiptItems.filter(i => i.checked).length;
  const assignedCount = receiptItems.filter(i => i.projectName).length;
  
  el.textContent = `選択中: ${checkedCount}件 ／ 現場割り当て済み: ${assignedCount}件`;
}


// ==========================================
// 品名マスター登録
// ==========================================
function registerToMaster(itemId, name, category) {
  const item = receiptItems.find(i => i.id === itemId);
  if (!item) return;
  
  const newEntry = {
    id: Date.now(),
    keywords: [name.toLowerCase()],
    productName: name,
    category: category || 'material',
    defaultPrice: item.price || 0
  };
  
  productMaster.push(newEntry);
  saveProductMaster();
  
  // マッチ済みフラグを立てる
  item.matched = true;
  item.originalName = null;
  renderReceiptItems();
  
  alert(`「${name}」を品名マスターに登録しました`);
}

function saveProductMaster() {
  localStorage.setItem('reform_app_product_master', JSON.stringify(productMaster));
}


// ==========================================
// レシート保存
// v0.95修正: try-catchでエラー可視化
// ==========================================
function saveReceipt() {
  try {
    console.log('[saveReceipt] 開始');
    
    const storeEl = document.getElementById('receiptStoreName');
    const dateEl = document.getElementById('receiptDate');
    const saveImgEl = document.getElementById('saveReceiptImage');
    
    // 要素の存在チェック
    if (!storeEl) { alert('❌ エラー: receiptStoreName要素が見つかりません'); return; }
    if (!dateEl) { alert('❌ エラー: receiptDate要素が見つかりません'); return; }
    if (!saveImgEl) { alert('❌ エラー: saveReceiptImage要素が見つかりません'); return; }
    
    const storeName = storeEl.value.trim();
    const date = dateEl.value;
    const saveImage = saveImgEl.checked;
    
    console.log('[saveReceipt] 店名:', storeName, '日付:', date, '品目数:', receiptItems.length);
    
    if (!storeName) {
      alert('店名を入力してください');
      return;
    }
    
    // 材料と経費を分ける
    const materials = receiptItems
      .filter(item => item.type === 'material' && item.name)
      .map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        category: item.category,
        projectName: item.projectName || ''
      }));
      
    const expenses = receiptItems
      .filter(item => item.type === 'expense' && item.name)
      .map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        category: item.category,
        projectName: item.projectName || ''
      }));
    
    console.log('[saveReceipt] 材料:', materials.length, '経費:', expenses.length);
    
    if (materials.length === 0 && expenses.length === 0) {
      alert('保存する品目がありません');
      return;
    }
    
    // v0.94.1追加: 履歴として保存
    // v0.95: 重複チェック結果を確認（falseなら重複で中止）
    if (typeof saveReceiptHistory === 'function') {
      console.log('[saveReceipt] 履歴保存を実行...');
      const saved = saveReceiptHistory(storeName, date, materials, expenses, saveImage);
      if (saved === false) return; // 重複のため中止
      console.log('[saveReceipt] 履歴保存完了');
    } else {
      console.warn('[saveReceipt] saveReceiptHistory関数が未定義');
    }

    // v0.95: 自動保存データをクリア（手動保存成功）
    if (typeof onManualSaveSuccess === 'function') {
      onManualSaveSuccess('receipt');
    }

    // 連携フローを開始
    console.log('[saveReceipt] 連携フローを開始');
    showDocFlowModal(storeName, date, materials, expenses);
    
  } catch (e) {
    console.error('[saveReceipt] エラー:', e);
    alert('❌ 保存中にエラーが発生しました\n\n' + e.message + '\n\n場所: ' + (e.stack ? e.stack.split('\n')[1] : '不明'));
  }
}


// ==========================================
// 書類連携フロー（v0.93追加、v0.94修正）
// ==========================================
let _docFlowStoreName = '';
let _docFlowDate = '';
let _docFlowMaterials = [];
let _docFlowExpenses = [];
let _docFlowTarget = '';
let _docFlowCustomerName = '';
let _docFlowProjectName = '';

function showDocFlowModal(storeName, date, materials, expenses) {
  _docFlowStoreName = storeName;
  _docFlowDate = date;
  _docFlowMaterials = materials;
  _docFlowExpenses = expenses;
  
  // v0.94追加: お客様名を取得
  const custEl = document.getElementById('receiptCustomerName');
  _docFlowCustomerName = custEl ? custEl.value.trim() : '';
  
  // 現場名を取得（最初の品目から）
  const firstWithProject = [...materials, ...expenses].find(m => m.projectName);
  _docFlowProjectName = firstWithProject ? firstWithProject.projectName : '';
  
  showDocFlowStep1();
  document.getElementById('receiptDocFlowModal').style.display = 'flex';
}

function closeDocFlowModal() {
  document.getElementById('receiptDocFlowModal').style.display = 'none';
}

// ── Step 1: どこに反映する？ ──
function showDocFlowStep1() {
  const title = document.getElementById('docFlowTitle');
  const subtitle = document.getElementById('docFlowSubtitle');
  const content = document.getElementById('docFlowContent');
  const footer = document.getElementById('docFlowFooter');
  
  const count = _docFlowMaterials.length;
  const total = _docFlowMaterials.reduce((s, m) => s + m.price * m.quantity, 0);
  
  title.textContent = '📋 書類に反映';
  subtitle.textContent = `材料 ${count}件 ／ 合計 ¥${total.toLocaleString()}`;
  
  content.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
      <div style="font-size: 13px; color: #0369a1; font-weight: 600; margin-bottom: 4px;">📍 店名・日付</div>
      <div style="font-size: 14px; color: #1f2937;">${escapeHtml(_docFlowStoreName)} ／ ${_docFlowDate}</div>
      ${_docFlowCustomerName ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">👤 ${escapeHtml(_docFlowCustomerName)}</div>` : ''}
      ${_docFlowProjectName ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">🏠 ${escapeHtml(_docFlowProjectName)}</div>` : ''}
    </div>
    <div style="font-size: 14px; color: #374151; font-weight: 500; margin-bottom: 12px;">
      どの書類に反映しますか？
    </div>
  `;
  
  footer.innerHTML = `
    <div style="display: flex; gap: 8px;">
      <button onclick="selectDocTarget('estimate')" 
        style="flex: 1; padding: 14px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">
        📝 見積書
      </button>
      <button onclick="selectDocTarget('invoice')" 
        style="flex: 1; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">
        📄 請求書
      </button>
    </div>
    <button onclick="closeDocFlowModal()" 
      style="width: 100%; margin-top: 8px; padding: 12px; background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; cursor: pointer;">
      キャンセル
    </button>
  `;
}

function selectDocTarget(target) {
  _docFlowTarget = target;
  showDocFlowStep2();
}

// ── Step 2: 新規 or 既存？ ──
function showDocFlowStep2() {
  const title = document.getElementById('docFlowTitle');
  const subtitle = document.getElementById('docFlowSubtitle');
  const content = document.getElementById('docFlowContent');
  const footer = document.getElementById('docFlowFooter');
  
  const isEstimate = _docFlowTarget === 'estimate';
  const docLabel = isEstimate ? '見積書' : '請求書';
  const storageKey = isEstimate ? 'reform_app_estimates' : 'reform_app_invoices';
  
  // 下書きを取得
  const docs = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const drafts = docs.filter(d => d.status === 'draft');
  
  title.textContent = `${isEstimate ? '📝' : '📄'} ${docLabel}に反映`;
  subtitle.textContent = '新規作成または既存の下書きを選択';
  
  // 下書きリスト
  let draftsHtml = '';
  if (drafts.length > 0) {
    draftsHtml = `
      <div style="max-height: 200px; overflow-y: auto; margin-top: 12px;">
        ${drafts.map(d => `
          <div onclick="addToExistingDoc('${d.id}')" 
            style="padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; cursor: pointer;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #1f2937;">${d.number || '番号なし'}</div>
                <div style="font-size: 12px; color: #6b7280;">${d.customerName || '顧客未設定'} ／ ${d.date}</div>
              </div>
              <div style="font-size: 14px; font-weight: 600; color: #3b82f6;">¥${(d.total || 0).toLocaleString()}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    draftsHtml = `
      <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 13px;">
        下書きの${docLabel}はありません
      </div>
    `;
  }
  
  content.innerHTML = `
    <button onclick="createNewDoc()" 
      style="width: 100%; padding: 16px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; margin-bottom: 12px;">
      ✨ 新規${docLabel}を作成
    </button>
    <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">または既存の下書きに追加:</div>
    ${draftsHtml}
  `;
  
  footer.innerHTML = `
    <button onclick="showDocFlowStep1()" 
      style="width: 100%; padding: 12px; background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; cursor: pointer;">
      ← 戻る
    </button>
  `;
}

// ── 既存書類に追加 ──
function addToExistingDoc(docId) {
  const isEstimate = _docFlowTarget === 'estimate';
  const storageKey = isEstimate ? 'reform_app_estimates' : 'reform_app_invoices';
  const docLabel = isEstimate ? '見積書' : '請求書';
  
  const docs = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const doc = docs.find(d => String(d.id) === String(docId));
  
  if (!doc) {
    alert('書類が見つかりませんでした');
    return;
  }
  
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const profitRate = parseFloat(settings.defaultProfitRate) || 20;
  
  // 材料を追加
  // v0.94修正: priceを確実に数値に変換
  _docFlowMaterials.forEach(m => {
    const price = parseInt(m.price) || 0;
    const mat = {
      id: Date.now() + Math.random(),
      name: m.name,
      quantity: parseInt(m.quantity) || 1
    };
    if (isEstimate) {
      mat.costPrice = price;
      mat.profitRate = profitRate;
      mat.sellingPrice = Math.ceil(price * (1 + profitRate / 100));
    } else {
      mat.price = price;
    }
    doc.materials.push(mat);
  });
  
  recalcDocTotals(doc, isEstimate);
  
  // 保存
  localStorage.setItem(storageKey, JSON.stringify(docs));
  
  showDocFlowStep3(docLabel, doc.number, false);
}

// ── 新規書類作成 ──
function createNewDoc() {
  const isEstimate = _docFlowTarget === 'estimate';
  const storageKey = isEstimate ? 'reform_app_estimates' : 'reform_app_invoices';
  const docLabel = isEstimate ? '見積書' : '請求書';
  
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const taxRate = parseFloat(settings.taxRate) || 10;
  const profitRate = parseFloat(settings.defaultProfitRate) || 20;
  
  // 材料データを作成
  // v0.94修正: priceを確実に数値に変換
  const newMaterials = _docFlowMaterials.map(m => {
    const price = parseInt(m.price) || 0;
    const mat = {
      id: Date.now() + Math.random(),
      name: m.name,
      quantity: parseInt(m.quantity) || 1
    };
    if (isEstimate) {
      mat.costPrice = price;
      mat.profitRate = profitRate;
      mat.sellingPrice = Math.ceil(price * (1 + profitRate / 100));
    } else {
      mat.price = price;
    }
    return mat;
  });
  
  // 新規書類
  // v0.94修正: customerNameに_docFlowCustomerName、subjectに_docFlowProjectNameをセット
  const newDoc = {
    id: Date.now(),
    status: 'draft',
    customerName: _docFlowCustomerName,
    subject: _docFlowProjectName,
    date: new Date().toISOString().split('T')[0],
    materials: newMaterials,
    works: [],
    workType: 'construction',
    notes: '',
    taxRate: taxRate,
    createdAt: new Date().toISOString()
  };
  
  if (isEstimate) {
    newDoc.number = generateEstimateNumber();
    const validDays = parseInt(settings.estimateValidDays) || 30;
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + validDays);
    newDoc.validDate = validDate.toISOString().split('T')[0];
  } else {
    newDoc.number = generateInvoiceNumber();
    newDoc.dueDate = '';
  }
  
  recalcDocTotals(newDoc, isEstimate);
  
  // 保存
  const docs = JSON.parse(localStorage.getItem(storageKey) || '[]');
  docs.push(newDoc);
  localStorage.setItem(storageKey, JSON.stringify(docs));
  
  showDocFlowStep3(docLabel, newDoc.number, true);
}

// ── 書類の小計・合計を再計算 ──
function recalcDocTotals(doc, isEstimate) {
  const taxRate = doc.taxRate || 10;
  
  if (isEstimate) {
    doc.materialSubtotal = (doc.materials || []).reduce((sum, m) => 
      sum + (m.quantity || 0) * (m.sellingPrice || m.price || 0), 0);
  } else {
    doc.materialSubtotal = (doc.materials || []).reduce((sum, m) => 
      sum + (m.quantity || 0) * (m.price || 0), 0);
  }
  
  doc.workSubtotal = (doc.works || []).reduce((sum, w) => {
    if (doc.workType === 'daily') {
      return sum + (w.quantity || 1) * (w.value || 0);
    }
    return sum + (w.value || 0);
  }, 0);
  
  doc.subtotal = doc.materialSubtotal + doc.workSubtotal;
  doc.tax = Math.floor(doc.subtotal * taxRate / 100);
  doc.total = doc.subtotal + doc.tax;
}

// ── Step 3: 完了 → 開く？ ──
function showDocFlowStep3(docLabel, docNumber, isNew) {
  const title = document.getElementById('docFlowTitle');
  const subtitle = document.getElementById('docFlowSubtitle');
  const content = document.getElementById('docFlowContent');
  const footer = document.getElementById('docFlowFooter');
  
  const isEstimate = _docFlowTarget === 'estimate';
  const count = _docFlowMaterials.length;
  
  title.textContent = '✅ 反映完了！';
  subtitle.textContent = '';
  
  content.innerHTML = `
    <div style="text-align: center; padding: 16px 0;">
      <div style="font-size: 48px; margin-bottom: 12px;">${isEstimate ? '📝' : '📄'}</div>
      <div style="font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 8px;">
        ${isNew ? '新規' : '既存の'}${docLabel}に反映しました
      </div>
      <div style="font-size: 14px; color: #6b7280;">
        ${docNumber} — 材料 ${count}件追加
      </div>
    </div>
    <div style="text-align: center; font-size: 15px; color: #374151; font-weight: 500; margin-top: 8px;">
      今 ${docLabel}を開きますか？
    </div>
  `;
  
  footer.innerHTML = `
    <div style="display: flex; gap: 8px;">
      <button onclick="closeDocFlowModal()" 
        style="flex: 1; padding: 14px; background: #f3f4f6; color: #6b7280; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; cursor: pointer;">
        レシートに戻る
      </button>
      <button onclick="openDocScreen()" 
        style="flex: 2; padding: 14px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">
        開く →
      </button>
    </div>
  `;
}

// ── 書類画面を開く ──
// v0.94修正: 画面遷移後にLocalStorageの下書きデータを読み込んで表示する
// v0.94.1修正: レシート画面をリセットしない（戻った時に内容が残る）
function openDocScreen() {
  const modal = document.getElementById('receiptDocFlowModal');
  if (modal) modal.style.display = 'none';
  // resetReceiptForm(); // v0.94.1: リセットしない（戻った時に内容を残す）
  
  if (_docFlowTarget === 'estimate') {
    showScreen('estimate');
    setTimeout(() => loadLatestDraftToScreen('estimate'), 300);
  } else {
    showScreen('invoice');
    setTimeout(() => loadLatestDraftToScreen('invoice'), 300);
  }
}

// v0.94追加: 最新の下書きを画面に読み込む
function loadLatestDraftToScreen(type) {
  const isEstimate = type === 'estimate';
  const storageKey = isEstimate ? 'reform_app_estimates' : 'reform_app_invoices';
  const docs = JSON.parse(localStorage.getItem(storageKey) || '[]');
  
  // 最後に保存された下書きを取得
  const latestDraft = docs.filter(d => d.status === 'draft').pop();
  if (!latestDraft) return;
  
  if (isEstimate) {
    // お客様名・件名を反映
    const custEl = document.getElementById('estCustomerName');
    const subjEl = document.getElementById('estSubject');
    if (custEl) custEl.value = latestDraft.customerName || '';
    if (subjEl) subjEl.value = latestDraft.subject || '';
    
    // 材料データをメモリに読み込み
    estimateMaterials = (latestDraft.materials || []).map(m => ({
      ...m,
      id: m.id || Date.now() + Math.random()
    }));
    
    // 作業データ
    if (latestDraft.works && latestDraft.works.length > 0) {
      estimateWorks = latestDraft.works.map(w => ({
        ...w,
        id: w.id || Date.now() + Math.random()
      }));
    }
    
    renderEstimateMaterials();
    renderEstimateWorks();
    calculateEstimateTotal();
  } else {
    // 請求書
    const custEl = document.getElementById('invCustomerName');
    const subjEl = document.getElementById('invSubject');
    if (custEl) custEl.value = latestDraft.customerName || '';
    if (subjEl) subjEl.value = latestDraft.subject || '';
    
    // 材料データをメモリに読み込み
    invoiceMaterials = (latestDraft.materials || []).map(m => ({
      ...m,
      id: m.id || Date.now() + Math.random()
    }));
    
    // 作業データ
    if (latestDraft.works && latestDraft.works.length > 0) {
      invoiceWorks = latestDraft.works.map(w => ({
        ...w,
        id: w.id || Date.now() + Math.random()
      }));
    }
    
    renderInvoiceMaterials();
    renderInvoiceWorks();
    calculateInvoiceTotal();
  }
}

// v0.94.1修正: リセットボタン用（ユーザーが明示的にリセットする時のみ呼ばれる）
function resetReceiptForm() {
  // v0.94追加: お客様名もリセット
  const custEl = document.getElementById('receiptCustomerName');
  if (custEl) custEl.value = '';
  document.getElementById('receiptStoreName').value = '';
  document.getElementById('receiptDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('imagePlaceholder').style.display = 'flex';
  const procPreview = document.getElementById('processedImagePreview');
  if (procPreview) procPreview.style.display = 'none';
  // v0.95: ocrBtn削除
  document.getElementById('aiBtn').disabled = true;
  receiptImageData = null;
  // v0.94.1追加: 複数画像もリセット
  multiImageDataUrls = [];
  if (document.getElementById('multiImageArea')) {
    document.getElementById('multiImageArea').style.display = 'none';
  }
  if (document.getElementById('multiImageThumbnails')) {
    document.getElementById('multiImageThumbnails').innerHTML = '';
  }
  receiptItems = [];
  addReceiptItem();
  updateReceiptTotal();
  // v0.94.1: initReceiptScreenが次回も初期化できるようにフラグを残す
  // （リセット後は「初回状態」と同じ扱い）
  // ※ただしフラグはリセットしない（画面遷移でのリセットを防ぐため）
}
