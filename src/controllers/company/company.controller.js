const catchAsync   = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc          = require('../../services/company/company.service');

const getCompany = catchAsync(async (req, res) => {
  const company = await svc.getCompany(req.user.companyId);
  sendSuccess(res, { data: { company } });
});

const updateCompany = catchAsync(async (req, res) => {
  const company = await svc.updateCompany(req.user.companyId, req.body);
  sendSuccess(res, { message: 'Company settings updated.', data: { company } });
});

const uploadLogo = catchAsync(async (req, res) => {
  const company = await svc.uploadLogo(req.user.companyId, req.file);
  sendSuccess(res, { message: 'Logo uploaded.', data: { logo: company.logo } });
});

const removeLogo = catchAsync(async (req, res) => {
  await svc.removeLogo(req.user.companyId);
  sendSuccess(res, { message: 'Logo removed.' });
});

const uploadSignature = catchAsync(async (req, res) => {
  const company = await svc.uploadSignature(req.user.companyId, req.file);
  sendSuccess(res, { message: 'Signature uploaded.', data: { signatureImage: company.settings.payslip.signatureImage } });
});

const removeSignature = catchAsync(async (req, res) => {
  await svc.removeSignature(req.user.companyId);
  sendSuccess(res, { message: 'Signature removed.' });
});

const uploadPayslipLogo = catchAsync(async (req, res) => {
  const company = await svc.uploadPayslipLogo(req.user.companyId, req.file);
  sendSuccess(res, { message: 'Payslip logo uploaded.', data: { logo: company.settings.payslip.logo } });
});

const removePayslipLogo = catchAsync(async (req, res) => {
  await svc.removePayslipLogo(req.user.companyId);
  sendSuccess(res, { message: 'Payslip logo removed.' });
});

module.exports = { getCompany, updateCompany, uploadLogo, removeLogo, uploadSignature, removeSignature, uploadPayslipLogo, removePayslipLogo };
