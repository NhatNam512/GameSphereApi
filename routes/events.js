var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const eventModel = require('../models/eventModel');

router.get("/all", async function (req, res) {
  try{
  const events = await eventModel.find();
  res.status(200).json({
    status: true,
    message: "Lấy danh sách sự kiện thành công",
    data: events 
  });
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e});
  }
});

router.post("/add", async function (req, res) {
    try {
            const { name, description, timeStart, timeEnd, avatar, images, categories, banner, location, ticketPrice, ticketQuantity, rating } = req.body;
            const newItem = { name, description, timeStart, timeEnd, avatar, images, categories, banner, location, ticketPrice, ticketQuantity, rating};
            await eventModel.create(newItem);
            res.status(200).json({ 
              status: true,
              message: "Successfully" 
            });
        }
    catch (e) {
      res.status(400).json({ status: false, message: "Error" + e});
    }
})

module.exports = router;