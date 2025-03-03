var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const eventModel = require('../models/eventModel');

router.get("/all", async function (req, res) {
  try {
    const events = await eventModel.find();
    res.status(200).json({
      status: true,
      message: "Lấy danh sách sự kiện thành công",
      data: events
    });
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

router.get("/detail/:id", async function (req, res) {
  try {
    const { id } = req.params;
    var detail = await eventModel.findById(id);

    if (detail) {
      res.status(200).json({
        status: true,
        message: "Lấy chi tiết sự kiện thành công",
        data: detail
      });
    }
    else {
      res.status(404).json({ status: true, message: "Not Found" })
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
});

router.get("/categories/:id", async function (req,  res) {
  try{
    const {id} = req.params;
    var categories = await eventModel.find({categories: id});
    if(categories.length>0){
      res.status(200).json({
        status: true,
        message: "Lấy sự kiện thành công",
        data: categories
      })
    }
    else {
      res.status(404).json({ status: false, message: "Not Found" })
    }
  }catch(e){
    res.status(400).json({ status: false, message: "Error: " + e });
  }  
})

router.post("/add", async function (req, res) {
  try {
    const { name, description, timeStart, timeEnd, avatar, images, categories, banner, location, ticketPrice, ticketQuantity, rating, longitude, latitude } = req.body;
    const newItem = { name, description, timeStart, timeEnd, avatar, images, categories, banner, location, ticketPrice, ticketQuantity, rating, longitude, latitude};
    await eventModel.create(newItem);
    res.status(200).json({
      status: true,
      message: "Successfully"
    });
  }
  catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
});


router.put("/edit", async function (req, res) {
  try {
    const { id, name, description, timeStart, timeEnd, avatar, images, categories, banner, location, ticketPrice, ticketQuantity, rating, longitude, latitude } = req.body;
    const itemUpdate = await eventModel.findById(id);

    if (itemUpdate) {
      itemUpdate.name = name ? name : itemUpdate.name;
      itemUpdate.description = description ? description : itemUpdate.description;
      itemUpdate.timeStart = timeStart ? timeStart : itemUpdate.timeStart;
      itemUpdate.timeEnd = timeEnd ? timeEnd : itemUpdate.timeEnd;
      itemUpdate.avatar = avatar ? avatar : itemUpdate.avatar;
      itemUpdate.images = images ? images : itemUpdate.images;
      itemUpdate.categories = categories ? categories : itemUpdate.categories;
      itemUpdate.banner = banner ? banner : itemUpdate.banner;
      itemUpdate.ticketPrice = ticketPrice ? ticketPrice : itemUpdate.ticketPrice;
      itemUpdate.ticketQuantity = ticketQuantity ? ticketQuantity : itemUpdate.ticketQuantity;
      itemUpdate.location = location ? location : itemUpdate.location;
      itemUpdate.rating = rating ? rating : itemUpdate.rating;
      itemUpdate.longitude = longitude ? longitude : itemUpdate.longitude;
      itemUpdate.latitude = latitude ? latitude : itemUpdate.latitude;

      await itemUpdate.save();
      res.status(200).json({ status: true, message: "Successfully" });
    }
    else {
      res.status(300).json({ status: true, message: "Not found" });
    }
  }
  catch (e) {
    res.status(400).json({ status: false, message: "Error" + e });
  }
})

router.get("/search", async function (req, res) {
  try {
    const { query } = req.query;
    const events = await eventModel.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } }
      ]
    });

    if (events.length > 0) {
      res.status(200).json({
        status: true,
        message: "Tìm kiếm sự kiện thành công",
        data: events
      });
    } else {
      res.status(404).json({ status: false, message: "Không tìm thấy sự kiện" });
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error: " + e });
  }
});

router.get("/revenue", async function (req, res) {
  try {
    const events = await eventModel.find();
    const revenueData = events.map(event => ({
      id: event._id,
      soldTickets: event.soldTickets,
      revenue: event.ticketPrice * event.soldTickets
    }));

    res.status(200).json({
      status: true,
      message: "Tính doanh thu cho tất cả sự kiện thành công",
      data: revenueData
    });
  } catch (e) {
    res.status(400).json({ status: false, message: "Error: " + e });
  }
});

module.exports = router;