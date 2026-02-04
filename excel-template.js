// ==========================================
// 見積書・請求書 Excelテンプレート生成
// Reform App Pro v0.95
// ==========================================
// このファイルはxlsx-js-styleを使用して
// スタイル付き（罫線・背景色・フォント）の
// 見積書・請求書Excelを出力する
//
// doc-template.js（HTML/PDF版）と同じレイアウトを
// Excelセルで再現する
//
// 依存: xlsx-js-style (XLSX グローバル変数)
// ==========================================


// ==========================================
// 共通スタイル定義
// v0.95追加 - Excelセルスタイル
// ==========================================

// カラー定義（PDFテンプレートと統一）
const EXCEL_COLORS = {
  navy: '2C5282',       // ヘッダー背景・タイトル
  navyDark: '1A365D',   // タイトル文字
  white: 'FFFFFF',
  black: '1A1A1A',
  grayLight: 'E8F0FE',  // v0.95修正: 偶数行背景（薄い青）
  grayBorder: 'CBD5E0', // 罫線色
  grayText: '555555',   // ラベル文字
  sectionBg: 'EDF2F7',  // セクション行背景
  sectionText: '2D3748', // セクション行文字
  notesBg: 'FFFEF5',    // 備考背景
  totalBoxBg: 'EBF5FB',  // v0.95修正: 合計欄背景（薄い青）
};

// 罫線スタイル
const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: EXCEL_COLORS.grayBorder } },
  bottom: { style: 'thin', color: { rgb: EXCEL_COLORS.grayBorder } },
  left: { style: 'thin', color: { rgb: EXCEL_COLORS.grayBorder } },
  right: { style: 'thin', color: { rgb: EXCEL_COLORS.grayBorder } },
};

// v0.95追加 - フォント定義
const FONT_TITLE = { name: 'Yu Gothic', sz: 18, bold: true, color: { rgb: EXCEL_COLORS.navyDark } };
const FONT_HEADER = { name: 'Yu Gothic', sz: 10, bold: true, color: { rgb: EXCEL_COLORS.white } };
const FONT_NORMAL = { name: 'Yu Gothic', sz: 9, color: { rgb: EXCEL_COLORS.black } };
const FONT_BOLD = { name: 'Yu Gothic', sz: 9, bold: true, color: { rgb: EXCEL_COLORS.black } };
const FONT_LABEL = { name: 'Yu Gothic', sz: 9, color: { rgb: EXCEL_COLORS.grayText } };
const FONT_TOTAL_WHITE = { name: 'Yu Gothic', sz: 11, bold: true, color: { rgb: EXCEL_COLORS.white } };
const FONT_AMOUNT = { name: 'Yu Gothic', sz: 14, bold: true, color: { rgb: EXCEL_COLORS.navyDark } };
const FONT_COMPANY = { name: 'Yu Gothic', sz: 10, bold: true, color: { rgb: EXCEL_COLORS.black } };
const FONT_SMALL = { name: 'Yu Gothic', sz: 8, color: { rgb: EXCEL_COLORS.grayText } };
const FONT_SECTION = { name: 'Yu Gothic', sz: 9, bold: true, color: { rgb: EXCEL_COLORS.sectionText } };
const FONT_CUSTOMER = { name: 'Yu Gothic', sz: 13, bold: true, color: { rgb: EXCEL_COLORS.black } };


// ==========================================
// セルオブジェクト生成ヘルパー
// v0.95追加
// ==========================================

// テキストセル
function xlTextCell(value, style) {
  return { v: value || '', t: 's', s: style || {} };
}

// 数値セル（¥カンマ付き）
function xlYenCell(value, style) {
  const s = Object.assign({}, style || {}, { numFmt: '¥#,##0' });
  return { v: value || 0, t: 'n', s: s };
}

// 数値セル（通常）
function xlNumCell(value, style) {
  return { v: value || 0, t: 'n', s: style || {} };
}

// 空セル（スタイル付き）
function xlEmptyCell(style) {
  return { v: '', t: 's', s: style || {} };
}


// ==========================================
// 見積書Excel出力（スタイル付き）
// v0.95追加 - estimate.jsのexportEstimateExcelから呼ばれる
// ==========================================
function exportEstimateExcelStyled() {
  const data = getEstimateData();
  const settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  const estimateNumber = generateEstimateNumber();

  const wb = generateStyledExcel({
    docType: 'estimate',
    docTitle: '御 見 積 書',
    docNumber: estimateNumber,
    docNumberLabel: '見積番号',
    docDate: data.date,
    docDateLabel: '見積日',
    validDate: data.validDate,
    validDateLabel: '有効期限',
    customerName: data.customerName,
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
    settings: settings
  });

  // ダウンロード
  var filename = '見積書_' + data.customerName + '_' + data.date + '.xlsx';
  XLSX.writeFile(wb, filename);

  // 保存処理
  data.status = 'completed';
  data.id = Date.now();
  data.number = estimateNumber;
  var estimates = JSON.parse(localStorage.getItem('reform_app_estimates') || '[]');
  estimates.push(data);
  localStorage.setItem('reform_app_estimates', JSON.stringify(estimates));

  closeOutputModal();
  alert('Excel出力完了！\n見積番号: ' + estimateNumber + '\nファイル: ' + filename);
}


// ==========================================
// 請求書Excel出力（スタイル付き）
// v0.95追加 - invoice.jsのexportInvoiceExcelから呼ばれる
// ==========================================
function exportInvoiceExcelStyled() {
  var data = getInvoiceData();
  var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  var invoiceNumber = generateInvoiceNumber();

  var wb = generateStyledExcel({
    docType: 'invoice',
    docTitle: '御 請 求 書',
    docNumber: invoiceNumber,
    docNumberLabel: '請求番号',
    docDate: data.date,
    docDateLabel: '請求日',
    validDate: data.dueDate,
    validDateLabel: 'お支払期限',
    customerName: data.customerName,
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
    settings: settings
  });

  var filename = '請求書_' + data.customerName + '_' + data.date + '.xlsx';
  XLSX.writeFile(wb, filename);

  data.status = 'completed';
  data.id = Date.now();
  data.number = invoiceNumber;
  var invoices = JSON.parse(localStorage.getItem('reform_app_invoices') || '[]');
  invoices.push(data);
  localStorage.setItem('reform_app_invoices', JSON.stringify(invoices));

  if (typeof closeInvOutputModal === 'function') closeInvOutputModal();
  alert('Excel出力完了！\n請求番号: ' + invoiceNumber + '\nファイル: ' + filename);
}


// ==========================================
// スタイル付きExcelワークブック生成（共通）
// v0.95追加
// ==========================================
function generateStyledExcel(d) {
  var wb = XLSX.utils.book_new();
  var s = d.settings;

  // ワークシートデータを格納する二次元配列
  var rows = [];
  var merges = [];
  var currentRow = 0;

  // ------------------------------------------
  // 行0: タイトル
  // ------------------------------------------
  rows.push([
    xlTextCell(d.docTitle, {
      font: FONT_TITLE,
      alignment: { horizontal: 'left', vertical: 'center' },
    }),
    xlEmptyCell(),
    xlEmptyCell(),
    xlTextCell(s.companyName || '', {
      font: FONT_COMPANY,
      alignment: { horizontal: 'right', vertical: 'center' },
    }),
    xlEmptyCell(),
  ]);
  // タイトル結合 A1:B1、会社名 D1:E1
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } });
  merges.push({ s: { r: 0, c: 3 }, e: { r: 0, c: 4 } });
  currentRow++;

  // ------------------------------------------
  // 行1: タイトル下線（ネイビー帯）
  // ------------------------------------------
  var titleLineFill = { fgColor: { rgb: EXCEL_COLORS.navy } };
  rows.push([
    xlEmptyCell({ fill: titleLineFill }),
    xlEmptyCell({ fill: titleLineFill }),
    xlEmptyCell({ fill: titleLineFill }),
    xlTextCell(
      (s.postalCode || s.address) ? '〒' + (s.postalCode || '') + ' ' + (s.address || '') : '',
      { font: FONT_SMALL, alignment: { horizontal: 'right', vertical: 'center' } }
    ),
    xlEmptyCell(),
  ]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 2 } });
  merges.push({ s: { r: 1, c: 3 }, e: { r: 1, c: 4 } });
  currentRow++;

  // ------------------------------------------
  // 行2: 空行 + TEL
  // ------------------------------------------
  rows.push([
    xlEmptyCell(), xlEmptyCell(), xlEmptyCell(),
    xlTextCell(
      s.phone ? 'TEL: ' + s.phone + (s.fax ? ' / FAX: ' + s.fax : '') : '',
      { font: FONT_SMALL, alignment: { horizontal: 'right', vertical: 'center' } }
    ),
    xlEmptyCell(),
  ]);
  merges.push({ s: { r: 2, c: 3 }, e: { r: 2, c: 4 } });
  currentRow++;

  // ------------------------------------------
  // 行3: 登録番号
  // ------------------------------------------
  rows.push([
    xlEmptyCell(), xlEmptyCell(), xlEmptyCell(),
    xlTextCell(
      (s.isInvoiceRegistered && s.invoiceNumber) ? '登録番号: ' + s.invoiceNumber : '',
      { font: FONT_SMALL, alignment: { horizontal: 'right', vertical: 'center' } }
    ),
    xlEmptyCell(),
  ]);
  merges.push({ s: { r: 3, c: 3 }, e: { r: 3, c: 4 } });
  currentRow++;

  // ------------------------------------------
  // 行4: 宛名 + 書類番号
  // ------------------------------------------
  var customerUnderline = { bottom: { style: 'thin', color: { rgb: EXCEL_COLORS.black } } };
  rows.push([
    xlTextCell((d.customerName || '') + ' 様', {
      font: FONT_CUSTOMER,
      alignment: { horizontal: 'left', vertical: 'center' },
      border: customerUnderline,
    }),
    xlEmptyCell({ border: customerUnderline }),
    xlEmptyCell(),
    xlTextCell(d.docNumberLabel + ': ' + d.docNumber, {
      font: FONT_LABEL,
      alignment: { horizontal: 'right', vertical: 'center' },
    }),
    xlEmptyCell(),
  ]);
  merges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: 1 } });
  merges.push({ s: { r: 4, c: 3 }, e: { r: 4, c: 4 } });
  currentRow++;

  // ------------------------------------------
  // 行5: 件名 + 日付
  // ------------------------------------------
  rows.push([
    xlTextCell('件名: ' + (d.subject || ''), {
      font: FONT_NORMAL,
      alignment: { horizontal: 'left', vertical: 'center' },
    }),
    xlEmptyCell(),
    xlEmptyCell(),
    xlTextCell(d.docDateLabel + ': ' + formatDate(d.docDate), {
      font: FONT_LABEL,
      alignment: { horizontal: 'right', vertical: 'center' },
    }),
    xlEmptyCell(),
  ]);
  merges.push({ s: { r: 5, c: 0 }, e: { r: 5, c: 1 } });
  merges.push({ s: { r: 5, c: 3 }, e: { r: 5, c: 4 } });
  currentRow++;

  // ------------------------------------------
  // 行6: 有効期限
  // ------------------------------------------
  rows.push([
    xlEmptyCell(), xlEmptyCell(), xlEmptyCell(),
    xlTextCell(d.validDateLabel + ': ' + formatDate(d.validDate), {
      font: FONT_LABEL,
      alignment: { horizontal: 'right', vertical: 'center' },
    }),
    xlEmptyCell(),
  ]);
  merges.push({ s: { r: 6, c: 3 }, e: { r: 6, c: 4 } });
  currentRow++;

  // ------------------------------------------
  // 行7: 合計金額枠（ネイビー太枠）
  // ------------------------------------------
  var navyBorderAll = {
    top: { style: 'medium', color: { rgb: EXCEL_COLORS.navy } },
    bottom: { style: 'medium', color: { rgb: EXCEL_COLORS.navy } },
    left: { style: 'medium', color: { rgb: EXCEL_COLORS.navy } },
    right: { style: 'medium', color: { rgb: EXCEL_COLORS.navy } },
  };
  var navyBorderMid = {
    top: { style: 'medium', color: { rgb: EXCEL_COLORS.navy } },
    bottom: { style: 'medium', color: { rgb: EXCEL_COLORS.navy } },
  };
  rows.push([
    xlTextCell('合計金額（税込）', {
      font: { name: 'Yu Gothic', sz: 11, bold: true, color: { rgb: EXCEL_COLORS.navy } },
      fill: { fgColor: { rgb: EXCEL_COLORS.totalBoxBg } },
      border: navyBorderAll,
      alignment: { horizontal: 'left', vertical: 'center' },
    }),
    xlEmptyCell({ fill: { fgColor: { rgb: EXCEL_COLORS.totalBoxBg } }, border: navyBorderMid }),
    xlEmptyCell({ fill: { fgColor: { rgb: EXCEL_COLORS.totalBoxBg } }, border: navyBorderMid }),
    xlYenCell(d.total, {
      font: FONT_AMOUNT,
      fill: { fgColor: { rgb: EXCEL_COLORS.totalBoxBg } },
      border: navyBorderAll,
      alignment: { horizontal: 'right', vertical: 'center' },
    }),
    xlEmptyCell({
      fill: { fgColor: { rgb: EXCEL_COLORS.totalBoxBg } },
      border: {
        top: { style: 'medium', color: { rgb: EXCEL_COLORS.navy } },
        bottom: { style: 'medium', color: { rgb: EXCEL_COLORS.navy } },
        right: { style: 'medium', color: { rgb: EXCEL_COLORS.navy } },
      },
    }),
  ]);
  merges.push({ s: { r: 7, c: 0 }, e: { r: 7, c: 2 } });
  merges.push({ s: { r: 7, c: 3 }, e: { r: 7, c: 4 } });
  currentRow++;

  // ------------------------------------------
  // 行8: 空行
  // ------------------------------------------
  rows.push([xlEmptyCell(), xlEmptyCell(), xlEmptyCell(), xlEmptyCell(), xlEmptyCell()]);
  currentRow++;

  // ------------------------------------------
  // 行9: テーブルヘッダー（ネイビー背景）
  // ------------------------------------------
  var headerStyle = {
    font: FONT_HEADER,
    fill: { fgColor: { rgb: EXCEL_COLORS.navy } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_COLORS.navy } },
      bottom: { style: 'thin', color: { rgb: EXCEL_COLORS.navy } },
      left: { style: 'thin', color: { rgb: EXCEL_COLORS.navy } },
      right: { style: 'thin', color: { rgb: EXCEL_COLORS.navy } },
    },
  };
  var headerStyleLeft = Object.assign({}, headerStyle, {
    alignment: { horizontal: 'left', vertical: 'center' },
  });
  rows.push([
    xlTextCell('No.', headerStyle),
    xlTextCell('品名・作業内容', headerStyleLeft),
    xlTextCell('数量', headerStyle),
    xlTextCell('単価', headerStyle),
    xlTextCell('金額', headerStyle),
  ]);
  var headerRowIdx = currentRow;
  currentRow++;

  // ------------------------------------------
  // 明細行の生成
  // ------------------------------------------
  var no = 1;
  var dataRowCount = 0;

  // --- 材料費セクション ---
  if (d.materials && d.materials.length > 0) {
    // セクションヘッダー
    var sectionStyle = {
      font: FONT_SECTION,
      fill: { fgColor: { rgb: EXCEL_COLORS.sectionBg } },
      border: BORDER_THIN,
      alignment: { horizontal: 'left', vertical: 'center' },
    };
    rows.push([
      xlTextCell('【材料費】', sectionStyle),
      xlEmptyCell(sectionStyle),
      xlEmptyCell(sectionStyle),
      xlEmptyCell(sectionStyle),
      xlEmptyCell(sectionStyle),
    ]);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 4 } });
    currentRow++;
    dataRowCount++;

    // 各材料行
    d.materials.forEach(function(m) {
      if (m.name) {
        var unitPrice = m.sellingPrice || m.price || 0;
        var amount = (m.quantity || 0) * unitPrice;
        var isEven = dataRowCount % 2 === 1;
        var rowBg = isEven ? { fgColor: { rgb: EXCEL_COLORS.grayLight } } : { fgColor: { rgb: EXCEL_COLORS.white } };
        var cb = { font: FONT_NORMAL, border: BORDER_THIN, fill: rowBg };

        rows.push([
          xlNumCell(no, Object.assign({}, cb, { alignment: { horizontal: 'center', vertical: 'center' } })),
          xlTextCell(m.name, Object.assign({}, cb, { alignment: { horizontal: 'left', vertical: 'center' } })),
          xlNumCell(m.quantity || 0, Object.assign({}, cb, { alignment: { horizontal: 'center', vertical: 'center' } })),
          xlYenCell(unitPrice, Object.assign({}, cb, { alignment: { horizontal: 'right', vertical: 'center' } })),
          xlYenCell(amount, Object.assign({}, cb, { alignment: { horizontal: 'right', vertical: 'center' } })),
        ]);
        no++;
        currentRow++;
        dataRowCount++;
      }
    });

    // 材料費小計行
    var matSubStyle = {
      font: FONT_BOLD,
      fill: { fgColor: { rgb: EXCEL_COLORS.grayLight } },
      border: Object.assign({}, BORDER_THIN, {
        top: { style: 'medium', color: { rgb: 'A0AEC0' } },
      }),
      alignment: { horizontal: 'right', vertical: 'center' },
    };
    var matSubEmpty = {
      border: Object.assign({}, BORDER_THIN, {
        top: { style: 'medium', color: { rgb: 'A0AEC0' } },
      }),
      fill: { fgColor: { rgb: EXCEL_COLORS.grayLight } },
    };
    rows.push([
      xlEmptyCell(matSubEmpty),
      xlEmptyCell(matSubEmpty),
      xlEmptyCell(matSubEmpty),
      xlTextCell('材料費 小計', matSubStyle),
      xlYenCell(d.materialSubtotal, matSubStyle),
    ]);
    currentRow++;
    dataRowCount++;
  }

  // --- 作業費セクション ---
  if (d.works && d.works.length > 0) {
    var sectionStyle2 = {
      font: FONT_SECTION,
      fill: { fgColor: { rgb: EXCEL_COLORS.sectionBg } },
      border: BORDER_THIN,
      alignment: { horizontal: 'left', vertical: 'center' },
    };
    rows.push([
      xlTextCell('【作業費】', sectionStyle2),
      xlEmptyCell(sectionStyle2),
      xlEmptyCell(sectionStyle2),
      xlEmptyCell(sectionStyle2),
      xlEmptyCell(sectionStyle2),
    ]);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 4 } });
    currentRow++;
    dataRowCount++;

    d.works.forEach(function(w) {
      if (w.name || w.value) {
        var qtyStr, unitPriceVal, amount;
        if (d.workType === 'construction') {
          qtyStr = w.unit || '1式';
          unitPriceVal = null;
          amount = w.value || 0;
        } else {
          qtyStr = (w.quantity || 1) + '日';
          unitPriceVal = w.value || 0;
          amount = (w.quantity || 1) * (w.value || 0);
        }

        var isEven = dataRowCount % 2 === 1;
        var rowBg = isEven ? { fgColor: { rgb: EXCEL_COLORS.grayLight } } : { fgColor: { rgb: EXCEL_COLORS.white } };
        var cb = { font: FONT_NORMAL, border: BORDER_THIN, fill: rowBg };

        rows.push([
          xlNumCell(no, Object.assign({}, cb, { alignment: { horizontal: 'center', vertical: 'center' } })),
          xlTextCell(w.name || '作業', Object.assign({}, cb, { alignment: { horizontal: 'left', vertical: 'center' } })),
          xlTextCell(qtyStr, Object.assign({}, cb, { alignment: { horizontal: 'center', vertical: 'center' } })),
          unitPriceVal !== null
            ? xlYenCell(unitPriceVal, Object.assign({}, cb, { alignment: { horizontal: 'right', vertical: 'center' } }))
            : xlEmptyCell(Object.assign({}, cb, { alignment: { horizontal: 'right', vertical: 'center' } })),
          xlYenCell(amount, Object.assign({}, cb, { alignment: { horizontal: 'right', vertical: 'center' } })),
        ]);
        no++;
        currentRow++;
        dataRowCount++;
      }
    });

    // 作業費小計行
    var wkSubStyle = {
      font: FONT_BOLD,
      fill: { fgColor: { rgb: EXCEL_COLORS.grayLight } },
      border: Object.assign({}, BORDER_THIN, {
        top: { style: 'medium', color: { rgb: 'A0AEC0' } },
      }),
      alignment: { horizontal: 'right', vertical: 'center' },
    };
    var wkSubEmpty = {
      border: Object.assign({}, BORDER_THIN, {
        top: { style: 'medium', color: { rgb: 'A0AEC0' } },
      }),
      fill: { fgColor: { rgb: EXCEL_COLORS.grayLight } },
    };
    rows.push([
      xlEmptyCell(wkSubEmpty),
      xlEmptyCell(wkSubEmpty),
      xlEmptyCell(wkSubEmpty),
      xlTextCell('作業費 小計', wkSubStyle),
      xlYenCell(d.workSubtotal, wkSubStyle),
    ]);
    currentRow++;
    dataRowCount++;
  }

  // ------------------------------------------
  // 空行で25行まで埋める（マス目を揃える）
  // ------------------------------------------
  var minRows = 25;
  while (dataRowCount < minRows) {
    var isEven = dataRowCount % 2 === 1;
    var rowBg = isEven ? { fgColor: { rgb: EXCEL_COLORS.grayLight } } : { fgColor: { rgb: EXCEL_COLORS.white } };
    var cb = { font: FONT_NORMAL, border: BORDER_THIN, fill: rowBg };
    rows.push([
      xlEmptyCell(Object.assign({}, cb, { alignment: { horizontal: 'center' } })),
      xlEmptyCell(cb),
      xlEmptyCell(Object.assign({}, cb, { alignment: { horizontal: 'center' } })),
      xlEmptyCell(Object.assign({}, cb, { alignment: { horizontal: 'right' } })),
      xlEmptyCell(Object.assign({}, cb, { alignment: { horizontal: 'right' } })),
    ]);
    currentRow++;
    dataRowCount++;
  }

  // ------------------------------------------
  // 空行
  // ------------------------------------------
  rows.push([xlEmptyCell(), xlEmptyCell(), xlEmptyCell(), xlEmptyCell(), xlEmptyCell()]);
  currentRow++;

  // ------------------------------------------
  // 合計エリア（右寄せ D:E列）
  // ------------------------------------------
  var labelStyle = {
    font: FONT_BOLD,
    fill: { fgColor: { rgb: EXCEL_COLORS.grayLight } },
    border: BORDER_THIN,
    alignment: { horizontal: 'right', vertical: 'center' },
  };
  var valueStyle = {
    font: FONT_BOLD,
    border: BORDER_THIN,
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '¥#,##0',
  };

  // 小計
  rows.push([
    xlEmptyCell(), xlEmptyCell(), xlEmptyCell(),
    xlTextCell('小計', labelStyle),
    xlYenCell(d.subtotal, valueStyle),
  ]);
  currentRow++;

  // 消費税
  rows.push([
    xlEmptyCell(), xlEmptyCell(), xlEmptyCell(),
    xlTextCell('消費税（' + d.taxRate + '%）', labelStyle),
    xlYenCell(d.tax, valueStyle),
  ]);
  currentRow++;

  // 合計（ネイビー背景）
  var grandNavyBorder = {
    top: { style: 'thin', color: { rgb: EXCEL_COLORS.navy } },
    bottom: { style: 'thin', color: { rgb: EXCEL_COLORS.navy } },
    left: { style: 'thin', color: { rgb: EXCEL_COLORS.navy } },
    right: { style: 'thin', color: { rgb: EXCEL_COLORS.navy } },
  };
  rows.push([
    xlEmptyCell(), xlEmptyCell(), xlEmptyCell(),
    xlTextCell('合計', {
      font: FONT_TOTAL_WHITE,
      fill: { fgColor: { rgb: EXCEL_COLORS.navy } },
      border: grandNavyBorder,
      alignment: { horizontal: 'right', vertical: 'center' },
    }),
    { v: d.total, t: 'n', s: {
      font: FONT_TOTAL_WHITE,
      fill: { fgColor: { rgb: EXCEL_COLORS.navy } },
      border: grandNavyBorder,
      numFmt: '¥#,##0',
      alignment: { horizontal: 'right', vertical: 'center' },
    }},
  ]);
  currentRow++;

  // ------------------------------------------
  // 備考
  // ------------------------------------------
  if (d.notes) {
    rows.push([xlEmptyCell(), xlEmptyCell(), xlEmptyCell(), xlEmptyCell(), xlEmptyCell()]);
    currentRow++;

    var notesTitleStyle = {
      font: FONT_BOLD,
      fill: { fgColor: { rgb: EXCEL_COLORS.notesBg } },
      border: BORDER_THIN,
      alignment: { horizontal: 'left', vertical: 'center' },
    };
    var notesBodyStyle = {
      font: FONT_NORMAL,
      fill: { fgColor: { rgb: EXCEL_COLORS.notesBg } },
      border: BORDER_THIN,
      alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
    };
    var notesEmptyStyle = {
      fill: { fgColor: { rgb: EXCEL_COLORS.notesBg } },
      border: BORDER_THIN,
    };
    rows.push([
      xlTextCell('【備考】', notesTitleStyle),
      xlTextCell(d.notes, notesBodyStyle),
      xlEmptyCell(notesEmptyStyle),
      xlEmptyCell(notesEmptyStyle),
      xlEmptyCell(notesEmptyStyle),
    ]);
    // 備考はB列をC:E列と結合
    merges.push({ s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 4 } });
    currentRow++;
  }

  // ------------------------------------------
  // フッター
  // ------------------------------------------
  rows.push([xlEmptyCell(), xlEmptyCell(), xlEmptyCell(), xlEmptyCell(), xlEmptyCell()]);
  currentRow++;

  rows.push([
    xlTextCell(
      (s.companyName || '') + ' | ' + d.docNumberLabel + ': ' + d.docNumber,
      { font: FONT_SMALL, alignment: { horizontal: 'center', vertical: 'center' } }
    ),
    xlEmptyCell(), xlEmptyCell(), xlEmptyCell(), xlEmptyCell(),
  ]);
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 4 } });
  currentRow++;

  // ==========================================
  // ワークシート生成とスタイル適用
  // ==========================================
  var ws = XLSX.utils.aoa_to_sheet(rows);

  // 列幅（PDF版と同じ比率）
  ws['!cols'] = [
    { wch: 6 },   // A: No.
    { wch: 35 },  // B: 品名
    { wch: 10 },  // C: 数量
    { wch: 14 },  // D: 単価
    { wch: 16 },  // E: 金額
  ];

  // 行高さ
  ws['!rows'] = [];
  for (var i = 0; i < currentRow; i++) {
    if (i === 0) {
      ws['!rows'][i] = { hpt: 28 }; // タイトル
    } else if (i === 1) {
      ws['!rows'][i] = { hpt: 5 };  // タイトル下線帯
    } else if (i === 7) {
      ws['!rows'][i] = { hpt: 26 }; // 合計金額枠
    } else {
      ws['!rows'][i] = { hpt: 18 }; // 通常行
    }
  }

  // セル結合
  ws['!merges'] = merges;

  // シート追加
  var sheetName = d.docType === 'estimate' ? '見積書' : '請求書';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  return wb;
}
