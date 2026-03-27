const express      = require('express');
const router       = express.Router();
const multer       = require('multer');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');

const ctrl = require('../../controllers/reimbursement/reimbursement.controller');
const {
  createClaimValidator,
  updateClaimValidator,
  hrApproveValidator,
  rejectValidator,
} = require('../../validators/reimbursement/reimbursement.validator');

// Multer — store in memory (then upload to B2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB max for receipts
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIES (admin)
// ═══════════════════════════════════════════════════════════════════════════════
router.get(   '/categories',     authenticate,                                            ctrl.listCategories);
router.post(  '/categories',     authenticate, authorize('expense_categories', 'create'), ctrl.createCategory);
router.patch( '/categories/:id', authenticate, authorize('expense_categories', 'update'), ctrl.updateCategory);
router.delete('/categories/:id', authenticate, authorize('expense_categories', 'delete'), ctrl.deleteCategory);

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIMS (employee self-service)
// ═══════════════════════════════════════════════════════════════════════════════
router.post(  '/claims',            authenticate, upload.single('receipt'), createClaimValidator, ctrl.createClaim);
router.get(   '/claims/my',        authenticate, ctrl.myClaims);
router.patch( '/claims/:id',       authenticate, upload.single('receipt'), updateClaimValidator, ctrl.updateClaim);
router.delete('/claims/:id',       authenticate, ctrl.deleteClaim);
router.patch( '/claims/:id/submit', authenticate, ctrl.submitClaim);

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVALS (manager / HR)
// ═══════════════════════════════════════════════════════════════════════════════
router.get(  '/claims/pending',              authenticate, authorize('reimbursements', 'view'),    ctrl.listPending);
router.patch('/claims/:id/manager-approve',  authenticate, authorize('reimbursements', 'approve'), ctrl.managerApprove);
router.patch('/claims/:id/hr-approve',       authenticate, authorize('reimbursements', 'approve'), hrApproveValidator, ctrl.hrApprove);
router.patch('/claims/:id/reject',           authenticate, authorize('reimbursements', 'reject'),  rejectValidator, ctrl.rejectClaim);

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIPT
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/claims/:id/receipt', authenticate, ctrl.downloadReceipt);

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL ACTIONS (no cookie auth — uses JWT token in query)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/action', async (req, res) => {
  const { action } = req.query;
  if (action === 'reject') return ctrl.rejectFromEmail(req, res);
  return ctrl.approveFromEmail(req, res);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/summary', authenticate, ctrl.getMonthlySummary);

module.exports = router;
