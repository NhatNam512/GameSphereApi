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
      const isBooked = await SeatBookingModel.exists({
        eventId, showtimeId, status: 'booked', 'seats.seatId': seat.seatId,
      });

      if (isBooked) {
        return res.status(409).json({ message: `Ghế ${seat.seatId} đã được đặt.` });
      }

      const lock = await redisClient.set(seatKey, userId, 'NX', 'EX', reservationTimeSeconds);

      const currentLocker = await redisClient.get(seatKey);
      if (!lock && currentLocker !== userId) {
        return res.status(409).json({ message: `Ghế ${seat.seatId} đang được giữ bởi người khác.` });
      }

      const expiresAt = new Date(Date.now() + reservationTimeSeconds * 1000);

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

      if (io) {
        io.to(`event_${eventId}_showtime_${showtimeId}`).emit('seat_updated', {
          seatId: seat.seatId,
          status: 'reserved',
          userId,
        });
        io.to(`event_${eventId}_showtime_${showtimeId}`).emit('zone_data_changed', { eventId, showtimeId });
      }

      return res.status(200).json({
        message: "Chọn ghế thành công.",
        expiresIn: reservationTimeSeconds,
        seatId: seat.seatId,
      });
    }

    if (action === 'deselect') {
      const booking = await SeatBookingModel.findOne({
        userId, eventId, showtimeId, status: 'reserved',
      });

      if (!booking || !booking.seats.some(s => s.seatId === seat.seatId)) {
        return res.status(400).json({ message: "Ghế không tồn tại trong booking." });
      }

      // Cập nhật booking
      const updatedSeats = booking.seats.filter(s => s.seatId !== seat.seatId);
      if (updatedSeats.length === 0) {
        await SeatBookingModel.deleteOne({ _id: booking._id });
      } else {
        await SeatBookingModel.updateOne(
          { _id: booking._id },
          {
            $set: {
              seats: updatedSeats,
              expiresAt: new Date(Date.now() + reservationTimeSeconds * 1000),
            }
          }
        );
      }

      // Xóa Redis lock
      const currentLocker = await redisClient.get(seatKey);
      if (currentLocker === userId) {
        await redisClient.del(seatKey);
      }

      if (io) {
        io.to(`event_${eventId}_showtime_${showtimeId}`).emit('seat_updated', {
          seatId: seat.seatId,
          status: 'available',
        });
        io.to(`event_${eventId}_showtime_${showtimeId}`).emit('zone_data_changed', { eventId, showtimeId });
      }

      return res.status(200).json({
        message: "Bỏ chọn ghế thành công.",
        seatId: seat.seatId,
      });
    }

  } catch (error) {
    console.error("Lỗi reserveSeats:", error);
    const lockOwner = await redisClient.get(seatKey);
    if (lockOwner === userId) {
      await redisClient.del(seatKey);
    }
    return res.status(500).json({ error: error.message });
  }
};


