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
    }).lean(); // Sử dụng lean() để tăng hiệu suất

    if (expiredBookings.length === 0) {
      console.log('No expired bookings to clean up.');
      return;
    }
    
    const expiredBookingIds = [];

    for (const booking of expiredBookings) {
      expiredBookingIds.push(booking._id);
      
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
            userId: null
          })
        );
      }
    }

    // 3. Xóa tất cả booking hết hạn bằng một lệnh duy nhất
    await seatBookingModel.deleteMany({ _id: { $in: expiredBookingIds } });
    console.log(` Deleted ${expiredBookingIds.length} expired bookings.`);

  } catch (error) {
    console.error(' Booking cleanup failed:', error);
  }
});
