const { getSocketIO } = require("../../../socket/socket");
const eventModel = require("../../models/events/eventModel");
const seatModel = require("../../models/events/seatBookingModel");
const zoneModel = require("../../models/events/zoneModel");
const ZoneTicket = require("../../models/events/zoneTicketModel");
const redisClient = require("../../redis/redisClient");
const zoneBookingModel = require("../../models/events/zoneBookingModel")
const SeatBookingModel = require("../../models/events/seatBookingModel");

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

  const reservationTimeMinutes = 10; // Thời gian giữ chỗ nhất quán
  const expiresAt = new Date(Date.now() + reservationTimeMinutes * 60 * 1000);

  let pendingBooking = null;

  try {
    // 1. Tạo một mục đặt chỗ 'pending'
    pendingBooking = await SeatBookingModel.create({
        eventId,
        userId,
        seats: seats.map(seat => ({
            seatId: seat.seatId,
            zoneId: seat.zoneId // Đảm bảo bạn gửi zoneId trong mảng seats từ client
        })), // Lưu trữ chi tiết ghế
        status: 'pending',
        expiresAt: expiresAt, // Đặt thời gian hết hạn tiềm năng sớm
    });

    const failedSeats = [];
    const successfulLocks = [];

    // 2. Cố gắng đặt khóa Redis cho từng ghế
    for (const seat of seats) {
      const key = `seatLock:${eventId}:${seat.seatId}`;
      // Sử dụng ID đặt chỗ 'pending' làm giá trị trong khóa Redis
      const result = await redisClient.set(key, pendingBooking._id.toString(), 'NX', 'EX', reservationTimeMinutes * 60);
      if (result !== 'OK') {
        failedSeats.push(seat.seatId);
      } else {
        successfulLocks.push(seat.seatId);
      }
    }

    // 3. Nếu bất kỳ khóa nào thất bại, hoàn tác và trả về lỗi
    if (failedSeats.length > 0) {
      // Giải phóng các khóa Redis đã thành công
      if (successfulLocks.length > 0) {
        const lockKeysToRelease = successfulLocks.map(seatId => `seatLock:${eventId}:${seatId}`);
        await redisClient.del(lockKeysToRelease);
      }
      // Xóa mục đặt chỗ 'pending'
      if (pendingBooking) {
          await SeatBookingModel.findByIdAndDelete(pendingBooking._id);
      } else {
        // Should not happen if pendingBooking was created, but good practice
        console.error("Lỗi: pendingBooking không tồn tại khi xử lý lỗi khóa Redis.");
      }

      return res.status(409).json({
        message: "Một số ghế đã bị người khác giữ.",
        failedSeats,
      });
    }

    // 4. Nếu tất cả các khóa thành công, cập nhật trạng thái đặt chỗ thành 'reserved'
    pendingBooking.status = 'reserved';
    await pendingBooking.save();

    // 5. Phát sự kiện socket
    const io = getSocketIO();
    if (io) {
      io.to(`event_${eventId}`).emit('seat_reserved', {
        bookingId: pendingBooking._id, // Phát ID đặt chỗ
        seats: pendingBooking.seats, // Sử dụng chi tiết ghế từ booking
        userId,
        expiresIn: reservationTimeMinutes * 60,
      });
    }

    // 6. Trả về thành công kèm theo ID đặt chỗ
    return res.status(200).json({
      message: "Giữ ghế thành công.",
      bookingId: pendingBooking._id,
      expiresIn: reservationTimeMinutes * 60
    });

  } catch (error) {
    console.error("Lỗi khi giữ ghế:", error);
    // Ensure pending booking is cleaned up on unexpected errors
    if (pendingBooking && pendingBooking.status === 'pending') {
         await SeatBookingModel.findByIdAndDelete(pendingBooking._id);
    } else if (pendingBooking) {
        // If status is not pending, it means it was successfully reserved before error
        // We might need a separate process to clean up expired 'reserved' bookings
        console.warn("Lỗi xảy ra sau khi đặt chỗ thành công. Booking ID:", pendingBooking._id);
    }

    // Attempt to release any held locks in case of unexpected errors
     if (seats && seats.length > 0) {
        const lockKeysToRelease = seats.map(seat => `seatLock:${eventId}:${seat.seatId}`);
        // Use try-catch here to prevent further errors during cleanup
        try {
             await redisClient.del(lockKeysToRelease);
        } catch (redisError) {
             console.error("Error releasing Redis locks during error handling:", redisError);
        }
    }
    res.status(500).json({ error: error.message });
  }
};

