var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const categoryModel = require('../models/games/categoriesGameModel');

router.get("/all", async function (req, res) {
  try {
    const categories = await categoryModel.find();
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
    const { name} = req.body;
    const newItem = { name };
    await categoryModel.create(newItem);
    res.status(200).json({ status: true, message: "Successfully" });
  }
  catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
})

module.exports = router;