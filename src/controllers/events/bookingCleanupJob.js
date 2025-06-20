const cron = require('node-cron');
const seatBookingModel = require('../../models/events/seatBookingModel');
const redis = require('../../redis/redisClient');
const { getSocketIO } = require('../../../socket/socket');

// Chạy mỗi 1 phút
cron.schedule('*/1 * * * *', async () => {
  console.log('⏰ Running booking cleanup job...');

  const now = new Date();
  try {
    const expiredBookings = await seatBookingModel.find({
      status: { $in: ['pending', 'reserved'] },
      expiresAt: { $lt: now }
    });

    for (const booking of expiredBookings) {
      // 1. Giải phóng Redis lock nếu cần
      const unlocks = booking.seats.map(seat =>
        redis.del(`seatLock:${booking.eventId}:${booking.showtimeId}:${seat.seatId}`)
      );
      await Promise.all(unlocks);

      // 2. Gửi socket thông báo nếu đang dùng
      const io = getSocketIO?.();
      if (io) {
        io.to(`user_${booking.userId}`).emit('booking_expired', { bookingId: booking._id });

        booking.seats.forEach(s =>
          io.to(`event_${booking.eventId}`).emit('seat_updated', {
            seatId: s.seatId,
            showtimeId: booking.showtimeId,
            status: 'available',
          })
        );
      }

      // 3. Xóa booking
      await seatBookingModel.findByIdAndDelete(booking._id);
      console.log(`🧹 Deleted expired booking: ${booking._id}`);
    }
  } catch (error) {
    console.error('❌ Booking cleanup failed:', error);
  }
});
