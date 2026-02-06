// ==========================================
// 経費管理機能
// Reform App Pro v0.91
// ==========================================


function initExpensesScreen() {
  // 今月の範囲をセット
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  document.getElementById('expenseStartDate').value = firstDay.toISOString().split('T')[0];
  document.getElementById('expenseEndDate').value = lastDay.toISOString().split('T')[0];
  
  filterExpenses();
}




// ===== 価格比較検索機能 =====
// ★ v0.96: searchOnSite, clearPriceSearch, startVoiceSearch は
//    price-search.js に移行済み。このファイルからは削除。

// ===== 音声コマンド機能 =====

// expenseCategories は globals.js で定義
// currentExpenseType は globals.js で定義
// editingExpenseId は globals.js で定義

// 経費入力フォームを表示
function showExpenseForm(type, editId = null) {
  currentExpenseType = type;
  editingExpenseId = editId;
  
  const modal = document.getElementById('expense-form-modal');
  const title = document.getElementById('expenseFormTitle');
  const saveBtn = document.getElementById('expFormSaveBtn');
  const category1Select = document.getElementById('expFormCategory1');
  
  // タイトルとボタン色を設定
  if (type === 'income') {
    title.textContent = editId ? '✏️ 収入を編集' : '➕ 収入を追加';
    saveBtn.style.background = '#22c55e';
  } else {
    title.textContent = editId ? '✏️ 支出を編集' : '➖ 支出を追加';
    saveBtn.style.background = '#ef4444';
  }
  
  // カテゴリ1を設定
  const categories = expenseCategories[type];
  category1Select.innerHTML = '<option value="">選択してください</option>';
  Object.keys(categories).forEach(cat => {
    category1Select.innerHTML += '<option value="' + cat + '">' + cat + '</option>';
  });
  
  // フォームをリセット
  if (!editId) {
    document.getElementById('expFormDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('expFormCategory2').innerHTML = '<option value="">選択してください</option>';
    document.getElementById('expFormMemo').value = '';
    document.getElementById('expFormAmount').value = '';
  } else {
    // 編集時は既存データを読み込み
    const entries = JSON.parse(localStorage.getItem('reform_expense_entries') || '[]');
    const entry = entries.find(e => e.id === editId);
    if (entry) {
      document.getElementById('expFormDate').value = entry.date;
      category1Select.value = entry.category1;
      updateExpenseCategory2();
      document.getElementById('expFormCategory2').value = entry.category2 || '';
      document.getElementById('expFormMemo').value = entry.memo || '';
      document.getElementById('expFormAmount').value = entry.amount;
    }
  }
  
  modal.classList.remove('hidden');
}

// カテゴリ2を更新
function updateExpenseCategory2() {
  const cat1 = document.getElementById('expFormCategory1').value;
  const cat2Select = document.getElementById('expFormCategory2');
  const categories = expenseCategories[currentExpenseType];
  
  cat2Select.innerHTML = '<option value="">選択してください</option>';
  
  if (cat1 && categories[cat1]) {
    categories[cat1].forEach(subcat => {
      cat2Select.innerHTML += '<option value="' + subcat + '">' + subcat + '</option>';
    });
  }
}

// 経費を保存
function saveExpenseEntry() {
  const date = document.getElementById('expFormDate').value;
  const category1 = document.getElementById('expFormCategory1').value;
  const category2 = document.getElementById('expFormCategory2').value;
  const memo = document.getElementById('expFormMemo').value;
  const amount = parseInt(document.getElementById('expFormAmount').value) || 0;
  
  if (!date || !category1 || !amount) {
    alert('日付、大分類、金額は必須です');
    return;
  }
  
  let entries = JSON.parse(localStorage.getItem('reform_expense_entries') || '[]');
  
  const entry = {
    id: editingExpenseId || Date.now().toString(),
    type: currentExpenseType,
    date: date,
    category1: category1,
    category2: category2,
    memo: memo,
    amount: amount,
    createdAt: editingExpenseId ? entries.find(e => e.id === editingExpenseId)?.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  if (editingExpenseId) {
    // 編集
    const index = entries.findIndex(e => e.id === editingExpenseId);
    if (index !== -1) {
      entries[index] = entry;
    }
  } else {
    // 新規追加
    entries.push(entry);
  }
  
  localStorage.setItem('reform_expense_entries', JSON.stringify(entries));
  
  closeExpenseForm();
  filterExpenses();
  
  alert(editingExpenseId ? '更新しました！' : '保存しました！');
}

// 経費フォームを閉じる
function closeExpenseForm() {
  document.getElementById('expense-form-modal').classList.add('hidden');
  editingExpenseId = null;
}

// 経費エントリーを削除
function deleteExpenseEntry(id) {
  if (!confirm('この記録を削除しますか？')) return;
  
  let entries = JSON.parse(localStorage.getItem('reform_expense_entries') || '[]');
  entries = entries.filter(e => e.id !== id);
  localStorage.setItem('reform_expense_entries', JSON.stringify(entries));
  
  filterExpenses();
}

function filterExpenses() {
  const startDate = document.getElementById('expenseStartDate').value;
  const endDate = document.getElementById('expenseEndDate').value;
  
  // 新しい経費帳データ
  let entries = JSON.parse(localStorage.getItem('reform_expense_entries') || '[]');
  
  // 旧データも統合（互換性のため）
  const oldExpenses = JSON.parse(localStorage.getItem('reform_app_expenses') || '[]');
  oldExpenses.forEach(e => {
    // 旧形式を新形式に変換して追加
    if (!entries.find(entry => entry.id === e.id)) {
      entries.push({
        id: e.id,
        type: 'expense',
        date: e.date,
        category1: getCategoryLabel(e.category),
        category2: e.name || '',
        memo: e.storeName || '',
        amount: e.price || 0
      });
    }
  });
  
  // 日付フィルター
  if (startDate) {
    entries = entries.filter(e => e.date >= startDate);
  }
  if (endDate) {
    entries = entries.filter(e => e.date <= endDate);
  }
  
  // 日付順にソート（新しい順）
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  renderExpensesList(entries);
  renderExpensesSummary(entries);
}

function renderExpensesList(entries) {
  const container = document.getElementById('expensesList');
  
  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📒</div>
        <div>この期間の記録はありません</div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 8px;">上のボタンから収入・支出を追加してください</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = entries.map(e => `
    <div class="expense-item" style="border-left: 4px solid ${e.type === 'income' ? '#22c55e' : '#ef4444'};">
      <div class="expense-item-header">
        <div>
          <div class="expense-item-name">
            ${e.type === 'income' ? '💰' : '💸'} ${e.category1}${e.category2 ? ' / ' + e.category2 : ''}
          </div>
          <div class="expense-item-detail">
            ${formatDate(e.date)}${e.memo ? ' | ' + e.memo : ''}
          </div>
        </div>
        <div class="expense-item-amount" style="color: ${e.type === 'income' ? '#16a34a' : '#dc2626'};">
          ${e.type === 'income' ? '+' : '-'}¥${(e.amount || 0).toLocaleString()}
        </div>
      </div>
      <div class="expense-item-actions">
        <button class="master-btn edit" onclick="showExpenseForm('${e.type}', '${e.id}')">編集</button>
        <button class="master-btn delete" onclick="deleteExpenseEntry('${e.id}')">削除</button>
      </div>
    </div>
  `).join('');
}

function renderExpensesSummary(entries) {
  // 収入合計
  const incomeTotal = entries.filter(e => e.type === 'income').reduce((sum, e) => sum + (e.amount || 0), 0);
  document.getElementById('incomeTotalAmount').textContent = '¥' + incomeTotal.toLocaleString();
  
  // 支出合計
  const expenseTotal = entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + (e.amount || 0), 0);
  document.getElementById('expenseTotalAmount').textContent = '¥' + expenseTotal.toLocaleString();
  
  // 収支差額
  const balance = incomeTotal - expenseTotal;
  const balanceEl = document.getElementById('balanceTotalAmount');
  balanceEl.textContent = (balance >= 0 ? '+' : '') + '¥' + balance.toLocaleString();
  balanceEl.style.color = balance >= 0 ? '#16a34a' : '#dc2626';
  
  // カテゴリ別集計（支出のみ）
  const byCategory = {};
  entries.filter(e => e.type === 'expense').forEach(e => {
    const cat = e.category1 || 'その他';
    byCategory[cat] = (byCategory[cat] || 0) + (e.amount || 0);
  });
  
  const summaryHtml = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount]) => `
      <div style="display: flex; justify-content: space-between; margin-top: 4px;">
        <span>${cat}</span>
        <span>¥${amount.toLocaleString()}</span>
      </div>
    `).join('');
  
  document.getElementById('expenseCategorySummary').innerHTML = summaryHtml;
}

function deleteExpense(expenseId) {
  if (!confirm('この経費を削除しますか？')) return;
  
  let expenses = JSON.parse(localStorage.getItem('reform_app_expenses') || '[]');
  expenses = expenses.filter(e => String(e.id) !== String(expenseId));
  localStorage.setItem('reform_app_expenses', JSON.stringify(expenses));
  
  filterExpenses();
}

function exportExpensesExcel() {
  const startDate = document.getElementById('expenseStartDate').value;
  const endDate = document.getElementById('expenseEndDate').value;
  
  let expenses = JSON.parse(localStorage.getItem('reform_app_expenses') || '[]');
  
  if (startDate) {
    expenses = expenses.filter(e => e.date >= startDate);
  }
  if (endDate) {
    expenses = expenses.filter(e => e.date <= endDate);
  }
  
  expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const total = expenses.reduce((sum, e) => sum + (e.price || 0), 0);
  
  const wb = XLSX.utils.book_new();
  
  const rows = [
    ['経費一覧'],
    [`期間: ${startDate || '指定なし'} 〜 ${endDate || '指定なし'}`],
    [],
    ['日付', '品名', '店舗', 'カテゴリ', '金額'],
  ];
  
  expenses.forEach(e => {
    rows.push([
      e.date,
      e.name || '',
      e.storeName || '',
      getCategoryLabel(e.category),
      e.price || 0
    ]);
  });
  
  rows.push([]);
  rows.push(['', '', '', '合計', total]);
  
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 25 },
    { wch: 20 },
    { wch: 15 },
    { wch: 12 },
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, '経費一覧');
  
  const filename = `経費一覧_${startDate}_${endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
  
  alert('Excelエクスポート完了！');
}