var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const cartModel = require('../models/cartModel');
const plantModel = require('../models/plantModel');

router.post("/add", async (req, res) => {
    const { userId, productId, quantity } = req.body;
  
    try {
      const product = await plantModel.findById(productId);
      if (!product) return res.status(404).json({ message: "Sản phẩm không tồn tại" });
        
      let cart = await cartModel.findOne({ userId });
      if (!cart) {
        cart = new cartModel({ userId, items: [] });
      }
  
      const itemIndex = cart.items.findIndex((item) => item.productId.equals(productId));
  
      if (itemIndex > -1) {
        cart.items[itemIndex].quantity += quantity;
      } else {
        cart.items.push({ name: product.name, image: product.images[0] , quantity, price: product.price });
      }
  
      cart.updatedAt = new Date();
      await cart.save();
      res.status(200).json({
        status: true,
        message: "Thêm giỏ hàng thành công",
        data: cart
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  router.get("/getCart/:userId", async (req, res) => {
    try {
      const cart = await cartModel.findOne({ userId: req.params.userId }).populate("items.productId");
      if (!cart) return res.json({ items: [] });
      res.status(200).json({
        status: true,
        message: "Lấy giỏ hàng thành công",
        data: cart
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  router.delete("/remove", async (req, res) => {
    const { userId, productId } = req.body;
    
    try {
      const cart = await cartModel.findOne({ userId });
      if (!cart) return res.status(404).json({ message: "Giỏ hàng trống" });
  
      cart.items = cart.items.filter((item) => !item.productId.equals(productId));
  
      await cart.save();
      res.status(200).json({ message: "Xóa giỏ hàng thành công" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
module.exports = router;
