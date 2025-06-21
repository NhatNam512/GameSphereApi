const { getSocketIO } = require("../../../socket/socket");
const eventModel = require("../../models/events/eventModel");
const SeatBookingModel = require("../../models/events/seatBookingModel");
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
      // Lấy các ghế đã đặt thành công từ SeatBooking model cho sự kiện này
      const bookedBookings = await SeatBookingModel.find({ 
        eventId: eventId, 
        showtimeId: showtimeId, 
        status: 'booked' 
      }).lean();
      const bookedSeatUserMap = new Map();
      bookedBookings.forEach(booking => {
        booking.seats.forEach(seat => {
          bookedSeatUserMap.set(seat.seatId, booking.userId);
        });
      });

      // Lấy các ghế đang giữ tạm thời từ SeatBookingModel cho sự kiện này
      const reservedBookings = await SeatBookingModel.find({
        eventId: eventId,
        showtimeId: showtimeId,
        status: 'reserved',
      }).lean();
      const reservedSeatUserMap = new Map();
      reservedBookings.forEach(booking => {
        booking.seats.forEach(seat => {
          reservedSeatUserMap.set(seat.seatId, booking.userId);
        });
      });

      // Duyệt từng zone để cập nhật trạng thái ghế
      const zonesWithStatus = zones.map(zone => {
        const seatsWithStatus = (zone.layout && Array.isArray(zone.layout.seats)) ? zone.layout.seats.map(seat => {
          let status = 'available';
          let userId = null;
          if (bookedSeatUserMap.has(seat.seatId)) {
            status = 'booked';
            userId = bookedSeatUserMap.get(seat.seatId);
          } else if (reservedSeatUserMap.has(seat.seatId)) {
            status = 'reserved';
            userId = reservedSeatUserMap.get(seat.seatId);
          }
          return { ...seat, status, userId };
        }) : [];
        return { ...zone, layout: { ...zone.layout, seats: seatsWithStatus } };
      });
      res.status(200).json({ message: "Lấy sơ đồ chỗ ngồi thành công.", zones: zonesWithStatus });
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
  const { eventId, showtimeId, seat, action } = req.body; // seat: { seatId, zoneId }, action: 'select' | 'deselect'
  const userId = req.user.id;

  if (!eventId || !showtimeId || !seat || !seat.seatId || !action || !['select', 'deselect'].includes(action)) {
    return res.status(400).json({ message: "Thiếu thông tin giữ ghế hoặc hành động không hợp lệ." });
  }

  const reservationTimeMinutes = 10;
  const seatKey = `seatLock:${eventId}:${showtimeId}:${seat.seatId}`;
  const io = getSocketIO();

  try {
    // START: Logic for 'select' action
    if (action === 'select') {
      // 1. Check if the seat is already booked by anyone
      const isBooked = await SeatBookingModel.findOne({ eventId, showtimeId, status: 'booked', "seats.seatId": seat.seatId });
      if (isBooked) {
        return res.status(409).json({ message: `Ghế ${seat.seatId} đã được người khác đặt.` });
      }

      // 2. Try to lock the seat using Redis for atomicity
      const lockAcquired = await redisClient.set(seatKey, userId, 'NX', 'EX', reservationTimeMinutes * 60);
      if (!lockAcquired) {
        const lockingUser = await redisClient.get(seatKey);
        // If the seat is locked by another user
        if (lockingUser !== userId) {
          return res.status(409).json({ message: `Ghế ${seat.seatId} đang được người khác giữ.` });
        }
        // If locked by the same user, it's a redundant select, can proceed or just return success
      }
      
      // 3. Find or create the user's booking for this showtime
      let userBooking = await SeatBookingModel.findOne({
        userId,
        eventId,
        showtimeId,
        status: 'reserved',
      });

      const expiresAt = new Date(Date.now() + reservationTimeMinutes * 60 * 1000);

      if (userBooking) {
        // Add seat to existing booking if not already present
        if (!userBooking.seats.some(s => s.seatId === seat.seatId)) {
          userBooking.seats.push({ seatId: seat.seatId, zoneId: seat.zoneId });
        }
        userBooking.expiresAt = expiresAt; // Refresh expiration time
      } else {
        // Create a new booking
        userBooking = new SeatBookingModel({
          eventId,
          showtimeId,
          userId,
          seats: [{ seatId: seat.seatId, zoneId: seat.zoneId }],
          status: 'reserved',
          expiresAt: expiresAt,
        });
      }

      await userBooking.save();
      
      // Emit updates via Socket.IO
      if (io) {
        io.to(`event_${eventId}`).emit('seat_updated', { seatId: seat.seatId, status: 'reserved', userId, showtimeId });
        io.to(`user_${userId}`).emit('booking_updated', { bookingId: userBooking._id, seats: userBooking.seats, expiresIn: reservationTimeMinutes * 60 });
      }

      return res.status(200).json({
        message: "Chọn ghế thành công.",
        bookingId: userBooking._id,
        expiresIn: reservationTimeMinutes * 60,
        currentSeats: userBooking.seats,
      });
    }
    // END: Logic for 'select' action

    // START: Logic for 'deselect' action
    if (action === 'deselect') {
      const userBooking = await SeatBookingModel.findOne({
        userId,
        eventId,
        showtimeId,
        status: 'reserved',
      });

      if (!userBooking || !userBooking.seats.some(s => s.seatId === seat.seatId)) {
        return res.status(400).json({ message: "Ghế chưa được chọn hoặc không tồn tại trong booking hiện tại." });
      }

      // Remove the seat from the booking
      userBooking.seats = userBooking.seats.filter(s => s.seatId !== seat.seatId);
      
      // Release the Redis lock
      await redisClient.del(seatKey);
      
      if (io) {
        io.to(`event_${eventId}`).emit('seat_updated', { seatId: seat.seatId, status: 'available', userId: null, showtimeId });
      }

      if (userBooking.seats.length === 0) {
        // If no seats are left, delete the booking document
        await SeatBookingModel.findByIdAndDelete(userBooking._id);
        if (io) {
          io.to(`user_${userId}`).emit('booking_cleared', { bookingId: userBooking._id });
        }
        return res.status(200).json({ message: "Bỏ chọn ghế thành công và booking đã được xóa." });
      } else {
        // If seats remain, update the booking's expiration time
        userBooking.expiresAt = new Date(Date.now() + reservationTimeMinutes * 60 * 1000);
        await userBooking.save();
        if (io) {
          io.to(`user_${userId}`).emit('booking_updated', { bookingId: userBooking._id, seats: userBooking.seats, expiresIn: reservationTimeMinutes * 60 });
        }
        return res.status(200).json({
          message: "Bỏ chọn ghế thành công.",
          bookingId: userBooking._id,
          expiresIn: reservationTimeMinutes * 60,
          currentSeats: userBooking.seats,
        });
      }
    }
    // END: Logic for 'deselect' action

  } catch (error) {
    console.error("Lỗi khi xử lý ghế:", error);
    // Ensure Redis lock is released on error if it was acquired by this user
    const lockValue = await redisClient.get(seatKey);
    if (lockValue === userId) {
      await redisClient.del(seatKey);
    }
    res.status(500).json({ error: error.message });
  }
};

