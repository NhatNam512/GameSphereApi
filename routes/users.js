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
        status: 200,
        message: "Đăng nhập thành công",
        data:{
          id: checkUser._id,
          email: checkUser.email,
          token: token,
          fcmTokens: checkUser.fcmTokens
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
    const { email, password, username, phoneNumber } = req.body;
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
      phoneNumber: phoneNumber,
      role: 3,
    });

    // Save user to database
    await newUser.save();

    res.status(200).json({
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
    const {id, checkPassword, password, username, picUrl, phoneNumber, address} = req.body;
    const itemUpdate = await userModel.findById(id);

    if(itemUpdate){
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
    else{
      res.status(404).json({ status: true, message: "Not Found User" });
    }
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

router.put("/editPassword", async function (req, res) {
  try{
    const {id, currentPassword, newPassword, } = req.body;
    const itemUpdate = await userModel.findById(id);
    // So sánh mật khẩu đã mã hóa
    const isPasswordValid = await bcrypt.compare(currentPassword, itemUpdate.password);
    if (!isPasswordValid) {
      return res.status(400).json({ status: false, message: "Mật khẩu không đúng" });
    }
    else{
      if(itemUpdate){
        if (newPassword) {
          itemUpdate.password = await bcrypt.hash(newPassword, 10);
        }
        await itemUpdate.save();
        res.status(200).json({ status: true, message: "Successfully" });
      }
      else{
        res.status(404).json({ status: true, message: "Not Found User" });
      }
    }
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e });
  }
})

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

module.exports = router;

