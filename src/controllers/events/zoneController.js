const { getSocketIO } = require("../../../socket/socket");
const zoneModel = require("../../models/events/seatModel");
const redisClient = require("../../redis/redisClient");
exports.blockSeats = async (req, res) => {
    try {
        const { eventId } = req.query;
        const bookings = await zoneModel.find({ eventId, status: 'booked' });
        const blockedSeats = bookings.flatMap(b => b.seats.map(s => s.seatId));
        res.status(200).json({
            eventId,
            blockedSeats
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

exports.seat = async (req, res) => {
    try {
        const userId = req.user.id
        const { eventId, seats, totalPrice } = req.body;
        if (!eventId || !userId || !totalPrice || !Array.isArray(seats) || seats.length === 0) {
            return res.status(400).json({ message: 'Thiếu thông tin đặt ghế.' });
        }
        const seatIds = seats.map(s => s.seatId);
        const conflict = await zoneModel.findOne({
            eventId,
            'seats.seatId': { $in: seatIds },
            status: 'booked',
        });
        const booking = new zoneModel({
            eventId,
            userId,
            seats,
            totalPrice,
        });
        if (conflict) {
            return res.status(400).json({ message: 'Một số ghế đã được đặt.' });
        }
        await booking.save();

        res.status(200).json({ message: 'Đặt ghế thành công.', booking });

    } catch (error) {
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