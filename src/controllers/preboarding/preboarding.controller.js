const catchAsync      = require('../../utils/catchAsync');
const { sendSuccess } = require('../../utils/response');
const svc             = require('../../services/preboarding/preboarding.service');

// All routes are public — authenticated via magic token in query/body

const getChecklist = catchAsync(async (req, res) => {
  const { token } = req.query;
  const data = await svc.getChecklist(token);
  sendSuccess(res, { data });
});

const acceptLetter = catchAsync(async (req, res) => {
  const { token }      = req.query;
  const { letterId, signedName, comment } = req.body;
  const letter = await svc.acceptLetter(token, letterId, signedName, comment);
  sendSuccess(res, { message: 'Offer accepted.', data: { letter } });
});

const declineLetter = catchAsync(async (req, res) => {
  const { token }  = req.query;
  const { letterId, reason } = req.body;
  const letter = await svc.declineLetter(token, letterId, reason);
  sendSuccess(res, { message: 'Offer declined.', data: { letter } });
});

const acknowledgePolicy = catchAsync(async (req, res) => {
  const { token }    = req.query;
  const { policyId } = req.body;
  const ack = await svc.acknowledgePolicy(token, policyId);
  sendSuccess(res, { message: 'Policy acknowledged.', data: { ack } });
});

const savePersonalDetails = catchAsync(async (req, res) => {
  const { token } = req.query;
  const employee  = await svc.savePersonalDetails(token, req.body);
  sendSuccess(res, { message: 'Personal details saved.', data: { employee } });
});

module.exports = { getChecklist, acceptLetter, declineLetter, acknowledgePolicy, savePersonalDetails };
