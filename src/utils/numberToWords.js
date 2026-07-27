// ─── Amount → words (international, currency-aware) ───────────────────────────
// Wraps the `to-words` library to spell out a payslip's net salary in the
// company's own currency, e.g. 30000 → "Thirty Thousand Dollars Only" (USD),
// "Thirty Thousand Rupees Only" (INR), "Thirty Thousand Euros Only" (EUR).

const { ToWords } = require('to-words');

const toWords = new ToWords({ localeCode: 'en-US' });

// Minimal currency-name map for the currencies the app supports (see
// validators/company/company.validator.js). Anything not listed falls back to
// spelling the number and appending the raw currency code.
const CURRENCY_WORDS = {
  USD: { name: 'Dollar',   plural: 'Dollars',  fractionalUnit: { name: 'Cent',    plural: 'Cents' } },
  EUR: { name: 'Euro',     plural: 'Euros',    fractionalUnit: { name: 'Cent',    plural: 'Cents' } },
  GBP: { name: 'Pound',    plural: 'Pounds',   fractionalUnit: { name: 'Penny',   plural: 'Pence' } },
  INR: { name: 'Rupee',    plural: 'Rupees',   fractionalUnit: { name: 'Paisa',   plural: 'Paise' } },
  AED: { name: 'Dirham',   plural: 'Dirhams',  fractionalUnit: { name: 'Fils',    plural: 'Fils'  } },
  SAR: { name: 'Riyal',    plural: 'Riyals',   fractionalUnit: { name: 'Halala',  plural: 'Halalas' } },
  SGD: { name: 'Dollar',   plural: 'Dollars',  fractionalUnit: { name: 'Cent',    plural: 'Cents' } },
  AUD: { name: 'Dollar',   plural: 'Dollars',  fractionalUnit: { name: 'Cent',    plural: 'Cents' } },
  CAD: { name: 'Dollar',   plural: 'Dollars',  fractionalUnit: { name: 'Cent',    plural: 'Cents' } },
  JPY: { name: 'Yen',      plural: 'Yen',      fractionalUnit: { name: 'Sen',     plural: 'Sen'   } },
  CNY: { name: 'Yuan',     plural: 'Yuan',     fractionalUnit: { name: 'Fen',     plural: 'Fen'   } },
  HKD: { name: 'Dollar',   plural: 'Dollars',  fractionalUnit: { name: 'Cent',    plural: 'Cents' } },
  MYR: { name: 'Ringgit',  plural: 'Ringgit',  fractionalUnit: { name: 'Sen',     plural: 'Sen'   } },
  THB: { name: 'Baht',     plural: 'Baht',     fractionalUnit: { name: 'Satang',  plural: 'Satang' } },
  IDR: { name: 'Rupiah',   plural: 'Rupiah',   fractionalUnit: { name: 'Sen',     plural: 'Sen'   } },
  PHP: { name: 'Peso',     plural: 'Pesos',    fractionalUnit: { name: 'Centavo', plural: 'Centavos' } },
  BDT: { name: 'Taka',     plural: 'Taka',     fractionalUnit: { name: 'Poisha',  plural: 'Poisha' } },
  PKR: { name: 'Rupee',    plural: 'Rupees',   fractionalUnit: { name: 'Paisa',   plural: 'Paise' } },
  LKR: { name: 'Rupee',    plural: 'Rupees',   fractionalUnit: { name: 'Cent',    plural: 'Cents' } },
  NGN: { name: 'Naira',    plural: 'Naira',    fractionalUnit: { name: 'Kobo',    plural: 'Kobo'  } },
  KES: { name: 'Shilling', plural: 'Shillings',fractionalUnit: { name: 'Cent',    plural: 'Cents' } },
  ZAR: { name: 'Rand',     plural: 'Rand',     fractionalUnit: { name: 'Cent',    plural: 'Cents' } },
  BRL: { name: 'Real',     plural: 'Reais',    fractionalUnit: { name: 'Centavo', plural: 'Centavos' } },
  MXN: { name: 'Peso',     plural: 'Pesos',    fractionalUnit: { name: 'Centavo', plural: 'Centavos' } },
};

/**
 * Spell out an amount in words for the given currency.
 * @param {number} amount
 * @param {string} [currencyCode='USD']
 * @returns {string} e.g. "Thirty Thousand Dollars Only"
 */
const amountInWords = (amount, currencyCode = 'USD') => {
  const value = Math.abs(Number(amount) || 0);
  const spec  = CURRENCY_WORDS[String(currencyCode).toUpperCase()];

  try {
    if (spec) {
      return toWords.convert(value, {
        currency: true,
        ignoreDecimal: true,
        currencyOptions: { name: spec.name, plural: spec.plural, symbol: '', fractionalUnit: { ...spec.fractionalUnit, symbol: '' } },
      });
    }
    // Unknown currency: spell the number, append the raw code.
    const words = toWords.convert(value, { ignoreDecimal: true });
    return `${words} ${String(currencyCode).toUpperCase()} Only`;
  } catch {
    return '';
  }
};

module.exports = { amountInWords };
