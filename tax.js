// ==========================================
// 確定申告・税金計算
// Reform App Pro v0.91
// ==========================================

function selectTaxType(type) {
  taxType = type;
  const blueBtn = document.getElementById('taxBlueBtn');
  const whiteBtn = document.getElementById('taxWhiteBtn');
  const infoDiv = document.getElementById('taxTypeInfo');
  
  if (type === 'blue') {
    blueBtn.style.border = '2px solid #2563eb';
    blueBtn.style.background = '#eff6ff';
    whiteBtn.style.border = '2px solid #e5e7eb';
    whiteBtn.style.background = '#f9fafb';
    infoDiv.innerHTML = `
      💡 <strong>青色申告を選択中</strong><br>
      <span style="color: #166534;">最大65万円の控除</span>が受けられます！<br>
      このアプリで自動作成した帳簿が使えます。
    `;
    infoDiv.style.background = '#f0f9ff';
    infoDiv.style.color = '#1e40af';
  } else {
    whiteBtn.style.border = '2px solid #374151';
    whiteBtn.style.background = '#f3f4f6';
    blueBtn.style.border = '2px solid #e5e7eb';
    blueBtn.style.background = '#f9fafb';
    infoDiv.innerHTML = `
      📝 <strong>白色申告を選択中</strong><br>
      シンプルな単式簿記で申告できます。<br>
      事業規模が小さい場合や初めての方におすすめ。
    `;
    infoDiv.style.background = '#f9fafb';
    infoDiv.style.color = '#374151';
  }
  
  localStorage.setItem('reform_app_tax_type', type);
  updateTaxSummary();
}

function updateTaxSummary() {
  const year = document.getElementById('taxYear')?.value || new Date().getFullYear().toString();
  
  // 売上を計算（請求書から）
  const invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
  let totalIncome = 0;
  invoices.forEach(inv => {
    const invDate = new Date(inv.date || inv.createdAt);
    if (invDate.getFullYear().toString() === year) {
      totalIncome += inv.total || 0;
    }
  });
  
  // 経費を計算（レシートから）
  const expenses = JSON.parse(localStorage.getItem('reform_app_expenses') || '[]');
  let totalExpense = 0;
  const expenseByCategory = {};
  
  expenses.forEach(exp => {
    const expDate = new Date(exp.date || exp.createdAt);
    if (expDate.getFullYear().toString() === year) {
      const amount = exp.total || exp.amount || 0;
      totalExpense += amount;
      
      // カテゴリ別集計
      const category = exp.category || '未分類';
      if (!expenseByCategory[category]) {
        expenseByCategory[category] = 0;
      }
      expenseByCategory[category] += amount;
    }
  });
  
  // 所得を計算
  const profit = totalIncome - totalExpense;
  
  // 表示を更新
  document.getElementById('taxIncome').textContent = '¥' + totalIncome.toLocaleString();
  document.getElementById('taxExpense').textContent = '¥' + totalExpense.toLocaleString();
  document.getElementById('taxProfit').textContent = '¥' + profit.toLocaleString();
  
  // 経費内訳を表示
  const breakdownDiv = document.getElementById('expenseBreakdown');
  if (Object.keys(expenseByCategory).length > 0) {
    let html = '';
    const categories = {
      '材料費': { icon: '📦', color: '#f97316' },
      '消耗品費': { icon: '🔧', color: '#8b5cf6' },
      '車両費': { icon: '🚗', color: '#06b6d4' },
      '通信費': { icon: '📱', color: '#ec4899' },
      '旅費交通費': { icon: '🚃', color: '#14b8a6' },
      '接待交際費': { icon: '🍽️', color: '#f59e0b' },
      '外注費': { icon: '👷', color: '#3b82f6' },
      '未分類': { icon: '📋', color: '#6b7280' }
    };
    
    Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, amount]) => {
      const catInfo = categories[cat] || { icon: '📋', color: '#6b7280' };
      const percentage = totalExpense > 0 ? Math.round(amount / totalExpense * 100) : 0;
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">${catInfo.icon}</span>
            <span style="font-size: 13px; color: #374151;">${cat}</span>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 14px; font-weight: bold; color: ${catInfo.color};">¥${amount.toLocaleString()}</div>
            <div style="font-size: 11px; color: #94a3b8;">${percentage}%</div>
          </div>
        </div>
      `;
    });
    breakdownDiv.innerHTML = html;
  } else {
    breakdownDiv.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #94a3b8;">
        <p>経費データがありません</p>
        <p style="font-size: 12px; margin-top: 8px;">レシートを読み込むと自動で分類されます</p>
      </div>
    `;
  }
  
  // 節税アドバイスを生成
  generateTaxAdvice(totalIncome, totalExpense, profit);
}

function generateTaxAdvice(income, expense, profit) {
  const adviceList = document.getElementById('taxAdviceList');
  const advices = [];
  
  // 青色申告のメリット計算
  if (taxType === 'white' && profit > 500000) {
    const savings = Math.min(650000, profit) * 0.2; // 仮に税率20%で計算
    advices.push(`青色申告に切り替えると、最大約${Math.round(savings / 10000)}万円の節税効果があります！`);
  }
  
  // 経費率のチェック
  if (income > 0) {
    const expenseRatio = expense / income * 100;
    if (expenseRatio < 30) {
      advices.push('経費率が低めです。見落としている経費がないか確認しましょう（車両費、通信費、消耗品など）');
    }
  }
  
  // 売上がある場合
  if (income > 10000000) {
    advices.push('売上1000万円超のため、2年後から消費税の課税事業者になる可能性があります');
  }
  
  // 利益がある場合の控除提案
  if (profit > 0) {
    advices.push('小規模企業共済やiDeCoで、さらに節税できる可能性があります');
  }
  
  // デフォルトのアドバイス
  if (advices.length === 0) {
    advices.push('経費と売上を入力すると、あなたに合った節税アドバイスが表示されます');
  }
  
  adviceList.innerHTML = advices.map(a => `<li>${a}</li>`).join('');
  
  // 所得欄のアドバイス更新
  const taxAdviceDiv = document.getElementById('taxAdvice');
  if (taxType === 'blue' && profit > 0) {
    const deduction = profit > 650000 ? 650000 : profit;
    taxAdviceDiv.innerHTML = `💡 青色申告特別控除で約¥${deduction.toLocaleString()}控除できます！`;
  } else {
    taxAdviceDiv.innerHTML = taxType === 'blue' ? '💡 青色申告で最大65万円控除！' : '📝 白色申告（控除なし）';
  }
}

function exportLedger(type) {
  const year = document.getElementById('taxYear')?.value || new Date().getFullYear().toString();
  
  if (type === 'income') {
    // 収入帳を出力
    const invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
    const yearInvoices = invoices.filter(inv => {
      const d = new Date(inv.date || inv.createdAt);
      return d.getFullYear().toString() === year;
    });
    
    if (yearInvoices.length === 0) {
      alert('該当年の売上データがありません');
      return;
    }
    
    let csv = '日付,顧客名,内容,金額\n';
    yearInvoices.forEach(inv => {
      csv += `${inv.date || ''},${inv.customerName || ''},${inv.title || ''},${inv.total || 0}\n`;
    });
    
    downloadCSV(csv, `収入帳_${year}年.csv`);
    alert('収入帳をダウンロードしました');
    
  } else if (type === 'expense') {
    // 経費帳を出力
    const expenses = JSON.parse(localStorage.getItem('reform_app_expenses') || '[]');
    const yearExpenses = expenses.filter(exp => {
      const d = new Date(exp.date || exp.createdAt);
      return d.getFullYear().toString() === year;
    });
    
    if (yearExpenses.length === 0) {
      alert('該当年の経費データがありません');
      return;
    }
    
    let csv = '日付,勘定科目,内容,金額\n';
    yearExpenses.forEach(exp => {
      csv += `${exp.date || ''},${exp.category || '未分類'},${exp.shopName || exp.items?.map(i => i.name).join(' ') || ''},${exp.total || exp.amount || 0}\n`;
    });
    
    downloadCSV(csv, `経費帳_${year}年.csv`);
    alert('経費帳をダウンロードしました');
    
  } else {
    // 一括出力
    const data = {
      year: year,
      taxType: taxType,
      income: document.getElementById('taxIncome').textContent,
      expense: document.getElementById('taxExpense').textContent,
      profit: document.getElementById('taxProfit').textContent,
      invoices: JSON.parse(localStorage.getItem('reform_app_invoices') || '[]'),
      expenses: JSON.parse(localStorage.getItem('reform_app_expenses') || '[]')
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `確定申告データ_${year}年.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('確定申告用データをダウンロードしました');
  }
}

function downloadCSV(content, filename) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
