const sendSuccess = (res, { status = 200, message = 'Success', data = null } = {}) => {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  return res.status(status).json(body);
};

const sendError = (res, { status = 500, message = 'Internal server error', errors = null } = {}) => {
  const body = { success: false, message };
  if (errors !== null) body.errors = errors;
  return res.status(status).json(body);
};

module.exports = { sendSuccess, sendError };
