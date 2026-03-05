const nodemailer = require('nodemailer');

let transporter = null;
let verified = false;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransporter() {
  if (transporter) return transporter;
  if (!isConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: parseInt(process.env.SMTP_PORT, 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendEmail(to, subject, htmlBody) {
  const t = createTransporter();
  if (!t) return { success: false, error: 'SMTP not configured' };

  if (!verified) {
    try {
      await t.verify();
      verified = true;
    } catch (err) {
      return { success: false, error: `SMTP verification failed: ${err.message}` };
    }
  }

  try {
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html: htmlBody,
      text: htmlBody.replace(/<[^>]*>/g, ''),
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { isConfigured, sendEmail };
