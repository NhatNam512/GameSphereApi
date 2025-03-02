var express = require('express');
var router = express.Router();
const userModel = require("../models/userModel");
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const bcrypt = require('bcrypt')
const { wss } = require('../app'); // Import the WebSocket server

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
        status: 200,
        message: "Đăng nhập thành công",
        data:{
          id: checkUser._id,
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
      username: username,
      role: 3,
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

router.put("/addLocation", async function (req, res) {
  try{
    const {id, longitude, latitude} = req.body;
    const itemUpdate = await userModel.findById(id);

    if(itemUpdate){
      itemUpdate.longitude = longitude ? longitude : itemUpdate.longitude;
      itemUpdate.latitude = latitude ? latitude : itemUpdate.latitude;

      await itemUpdate.save();
      res.status(200).json({ status: true, message: "Successfully" });
    }
    else{
      res.status(300).json({ status: true, message: "Not found" });
    }
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

router.put("/edit", async function (req, res) {
  try{
    const {id, password, username, picUrl} = req.body;
    const itemUpdate = await userModel.findById(id);

    if(itemUpdate){
      itemUpdate.username = username ? username : itemUpdate.username;
      itemUpdate.password = password ? password : itemUpdate.password;
      itemUpdate.picUrl = picUrl ? picUrl : itemUpdate.picUrl;

      await itemUpdate.save();
      res.status(200).json({ status: true, message: "Successfully" });
    }
    else{
      res.status(404).json({ status: true, message: "Not Found User" });
    }
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

router.get("/:id", async function (req, res) {
  try{
    const {id} = req.params;
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
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e });
  }
})

// API to send notification to WebSocket clients
router.post("/notify", function (req, res) {
  try {
    const message = "Vé của bạn đã đặt thành công";
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });

    res.status(200).json({
      status: true,
      message: "Notification sent to all WebSocket clients"
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({
      status: false,
      message: "Internal Server Error"
    });
  }
});

module.exports = router;

