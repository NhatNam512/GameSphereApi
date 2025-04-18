var express = require('express');
var router = express.Router();
const categoryModel = require('../models/events/categoryModel');
const redis = require('../redis/redisClient');

router.get("/all", async function (req, res) {
  try {
    const cacheKey = `categories`;
    const cachedData = await redis.get(cacheKey);
    const categories = await categoryModel.find();
    if (cachedData) {
      console.log("📦 Lấy dữ liệu từ Redis cache");
      return res.status(200).json({
        status: true,
        message: "Lấy thể loại sự kiện thành công (từ Redis cache)",
        data: JSON.parse(cachedData)
      });
    }
    if(categories){
      await redis.set(cacheKey, JSON.stringify(categories), 'EX', 300);
      res.status(200).json({
        status: true,
        data: categories
      });
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

router.post("/add", async function (req, res) {
  try {
    const { name, image } = req.body;
    const newItem = { name, image };
    await categoryModel.create(newItem);
    res.status(200).json({ status: true, message: "Successfully" });
  }
  catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
})

module.exports = router;