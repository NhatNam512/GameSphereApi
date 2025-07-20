const { getSocketIO } = require("../../../socket/socket");
const eventModel = require("../../models/events/eventModel");
const SeatBookingModel = require("../../models/events/seatBookingModel");
const zoneModel = require("../../models/events/zoneModel");
const ZoneTicket = require("../../models/events/zoneTicketModel");
const redisClient = require("../../redis/redisClient");
const zoneBookingModel = require("../../models/events/zoneBookingModel")

exports.createZone = async (req, res) => {
  try {
    const userId = req.user.id;
    const {name, rows, cols, seats} = req.body;
    if( !rows || !cols || !seats) {
      return res.status(400).json({message: "Thiếu thông tin tạo vùng."});
    }
    const zone = await zoneModel.create({
      name,
      layout: {
        rows: rows,
        cols: cols,
        seats: seats,
        color: color,
      },
      createdBy: userId,
      updatedBy: userId,
    })
    await zone.save();
    res.status(200).json({message: "Tạo vùng thành công.", zoneId: zone._id,});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
}

exports.getZones = async (req, res)=>{
  try {
    // Lấy eventId từ req.params.id theo định nghĩa route /getZone/:id
    const eventId = req.params.id;
    const { showtimeId } = req.query;

    if (!eventId) {
      return res.status(400).json({ message: "Thiếu eventId trong params." });
    }

    // Tìm event bằng eventId và populate trường zone
    const event = await eventModel.findById(eventId).populate('zone').lean();

    if (!event) {
        return res.status(404).json({ message: "Không tìm thấy sự kiện." });
    }

    if(event.typeBase == 'none'){
      return res.status(200).json({ message: "Sự kiện chưa có sơ đồ chỗ ngồi hoặc zone không tồn tại.", zones: [] });
    }
    if(event.typeBase == 'seat'){
      // Lấy tất cả các zone thuộc event này
      const zones = await zoneModel.find({ eventId: eventId }).lean();
      if (!zones || zones.length === 0) {
        return res.status(200).json({ message: "Sự kiện chưa có sơ đồ chỗ ngồi.", zones: [] });
      }
      // Lấy trạng thái ghế từ Redis (ưu tiên in-memory)
      const cacheKey = `seatStatus:${eventId}:${showtimeId}`;
      let booked = [], reserved = [];
      const cacheData = await redisClient.get(cacheKey);
      if (cacheData) {
        ({ booked = [], reserved = [] } = JSON.parse(cacheData));
      } else {
        // Nếu cache miss, fallback truy vấn lại toàn bộ
        const [bookedBookings, reservedBookings] = await Promise.all([
          SeatBookingModel.find({ eventId, showtimeId, status: 'booked' }, { seats: 1 }).lean(),
          SeatBookingModel.find({ eventId, showtimeId, status: 'reserved' }, { seats: 1 }).lean(),
        ]);
        booked = bookedBookings.flatMap(booking => booking.seats.map(seat => seat.seatId));
        reserved = reservedBookings.flatMap(booking => booking.seats.map(seat => seat.seatId));
        // Cập nhật cache luôn
        await redisClient.set(cacheKey, JSON.stringify({ booked, reserved }), 'EX', 60);
      }
      // Duyệt từng zone để cập nhật trạng thái ghế
      const zonesWithStatus = zones.map(zone => {
        const seatsWithStatus = (zone.layout && Array.isArray(zone.layout.seats)) ? zone.layout.seats.map(seat => {
          let status = 'available';
          if (booked.includes(seat.seatId)) {
            status = 'booked';
          } else if (reserved.includes(seat.seatId)) {
            status = 'reserved';
          }
          return { ...seat, status };
        }) : [];
        return { ...zone, layout: { ...zone.layout, seats: seatsWithStatus } };
      });
      return res.status(200).json({ message: "Lấy sơ đồ chỗ ngồi thành công.", zones: zonesWithStatus });
    }
    if(event.typeBase=='zone'){
      const zones = await ZoneTicket.find({ showtimeId: showtimeId }).lean();
      if (!zones || zones.length === 0) {
        return res.status(200).json({ message: "Sự kiện chưa có khu vực vé.", zones: [] });
      }

      // Lấy bookings theo showtimeId
      const bookings = await zoneBookingModel.find({
        showtimeId: showtimeId,
        status: { $in: ['booked', 'reserved'] },
      }).lean();

      const bookingCounts = bookings.reduce((acc, booking) => {
        const zoneId = booking.zoneId.toString();
        acc[zoneId] = (acc[zoneId] || 0) + booking.quantity;
        return acc;
      }, {});

      const zonesWithAvailability = zones.map(zone => {
        const bookedAndReservedCount = bookingCounts[zone._id.toString()] || 0;
        const availableCount = zone.totalTicketCount - bookedAndReservedCount;
        return {
          ...zone,
          availableCount: Math.max(0, availableCount),
        };
      });

      res.status(200).json({ message: "Lấy thông tin khu vực vé thành công.", zones: zonesWithAvailability });
    }

  } catch (error) {
    console.error("Lỗi khi lấy sơ đồ chỗ ngồi:", error);
    res.status(500).json({ error: error.message });
  }
}
exports.reserveSeats = async (req, res) => {
  const { eventId, showtimeId, seat, action } = req.body;
  const userId = req.user.id;

  if (!eventId || !showtimeId || !seat?.seatId || !seat?.zoneId || !['select', 'deselect'].includes(action)) {
    return res.status(400).json({ message: "Thiếu thông tin hoặc hành động không hợp lệ." });
  }

  const reservationTimeSeconds = 10 * 60;
  const seatKey = `seatLock:${eventId}:${showtimeId}:${seat.seatId}`;
  const io = getSocketIO();

  try {
    if (action === 'select') {
      // Kiểm tra song song: ghế đã đặt hoặc đang bị giữ bởi người khác
      const [isBooked, currentLocker] = await Promise.all([
        SeatBookingModel.exists({
          eventId, showtimeId, status: 'booked', 'seats.seatId': seat.seatId,
        }),
        redisClient.get(seatKey)
      ]);

      if (isBooked) {
        return res.status(409).json({ message: `Ghế ${seat.seatId} đã được đặt.` });
      }
      if (currentLocker && currentLocker !== userId) {
        return res.status(409).json({ message: `Ghế ${seat.seatId} đang được giữ bởi người khác.` });
      }

      // Đặt lock nếu chưa có
      let lock = null;
      if (!currentLocker) {
        lock = await redisClient.set(seatKey, userId, 'NX', 'EX', reservationTimeSeconds);
        if (!lock) {
          return res.status(409).json({ message: `Không thể giữ ghế, vui lòng thử lại.` });
        }
      }

      const expiresAt = new Date(Date.now() + reservationTimeSeconds * 1000);
      // Cập nhật booking (upsert)
      await SeatBookingModel.updateOne(
        {
          userId, eventId, showtimeId, status: 'reserved',
        },
        {
          $addToSet: { seats: seat },
          $set: { expiresAt },
        },
        { upsert: true }
      );

      // Lấy booking mới nhất (dùng lean để tăng tốc)
      const booking = await SeatBookingModel.findOne({
        userId, eventId, showtimeId, status: 'reserved',
      }, { seats: 1 }).lean();

      // Chỉ emit nếu số ghế thực sự thay đổi
      if (io && booking?.seats?.some(s => s.seatId === seat.seatId)) {
        io.to(`event_${eventId}_showtime_${showtimeId}`).emit('zone_data_changed', { eventId, showtimeId });
      }

      // Sau khi xử lý chọn ghế, cập nhật lại cache trạng thái ghế cho showtime (tối ưu: chỉ cập nhật seatId vừa chọn)
      const cacheKey = `seatStatus:${eventId}:${showtimeId}`;
      let cacheData = await redisClient.get(cacheKey);
      let booked = [], reserved = [];
      if (cacheData) {
        ({ booked = [], reserved = [] } = JSON.parse(cacheData));
      } else {
        // Nếu cache miss, fallback truy vấn lại toàn bộ
        const [bookedBookingsCache, reservedBookingsCache] = await Promise.all([
          SeatBookingModel.find({ eventId, showtimeId, status: 'booked' }, { seats: 1 }).lean(),
          SeatBookingModel.find({ eventId, showtimeId, status: 'reserved' }, { seats: 1 }).lean(),
        ]);
        booked = bookedBookingsCache.flatMap(booking => booking.seats.map(seat => seat.seatId));
        reserved = reservedBookingsCache.flatMap(booking => booking.seats.map(seat => seat.seatId));
      }
      // Chỉ cập nhật mảng reserved (vì action select là giữ ghế tạm thời)
      if (!reserved.includes(seat.seatId)) reserved.push(seat.seatId);
      await redisClient.set(cacheKey, JSON.stringify({ booked, reserved }), 'EX', 60);

      return res.status(200).json({
        message: "Chọn ghế thành công.",
        bookingId: booking?._id,
        expiresIn: reservationTimeSeconds,
        currentSeats: booking?.seats || []
      });
    }

    if (action === 'deselect') {
      // Lấy booking hiện tại (dùng lean)
      const booking = await SeatBookingModel.findOne({
        userId, eventId, showtimeId, status: 'reserved',
      }, { seats: 1 }).lean();

      if (!booking || !booking.seats.some(s => s.seatId === seat.seatId)) {
        return res.status(400).json({ message: "Ghế không tồn tại trong booking." });
      }

      // Xóa Redis lock và cập nhật DB song song
      const updatedSeats = booking.seats.filter(s => s.seatId !== seat.seatId);
      const dbPromise = updatedSeats.length === 0
        ? SeatBookingModel.deleteOne({ _id: booking._id })
        : SeatBookingModel.updateOne(
            { _id: booking._id },
            {
              $set: {
                seats: updatedSeats,
                expiresAt: new Date(Date.now() + reservationTimeSeconds * 1000),
              }
            }
          );
      await Promise.all([
        redisClient.del(seatKey),
        dbPromise
      ]);

      // Lấy lại booking mới nhất (có thể null nếu đã xóa hết ghế, dùng lean)
      const updatedBooking = updatedSeats.length === 0 ? null : await SeatBookingModel.findOne({
        userId, eventId, showtimeId, status: 'reserved',
      }, { seats: 1 }).lean();

      // Chỉ emit nếu số ghế thực sự thay đổi
      if (io && (!updatedBooking || !updatedBooking.seats.some(s => s.seatId === seat.seatId))) {
        io.to(`event_${eventId}_showtime_${showtimeId}`).emit('seat_updated', {
          seatId: seat.seatId,
          status: 'available',
        });
        io.to(`event_${eventId}_showtime_${showtimeId}`).emit('zone_data_changed', { eventId, showtimeId });
      }

      // Xóa cache trạng thái ghế cho showtime này sau khi bỏ chọn ghế
      const cacheKey = `seatStatus:${eventId}:${showtimeId}`;
      await redisClient.del(cacheKey);

      return res.status(200).json({
        message: "Bỏ chọn ghế thành công.",
        seatId: seat.seatId,
        currentSeats: updatedBooking?.seats || []
      });
    }

  } catch (error) {
    console.error("Lỗi reserveSeats:", error);
    // Chỉ xóa lock nếu là user này giữ
    const lockOwner = await redisClient.get(seatKey);
    if (lockOwner === userId) {
      await redisClient.del(seatKey);
    }
    return res.status(500).json({ error: error.message });
  }
};

// ================== Hỗ trợ tối ưu nâng cao ==================
// 1. Redis Pipeline cho multi-seat (chưa tích hợp, chỉ ví dụ):
async function lockMultipleSeatsRedisPipeline(seatKeys, userId, reservationTimeSeconds) {
  const pipeline = redisClient.pipeline();
  seatKeys.forEach(key => pipeline.set(key, userId, 'NX', 'EX', reservationTimeSeconds));
  return pipeline.exec();
}

// 2. Lua script cho lock/unlock Redis (chưa tích hợp, chỉ ví dụ):
// Lock: chỉ set nếu chưa có hoặc đã hết hạn
// Unlock: chỉ xóa nếu đúng user giữ
//
// const luaUnlockScript = `
//   if redis.call('get', KEYS[1]) == ARGV[1] then
//     return redis.call('del', KEYS[1])
//   else
//     return 0
//   end
// `;
// redisClient.eval(luaUnlockScript, 1, seatKey, userId);

// 3. Gợi ý cache trạng thái ghế vào Redis:
// Khi có thay đổi trạng thái ghế, cập nhật cache trạng thái ghế của showtime vào Redis.
// Khi client request trạng thái ghế, ưu tiên lấy từ Redis, chỉ fallback DB nếu cache miss.

exports.cancelAllReservedSeats = async (req, res) => {
  const userId = req.user.id;
  if (!userId) {
    return res.status(400).json({ message: "Thiếu userId." });
  }
  try {
    // Tìm tất cả booking reserved của user này
    const bookings = await SeatBookingModel.find({
      userId, status: 'reserved',
    });
    if (!bookings.length) {
      return res.status(200).json({ message: "Không có ghế nào đang giữ." });
    }
    const io = getSocketIO();
    for (const booking of bookings) {
      const { eventId, showtimeId } = booking;
      for (const seat of booking.seats) {
        const seatKey = `seatLock:${eventId}:${showtimeId}:${seat.seatId}`;
        const currentLocker = await redisClient.get(seatKey);
        if (currentLocker === userId) {
          await redisClient.del(seatKey);
        }
      }
      await SeatBookingModel.deleteOne({ _id: booking._id });
      if (io) {
        io.to(`event_${eventId}_showtime_${showtimeId}`).emit('zone_data_changed', { eventId, showtimeId });
      }
      // Xóa cache trạng thái ghế cho showtime này
      const cacheKey = `seatStatus:${eventId}:${showtimeId}`;
      await redisClient.del(cacheKey);
    }
    return res.status(200).json({ message: "Đã hủy tất cả ghế đang giữ cho user." });
  } catch (error) {
    console.error("Lỗi cancelAllReservedSeats:", error);
    return res.status(500).json({ error: error.message });
  }
};

// GỢI Ý: Để sync về MongoDB định kỳ, bạn có thể tạo một background job (ví dụ: mỗi 1 phút) đọc trạng thái ghế từ Redis và ghi lại vào MongoDB. Có thể dùng setInterval hoặc một job scheduler như node-cron.




