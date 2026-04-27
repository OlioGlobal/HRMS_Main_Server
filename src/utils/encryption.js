const crypto = require('crypto');

const PREFIX = 'ENC_v1:';

// Lazy-load key — allows the module to be required before env validation runs
let _key = null;
const _getKey = () => {
  if (!_key) {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    _key = Buffer.from(hex, 'hex');
  }
  return _key;
};

// ─── Core encrypt / decrypt ────────────────────────────────────────────────────

// Encrypts any value. Stores as: ENC_v1:{iv_hex}:{authTag_hex}:{ciphertext_hex}
// iv and authTag are hex (0-9, a-f only) — no ':' collision possible.
const encrypt = (value) => {
  if (value == null) return value;
  const key = _getKey();
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = cipher.update(String(value), 'utf8', 'hex') + cipher.final('hex');
  return `${PREFIX}${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc}`;
};

// Internal: raw AES-GCM decrypt — always returns a string
const _decryptRaw = (str) => {
  const key   = _getKey();
  const inner = str.slice(PREFIX.length); // strip 'ENC_v1:'

  // Find the two ':' separators safely (hex chars cannot contain ':')
  const c1 = inner.indexOf(':');
  const c2 = inner.indexOf(':', c1 + 1);
  if (c1 === -1 || c2 === -1) throw new Error(`Malformed encrypted value: ${str.slice(0, 30)}`);

  const ivHex      = inner.slice(0, c1);
  const authTagHex = inner.slice(c1 + 1, c2);
  const ciphertext = inner.slice(c2 + 1);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8');
};

// Decrypt a NUMERIC field — always returns a Number.
// Handles three cases: plain Number (old records), encrypted string, plain string number (safety).
const decrypt = (value) => {
  if (value == null) return value;
  if (typeof value === 'number') return value; // old unencrypted record — pass through

  const str = String(value);
  if (!str.startsWith(PREFIX)) {
    // Plain string that somehow ended up here — parse safely
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(_decryptRaw(str));
  return isNaN(n) ? 0 : n;
};

// Decrypt a STRING field (bankDetails.accountNumber, ifscCode) — returns String.
const decryptString = (value) => {
  if (value == null) return value;
  if (typeof value === 'number') return String(value);
  const str = String(value);
  if (!str.startsWith(PREFIX)) return str; // not encrypted, return as-is
  return _decryptRaw(str);
};

// Check if a value is currently encrypted
const isEncrypted = (value) =>
  typeof value === 'string' && value.startsWith(PREFIX);

// ─── EmployeeSalary helpers ────────────────────────────────────────────────────

const encryptSalaryDoc = (doc) => {
  if (!doc) return doc;
  const out = { ...doc };
  if (out.ctcMonthly != null) out.ctcMonthly = encrypt(out.ctcMonthly);
  if (out.ctcAnnual  != null) out.ctcAnnual  = encrypt(out.ctcAnnual);
  if (Array.isArray(out.components)) {
    out.components = out.components.map((c) => ({
      ...c,
      monthlyAmount: c.monthlyAmount != null ? encrypt(c.monthlyAmount) : c.monthlyAmount,
    }));
  }
  return out;
};

const decryptSalaryDoc = (doc) => {
  if (!doc) return doc;
  const out = { ...doc };
  if (out.ctcMonthly != null) out.ctcMonthly = decrypt(out.ctcMonthly);
  if (out.ctcAnnual  != null) out.ctcAnnual  = decrypt(out.ctcAnnual);
  if (Array.isArray(out.components)) {
    out.components = out.components.map((c) => ({
      ...c,
      monthlyAmount: c.monthlyAmount != null ? decrypt(c.monthlyAmount) : c.monthlyAmount,
    }));
  }
  return out;
};

// ─── PayrollRecord helpers ─────────────────────────────────────────────────────

const PAYROLL_NUMERIC_FIELDS = [
  'ctcMonthly',
  'grossEarnings',
  'netPay',
  'totalDeductions',
  'overtimeAmount',
  'reimbursementTotal',
  'perDaySalary',
  'perHourSalary',
  'lwpDeductionAmount',
  'absentDeductionAmount',
  'halfDayDeductionAmount',
  'lateDeductionAmount',
];

const encryptPayrollDoc = (doc) => {
  if (!doc) return doc;
  const out = { ...doc };
  for (const field of PAYROLL_NUMERIC_FIELDS) {
    if (out[field] != null) out[field] = encrypt(out[field]);
  }
  if (Array.isArray(out.earnings)) {
    out.earnings = out.earnings.map((e) => ({
      ...e,
      amount: e.amount != null ? encrypt(e.amount) : e.amount,
    }));
  }
  if (Array.isArray(out.deductions)) {
    out.deductions = out.deductions.map((d) => ({
      ...d,
      amount: d.amount != null ? encrypt(d.amount) : d.amount,
    }));
  }
  return out;
};

const decryptPayrollDoc = (doc) => {
  if (!doc) return doc;
  const out = { ...doc };
  for (const field of PAYROLL_NUMERIC_FIELDS) {
    if (out[field] != null) out[field] = decrypt(out[field]);
  }
  if (Array.isArray(out.earnings)) {
    out.earnings = out.earnings.map((e) => ({
      ...e,
      amount: e.amount != null ? decrypt(e.amount) : e.amount,
    }));
  }
  if (Array.isArray(out.deductions)) {
    out.deductions = out.deductions.map((d) => ({
      ...d,
      amount: d.amount != null ? decrypt(d.amount) : d.amount,
    }));
  }
  return out;
};

// ─── BankDetails helpers ───────────────────────────────────────────────────────

const encryptBankDetails = (bd) => {
  if (!bd) return bd;
  const out = { ...bd };
  if (out.accountNumber) out.accountNumber = encrypt(out.accountNumber);
  if (out.ifscCode)      out.ifscCode      = encrypt(out.ifscCode);
  return out;
};

const decryptBankDetails = (bd) => {
  if (!bd) return bd;
  const out = { ...bd };
  if (out.accountNumber) out.accountNumber = decryptString(out.accountNumber);
  if (out.ifscCode)      out.ifscCode      = decryptString(out.ifscCode);
  return out;
};

module.exports = {
  encrypt,
  decrypt,
  decryptString,
  isEncrypted,
  encryptSalaryDoc,
  decryptSalaryDoc,
  encryptPayrollDoc,
  decryptPayrollDoc,
  encryptBankDetails,
  decryptBankDetails,
  PAYROLL_NUMERIC_FIELDS,
};
