const express      = require('express');
const router       = express.Router();
const multer       = require('multer');
const authenticate = require('../../middleware/authenticate');
const authorize    = require('../../middleware/authorize');

const docTypeCtrl  = require('../../controllers/document/documentType.controller');
const empDocCtrl   = require('../../controllers/document/employeeDocument.controller');
const policyCtrl   = require('../../controllers/document/policyDocument.controller');
const auditCtrl    = require('../../controllers/document/auditLog.controller');
const v            = require('../../validators/document/document.validator');

// Multer — store in memory (then upload to B2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

// ─── Document Types ─────────────────────────────────────────────────────────
router.get(   '/types',     authenticate, authorize('document_types', 'view'),   docTypeCtrl.list);
router.post(  '/types',     authenticate, authorize('document_types', 'create'), v.createDocumentType, docTypeCtrl.create);
router.patch( '/types/:id', authenticate, authorize('document_types', 'update'), v.updateDocumentType, docTypeCtrl.update);
router.delete('/types/:id', authenticate, authorize('document_types', 'delete'), docTypeCtrl.remove);

// ─── Pre-boarding document upload (public — authenticated via token) ────────
router.post('/employee/upload-preboarding', upload.single('file'), empDocCtrl.uploadPreboarding);

// ─── Employee Documents (self-service) ──────────────────────────────────────
router.get(   '/my',                 authenticate, authorize('documents', 'view'),   empDocCtrl.myDocuments);
router.get(   '/my/checklist',       authenticate, authorize('documents', 'view'),   empDocCtrl.myChecklist);
router.post(  '/my/upload',          authenticate, authorize('documents', 'create'), upload.single('file'), empDocCtrl.myUpload);
router.get(   '/my/:docId/download', authenticate, authorize('documents', 'export'), empDocCtrl.myDownload);
router.delete('/my/:docId',          authenticate, authorize('documents', 'delete'), empDocCtrl.myDelete);

// ─── Expiring Documents + Compliance (HR) ───────────────────────────────────
router.get('/expiring',   authenticate, authorize('documents', 'view'), empDocCtrl.expiring);
router.get('/compliance', authenticate, authorize('documents', 'view'), empDocCtrl.compliance);

// ─── Bulk Operations (HR) ───────────────────────────────────────────────────
router.post('/bulk-verify', authenticate, authorize('documents', 'verify'), empDocCtrl.bulkVerify);

// ─── Employee Documents (HR manages) ────────────────────────────────────────
router.get(   '/employees/:employeeId',                    authenticate, authorize('documents', 'view'),   empDocCtrl.listDocuments);
router.post(  '/employees/:employeeId/upload',             authenticate, authorize('documents', 'create'), upload.single('file'), empDocCtrl.uploadDocument);
router.get(   '/employees/:employeeId/checklist',          authenticate, authorize('documents', 'view'),   empDocCtrl.checklist);
router.get(   '/employees/:employeeId/:docId/download',    authenticate, authorize('documents', 'export'), empDocCtrl.downloadDocument);
router.patch( '/employees/:employeeId/:docId/verify',      authenticate, authorize('documents', 'verify'), empDocCtrl.verify);
router.patch( '/employees/:employeeId/:docId/reject',      authenticate, authorize('documents', 'reject'), v.rejectDocument, empDocCtrl.reject);
router.delete('/employees/:employeeId/:docId',             authenticate, authorize('documents', 'delete'), empDocCtrl.remove);

// ─── Policy Documents ───────────────────────────────────────────────────────
router.get(   '/policies',                          authenticate, authorize('policy_documents', 'view'),   policyCtrl.list);
router.get(   '/policies/pending-acknowledgements',  authenticate, authorize('policy_acknowledgements', 'view'), policyCtrl.myPending);
router.post(  '/policies',                          authenticate, authorize('policy_documents', 'create'), upload.single('file'), policyCtrl.create);
router.get(   '/policies/:id',                      authenticate, authorize('policy_documents', 'view'),   policyCtrl.get);
router.patch( '/policies/:id',                      authenticate, authorize('policy_documents', 'update'), policyCtrl.update);
router.delete('/policies/:id',                      authenticate, authorize('policy_documents', 'delete'), policyCtrl.remove);
router.post(  '/policies/:id/new-version',          authenticate, authorize('policy_documents', 'create'), upload.single('file'), policyCtrl.newVersion);
router.get(   '/policies/:id/versions',             authenticate, authorize('policy_documents', 'view'),   policyCtrl.versionHistory);
router.get(   '/policies/:id/download',             authenticate, authorize('policy_documents', 'view'),   policyCtrl.download);
router.get(   '/policies/:id/acknowledgements',     authenticate, authorize('policy_acknowledgements', 'view'), policyCtrl.acknowledgements);
router.post(  '/policies/:id/acknowledge',          authenticate, authorize('policy_acknowledgements', 'create'), policyCtrl.acknowledge);

// ─── Audit Logs ─────────────────────────────────────────────────────────────
router.get('/audit-logs', authenticate, authorize('audit_logs', 'view'), auditCtrl.list);

module.exports = router;
