const User = require('../../models/userModel');
const redis = require('../../redis/redisClient');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const sgMail = require("@sendgrid/mail");
const { sendOtpEmail, sendForgetOtpEmail } = require('../../services/mailService');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Gửi OTP qua email
// Gửi OTP
exports.requestForgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Vui lòng nhập email' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng với email này' });

  // Tạo OTP
  const otp = crypto.randomInt(100000, 999999).toString();

  // Lưu OTP vào Redis
  await redis.set(`forgot_otp:${email}`, otp, 'EX', 300); // 5 phút

  // Gửi email
  await sendForgetOtpEmail(email, otp)
  .then((res) => console.log('✅ Email sent:', res))
  .catch((err) => console.error('❌ Error sending email:', err));;

  return res.json({ message: 'Đã gửi OTP về email' });
};

// Xác minh OTP
exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Vui lòng nhập email và OTP' });

  const savedOtp = await redis.get(`forgot_otp:${email}`);
  if (!savedOtp) return res.status(400).json({ message: 'OTP đã hết hạn hoặc không tồn tại' });

  if (savedOtp !== otp) return res.status(400).json({ message: 'OTP không đúng' });

  // Đánh dấu đã xác minh OTP: tạo key "forgot_otp_verified:<email>"
  await redis.set(`forgot_otp_verified:${email}`, 'true', 'EX', 300); // 5 phút

  return res.json({ message: 'OTP hợp lệ. Bạn có thể đổi mật khẩu.' });
};

// Đặt lại mật khẩu mới
exports.resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu mới' });

  // Kiểm tra đã xác minh OTP chưa
  const isVerified = await redis.get(`forgot_otp_verified:${email}`);
  if (!isVerified) return res.status(400).json({ message: 'Bạn chưa xác minh OTP hoặc OTP đã hết hạn' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });

  // Đổi mật khẩu
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();

  // Xóa key OTP và xác minh
  await redis.del(`forgot_otp:${email}`);
  await redis.del(`forgot_otp_verified:${email}`);

  return res.json({ message: 'Đặt lại mật khẩu thành công' });
};
