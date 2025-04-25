var express = require('express');
var router = express.Router();
const userModel = require("../../models/userModel");
const JWT = require('jsonwebtoken');
const config = require("../../utils/tokenConfig");
const bcrypt = require('bcrypt');
const crypto = require("crypto");
const redis = require('../../redis/redisClient');
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const { sendNotification } = require('../../controllers/auth/sendNotification');
// Login
router.get("/all", async function (req, res) {
  const users = await userModel.find();
  res.status(200).json({
    status: true,
    message: "Lấy danh sách người dùng thành công",
    data: users
  });
});

router.post("/login", async function (req, res) {
  try {
    const { email, password } = req.body;
    // Tìm người dùng theo email
    const checkUser = await userModel.findOne({ email: email });
    if (!checkUser) {
      return res.status(400).json({ status: false, message: "Tên đăng nhập hoặc mật khẩu không đúng" });
    }

    // So sánh mật khẩu đã mã hóa
    const isPasswordValid = await bcrypt.compare(password, checkUser.password);
    if (!isPasswordValid) {
      return res.status(400).json({ status: false, message: "Tên đăng nhập hoặc mật khẩu không đúng" });
    }
    else {
      const tokenPayload = {
        id: checkUser._id,
        email: checkUser.email,
        role: checkUser.role,
        tags: checkUser.tags,
        location: checkUser.location
      };

      const token = JWT.sign(tokenPayload, config.SECRETKEY, { expiresIn: "1h" });
      const refreshToken = JWT.sign({ id: checkUser._id }, config.SECRETKEY, { expiresIn: '7d' });
      
      await userModel.findByIdAndUpdate(checkUser._id, { refreshToken });

      res.status(200).json({
        status: 200,
        message: "Đăng nhập thành công",
        data: {
          id: checkUser._id,
          email: checkUser.email,
          token,
          refreshToken,
          fcmTokens: checkUser.fcmTokens || []
        }
      });
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

// Register
router.post("/register", async function (req, res) {
  try {
    const { email, password, username, phoneNumber } = req.body;
    // Check if user already exists
    const existingUser = await userModel.findOne({ email: email });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        message: "Email đã tồn tại"
      });
    }
    const otp = crypto.randomInt(100000, 999999).toString();

    // Gửi OTP
    await redis.set(`otp:${email}`, otp, "EX", 300); // 5 phút
    await redis.set(`otp-last:${email}`, Date.now(), "EX", 300);

    // Lưu tạm thông tin đăng ký
    const hashedPassword = await bcrypt.hash(password, 10);
    const userData = JSON.stringify({ email, password: hashedPassword, username, phoneNumber });
    await redis.set(`pending-user:${email}`, userData, "EX", 600);

    // Gửi email
    await sgMail.send({
      from: { email: "namnnps38713@gmail.com", name: "EventSphere" },
      to: email,
      subject: "Mã xác nhận đăng ký",
      text: `Mã OTP của bạn là: ${otp}. Có hiệu lực trong 5 phút.`,
    });

    res.status(200).json({ 
      status: 200,
      message: "Đã gửi mã OTP, vui lòng kiểm tra email" });
  } catch (e) {
    res.status(400).json({
      status: false,
      message: "Lỗi: " + e
    });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  const storedOtp = await redis.get(`otp:${email}`);
  if (!storedOtp) return res.status(400).json({ message: "OTP hết hạn hoặc không hợp lệ" });
  if (storedOtp !== otp) return res.status(400).json({ message: "Sai mã OTP" });

  const userDataJson = await redis.get(`pending-user:${email}`);
  if (!userDataJson) return res.status(400).json({ message: "Không tìm thấy dữ liệu đăng ký" });

  const userData = JSON.parse(userDataJson);

  // Kiểm tra lại đề phòng
  const existingUser = await userModel.findOne({ email });
  if (existingUser) return res.status(400).json({ message: "Email đã tồn tại" });

  // Tạo tài khoản
  const newUser = new userModel({ ...userData, role: 3 });
  await newUser.save();

  // Xoá Redis
  await redis.del(`otp:${email}`);
  await redis.del(`pending-user:${email}`);
  await redis.del(`otp-last:${email}`);

  res.status(200).json({ 
    status: 200,
    message: "Tạo tài khoản thành công" });
});

router.put("/addLocation", async function (req, res) {
  try {
    const { id, longitude, latitude } = req.body;
    const itemUpdate = await userModel.findById(id);

    if (itemUpdate) {
      itemUpdate.longitude = longitude ? longitude : itemUpdate.longitude;
      itemUpdate.latitude = latitude ? latitude : itemUpdate.latitude;

      await itemUpdate.save();
      res.status(200).json({ status: true, message: "Successfully" });
    }
    else {
      res.status(300).json({ status: true, message: "Not found" });
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

router.put("/edit", async function (req, res) {
  try {
    const { id, checkPassword, password, username, picUrl, phoneNumber, address } = req.body;
    const itemUpdate = await userModel.findById(id);

    if (itemUpdate) {
      itemUpdate.username = username ? username : itemUpdate.username;
      if (password) {
        itemUpdate.password = await bcrypt.hash(password, 10);
      }
      itemUpdate.picUrl = picUrl ? picUrl : itemUpdate.picUrl;
      itemUpdate.phoneNumber = phoneNumber ? phoneNumber : itemUpdate.phoneNumber;
      itemUpdate.address = address ? address : itemUpdate.address;

      await itemUpdate.save();
      res.status(200).json({ status: true, message: "Successfully" });
    }
    else {
      res.status(404).json({ status: true, message: "Not Found User" });
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

router.put("/editPassword", async function (req, res) {
  try {
    const { id, currentPassword, newPassword, } = req.body;
    const itemUpdate = await userModel.findById(id);
    // So sánh mật khẩu đã mã hóa
    const isPasswordValid = await bcrypt.compare(currentPassword, itemUpdate.password);
    if (!isPasswordValid) {
      return res.status(400).json({ status: false, message: "Mật khẩu không đúng" });
    }
    else {
      if (itemUpdate) {
        if (newPassword) {
          itemUpdate.password = await bcrypt.hash(newPassword, 10);
        }
        await itemUpdate.save();
        res.status(200).json({ status: true, message: "Successfully" });
      }
      else {
        res.status(404).json({ status: true, message: "Not Found User" });
      }
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
})

router.get("/:id", async function (req, res) {
  try {
    const { id } = req.params;
    var detail = await userModel.findById(id);

    if (detail) {
      res.status(200).json({
        status: true,
        message: "Lấy người thành công",
        data: detail
      });
    }
    else {
      res.status(404).json({ status: true, message: "Not Found" })
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
})

router.put("/fcmToken", async function (req, res) {
  try {
    const { id, fcmToken } = req.body;
    const itemUpdate = await userModel.findById(id);

    if (itemUpdate) {
      // Kiểm tra xem token đã tồn tại chưa
      if (!itemUpdate.fcmTokens.includes(fcmToken)) {
        itemUpdate.fcmTokens.push(fcmToken);
        await itemUpdate.save();
        res.status(200).json({
          status: true,
          message: "Thêm FCM token thành công"
        });
      } else {
        res.status(200).json({
          status: true,
          message: "Token đã tồn tại"
        });
      }
    } else {
      res.status(404).json({
        status: false,
        message: "Không tìm thấy người dùng"
      });
    }
  } catch (e) {
    res.status(400).json({
      status: false,
      message: "Lỗi: " + e
    });
  }
});

router.post('/send-notification', sendNotification);

router.post('/refresh-token', async function (req, res) {
  const {refreshToken} = req.body;

  if(!refreshToken){
    return res.status(400).json({message: 'No refresh token provided'});
  }
  try {
    const decoded = JWT.verify(refreshToken, config.SECRETKEY);
    const userId = decoded.id

    const user = await userModel.findById(userId)
    if (!user.refreshToken.includes(refreshToken)) {
      return res.status(404).json({ message: 'Invalid refresh token' });
    }

    const newAccessToken = JWT.sign(
      { id: user._id, email: user.email },
      config.SECRETKEY,
      { expiresIn: '1h' }
    );
    return res.status(200).json({
      token: newAccessToken,
    });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
})

module.exports = router;

