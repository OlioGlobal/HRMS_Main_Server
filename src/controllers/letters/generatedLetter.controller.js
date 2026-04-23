const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/letters/generatedLetter.service');

const list = catchAsync(async (req, res) => {
  const letters = await svc.list(req.user.companyId, req.query);
  sendSuccess(res, { data: { letters } });
});

const getOne = catchAsync(async (req, res) => {
  const letter = await svc.getOne(req.user.companyId, req.params.id);
  sendSuccess(res, { data: { letter } });
});

const generate = catchAsync(async (req, res) => {
  const letter = await svc.generate(req.user.companyId, req.user.id, req.body);
  sendSuccess(res, { status: 201, message: 'Letter generated.', data: { letter } });
});

const send = catchAsync(async (req, res) => {
  const result = await svc.send(req.user.companyId, req.params.id, req.user.id);
  sendSuccess(res, { message: 'Letter sent to candidate.', data: result });
});

const preview = catchAsync(async (req, res) => {
  const result = await svc.preview(req.user.companyId, req.body);
  sendSuccess(res, { data: result });
});

const buildPreview = catchAsync(async (req, res) => {
  const result = await svc.buildPreview(req.user.companyId, req.body);
  sendSuccess(res, { data: result });
});

const updateDraft = catchAsync(async (req, res) => {
  const letter = await svc.updateDraft(req.user.companyId, req.params.id, req.body);
  sendSuccess(res, { message: 'Draft updated.', data: { letter } });
});

const remove = catchAsync(async (req, res) => {
  await svc.remove(req.user.companyId, req.params.id);
  sendSuccess(res, { message: 'Letter deleted.' });
});

module.exports = { list, getOne, generate, preview, buildPreview, updateDraft, send, remove };
