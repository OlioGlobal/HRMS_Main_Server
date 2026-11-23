/**
 * A payslip with no deductions prints the currency zero, not "NA".
 * Pure rendering test: no database needed.
 */
const test   = require('node:test');
const assert = require('node:assert');
const { buildPayslipData, renderPayslipHtml } = require('../src/utils/payslipTemplate');

const company  = { name: 'Acme', settings: { currency: 'USD' } };
const employee = { firstName: 'Sneha', lastName: 'K', employeeId: 'E1' };

const render = (record) => renderPayslipHtml(buildPayslipData({
  record: { month: 10, year: 2026, earnings: [{ name: 'Basic', amount: 50000 }], grossEarnings: 50000, netPay: 50000, ...record },
  employee,
  company,
}));

test('no deductions at all: Total Deduction shows $0, never NA', () => {
  const html = render({ deductions: [], totalDeductions: 0 });
  assert.ok(!html.includes('NA'), 'slip still contains "NA"');
  assert.match(html, /Total Deduction<\/td><td class="amt" style="text-align:right">\$0</);
});

test('a deduction row with no amount stays NA, while the total shows $0', () => {
  const html = render({ deductions: [{ name: 'PF', amount: 0 }], totalDeductions: 0 });
  assert.match(html, /<td class="cell name">PF<\/td>\s*<td class="cell amt">NA</);
  assert.match(html, /Total Deduction<\/td><td class="amt" style="text-align:right">\$0</);
});

test('non-zero deductions are unchanged', () => {
  const html = render({ deductions: [{ name: 'PF', amount: 3000 }], totalDeductions: 3000 });
  assert.match(html, /<td class="cell amt">\$3,000</);
  assert.match(html, /Total Deduction<\/td><td class="amt" style="text-align:right">\$3,000</);
});
