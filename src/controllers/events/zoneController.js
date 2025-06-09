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
    const { showtimeId } = req.query;

    if (!eventId) {
      return res.status(400).json({ message: "Thiếu eventId trong params." });
    }

    // Tìm event bằng eventId và populate trường zone
    const event = await eventModel.findById(eventId).populate('zone');

    if(event.typeBase == 'none'){
      return res.status(200).json({ message: "Sự kiện chưa có sơ đồ chỗ ngồi hoặc zone không tồn tại.", zones: [] });
    }
    if(event.typeBase == 'seat'){
      // Lấy tất cả các zone thuộc event này
      const zones = await zoneModel.find({ eventId: eventId });
      if (!zones || zones.length === 0) {
        return res.status(200).json({ message: "Sự kiện chưa có sơ đồ chỗ ngồi.", zones: [] });
      }
      // Lấy các ghế đã đặt thành công từ SeatBooking model cho sự kiện này
      const bookedBookings = await seatModel.find({ 
        eventId: eventId, 
        showtimeId: showtimeId, 
        status: 'booked' 
      });
      const bookedSeatIds = bookedBookings.flatMap(booking => booking.seats.map(seat => seat.seatId));
      // Lấy các ghế đang giữ tạm thời từ SeatBookingModel cho sự kiện này
      const reservedBookings = await SeatBookingModel.find({
        eventId: eventId,
        showtimeId: showtimeId,
        status: 'reserved',
      });
      const reservedSeatIds = reservedBookings.flatMap(booking => booking.seats.map(seat => seat.seatId));
      // Duyệt từng zone để cập nhật trạng thái ghế
      const zonesWithStatus = zones.map(zone => {
        const seatsWithStatus = (zone.layout && Array.isArray(zone.layout.seats)) ? zone.layout.seats.map(seat => {
          let status = 'available';
          if (bookedSeatIds.includes(seat.seatId)) {
            status = 'booked';
          } else if (reservedSeatIds.includes(seat.seatId)) {
            status = 'reserved';
          }
          return { ...seat.toObject ? seat.toObject() : seat, status };
        }) : [];
        return { ...zone.toObject(), layout: { ...zone.layout, seats: seatsWithStatus } };
      });
      res.status(200).json({ message: "Lấy sơ đồ chỗ ngồi thành công.", zones: zonesWithStatus });
    }
    if(event.typeBase=='zone'){
      const zones = await ZoneTicket.find({ showtimeId: showtimeId });
      if (!zones || zones.length === 0) {
        return res.status(200).json({ message: "Sự kiện chưa có khu vực vé.", zones: [] });
      }

      // Lấy bookings theo showtimeId
      const bookings = await zoneBookingModel.find({
        showtimeId: showtimeId,
        status: { $in: ['booked', 'reserved'] },
      });

      const bookingCounts = bookings.reduce((acc, booking) => {
        const zoneId = booking.zoneId.toString();
        acc[zoneId] = (acc[zoneId] || 0) + booking.quantity;
        return acc;
      }, {});

      const zonesWithAvailability = zones.map(zone => {
        const bookedAndReservedCount = bookingCounts[zone._id.toString()] || 0;
        const availableCount = zone.totalTicketCount - bookedAndReservedCount;
        return {
          ...zone.toObject(),
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
  const { eventId, showtimeId, seat, action } = req.body; // seat: { seatId, zoneId }, action: 'select' | 'deselect'
  const userId = req.user.id;

  if (!eventId || !showtimeId || !seat || !seat.seatId || !seat.zoneId || !action || !['select', 'deselect'].includes(action)) {
    return res.status(400).json({ message: "Thiếu thông tin giữ ghế hoặc hành động không hợp lệ." });
  }

  const reservationTimeMinutes = 10; // Thời gian giữ chỗ nhất quán
  const expiresAt = new Date(Date.now() + reservationTimeMinutes * 60 * 1000);
  const seatKey = `seatLock:${eventId}:${showtimeId}:${seat.seatId}`;
  const io = getSocketIO();

  try {
    let currentBooking = await SeatBookingModel.findOne({
      userId,
      eventId,
      showtimeId,
      status: { $in: ['pending', 'reserved'] },
    });

    if (action === 'select') {
      // Kiểm tra xem ghế đã được đặt hoặc giữ bởi người khác chưa
      const existingSeatLock = await redisClient.get(seatKey);
      if (existingSeatLock) {
        // Nếu ghế đã bị khóa bởi booking khác (không phải của người dùng hiện tại)
        if (!currentBooking || existingSeatLock !== currentBooking._id.toString()) {
           return res.status(409).json({ message: `Ghế ${seat.seatId} đã bị người khác giữ hoặc đặt.` });
        }
      }
      // Nếu ghế đã có trong booking hiện tại, không làm gì cả
      if (currentBooking && currentBooking.seats.some(s => s.seatId === seat.seatId)) {
        return res.status(200).json({ message: "Ghế đã được chọn trước đó.", bookingId: currentBooking._id });
      }

      const redisResult = await redisClient.set(seatKey, currentBooking ? currentBooking._id.toString() : 'temp', 'NX', 'EX', reservationTimeMinutes * 60);
      if (redisResult !== 'OK') {
        return res.status(409).json({ message: `Ghế ${seat.seatId} đã bị người khác giữ.` });
      }

      if (!currentBooking) {
        currentBooking = await SeatBookingModel.create({
          eventId,
          showtimeId,
          userId,
          seats: [{ seatId: seat.seatId, zoneId: seat.zoneId }],
          status: 'pending', // Sẽ cập nhật thành reserved nếu có ghế
          expiresAt: expiresAt,
        });
         await redisClient.set(seatKey, currentBooking._id.toString(), 'XX', 'EX', reservationTimeMinutes * 60); // Cập nhật lại giá trị key với booking ID thật
      } else {
        currentBooking.seats.push({ seatId: seat.seatId, zoneId: seat.zoneId });
        currentBooking.expiresAt = expiresAt; // Cập nhật thời gian hết hạn
      }
      currentBooking.status = 'reserved'; // Chuyển sang reserved nếu có ghế được chọn
      await currentBooking.save();

      if (io) {
        io.to(`event_${eventId}`).emit('seat_updated', { seatId: seat.seatId, status: 'reserved', showtimeId });
        io.to(`user_${userId}`).emit('booking_updated', { bookingId: currentBooking._id, seats: currentBooking.seats, expiresIn: reservationTimeMinutes * 60 });
      }
      return res.status(200).json({
        message: "Chọn ghế thành công.",
        bookingId: currentBooking._id,
        expiresIn: reservationTimeMinutes * 60,
        currentSeats: currentBooking.seats,
      });

    } else if (action === 'deselect') {
      if (!currentBooking || !currentBooking.seats.some(s => s.seatId === seat.seatId)) {
        return res.status(400).json({ message: "Ghế chưa được chọn hoặc không tồn tại trong booking hiện tại." });
      }

      // Xóa ghế khỏi booking
      currentBooking.seats = currentBooking.seats.filter(s => s.seatId !== seat.seatId);
      currentBooking.expireAt = expiresAt; // Cập nhật thời gian hết hạn

      // Giải phóng khóa Redis
      await redisClient.del(seatKey);
      if (io) {
        io.to(`event_${eventId}`).emit('seat_updated', { seatId: seat.seatId, status: 'available', showtimeId });
      }

      if (currentBooking.seats.length === 0) {
        // Nếu không còn ghế nào, xóa booking hoặc chuyển về pending
        await SeatBookingModel.findByIdAndDelete(currentBooking._id);
        if (io) {
            io.to(`user_${userId}`).emit('booking_cleared', { bookingId: currentBooking._id });
        }
        return res.status(200).json({ message: "Bỏ chọn ghế thành công. Booking trống và đã được xóa." });
      } else {
        await currentBooking.save();
         if (io) {
            io.to(`user_${userId}`).emit('booking_updated', { bookingId: currentBooking._id, seats: currentBooking.seats, expiresIn: reservationTimeMinutes * 60 });
        }
        return res.status(200).json({
          message: "Bỏ chọn ghế thành công.",
          bookingId: currentBooking._id,
          expiresIn: reservationTimeMinutes * 60,
          currentSeats: currentBooking.seats,
        });
      }
    }
  } catch (error) {
    console.error("Lỗi khi xử lý ghế:", error);
    res.status(500).json({ error: error.message });
  }
};

