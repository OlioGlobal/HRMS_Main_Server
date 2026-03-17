const catchAsync   = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const service      = require('../../services/document/documentType.service');

const list = catchAsync(async (req, res) => {
  const types = await service.listDocumentTypes(req.user.companyId, req.query);
  sendSuccess(res, { data: { documentTypes: types } });
});

const get = catchAsync(async (req, res) => {
  const dt = await service.getDocumentType(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { documentType: dt } });
});

const create = catchAsync(async (req, res) => {
  const dt = await service.createDocumentType(req.user.companyId, req.body);
  sendSuccess(res, { status: 201, message: 'Document type created', data: { documentType: dt } });
});

const update = catchAsync(async (req, res) => {
  const dt = await service.updateDocumentType(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Document type updated', data: { documentType: dt } });
});

const remove = catchAsync(async (req, res) => {
  await service.deleteDocumentType(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Document type deleted' });
});

module.exports = { list, get, create, update, remove };
