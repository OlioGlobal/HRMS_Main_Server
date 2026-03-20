const nodemailer = require('nodemailer');
const Handlebars = require('handlebars');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    console.warn('[Email] Email not configured — skipping email sends');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: parseInt(EMAIL_PORT || '587', 10),
    secure: parseInt(EMAIL_PORT || '587', 10) === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  return transporter;
};

const sendEmail = async ({ to, subject, html }) => {
  const t = getTransporter();
  if (!t) return { success: false, error: 'Email not configured' };

  try {
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { success: false, error: err.message };
  }
};

const compileTemplate = (templateStr, variables) => {
  try {
    const template = Handlebars.compile(templateStr || '');
    return template(variables || {});
  } catch (err) {
    console.error('[Email] Template compile error:', err.message);
    return templateStr || '';
  }
};

module.exports = { sendEmail, compileTemplate };
