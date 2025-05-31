var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../../utils/tokenConfig");
const eventModel = require('../../models/events/eventModel');
const redis = require('../../redis/redisClient');
const validate = require('../../middlewares/validation');
const { eventSchema, eventTagsSchema } = require('../../validations/eventValidation');
const authenticate = require('../../middlewares/auth');
const { getRecommendedEvents } = require('../../controllers/events/recommendedEvents');
const { addTagsToEvent } = require('../../controllers/events/tagController');
const { getTopViewedEvents } = require('../../controllers/events/interactionController');
const { getZones } = require('../../controllers/events/zoneController');
const { default: mongoose } = require('mongoose');
const zoneTicketModel = require('../../models/events/zoneTicketModel');

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

router.get("/home", async function (req, res) {
  try {
    const cacheKey = "events_home";

    console.time("🔁 Redis GET");
    const cachedData = await redis.get(cacheKey);
    console.timeEnd("🔁 Redis GET");

    if (cachedData) {
      console.time("📦 JSON.parse");
      const parsedData = JSON.parse(cachedData);
      console.timeEnd("📦 JSON.parse");

      console.time("🚀 res.json");
      res.status(200).json({
        status: true,
        message: "Lấy danh sách sự kiện thành công (cache)",
        data: parsedData
      });
      console.timeEnd("🚀 res.json");

      return;
    }

    console.time("🗃️ DB Query");
    const events = await eventModel.find()
      .select("_id name timeStart timeEnd avatar banner categories location latitude longitude location_map")
      .lean();
    console.timeEnd("🗃️ DB Query");

    // 👉 Map location_map -> longitude/latitude
    const mappedEvents = events.map(ev => {
      if (ev.location_map && ev.location_map.coordinates) {
        ev.longitude = ev.location_map.coordinates[0];
        ev.latitude = ev.location_map.coordinates[1];
      }
      return ev;
    });

    console.time("📤 Redis SET");
    await redis.set(cacheKey, JSON.stringify(mappedEvents), 'EX', 300);
    console.timeEnd("📤 Redis SET");

    res.status(200).json({
      status: true,
      message: "Lấy danh sách sự kiện thành công",
      data: mappedEvents
    });

  } catch (e) {
    console.error("❌ Error in /home route:", e);
    res.status(500).json({ status: false, message: "Lỗi server: " + e.message });
  }
});

router.get("/detail/:id", async function (req, res, next) {
  try {
    const { id } = req.params;
    const cacheKey = `events_detail_${id}`;
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      return res.status(200).json({
        status: true,
        message: "Lấy chi tiết sự kiện thành công (từ Redis cache)",
        data: JSON.parse(cachedData)
      });
    }
    
    const detail = await eventModel.findById(id);
    if (!detail) {
      const error = new Error('Không tìm thấy sự kiện');
      error.statusCode = 404;
      throw error;
    }
    // Map location_map -> longitude/latitude if available
    if (detail.location_map && detail.location_map.coordinates) {
      detail.longitude = detail.location_map.coordinates[0];
      detail.latitude = detail.location_map.coordinates[1];
    }

    await redis.set(cacheKey, JSON.stringify(detail), 'EX', 300);
    return res.status(200).json({
      status: true,
      message: "Lấy chi tiết sự kiện thành công",
      data: detail
    });
  } catch (error) {
    next(error);
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

router.post("/add", async function (req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { 
      name, description, timeStart, timeEnd, 
      avatar, images, categories, banner, 
      location, ticketPrice, ticketQuantity, 
      rating, longitude, latitude, userId, tags, zone,
      typeBase, zones
    } = req.body;
    const [newItem] = await eventModel.create([{ 
      name, 
      description, 
      timeStart, 
      timeEnd, 
      avatar, 
      images, 
      categories, 
      banner, 
      location, 
      ticketPrice, 
      ticketQuantity, 
      rating, 
      userId,
      tags,
      typeBase: typeBase,
      zone: (typeBase === 'zone' || typeBase === 'seat') ? (zone ? zone : null) : null,
      location_map: {
        type: "Point",
        coordinates: [longitude, latitude] // đúng chuẩn GeoJSON
      }
    }], {session});

    // If typeBase is "zone", create zone tickets
    if (typeBase === 'zone' && req.body.zones && Array.isArray(req.body.zones)) {
      const zoneTicketsData = req.body.zones;
      const zoneTicketsToCreate = zoneTicketsData.map(zoneData => ({
        eventId: newItem._id,
        name: zoneData.name,
        totalTicketCount: zoneData.totalTicketCount,
        price: zoneData.price,
        createdBy: userId,
        updatedBy: userId,
      }));

      if (zoneTicketsToCreate.length > 0) {
        await zoneTicketModel.insertMany(zoneTicketsToCreate, { session });
      }
    }

    await session.commitTransaction(); // Commit the transaction if everything is successful
    session.endSession();
    // Xóa cache để cập nhật danh sách mới
    await redis.del("events");
    // await updateEventVector(newItem._id.toString(), description);
    
    // Gửi thông báo đến Redis Pub/Sub
    pub.publish("event_updates", JSON.stringify(newItem));
    
    res.status(200).json({
      status: true,
      message: "Thêm sự kiện thành công"
    });
  }
  catch (error) {
    await session.abortTransaction();
    session.endSession();
    // Chuyển lỗi đến error handler
    next(error);
  }
});

router.put("/edit", async function (req, res) {
  try {
    const {
      id, name, description, timeStart, timeEnd,
      avatar, images, categories, banner,
      location, ticketPrice, ticketQuantity,
      rating, longitude, latitude, zone
    } = req.body;

    const itemUpdate = await eventModel.findById(id);

    if (!itemUpdate) {
      return res.status(404).json({ status: false, message: "Event not found" });
    }

    // Cập nhật các trường cơ bản
    if (name) itemUpdate.name = name;
    if (description) itemUpdate.description = description;
    if (timeStart) itemUpdate.timeStart = timeStart;
    if (timeEnd) itemUpdate.timeEnd = timeEnd;
    if (avatar) itemUpdate.avatar = avatar;
    if (images) itemUpdate.images = images;
    if (categories) itemUpdate.categories = categories;
    if (banner) itemUpdate.banner = banner;
    if (ticketPrice) itemUpdate.ticketPrice = ticketPrice;
    if (ticketQuantity) itemUpdate.ticketQuantity = ticketQuantity;
    if (rating) itemUpdate.rating = rating;
    if (location) itemUpdate.location = location; // locationName là tên hiển thị
    if (zone) itemUpdate.zone = zone;

    // Cập nhật tọa độ nếu có
    if (longitude && latitude) {
      itemUpdate.location_map = {
        type: "Point",
        coordinates: [longitude, latitude]
      };
    }

    await itemUpdate.save();

    // Xóa cache để cập nhật dữ liệu mới
    await redis.del(`events_detail_${id}`); // Xóa cache chi tiết sự kiện
    await redis.del("events"); // Xóa cache danh sách tất cả sự kiện
    await redis.del("events_home"); // Xóa cache danh sách sự kiện trang chủ

    res.status(200).json({ status: true, message: "Successfully updated" });

  } catch (e) {
    res.status(400).json({ status: false, message: "Error: " + e.message });
  }
});

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

router.post("/sort", async function (req, res) {
  try {
    const { categories, ticketPrice, timeStart } = req.body;
    const filter = {};

    // Thêm điều kiện lọc cho categories nếu có
    if (categories) {
      filter.categories = categories;
    }

    // Thêm điều kiện lọc cho ticketPrice nếu có
    if (ticketPrice) {
      filter.ticketPrice = { $lte: ticketPrice }; // Lọc các sự kiện có giá vé nhỏ hơn hoặc bằng ticketPrice
    }

    // Thêm điều kiện lọc cho timeStart nếu có
    if (timeStart) {
      filter.timeStart = { $gte: new Date(timeStart) }; // Lọc các sự kiện bắt đầu từ timeStart trở đi
    }

    const events = await eventModel.find(filter);

    if (events.length > 0) {
      res.status(200).json({
        status: true,
        message: "Lọc sự kiện thành công",
        data: events
      });
    } else {
      res.status(404).json({ status: false, message: "Không tìm thấy sự kiện" });
    }
  } catch (e) {
    res.status(400).json({ status: false, message: "Error: " + e.message });
  }
});

router.get("/for-you", authenticate, getRecommendedEvents);

router.post('/add-tags', validate(eventTagsSchema), addTagsToEvent);

router.get('/getZone/:id', getZones);

router.put('/add-zone', async function (req, res) {
  try {
    const {eventId, zoneId} = req.body;
    const event = await eventModel.findById(eventId);
    event.zone = zoneId;
    await event.save();
    res.status(200).json({ status: true, message: "Successfully updated" });
  } catch (error) {
    res.status(400).json({ status: true, message: "Failure" });
  }
})

module.exports = router;