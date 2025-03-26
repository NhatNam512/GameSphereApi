var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const eventModel = require('../models/events/eventModel');
const redis = require('../redis/redisClient');
const natural = require("natural");
const {updateEventVector} = require("../service/contentBased");

const pub = redis.duplicate(); // Redis Publisher
const sub = redis.duplicate();

sub.subscribe("event_updates");

sub.on("message", (channel, message) => {
  if (channel === "event_updates") {
    const event = JSON.parse(message);
    console.log("📢 Sự kiện mới được cập nhật:", event);
    // Có thể gửi thông báo đến frontend qua WebSocket
  }
});

router.get("/all", async function (req, res) {
  try {
    const cacheKey = "events";
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      console.log("Lấy dữ liệu từ cache Redis");
      return res.json(JSON.parse(cachedData));
    }

    const events = await eventModel.find();
    await redis.set(cacheKey, JSON.stringify(events));
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
    const { name, description, timeStart, timeEnd, avatar, images, categories, banner, location, ticketPrice, ticketQuantity, rating, longitude, latitude, userId } = req.body;
    const newItem = await eventModel.create({ name, description, timeStart, timeEnd, avatar, images, categories, banner, location, ticketPrice, ticketQuantity, rating, longitude, latitude, userId});
    // Xóa cache để cập nhật danh sách mới
    await redis.del("events");
    await updateEventVector(newItem._id.toString(), description);
    // Gửi thông báo đến Redis Pub/Sub
    pub.publish("event_updates", JSON.stringify(newItem));
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
    const events = await eventModel.find({ timeStart: { $lt: new Date() } });
    const revenueData = events.map(event => ({
      id: event._id,
      name: event.name,
      soldTickets: event.soldTickets,
      revenue: event.ticketPrice * event.soldTickets,
      status: event.timeEnd < new Date() ? "End" : "Progress"
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

// const redisClient = new redis();
// async function saveEventToStream(event) {
//   await redisClient.xadd("event_stream", "*", "title", event.name, "category", event.categories)
// }
// router.post("/events", async (req, res) => {
//   try {
//     const event = await Event.create(req.body);
//     await saveEventToStream(event); // Lưu vào Redis Stream
//     pub.publish("event_updates", JSON.stringify(event));
//     res.status(201).json(event);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });
// async function getRecentEvents(limit = 5) {
//   const events = await redisClient.xrevrange("event_stream", "+", "-", "COUNT", limit);
//   return events.map(([id, data]) => ({
//     id,
//     title: data[1],
//     category: data[3],
//   }));
// }

// router.get("/suggested-events", async (req, res) => {
//   const recentEvents = await getRecentEvents();
//   res.json(recentEvents);
// });
module.exports = router;