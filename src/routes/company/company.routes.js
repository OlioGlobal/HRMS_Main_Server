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

module.exports = router;
