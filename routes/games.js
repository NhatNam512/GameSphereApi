var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const gameModel = require('../models/gameModel');

router.get("/all", async function (req, res) {
  try{
  const games = await gameModel.find();
  res.status(200).json({
    status: true,
    message: "Lấy danh sách người dùng thành công",
    data: games 
  });
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e});
  }
});

router.post("/add", async function (req, res) {
    try {
            const { name, description, developer, size, downloadLinks, images, categories } = req.body;
            const newItem = { name, description, developer, size, downloadLinks, images, categories};
            await gameModel.create(newItem);
            res.status(200).json({ status: true, message: "Successfully" });
        }
    catch (e) {
      res.status(400).json({ status: false, message: "Error" + e});
    }
})

module.exports = router;