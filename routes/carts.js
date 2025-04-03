var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const cartModel = require('../models/plants/cartModel');
const plantModel = require('../models/plants/plantModel');

router.post("/add", async (req, res) => {
    try {
      const { userId, products, status } = req.body;
      const newOrder =  { userId, products, status }
      await cartModel.create(newOrder);
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
