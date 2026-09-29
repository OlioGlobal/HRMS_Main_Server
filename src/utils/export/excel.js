// ─── Excel export helper (exceljs) ───────────────────────────────────────────
// Builds a styled .xlsx workbook buffer from one or more sheet definitions.
// Kept generic so both the attendance and payroll reports can reuse it.
// NOTE: `exceljs` is required lazily (inside buildWorkbook) so a missing dep can
// never crash server startup — only the report endpoints fail until it's installed.

const HEADER_FILL   = 'FF18181B'; // zinc-900 (matches app theme)
const HEADER_FONT   = 'FFFFFFFF';
const TITLE_FONT    = 'FF18181B';
const BORDER_COLOR  = 'FFE4E4E7';

/**
 * @typedef {Object} Column
 * @property {string} header   Column header label
 * @property {string} key      Row object key to read
 * @property {number} [width]  Column width (chars)
 * @property {'left'|'center'|'right'} [align]
 * @property {'number'|'currency'|'text'} [type]  Number formatting hint
 */

/**
 * @typedef {Object} Sheet
 * @property {string} name              Sheet tab name (<=31 chars, no []:*?/\)
 * @property {Column[]} columns
 * @property {Object[]} rows            Array of row objects keyed by column.key
 * @property {string} [title]           Big title row above the table
 * @property {string[]} [subtitles]     Small info rows under the title
 * @property {Object} [totals]          Optional totals row (keyed by column.key)
 */

const safeSheetName = (name) =>
  (name || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);

const addSheet = (wb, sheet) => {
  const ws = wb.addWorksheet(safeSheetName(sheet.name), {
    views: [{ state: 'frozen', ySplit: 0 }],
  });

  const cols = sheet.columns || [];
  const colCount = cols.length;
  let rowCursor = 1;

  // ─── Title ───────────────────────────────────────────────────────────────
  if (sheet.title) {
    ws.mergeCells(rowCursor, 1, rowCursor, Math.max(colCount, 1));
    const cell = ws.getCell(rowCursor, 1);
    cell.value = sheet.title;
    cell.font = { bold: true, size: 14, color: { argb: TITLE_FONT } };
    cell.alignment = { vertical: 'middle' };
    ws.getRow(rowCursor).height = 22;
    rowCursor++;
  }

  // ─── Subtitles (filters applied, generated-at, etc.) ─────────────────────
  for (const sub of sheet.subtitles || []) {
    ws.mergeCells(rowCursor, 1, rowCursor, Math.max(colCount, 1));
    const cell = ws.getCell(rowCursor, 1);
    cell.value = sub;
    cell.font = { size: 10, color: { argb: 'FF71717A' } };
    rowCursor++;
  }

  if (sheet.title || (sheet.subtitles && sheet.subtitles.length)) {
    rowCursor++; // spacer row
  }

  // ─── Header row ──────────────────────────────────────────────────────────
  const headerRowIdx = rowCursor;
  const headerRow = ws.getRow(headerRowIdx);
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: c.align || 'left', wrapText: true };
    cell.border = thinBorder();
  });
  headerRow.height = 20;
  rowCursor++;

  // ─── Data rows ───────────────────────────────────────────────────────────
  for (const row of sheet.rows || []) {
    const r = ws.getRow(rowCursor);
    cols.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      const val = row[c.key];
      cell.value = val === undefined || val === null ? '' : val;
      cell.alignment = { vertical: 'middle', horizontal: c.align || 'left' };
      cell.border = thinBorder();
      applyFormat(cell, c.type);
    });
    rowCursor++;
  }

  // ─── Totals row ──────────────────────────────────────────────────────────
  if (sheet.totals) {
    const r = ws.getRow(rowCursor);
    cols.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      const val = sheet.totals[c.key];
      cell.value = val === undefined || val === null ? '' : val;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
      cell.alignment = { vertical: 'middle', horizontal: c.align || 'left' };
      cell.border = thinBorder();
      applyFormat(cell, c.type);
    });
    rowCursor++;
  }

  // ─── Column widths ───────────────────────────────────────────────────────
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width || 16;
  });

  // Enable auto-filter on the header row
  if (colCount > 0) {
    ws.autoFilter = {
      from: { row: headerRowIdx, column: 1 },
      to:   { row: headerRowIdx, column: colCount },
    };
  }
};

const thinBorder = () => ({
  top:    { style: 'thin', color: { argb: BORDER_COLOR } },
  left:   { style: 'thin', color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
  right:  { style: 'thin', color: { argb: BORDER_COLOR } },
});

const applyFormat = (cell, type) => {
  if (type === 'currency') cell.numFmt = '#,##0.00';
  else if (type === 'number') cell.numFmt = '#,##0.##';
};

/**
 * Build an .xlsx buffer from an array of sheet definitions.
 * @param {Sheet[]} sheets
 * @returns {Promise<Buffer>}
 */
const buildWorkbook = async (sheets) => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HRMS';
  wb.created = new Date();
  for (const s of sheets) addSheet(wb, s);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
};

module.exports = { buildWorkbook };
