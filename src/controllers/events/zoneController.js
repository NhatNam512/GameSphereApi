const { getSocketIO } = require("../../../socket/socket");
const eventModel = require("../../models/events/eventModel");
const seatModel = require("../../models/events/seatBookingModel");
const zoneModel = require("../../models/events/zoneModel");
const ZoneTicket = require("../../models/events/zoneTicketModel");
const redisClient = require("../../redis/redisClient");
const zoneBookingModel = require("../../models/events/zoneBookingModel")

exports.createZone = async (req, res) => {
  try {
    const {userId} = req.user.id;
    const {name, rows, cols, seats} = req.body;
    if( !rows || !cols || !seats) {
      return res.status(400).json({message: "Thiếu thông tin tạo vùng."});
    }
    const zone = await zoneModel.create({
      name,
      layout: {
        rows: rows,
        cols: cols,
        seats: seats
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

    if (!eventId) {
      return res.status(400).json({ message: "Thiếu eventId trong params." });
    }

    // Tìm event bằng eventId và populate trường zone
    const event = await eventModel.findById(eventId).populate('zone');

    if(event.typeBase == 'none'){
      return res.status(200).json({ message: "Sự kiện chưa có sơ đồ chỗ ngồi hoặc zone không tồn tại.", zones: [] });
    }
    if(event.typeBase == 'seat'){
    // Lấy thông tin zone từ event đã populate
    const zone = event.zone;

    // Lấy các ghế đã đặt thành công từ SeatBooking model cho sự kiện này
    const bookedBookings = await seatModel.find({ eventId: eventId, status: 'booked' });
    const bookedSeatIds = bookedBookings.flatMap(booking => booking.seats.map(seat => seat.seatId));

    // Lấy các ghế đang giữ tạm thời từ Redis cho sự kiện này
    let reservedSeatIds = [];
    let cursor = '0';
    do {
      const reply = await redisClient.scan(cursor, 'MATCH', `gamesphere:seatLock:${eventId}:*`);
      cursor = reply[0];
      const keys = reply[1];
      keys.forEach(key => {
        const parts = key.split(':');
        if (parts.length === 4 && parts[0] === 'gamesphere' && parts[1] === 'seatLock' && parts[2] === eventId) {
          reservedSeatIds.push(parts[3]); // Lấy seatId từ phần thứ 4
        }
      });
    } while (cursor !== '0');

    // Kết hợp thông tin zone layout với trạng thái ghế
    const seatsWithStatus = zone.layout.seats.map(seat => {
      let status = 'available';
      if (bookedSeatIds.includes(seat.seatId)) {
        status = 'booked';
      } else if (reservedSeatIds.includes(seat.seatId)) {
        status = 'reserved';
      }
      // Trả về đối tượng ghế với trường status được cập nhật
      return { ...seat.toObject(), status };
    });

    // Trả về đối tượng zone đã cập nhật trạng thái ghế, bọc trong mảng để nhất quán với API có thể có nhiều zones sau này
    const zoneWithStatus = { ...zone.toObject(), layout: { ...zone.layout.toObject(), seats: seatsWithStatus } };

    res.status(200).json({ message: "Lấy sơ đồ chỗ ngồi thành công.", zones: [zoneWithStatus] });
    }
    if(event.typeBase=='zone'){
      const zones = await ZoneTicket.find({eventId: eventId});
      // If no zones found, return an empty array
    if (!zones || zones.length === 0) {
      return res.status(200).json({ message: "Sự kiện chưa có khu vực vé.", zones: [] });
    }

    // Get all bookings (booked and reserved) for this event
    const bookings = await zoneBookingModel.find({
      eventId: eventId,
      status: { $in: ['booked', 'reserved'] },
      // Optional: Add logic here to filter out expired reserved bookings if not handled by TTL in MongoDB/Redis
    });

    // Calculate booked and reserved quantities for each zone
    const bookingCounts = bookings.reduce((acc, booking) => {
      const zoneId = booking.zoneId.toString();
      acc[zoneId] = (acc[zoneId] || 0) + booking.quantity;
      return acc;
    }, {});

    // Combine zone info with available ticket count
    const zonesWithAvailability = zones.map(zone => {
      const bookedAndReservedCount = bookingCounts[zone._id.toString()] || 0;
      const availableCount = zone.totalTicketCount - bookedAndReservedCount;
      return {
        ...zone.toObject(),
        availableCount: Math.max(0, availableCount), // Ensure availableCount is not negative
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
  const { eventId, seats } = req.body;
  const userId = req.user.id;

  if (!eventId || !Array.isArray(seats) || seats.length === 0) {
    return res.status(400).json({ message: "Thiếu thông tin giữ ghế." });
  }

  const failedSeats = [];

  for (const seat of seats) {
    const key = `seatLock:${eventId}:${seat.seatId}`;
    const result = await redisClient.set(key, userId, 'NX', 'EX', 600);
    if (result !== 'OK') {
      failedSeats.push(seat.seatId);
    }
  }

  if (failedSeats.length > 0) {
    // Giải phóng các ghế đã giữ trước đó nếu 1 cái bị fail
    for (const seatId of seats) {
      await redisClient.del(`seatLock:${eventId}:${seatId}`);
    }
    return res.status(409).json({
      message: "Một số ghế đã bị người khác giữ.",
      failedSeats,
    });
  }

  // Emit socket đến room sự kiện để cập nhật ghế đã giữ
  const io = getSocketIO();
  io.to(`event_${eventId}`).emit('seat_reserved', {
    seats,
    userId,
    expiresIn: 600,
  });

  return res.status(200).json({ message: "Giữ ghế thành công.", expiresIn: 600 });
};

