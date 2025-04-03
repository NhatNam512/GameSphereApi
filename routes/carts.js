var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const cartModel = require('../models/plants/cartModel');
const plantModel = require('../models/plants/plantModel');

router.post("/add", async (req, res) => {
    const { userId, products, status } = req.body;
    try {
      let cart = await cartModel.findOne({ userId });
      if (!cart) {
        cart = new cartModel({ userId, items: [], status: status });
      }
      for (const { productId, quantity } of products) {
        const product = await plantModel.findById(productId);
        if (!product) return res.status(404).json({ message: `Sản phẩm ${productId} không tồn tại` });
        cart.items.push({ productId: productId, quantity, price: product.price });
      }
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
      const cart = await cartModel.find({ userId: req.params.userId }).populate("items.productId");
      res.status(200).json({
        status: true,
        message: "Lấy giỏ hàng thành công",
        data: cart
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

module.exports = router;
