const User = require('../../models/userModel');
const redis = require('../../redis/redisClient');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Gửi OTP qua email
exports.requestForgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Vui lòng nhập email' });
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng với email này' });

  // Tạo OTP 6 số
  const otp = crypto.randomInt(100000, 999999).toString();
  // Lưu OTP vào Redis, key: forgot_otp:<email>, expire 5 phút
  await redis.set(`forgot_otp:${email}`, otp, 'EX', 300);

  // Gửi mail
  await sgMail.send({
    from: { email: "namnnps38713@gmail.com", name: "EventSphere" },
    to: email,
    subject: "Mã OTP đặt lại mật khẩu",
    text: `Mã OTP của bạn là: ${otp}. Có hiệu lực trong 5 phút.`,
  });

  return res.json({ message: 'Đã gửi OTP về email' });
};

// Xác minh OTP và đổi mật khẩu
exports.verifyForgotPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ message: 'Thiếu thông tin' });
  const savedOtp = await redis.get(`forgot_otp:${email}`);
  if (!savedOtp) return res.status(400).json({ message: 'OTP đã hết hạn hoặc không tồn tại' });
  if (savedOtp !== otp) return res.status(400).json({ message: 'OTP không đúng' });

  // Đổi mật khẩu
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword; 
  await user.save();
  await redis.del(`forgot_otp:${email}`);
  return res.json({ message: 'Đổi mật khẩu thành công' });
}; 