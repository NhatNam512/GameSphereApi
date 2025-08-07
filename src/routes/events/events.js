var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../../utils/tokenConfig");
const eventModel = require('../../models/events/eventModel');
const redis = require('../../redis/redisClient');
const validate = require('../../middlewares/validation');
const { eventSchema, eventTagsSchema } = require('../../validations/eventValidation');
const { getRecommendedEvents } = require('../../controllers/events/recommendedEvents');
const { addTagsToEvent } = require('../../controllers/events/tagController');
const { getTopViewedEvents } = require('../../controllers/events/interactionController');
const { getZones } = require('../../controllers/events/zoneController');
const { default: mongoose } = require('mongoose');
const zoneTicketModel = require('../../models/events/zoneTicketModel');
const showtimeModel = require('../../models/events/showtimeModel');
const zoneModel = require('../../models/events/zoneModel');
const seatBookingModel = require('../../models/events/seatBookingModel');
const zoneBookingModel = require('../../models/events/zoneBookingModel');
const tagModel = require('../../models/events/tagModel');
const previewEventModel = require('../../models/events/previewEventModel');
const { default: slugify } = require('slugify');
const revenueController = require('../../controllers/events/revenueController');
const { authenticateOptional, authenticate } = require('../../middlewares/auth');
const { broadcastEventApproval } = require('../../../socket/socket');

const pub = redis.duplicate(); // Redis Publisher
const sub = redis.duplicate();

sub.subscribe("event_updates");

sub.on("message", (channel, message) => {
  if (channel === "event_updates") {
    const event = JSON.parse(message);
    // Có thể gửi thông báo đến frontend qua WebSocket
  }
});

// routes/events.js
router.delete("/:eventId",  async (req, res) => {
  const { eventId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({ status: false, message: "eventId không hợp lệ" });
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const event = await eventModel.findById(eventId).session(session);
    if (!event) {
      await session.abortTransaction();
      return res.status(404).json({ status: false, message: "Event không tồn tại" });
    }
    // Xoá các dữ liệu liên quan
    await Promise.all([
      showtimeModel.deleteMany({ event: eventId }).session(session),
      zoneModel.deleteMany({ event: eventId }).session(session),
      zoneTicketModel.deleteMany({ event: eventId }).session(session),
      seatBookingModel.deleteMany({ event: eventId }).session(session),
      zoneBookingModel.deleteMany({ event: eventId }).session(session),
      // Nếu bạn có các bảng interactions, tags gán theo event thì thêm vào đây
      // tagModel.updateMany({ events: eventId }, { $pull: { events: eventId } }).session(session),
    ]);

    await eventModel.deleteOne({ _id: eventId }).session(session);

    await session.commitTransaction();
    session.endSession();

    // Invalidate cache
    await redis.del("events");
    await redis.del(`event:${eventId}`);

    // Publish để frontend / worker khác biết
    await pub.publish(
      "event_updates",
      JSON.stringify({ type: "DELETE", eventId, by: req.user?._id })
    );

    return res.status(200).json({
      status: true,
      message: "Xoá sự kiện thành công",
      data: { eventId }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    return res.status(500).json({ status: false, message: "Lỗi hệ thống", error: err.message });
  }
});


router.get("/all", async function (req, res) {
  try {
    const { approvalStatus = 'approved' } = req.query;
    const cacheKey = `events_${approvalStatus}`;
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    const filter = { approvalStatus };
    const events = await eventModel.find(filter);
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
      console.timeEnd("📦 JSON.parse "+parsedData);

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
    const events = await eventModel.find({ approvalStatus: 'approved' })
      .select("_id name timeStart timeEnd avatar banner categories location latitude longitude location_map typeBase zone tags userId createdAt")
      .populate("userId", "username picUrl")
      .lean();
    console.timeEnd("🗃️ DB Query");

    // 👉 Map locamap -> longitude/latitude and add min/max ticket prices
    const mappedEvents = await Promise.all(events.map(async (ev) => {
      if (ev.location_map && ev.location_map.coordinates) {
        ev.longitude = ev.location_map.coordinates[0];
        ev.latitude = ev.location_map.coordinates[1];
      }
      
      let ticketPrices = [];

      if (ev.typeBase === 'seat') {
        const zones = await zoneModel.find({ eventId: ev._id }).select('layout.seats.price layout.seats.seatId');
        if (zones.length === 0) {
        }
        zones.forEach(zone => {
          if (zone && zone.layout && zone.layout.seats) {
            const currentZonePrices = zone.layout.seats
              .filter(seat => seat.seatId !== "none")
              .map(seat => seat.price)
              .filter(price => price !== undefined && price !== null);
            ticketPrices.push(...currentZonePrices);
          } else {
          }
        });
      } 
      else if (ev.typeBase === 'zone') {
        const zoneTickets = await zoneTicketModel
          .find({ eventId: ev._id })
          .select('price');
      
        ticketPrices = zoneTickets
          .map(t => t.price)
          .filter(price => price !== undefined && price !== null);
      }
      else if (ev.typeBase === 'none') {
        const showtimes = await showtimeModel.find({ eventId: ev._id }).select("ticketPrice");
        ticketPrices = showtimes.map(st => st.ticketPrice).filter(price => price !== undefined && price !== null);
      }
      
      if (ticketPrices.length > 0) {
        ev.minTicketPrice = Math.min(...ticketPrices);
        ev.maxTicketPrice = Math.max(...ticketPrices);
      } else {
        ev.minTicketPrice = null; 
        ev.maxTicketPrice = null;
      }
      // Thêm showtimes cho từng event (giống detail)
      const showtimes = await showtimeModel.find({ eventId: ev._id }).select("startTime endTime ticketPrice ticketQuantity");
      ev.showtimes = showtimes;
      return ev;
    }));

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

router.get("/detail/:id", authenticateOptional ,async function (req, res, next) {
  try {
    const { id } = req.params;
    
    // Lấy thông tin user từ token (optional)
    let currentUserId = req.user ? req.user.id : null;

    const cacheKey = `events_detail_${id}_${currentUserId || 'anonymous'}`;
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
    // Lấy các suất chiếu của sự kiện
    const showtimeModel = require('../../models/events/showtimeModel');
    const showtimes = await showtimeModel.find({ eventId: id });

    // Lấy loại vé, loại khu vực, số vé còn lại
    let ticketInfo = {};
    if (detail.typeBase === 'seat') {
      // Lấy tất cả các zone thuộc event này
      const zoneModel = require('../../models/events/zoneModel');
      const zones = await zoneModel.find({ eventId: id });
      // Lấy tất cả các showtimeId của event này
      const showtimeIds = showtimes.map(st => st._id);
      // Lấy các booking đã đặt và đang giữ cho tất cả showtime
      // --- CACHE GHẾ ---
      let bookedSeatIds = [];
      let reservedSeatIds = [];
      let cacheMiss = false;
      for (const showtimeId of showtimeIds) {
        const cacheKey = `seatStatus:${id}:${showtimeId}`;
        const cacheData = await redis.get(cacheKey);
        if (cacheData) {
          const { booked, reserved } = JSON.parse(cacheData);
          bookedSeatIds.push(...booked);
          reservedSeatIds.push(...reserved);
        } else {
          cacheMiss = true;
        }
      }
      if (cacheMiss) {
        // Nếu cache miss bất kỳ showtime nào, truy vấn DB cho tất cả showtime
        const bookedBookings = await seatBookingModel.find({ 
          eventId: id, 
          showtimeId: { $in: showtimeIds },
          status: 'booked' 
        });
        bookedSeatIds = bookedBookings.flatMap(booking => booking.seats.map(seat => seat.seatId));
        const reservedBookings = await seatBookingModel.find({
          eventId: id,
          showtimeId: { $in: showtimeIds },
          status: 'reserved',
        });
        reservedSeatIds = reservedBookings.flatMap(booking => booking.seats.map(seat => seat.seatId));
        // Cache lại cho từng showtime
        for (const showtimeId of showtimeIds) {
          const booked = bookedBookings.filter(b => b.showtimeId.toString() === showtimeId.toString()).flatMap(b => b.seats.map(s => s.seatId));
          const reserved = reservedBookings.filter(b => b.showtimeId.toString() === showtimeId.toString()).flatMap(b => b.seats.map(s => s.seatId));
          const cacheKey = `seatStatus:${id}:${showtimeId}`;
          await redis.set(cacheKey, JSON.stringify({ booked, reserved }), 'EX', 60); // cache 1 phút
        }
      }
      // Duyệt từng zone để cập nhật trạng thái ghế và đếm số ghế còn lại
      const zonesWithStatus = zones.map(zone => {
        let availableCount = 0;
        const seatsWithStatus = (zone.layout && Array.isArray(zone.layout.seats)) ? zone.layout.seats.map(seat => {
          let status = 'available';
          if (bookedSeatIds.includes(seat.seatId)) {
            status = 'booked';
          } else if (reservedSeatIds.includes(seat.seatId)) {
            status = 'reserved';
          } else {
            availableCount++;
          }
          return { ...seat.toObject ? seat.toObject() : seat, status };
        }) : [];
        return { ...zone.toObject(), layout: { ...zone.layout, seats: seatsWithStatus }, availableCount };
      });
      ticketInfo.zones = zonesWithStatus;
    } else if (detail.typeBase === 'zone') {
      // Lấy tất cả zone tickets cho event này (tất cả showtimes)
      const zoneTickets = await zoneTicketModel.find({ eventId: id });
      // Lấy tất cả booking cho các zone ticket này
      const zoneTicketIds = zoneTickets.map(z => z._id);
      const bookings = await zoneBookingModel.find({
        zoneId: { $in: zoneTicketIds },
        status: { $in: ['booked', 'reserved'] },
      });
      // Đếm số lượng đã đặt/giữ cho từng zone ticket
      const bookingCounts = bookings.reduce((acc, booking) => {
        const zoneId = booking.zoneId.toString();
        acc[zoneId] = (acc[zoneId] || 0) + booking.quantity;
        return acc;
      }, {});
      const zonesWithAvailability = zoneTickets.map(zone => {
        const bookedAndReservedCount = bookingCounts[zone._id.toString()] || 0;
        const availableCount = zone.totalTicketCount - bookedAndReservedCount;
        return {
          ...zone.toObject(),
          availableCount: Math.max(0, availableCount),
        };
      });
      ticketInfo.zoneTickets = zonesWithAvailability;
    }
    // Nếu typeBase === 'none' thì không cần gì thêm

    // Lấy tên các tag (trả về mảng tên thay vì mảng id)
    let tagNames = [];
    if (detail.tags && detail.tags.length > 0) {
      const tags = await tagModel.find({ _id: { $in: detail.tags } });
      tagNames = tags.map(tag => tag.name);
    }

    // Kiểm tra user đã review event này chưa
    let isPreview = false;
    if (currentUserId) {
      const existingReview = await previewEventModel.findOne({
        eventId: id,
        userId: currentUserId
      });
      isPreview = !!existingReview;
    }

    const result = { ...detail.toObject(), showtimes, ...ticketInfo, tags: tagNames, isPreview };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
    return res.status(200).json({
      status: true,
      message: "Lấy chi tiết sự kiện thành công",
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.get("/categories/:id", async function (req,  res) {
  try{
    const {id} = req.params;
    var categories = await eventModel.find({categories: id, approvalStatus: 'approved'});
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
      name, description, avatar, images, categories, banner,
      location, rating, longitude, latitude, userId, tags, typeBase, zones, timeStart, timeEnd,
      showtimes
    } = req.body;

    // ===== 🏷️ Xử lý TAGS ===== //
    const tagIds = [];
    for (let tagName of tags) {
      tagName = tagName.trim();
      if (!tagName) continue;

      const slug = slugify(tagName, { lower: true, strict: true });
      let tag = await tagModel.findOne({ slug }).session(session);
      if (!tag) {
        tag = await tagModel.create([{
          name: tagName,
          slug,
          createdBy: userId,
          isDefault: false
        }], { session });
        tag = tag[0]; // Vì dùng create([])
      }
      tagIds.push(tag._id);
    }

    // 1. Tạo event
    const [newEvent] = await eventModel.create([
      {
        name,
        description,
        avatar,
        images,
        categories,
        banner,
        location,
        rating,
        userId,
        tags: tagIds,
        typeBase: typeBase,
        timeStart,
        timeEnd,
        location_map: {
          type: "Point",
          coordinates: [longitude, latitude]
        }
      }
    ], { session });

    // Create all event-level showtimes first
    const createdShowtimes = [];
    if (Array.isArray(showtimes)) {
      for (const st of showtimes) {
        const [newShowtime] = await showtimeModel.create([{
          eventId: newEvent._id,
          startTime: st.startTime,
          endTime: st.endTime,
          ticketPrice: st.ticketPrice,
          ticketQuantity: st.ticketQuantity
        }], { session });
        createdShowtimes.push(newShowtime);
      }
    }

    // 2. Xử lý zones và showtimes theo typeBase
    if (typeBase === 'seat' && Array.isArray(zones)) {
      // Tạo zone với layout
      for (const zone of zones) {
        const [newZone] = await zoneModel.create([
          {
            name: zone.name,
            layout: zone.layout,
            eventId: newEvent._id
          }
        ], { session });
        // Tạo vé cho từng seat cho mỗi showtime
        if (createdShowtimes.length > 0 && zone.layout && Array.isArray(zone.layout.seats)) {
          for (const newShowtime of createdShowtimes) {
            const seatTickets = zone.layout.seats.map(seat => ({
              showtimeId: newShowtime._id,
              name: `${zone.name} - ${seat.label}`,
              totalTicketCount: 1,
              price: seat.price,
              eventId: newEvent._id
            }));
            if (seatTickets.length > 0) {
              await zoneTicketModel.insertMany(seatTickets, { session });
            }
          }
        }
      }
    } else if (typeBase === 'zone' && Array.isArray(zones)) {
      // Tạo vé zoneTicket cho từng showtime và từng zone (KHÔNG tạo/cập nhật/xóa gì ở zoneModel)
      for (const zone of zones) {
        if (createdShowtimes.length > 0) {
          for (const newShowtime of createdShowtimes) {
            await zoneTicketModel.create([
              {
                showtimeId: newShowtime._id,
                name: zone.name,
                totalTicketCount: zone.totalTicketCount,
                price: zone.price,
                eventId: newEvent._id
              }
            ], { session });
          }
        }
      }
    }
    // typeBase 'none' chỉ tạo showtimes, không cần xử lý zone/zoneTicket

    await session.commitTransaction();
    session.endSession();
    await redis.del("events");
    await redis.del("events_home");
    // Xóa cache getEvents của user
    if (userId) {
      await redis.del(`getEvents:${userId}`);
    }
    pub.publish("event_updates", JSON.stringify(newEvent));
    res.status(200).json({
      status: true,
      message: "Thêm sự kiện thành công",
      data: {
        _id: newEvent._id,
        name: newEvent.name,
        createdAt: newEvent.createdAt,
        updatedAt: newEvent.updatedAt
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
});

router.put("/edit", async function (req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      id, name, description, timeStart, timeEnd,
      avatar, images, categories, banner,
      location, rating, longitude, latitude, zone,
      typeBase, showtimes, zones, tags, userId
    } = req.body;

    const itemUpdate = await eventModel.findById(id).session(session);

    if (!itemUpdate) {
      const error = new Error('Không tìm thấy sự kiện');
      error.statusCode = 404;
      throw error;
    }

    // Capture old typeBase before updating
    const oldTypeBase = itemUpdate.typeBase;

    // Cập nhật các trường cơ bản
    if (name) itemUpdate.name = name;
    if (description) itemUpdate.description = description;
    if (timeStart) itemUpdate.timeStart = timeStart;
    if (timeEnd) itemUpdate.timeEnd = timeEnd;
    if (avatar) itemUpdate.avatar = avatar;
    if (images) itemUpdate.images = images;
    if (categories) itemUpdate.categories = categories;
    if (banner) itemUpdate.banner = banner;
    if (rating) itemUpdate.rating = rating;
    if (location) itemUpdate.location = location;
    if (zone) itemUpdate.zone = zone;
    if (typeBase) itemUpdate.typeBase = typeBase;

    // Cập nhật tọa độ nếu có
    if (longitude && latitude) {
      itemUpdate.location_map = {
        type: "Point",
        coordinates: [longitude, latitude]
      };
    }

    // ===== ��️ Xử lý TAGS (nếu có) ===== //
    if (tags && Array.isArray(tags)) {
      const tagIds = [];
      for (let tagName of tags) {
        tagName = tagName.trim();
        if (!tagName) continue;
        const slug = slugify(tagName, { lower: true, strict: true });
        let tag = await tagModel.findOne({ slug }).session(session);
        if (!tag) {
          tag = await tagModel.create([
            {
              name: tagName,
              slug,
              createdBy: userId || itemUpdate.userId,
              isDefault: false
            }
          ], { session });
          tag = tag[0];
        }
        tagIds.push(tag._id);
      }
      itemUpdate.tags = tagIds;
    }

    await itemUpdate.save({ session });

    // Handle showtimes updates
    // Delete existing showtimes for this event
    await showtimeModel.deleteMany({ eventId: id }).session(session);
    // Create new showtimes
    const createdShowtimes = [];
    if (Array.isArray(showtimes)) {
      for (const st of showtimes) {
        const [newShowtime] = await showtimeModel.create([{
          eventId: id,
          startTime: st.startTime,
          endTime: st.endTime,
          ticketPrice: st.ticketPrice,
          ticketQuantity: st.ticketQuantity
        }], { session });
        createdShowtimes.push(newShowtime);
      }
    }

    // Handle typeBase change cleanup
    if (oldTypeBase && typeBase && oldTypeBase !== typeBase) {
      if (oldTypeBase === 'seat') {
        await zoneModel.deleteMany({ eventId: id }).session(session);
        await zoneTicketModel.deleteMany({ eventId: id }).session(session);
      } else if (oldTypeBase === 'zone') {
        await zoneTicketModel.deleteMany({ eventId: id }).session(session);
      }
    }

    // Handle zones based on new typeBase
    if (typeBase === 'zone' && Array.isArray(zones)) {
      await zoneTicketModel.deleteMany({ eventId: id }).session(session);
      for (const zone of zones) {
        if (createdShowtimes.length > 0) {
          for (const newShowtime of createdShowtimes) {
            await zoneTicketModel.create([
              {
                showtimeId: newShowtime._id,
                name: zone.name,
                totalTicketCount: zone.totalTicketCount,
                price: zone.price,
                eventId: id
              }
            ], { session });
          }
        }
      }
    }

    if (typeBase === 'seat' && Array.isArray(zones)) {
      await zoneModel.deleteMany({ eventId: id }).session(session); // Clear old zones for seat type
      await zoneTicketModel.deleteMany({ eventId: id }).session(session); // Clear old seat tickets for seat type
      for (const zone of zones) {
        const [newZone] = await zoneModel.create([
          {
            name: zone.name,
            layout: zone.layout,
            eventId: id
          }
        ], { session });
        if (createdShowtimes.length > 0 && zone.layout && Array.isArray(zone.layout.seats)) {
          for (const newShowtime of createdShowtimes) {
            const seatTickets = zone.layout.seats.map(seat => ({
              showtimeId: newShowtime._id,
              name: `${zone.name} - ${seat.label}`,
              totalTicketCount: 1,
              price: seat.price
            }));
            if (seatTickets.length > 0) {
              await zoneTicketModel.insertMany(seatTickets, { session });
            }
          }
        }
      }
    }

    await session.commitTransaction();
    session.endSession();
    // Xóa cache getEvents của user
    if (itemUpdate.userId) {
      await redis.del(`getEvents:${itemUpdate.userId}`);
      await redis.del(`events_detail_${id}`)
    }
    res.status(200).json({ 
      status: true, 
      message: "Successfully updated",
      data: {
        _id: itemUpdate._id,
        name: itemUpdate.name,
        createdAt: itemUpdate.createdAt,
        updatedAt: itemUpdate.updatedAt
      }
    });

  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    next(e); // Pass error to next middleware for centralized error handling
  }
});
router.get("/search", async function (req, res) {
  try {
    const { query = "", page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const matchCondition = {
      approvalStatus: 'approved', // Chỉ search trong sự kiện đã duyệt
      $or: [
        { name: { $regex: query, $options: "i" } },
      ],
    };

    // Đếm tổng số sự kiện phù hợp (nếu cần)
    const totalEvents = await eventModel.countDocuments(matchCondition);

    const events = await eventModel.find(matchCondition)
      .select("_id name timeStart timeEnd avatar banner categories location latitude longitude location_map typeBase zone tags")
      .sort({ timeStart: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const mappedEvents = await Promise.all(events.map(async (ev) => {
      if (ev.location_map?.coordinates) {
        ev.longitude = ev.location_map.coordinates[0];
        ev.latitude = ev.location_map.coordinates[1];
      }

      let ticketPrices = [];

      if (ev.typeBase === 'seat') {
        const zones = await zoneModel.find({ eventId: ev._id }).select('layout.seats.price');
        zones.forEach(zone => {
          const prices = zone.layout?.seats?.map(seat => seat.price).filter(p => p != null);
          ticketPrices.push(...(prices || []));
        });
      } else if (ev.typeBase === 'zone') {
        const zoneTickets = await zoneTicketModel.find({ eventId: ev._id }).select('price');
        ticketPrices = zoneTickets.map(t => t.price).filter(p => p != null);
      } else if (ev.typeBase === 'none') {
        const showtimes = await showtimeModel.find({ eventId: ev._id }).select("ticketPrice");
        ticketPrices = showtimes.map(st => st.ticketPrice).filter(p => p != null);
      }

      ev.minTicketPrice = ticketPrices.length > 0 ? Math.min(...ticketPrices) : null;
      ev.maxTicketPrice = ticketPrices.length > 0 ? Math.max(...ticketPrices) : null;

      const showtimes = await showtimeModel.find({ eventId: ev._id }).select("startTime endTime ticketPrice ticketQuantity");
      ev.showtimes = showtimes;

      return ev;
    }));

    return res.status(200).json({
      status: true,
      message: "Tìm kiếm sự kiện thành công",
      data: mappedEvents,
      total: totalEvents,
      page: Number(page),
      hasMore: skip + mappedEvents.length < totalEvents
    });

  } catch (e) {
    console.error("🔴 Search error:", e);
    return res.status(500).json({ status: false, message: "Lỗi server: " + e });
  }
});

router.get("/revenue", revenueController.getRevenue);

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
});

router.get('/getEstimatedRevenue/:eventId', revenueController.getEstimatedRevenue);

// API duyệt sự kiện
router.put('/approve/:eventId', async function (req, res) {
  try {
    const { eventId } = req.params;
    const { approvalStatus, reason } = req.body;

    // Debug logging
    console.log('🔍 Approve Event Debug:', {
      eventId,
      approvalStatus,
      approvalStatusType: typeof approvalStatus,
      body: req.body
    });

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ 
        status: false, 
        message: "eventId không hợp lệ" 
      });
    }

    // Improved validation with more detailed error message
    if (!approvalStatus) {
      return res.status(400).json({ 
        status: false, 
        message: "approvalStatus là bắt buộc" 
      });
    }

    if (!['approved', 'rejected'].includes(approvalStatus)) {
      return res.status(400).json({ 
        status: false, 
        message: `approvalStatus phải là 'approved' hoặc 'rejected', nhận được: '${approvalStatus}'`
      });
    }

    const event = await eventModel.findById(eventId).populate('userId', 'username');
    if (!event) {
      return res.status(404).json({ 
        status: false, 
        message: "Không tìm thấy sự kiện" 
      });
    }

    // Cập nhật trạng thái duyệt và lý do
    event.approvalStatus = approvalStatus;
    event.approvalReason = reason || '';
    await event.save();

    // Xóa cache home khi duyệt thành công
    if (approvalStatus === 'approved') {
      await redis.del("events_home");
      await redis.del("events");
    }
    
    // Xóa cache pending approval để refresh danh sách
    const pendingCacheKeys = await redis.keys("events_pending_approval_*");
    if (pendingCacheKeys.length > 0) {
      await redis.del(...pendingCacheKeys);
    }
    
    // Xóa cache getEvents của organizer để cập nhật trạng thái duyệt
    if (event.userId) {
      await redis.del(`getEvents:${event.userId._id}`);
    }

    // Thông báo qua socket về việc duyệt
    const socketMessage = {
      type: 'EVENT_APPROVAL',
      eventId: event._id,
      eventName: event.name,
      approvalStatus: approvalStatus,
      approvedBy: req.user ? req.user.id : 'admin', // Handle khi không có user
      reason: reason || '',
      organizerId: event.userId._id,
      timestamp: new Date()
    };

    // Gửi thông báo qua Redis pub/sub
    await pub.publish("event_updates", JSON.stringify(socketMessage));
    
    // Gửi thông báo trực tiếp qua Socket.IO cho organizer
    try {
      broadcastEventApproval(event.userId._id.toString(), socketMessage);
    } catch (socketError) {
      console.error("❌ Socket broadcast error:", socketError.message);
      // Không throw error vì API vẫn thành công, chỉ socket bị lỗi
    }

    return res.status(200).json({
      status: true,
      message: `${approvalStatus === 'approved' ? 'Duyệt' : 'Từ chối'} sự kiện thành công`,
      data: {
        eventId: event._id,
        eventName: event.name,
        approvalStatus: event.approvalStatus,
        approvedAt: new Date()
      }
    });

  } catch (error) {
    console.error("❌ Error approving event:", error);
    return res.status(500).json({ 
      status: false, 
      message: "Lỗi hệ thống", 
      error: error.message 
    });
  }
});

// API test approval (chỉ để test)
router.post('/test-approve/:eventId', async function (req, res) {
  const { eventId } = req.params;
  const { action = 'approved' } = req.body;
  
  return res.status(200).json({
    status: true,
    message: "Test route for approval",
    testData: {
      eventId,
      suggestedBody: {
        approvalStatus: action,
        reason: "Test approval reason"
      },
      curlExample: `curl -X PUT ${req.protocol}://${req.get('host')}/events/approve/${eventId} \\
  -H "Content-Type: application/json" \\
  -d '{"approvalStatus":"${action}","reason":"Test reason"}'`
    }
  });
});

// API lấy danh sách sự kiện chưa duyệt
router.get('/pending-approval', async function (req, res) {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const cacheKey = `events_pending_approval_${page}_${limit}`;
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: true,
        message: "Lấy danh sách sự kiện chưa duyệt thành công (từ cache)",
        data: JSON.parse(cachedData)
      });
    }

    const totalPendingEvents = await eventModel.countDocuments({ approvalStatus: 'pending' });

    const pendingEvents = await eventModel.find({ approvalStatus: 'pending' })
      .select("_id name timeStart timeEnd avatar banner categories location userId createdAt approvalStatus")
      .populate("userId", "username picUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const result = {
      events: pendingEvents,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalPendingEvents / Number(limit)),
        totalEvents: totalPendingEvents,
        hasMore: skip + pendingEvents.length < totalPendingEvents
      }
    };

    // Cache trong 2 phút
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 120);

    return res.status(200).json({
      status: true,
      message: "Lấy danh sách sự kiện chưa duyệt thành công",
      data: result
    });

  } catch (error) {
    console.error("❌ Error getting pending events:", error);
    return res.status(500).json({ 
      status: false, 
      message: "Lỗi hệ thống", 
      error: error.message 
    });
  }
});

module.exports = router;