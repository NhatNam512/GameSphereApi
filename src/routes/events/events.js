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
const showtimeModel = require('../../models/events/showtimeModel');
const zoneModel = require('../../models/events/zoneModel');
const seatBookingModel = require('../../models/events/seatBookingModel');
const zoneBookingModel = require('../../models/events/zoneBookingModel');

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
      .select("_id name timeStart timeEnd avatar banner categories location latitude longitude location_map typeBase zone tags")
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
        const zones = await zoneModel.find({ eventId: ev._id }).select('layout.seats.price');
        console.log(`Event ID: ${ev._id}, Zones found: ${zones.length}`);
        if (zones.length === 0) {
          console.log("No zones found for this event.");
        }
        zones.forEach(zone => {
          console.log("Processing zone:", zone._id);
          if (zone && zone.layout && zone.layout.seats) {
            const currentZonePrices = zone.layout.seats.map(seat => seat.price).filter(price => price !== undefined && price !== null);
            console.log(`Prices from current zone (${zone._id}):`, currentZonePrices);
            ticketPrices.push(...currentZonePrices);
          } else {
            console.log(`Zone ${zone._id} does not have valid layout.seats or seats are empty.`);
          }
        });
        console.log("All collected ticket prices for seat-based event:", ticketPrices);
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
      const bookedBookings = await seatBookingModel.find({ 
        eventId: id, 
        showtimeId: { $in: showtimeIds },
        status: 'booked' 
      });
      const bookedSeatIds = bookedBookings.flatMap(booking => booking.seats.map(seat => seat.seatId));
      const reservedBookings = await seatBookingModel.find({
        eventId: id,
        showtimeId: { $in: showtimeIds },
        status: 'reserved',
      });
      const reservedSeatIds = reservedBookings.flatMap(booking => booking.seats.map(seat => seat.seatId));
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
      const zoneTicketModel = require('../../models/events/zoneTicketModel');
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

    const result = { ...detail.toObject(), showtimes, ...ticketInfo };
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
      name, description, avatar, images, categories, banner,
      location, rating, longitude, latitude, userId, tags, typeBase, zones, timeStart, timeEnd,
      showtimes
    } = req.body;

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
        tags,
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

    // 2. Nếu typeBase là 'zone' và có zones
    const zoneTicketModel = require('../../models/events/zoneTicketModel');
    const zoneModel = require('../../models/events/zoneModel');

    if (typeBase === 'zone' && Array.isArray(zones)) {
      for (const zone of zones) {
        // Tạo zone nếu có layout (nếu không có layout thì chỉ tạo zoneTicket)
        let newZone = null;
        if (zone.layout) {
          [newZone] = await zoneTicketModel.create([
            {
              name: zone.name,
              totalTicketCount: zone.totalTicketCount,
              price: zone.price,
              eventId: newEvent._id,
              createdBy: userId,
              updatedBy: userId
            }
          ], { session });
        }
        // Iterate over the pre-created event-level showtimes
        if (createdShowtimes.length > 0) {
          for (const newShowtime of createdShowtimes) {
            // Tạo zoneTicket cho showtime này, using zone's properties
            await zoneTicketModel.create([
              {
                showtimeId: newShowtime._id, // Use the pre-created showtime ID
                name: zone.name,
                totalTicketCount: zone.totalTicketCount, // Assumed to be on zone object
                price: zone.price, // Assumed to be on zone object
                eventId: newEvent._id,
                createdBy: userId,
                updatedBy: userId
              }
            ], { session });
          }
        }
      }
    }

    if (typeBase === 'seat' && Array.isArray(zones)) {
      for (const zone of zones) {
        // Tạo zone với layout
        const [newZone] = await zoneModel.create([{
          name: zone.name,
          layout: zone.layout,
          eventId: newEvent._id,
          createdBy: userId,
          updatedBy: userId
        }], { session });

        // Iterate over the pre-created event-level showtimes
        if (createdShowtimes.length > 0) {
          for (const newShowtime of createdShowtimes) {
            // Tạo vé cho từng seat
            if (zone.layout && Array.isArray(zone.layout.seats)) {
              const seatTickets = zone.layout.seats.map(seat => ({
                showtimeId: newShowtime._id, // Use the pre-created showtime ID
                name: `${zone.name} - ${seat.label}`,
                totalTicketCount: 1,
                price: seat.price,
                createdBy: userId,
                updatedBy: userId
                // Có thể bổ sung seatId, row, col, label... nếu muốn
              }));
              if (seatTickets.length > 0) {
                await zoneTicketModel.insertMany(seatTickets, { session });
              }
            }
          }
        }
      }
    }

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
      message: "Thêm sự kiện thành công"
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
      typeBase, showtimes, zones
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
      await zoneTicketModel.deleteMany({ eventId: id }).session(session); // Clear old zone tickets for zone type
      for (const zone of zones) {
        if (createdShowtimes.length > 0) {
          for (const newShowtime of createdShowtimes) {
            await zoneTicketModel.create([
              {
                showtimeId: newShowtime._id,
                name: zone.name,
                totalTicketCount: zone.totalTicketCount,
                price: zone.price,
                eventId: id,
                // createdBy: userId, // userId is not available in edit route, consider adding or making optional
                // updatedBy: userId
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
        const [newZone] = await zoneModel.create([{
          name: zone.name,
          layout: zone.layout,
          eventId: id,
          // createdBy: userId,
          // updatedBy: userId
        }], { session });

        if (createdShowtimes.length > 0) {
          for (const newShowtime of createdShowtimes) {
            if (zone.layout && Array.isArray(zone.layout.seats)) {
              const seatTickets = zone.layout.seats.map(seat => ({
                showtimeId: newShowtime._id,
                name: `${zone.name} - ${seat.label}`,
                totalTicketCount: 1,
                price: seat.price,
                // createdBy: userId,
                // updatedBy: userId
              }));
              if (seatTickets.length > 0) {
                await zoneTicketModel.insertMany(seatTickets, { session });
              }
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
    }
    res.status(200).json({ status: true, message: "Successfully updated" });

  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    next(e); // Pass error to next middleware for centralized error handling
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