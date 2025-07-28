// services/mail.service.js
const { resend } = require('../config/email');

async function sendOtpEmail(to, otp) {
  return resend.emails.send({
    from: 'EventSphere <onboarding@resend.dev>', // đổi sang noreply@yourdomain.com sau khi verify domain
    to,
    subject: 'Mã xác nhận đăng ký',
    html: `<p>Mã OTP của bạn là: <strong>${otp}</strong>. Có hiệu lực trong 5 phút.</p>`,
  });
}

module.exports = { sendOtpEmail };