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

module.exports = { getCompany, updateCompany, uploadLogo, removeLogo };
