const express      = require('express');
const router       = express.Router();
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const ctrl         = require('../../controllers/company/company.controller');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');
const { updateCompanyValidator } = require('../../validators/company/company.validator');

// ─── Logo Upload Storage ───────────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },  // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg/;
    cb(null, allowed.test(file.mimetype));
  },
});

// ─── Signature Upload Storage ──────────────────────────────────────────────────
const sigDir = path.join(process.cwd(), 'public', 'uploads', 'signatures');
if (!fs.existsSync(sigDir)) fs.mkdirSync(sigDir, { recursive: true });

const sigStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, sigDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `sig-${Date.now()}${ext}`);
  },
});
const uploadSig = multer({
  storage: sigStorage,
  limits: { fileSize: 2 * 1024 * 1024 },  // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg/;
    cb(null, allowed.test(file.mimetype));
  },
});

// ─── Payslip Logo Upload Storage ───────────────────────────────────────────────
const payslipLogoDir = path.join(process.cwd(), 'public', 'uploads', 'payslip-logos');
if (!fs.existsSync(payslipLogoDir)) fs.mkdirSync(payslipLogoDir, { recursive: true });

const payslipLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, payslipLogoDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `pslogo-${Date.now()}${ext}`);
  },
});
const uploadPayslipLogo = multer({
  storage: payslipLogoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },  // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg/;
    cb(null, allowed.test(file.mimetype));
  },
});

// ─── Routes ────────────────────────────────────────────────────────────────────
router.get('/',
  authenticate, authorize('company', 'view'),
  ctrl.getCompany
);

router.patch('/',
  authenticate, authorize('company', 'update'),
  updateCompanyValidator,
  ctrl.updateCompany
);

router.post('/logo',
  authenticate, authorize('company', 'update'),
  upload.single('logo'),
  ctrl.uploadLogo
);

router.delete('/logo',
  authenticate, authorize('company', 'update'),
  ctrl.removeLogo
);

router.post('/signature',
  authenticate, authorize('company', 'update'),
  uploadSig.single('signature'),
  ctrl.uploadSignature
);

router.delete('/signature',
  authenticate, authorize('company', 'update'),
  ctrl.removeSignature
);

router.post('/payslip-logo',
  authenticate, authorize('company', 'update'),
  uploadPayslipLogo.single('logo'),
  ctrl.uploadPayslipLogo
);

router.delete('/payslip-logo',
  authenticate, authorize('company', 'update'),
  ctrl.removePayslipLogo
);

module.exports = router;
