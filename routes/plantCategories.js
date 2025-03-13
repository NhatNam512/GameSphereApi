var express = require('express');
var router = express.Router();
const plantCategoryModel = require('../models/plantCategoryModel');

router.get("/all", async function (req, res) {
  try {
    const categories = await plantCategoryModel.find();
    res.status(200).json({
      status: true,
      data: categories
    });
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

router.post("/add", async function (req, res) {
  try {
    const { name } = req.body;
    const newItem = { name };
    await plantCategoryModel.create(newItem);
    res.status(200).json({ status: true, message: "Successfully" });
  }
  catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
})

module.exports = router;