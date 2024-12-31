var express = require('express');
var router = express.Router();
const userModel = require("../models/userModel");
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const bcrypt = require('bcrypt')

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
      var token = JWT.sign({ email: email }, config.SECRETKEY, { expiresIn: "1h" });
      const refreshToken = JWT.sign({ id: email._id }, config.SECRETKEY, { expiresIn: '1h' })
      res.status(200).json({
        status: true,
        message: "Đăng nhập thành công",
        data:{
          id: checkUser.id,
          email: checkUser.email,
          token: token,
        }
      });
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
})

// Register
router.post("/register", async function (req, res) {
  try {
    const { email, password, username } = req.body;
    // Check if user already exists
    const existingUser = await userModel.findOne({ email: email });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        message: "Email đã tồn tại"
      });
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new userModel({
      email: email,
      password: hashedPassword,
      username: username
    });

    // Save user to database
    await newUser.save();

    res.status(201).json({
      status: true,
      message: "Tạo tài khoản thành công"
    });
  } catch (e) {
    res.status(400).json({
      status: false,
      message: "Lỗi: " + e
    });
  }
});

module.exports = router;

