// ==========================================
// 見積書・請求書 HTMLテンプレート生成
// Reform App Pro v0.95
// ==========================================
// このファイルはHTML→PDF方式で見積書・請求書を出力する
// jsPDFの代わりにブラウザの印刷機能を使い、
// 日本語フォント問題を回避する
//
// 機能:
//   - A4縦レイアウト（行数多め、25〜30行対応）
//   - マス目（テーブル罫線）付きの本格書式
//   - ロゴ・印鑑画像の埋め込み
//   - 自動ページ分割
//   - 保存/印刷/共有の3モード対応
// ==========================================

// v0.95: HTMLテンプレートから見積書PDFを生成
async function exportEstimatePDF(mode = 'download') {
  const data = getEstimateData();
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const estimateNumber = generateEstimateNumber();
  const logoData = localStorage.getItem('reform_app_logo');
  const stampData = localStorage.getItem('reform_app_stamp');

  const html = generateDocumentHTML({
    docType: 'estimate',
    docTitle: '御 見 積 書',
    docNumber: estimateNumber,
    docNumberLabel: '見積番号',
    docDate: data.date,
    docDateLabel: '見積日',
    validDate: data.validDate,
    validDateLabel: '有効期限',
    customerName: data.customerName,
    customerAddress: data.customerAddress || '',
    subject: data.subject,
    materials: data.materials,
    works: data.works,
    workType: data.workType,
    materialSubtotal: data.materialSubtotal,
    workSubtotal: data.workSubtotal,
    subtotal: data.subtotal,
    taxRate: data.taxRate,
    tax: data.tax,
    total: data.total,
    notes: data.notes,
    settings: settings,
    logoData: logoData,
    stampData: stampData
  });

  await outputDocument(html, mode, `見積書_${data.customerName}_${data.date}`, data, estimateNumber, 'estimate');
}

// v0.95: HTMLテンプレートから請求書PDFを生成
async function exportInvoicePDF(mode = 'download') {
  const data = getInvoiceData();
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const invoiceNumber = generateInvoiceNumber();
  const logoData = localStorage.getItem('reform_app_logo');
  const stampData = localStorage.getItem('reform_app_stamp');

  const html = generateDocumentHTML({
    docType: 'invoice',
    docTitle: '御 請 求 書',
    docNumber: invoiceNumber,
    docNumberLabel: '請求番号',
    docDate: data.date,
    docDateLabel: '請求日',
    validDate: data.dueDate,
    validDateLabel: 'お支払期限',
    customerName: data.customerName,
    customerAddress: data.customerAddress || '',
    subject: data.subject,
    materials: data.materials,
    works: data.works,
    workType: data.workType,
    materialSubtotal: data.materialSubtotal,
    workSubtotal: data.workSubtotal,
    subtotal: data.subtotal,
    taxRate: data.taxRate,
    tax: data.tax,
    total: data.total,
    notes: data.notes,
    settings: settings,
    logoData: logoData,
    stampData: stampData
  });

  await outputDocument(html, mode, `請求書_${data.customerName}_${data.date}`, data, invoiceNumber, 'invoice');
}

// ==========================================
// HTMLテンプレート生成（見積書・請求書共通）
// ==========================================
function generateDocumentHTML(d) {
  // 明細行を生成
  let no = 1;
  let itemRows = '';

  // 材料費セクション
  if (d.materials && d.materials.length > 0) {
    itemRows += `<tr class="section-row"><td colspan="5">【材料費】</td></tr>`;
    d.materials.forEach(m => {
      if (m.name) {
        const unitPrice = m.sellingPrice || m.price || 0;
        const amount = (m.quantity || 0) * unitPrice;
        itemRows += `
          <tr>
            <td class="center">${no}</td>
            <td class="item-name">${escapeHtml(m.name)}</td>
            <td class="center">${m.quantity || 0}</td>
            <td class="right">¥${unitPrice.toLocaleString()}</td>
            <td class="right">¥${amount.toLocaleString()}</td>
          </tr>`;
        no++;
      }
    });
    itemRows += `
      <tr class="subtotal-row">
        <td colspan="3"></td>
        <td class="right bold">材料費 小計</td>
        <td class="right bold">¥${d.materialSubtotal.toLocaleString()}</td>
      </tr>`;
  }

  // 作業費セクション
  if (d.works && d.works.length > 0) {
    itemRows += `<tr class="section-row"><td colspan="5">【作業費】</td></tr>`;
    d.works.forEach(w => {
      if (w.name || w.value) {
        let qtyStr, unitPrice, amount;
        if (d.workType === 'construction') {
          qtyStr = w.unit || '1式';
          unitPrice = '';
          amount = w.value || 0;
        } else {
          qtyStr = `${w.quantity || 1}日`;
          unitPrice = `¥${(w.value || 0).toLocaleString()}`;
          amount = (w.quantity || 1) * (w.value || 0);
        }
        itemRows += `
          <tr>
            <td class="center">${no}</td>
            <td class="item-name">${escapeHtml(w.name || '作業')}</td>
            <td class="center">${qtyStr}</td>
            <td class="right">${unitPrice}</td>
            <td class="right">¥${amount.toLocaleString()}</td>
          </tr>`;
        no++;
      }
    });
    itemRows += `
      <tr class="subtotal-row">
        <td colspan="3"></td>
        <td class="right bold">作業費 小計</td>
        <td class="right bold">¥${d.workSubtotal.toLocaleString()}</td>
      </tr>`;
  }

  // v0.95修正 - A4いっぱいに空行を追加（最低25行）
  const MIN_ROWS = 25;
  // データ行数をカウント（セクションヘッダ・小計行は除く）
  let dataRowCount = 0;
  if (d.materials) {
    dataRowCount += d.materials.filter(m => m.name).length;
    dataRowCount += 2; // セクションヘッダ + 小計行
  }
  if (d.works) {
    dataRowCount += d.works.filter(w => w.name || w.value).length;
    dataRowCount += 2; // セクションヘッダ + 小計行
  }
  const emptyRows = Math.max(0, MIN_ROWS - dataRowCount);
  for (let i = 0; i < emptyRows; i++) {
    itemRows += `
      <tr class="empty-row">
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
      </tr>`;
  }

  // ロゴHTML
  const logoHtml = d.logoData 
    ? `<img src="${d.logoData}" class="logo-img" alt="ロゴ">` 
    : '';

  // 印鑑HTML
  const stampHtml = d.stampData 
    ? `<img src="${d.stampData}" class="stamp-img" alt="印鑑">` 
    : '';

  // 会社情報
  const s = d.settings;
  let companyInfo = '';
  if (s.companyName) companyInfo += `<div class="company-name">${escapeHtml(s.companyName)}</div>`;
  if (s.postalCode || s.address) companyInfo += `<div>〒${s.postalCode || ''} ${s.address || ''}</div>`;
  if (s.phone) companyInfo += `<div>TEL: ${s.phone}${s.fax ? ` / FAX: ${s.fax}` : ''}</div>`;
  if (s.email) companyInfo += `<div>${s.email}</div>`;
  if (s.isInvoiceRegistered && s.invoiceNumber) companyInfo += `<div class="invoice-number">登録番号: ${s.invoiceNumber}</div>`;

  // 備考
  const notesHtml = d.notes 
    ? `<div class="notes-section">
        <div class="notes-title">【備考】</div>
        <div class="notes-content">${escapeHtml(d.notes).replace(/\n/g, '<br>')}</div>
      </div>` 
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${d.docTitle} - ${d.customerName}</title>
<style>
  /* === 印刷用リセット === */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  @page {
    size: A4 portrait;
    margin: 12mm 10mm 12mm 10mm;
  }

  body {
    font-family: "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro", "Yu Gothic", "游ゴシック", "Meiryo", "メイリオ", sans-serif;
    font-size: 10px;
    color: #1a1a1a;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    width: 190mm;
    min-height: 267mm;
    margin: 0 auto;
    position: relative;
  }

  /* === ヘッダー部分 === */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6mm;
    padding-bottom: 3mm;
    border-bottom: 2px solid #2c5282;
  }

  .doc-title-area {
    flex: 1;
  }

  .doc-title {
    font-size: 22px;
    font-weight: bold;
    letter-spacing: 8px;
    color: #1a365d;
    margin-bottom: 2mm;
  }

  .doc-title-line {
    width: 100%;
    height: 3px;
    background: linear-gradient(to right, #2c5282, #4299e1, transparent);
    margin-bottom: 2mm;
  }

  .company-block {
    text-align: right;
    font-size: 9px;
    line-height: 1.6;
    position: relative;
    min-width: 55mm;
  }

  .company-name {
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 1mm;
  }

  .logo-img {
    max-width: 35mm;
    max-height: 15mm;
    margin-bottom: 2mm;
    display: block;
    margin-left: auto;
  }

  .stamp-img {
    position: absolute;
    bottom: -5mm;
    right: 0;
    width: 22mm;
    height: 22mm;
    opacity: 0.85;
  }

  .invoice-number {
    font-size: 8px;
    color: #666;
    margin-top: 1mm;
  }

  /* === 宛先・書類情報 === */
  .info-area {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5mm;
  }

  .customer-block {
    flex: 1;
  }

  .customer-name {
    font-size: 16px;
    font-weight: bold;
    padding-bottom: 2mm;
    border-bottom: 1px solid #1a1a1a;
    display: inline-block;
    margin-bottom: 2mm;
  }

  .customer-address {
    font-size: 9px;
    color: #555;
    margin-bottom: 1mm;
  }

  .subject-line {
    font-size: 11px;
    margin-top: 2mm;
  }

  .doc-info {
    text-align: right;
    font-size: 9px;
    line-height: 1.8;
    min-width: 50mm;
  }

  .doc-info-row {
    display: flex;
    justify-content: flex-end;
    gap: 3mm;
  }

  .doc-info-label {
    color: #555;
    min-width: 18mm;
    text-align: right;
  }

  .doc-info-value {
    min-width: 25mm;
    text-align: left;
    font-weight: 500;
  }

  /* === 合計金額枠 === */
  .total-box {
    border: 2px solid #2c5282;
    padding: 3mm 5mm;
    margin-bottom: 5mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f7fafc;
  }

  .total-box-label {
    font-size: 12px;
    font-weight: bold;
    color: #2c5282;
  }

  .total-box-amount {
    font-size: 18px;
    font-weight: bold;
    color: #1a365d;
    letter-spacing: 1px;
  }

  /* === 明細テーブル === */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 4mm;
    font-size: 9px;
  }

  .items-table thead th {
    background: #2c5282;
    color: white;
    padding: 2mm 2mm;
    font-weight: 600;
    font-size: 9px;
    text-align: center;
    border: 1px solid #2c5282;
  }

  .items-table thead th:first-child { width: 8mm; }
  .items-table thead th:nth-child(2) { text-align: left; }
  .items-table thead th:nth-child(3) { width: 18mm; }
  .items-table thead th:nth-child(4) { width: 25mm; }
  .items-table thead th:nth-child(5) { width: 28mm; }

  .items-table tbody td {
    padding: 1.5mm 2mm;
    border: 1px solid #cbd5e0;
    vertical-align: middle;
  }

  .items-table tbody tr:nth-child(even) {
    background: #f7fafc;
  }

  .items-table .center { text-align: center; }
  .items-table .right { text-align: right; }
  .items-table .bold { font-weight: bold; }
  .items-table .item-name { 
    text-align: left;
    max-width: 80mm;
    word-break: break-all;
  }

  /* セクション行 */
  .section-row td {
    background: #edf2f7 !important;
    font-weight: bold;
    font-size: 9px;
    color: #2d3748;
    padding: 1.5mm 3mm !important;
    border: 1px solid #cbd5e0;
  }

  /* 小計行 */
  .subtotal-row td {
    border-top: 2px solid #a0aec0;
    background: #f7fafc !important;
    padding: 1.5mm 2mm !important;
  }

  /* 空行（マス目だけ） */
  .empty-row td {
    height: 5.5mm;
  }

  /* === 合計エリア === */
  .totals-area {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 4mm;
  }

  .totals-table, /* v0.95 後方互換 */
  .totals-box {
    width: 60mm;
    font-size: 10px;
    border: 1px solid #cbd5e0;
    overflow: hidden;
  }

  /* v0.95修正 - div方式でプリンタのborder問題を回避 */
  .totals-row {
    display: flex;
  }

  .totals-label {
    text-align: right;
    background: #f7fafc;
    font-weight: 500;
    width: 28mm;
    padding: 1.5mm 3mm;
    border-right: 1px solid #cbd5e0;
  }

  .totals-value {
    text-align: right;
    font-weight: 500;
    width: 32mm;
    padding: 1.5mm 3mm;
  }

  .totals-row.grand-total {
    background: #2c5282;
    color: white;
    font-weight: bold;
    font-size: 12px;
  }

  .totals-row.grand-total .totals-label {
    background: #2c5282;
    color: white;
    font-weight: bold;
    padding: 2mm 3mm;
    border-right: 1px solid rgba(255,255,255,0.3);
  }

  .totals-row.grand-total .totals-value {
    font-weight: bold;
    padding: 2mm 3mm;
  }

  /* === 備考 === */
  .notes-section {
    margin-top: 3mm;
    padding: 2mm 3mm;
    border: 1px solid #e2e8f0;
    border-radius: 2px;
    font-size: 9px;
    background: #fffef5;
  }

  .notes-title {
    font-weight: bold;
    margin-bottom: 1mm;
    color: #2d3748;
  }

  .notes-content {
    color: #4a5568;
    line-height: 1.6;
  }

  /* === フッター === */
  .doc-footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    font-size: 8px;
    color: #a0aec0;
    text-align: center;
    padding-top: 2mm;
    border-top: 1px solid #e2e8f0;
  }

  /* === 印刷時の制御 === */
  @media print {
    body { margin: 0; }
    .page { 
      width: auto;
      min-height: auto;
    }
    .no-print { display: none !important; }
  }

  /* === 画面プレビュー時 === */
  @media screen {
    body {
      background: #e2e8f0;
      padding: 10mm;
    }
    .page {
      background: white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.15);
      padding: 12mm 10mm;
      border-radius: 2px;
    }
  }
</style>
</head>
<body>
<div class="page">
  <!-- ヘッダー -->
  <div class="doc-header">
    <div class="doc-title-area">
      <div class="doc-title">${d.docTitle}</div>
      <div class="doc-title-line"></div>
    </div>
    <div class="company-block">
      ${logoHtml}
      ${companyInfo}
      ${stampHtml}
    </div>
  </div>

  <!-- 宛先・書類情報 -->
  <div class="info-area">
    <div class="customer-block">
      ${d.customerAddress ? `<div class="customer-address">${escapeHtml(d.customerAddress)}</div>` : ''}
      <div class="customer-name">${escapeHtml(d.customerName)} 様</div>
      <div class="subject-line">件名: ${escapeHtml(d.subject)}</div>
    </div>
    <div class="doc-info">
      <div class="doc-info-row">
        <span class="doc-info-label">${d.docNumberLabel}:</span>
        <span class="doc-info-value">${d.docNumber}</span>
      </div>
      <div class="doc-info-row">
        <span class="doc-info-label">${d.docDateLabel}:</span>
        <span class="doc-info-value">${formatDate(d.docDate)}</span>
      </div>
      <div class="doc-info-row">
        <span class="doc-info-label">${d.validDateLabel}:</span>
        <span class="doc-info-value">${formatDate(d.validDate)}</span>
      </div>
    </div>
  </div>

  <!-- 合計金額枠 -->
  <div class="total-box">
    <div class="total-box-label">合計金額（税込）</div>
    <div class="total-box-amount">¥${d.total.toLocaleString()}-</div>
  </div>

  <!-- 明細テーブル -->
  <table class="items-table">
    <thead>
      <tr>
        <th>No.</th>
        <th>品名・作業内容</th>
        <th>数量</th>
        <th>単価</th>
        <th>金額</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- 合計エリア -->
  <div class="totals-area">
    <div class="totals-box">
      <div class="totals-row">
        <div class="totals-label">小計</div>
        <div class="totals-value">¥${d.subtotal.toLocaleString()}</div>
      </div>
      <div class="totals-row">
        <div class="totals-label">消費税（${d.taxRate}%）</div>
        <div class="totals-value">¥${d.tax.toLocaleString()}</div>
      </div>
      <div class="totals-row grand-total">
        <div class="totals-label">合計</div>
        <div class="totals-value">¥${d.total.toLocaleString()}</div>
      </div>
    </div>
  </div>

  <!-- 備考 -->
  ${notesHtml}

  <!-- フッター -->
  <div class="doc-footer">
    ${s.companyName || ''} | ${d.docNumberLabel}: ${d.docNumber}
  </div>
</div>
</body>
</html>`;
}


// ==========================================
// ドキュメント出力処理（印刷/保存/共有）
// ==========================================
async function outputDocument(html, mode, filenameBase, data, docNumber, docType) {
  // 新しいウィンドウにHTMLを書き込む
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('ポップアップがブロックされました。\nブラウザの設定でポップアップを許可してください。');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // 画像の読み込みを待つ
  await new Promise(resolve => {
    printWindow.onload = resolve;
    // フォールバック: 1秒後に強制実行
    setTimeout(resolve, 1000);
  });

  if (mode === 'print' || mode === 'download') {
    // 印刷ダイアログを開く（PDFとして保存も可能）
    printWindow.print();
  } else if (mode === 'share') {
    // 印刷ダイアログ経由で共有
    printWindow.print();
  }

  // 見積もり/請求書を保存
  saveDocumentData(data, docNumber, docType);

  // モーダルを閉じる
  if (docType === 'estimate' && typeof closeOutputModal === 'function') {
    closeOutputModal();
  } else if (docType === 'invoice' && typeof closeInvOutputModal === 'function') {
    closeInvOutputModal();
  }
}


// ==========================================
// ドキュメントデータの保存
// ==========================================
function saveDocumentData(data, docNumber, docType) {
  const doc = { ...data };
  doc.status = 'completed';
  doc.id = Date.now();
  doc.number = docNumber;

  if (docType === 'estimate') {
    const estimates = JSON.parse(localStorage.getItem('reform_app_estimates') || '[]');
    estimates.push(doc);
    localStorage.setItem('reform_app_estimates', JSON.stringify(estimates));
  } else {
    const invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
    invoices.push(doc);
    localStorage.setItem('reform_app_invoices', JSON.stringify(invoices));
  }
}
