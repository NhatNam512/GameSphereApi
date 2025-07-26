const cron = require('node-cron');
const Order = require('../../models/events/orderModel');
const ZoneBooking = require('../../models/events/zoneBookingModel');
const SeatBooking = require('../../models/events/seatBookingModel');
const Ticket = require('../../models/events/ticketModel');
const redisClient = require('../../redis/redisClient');
const { getSocketIO } = require('../../../socket/socket');

// Chạy mỗi 2 phút để kiểm tra đơn hàng hết hạn
cron.schedule('*/2 * * * *', async () => {
  console.log('🧹 Running order cleanup job...');

  try {
    // Tìm các đơn hàng pending quá 10 phút
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const expiredOrders = await Order.find({
      status: 'pending',
      createdAt: { $lt: tenMinutesAgo }
    }).lean();

    if (expiredOrders.length === 0) {
      console.log('✅ No expired orders to clean up.');
      return;
    }

    console.log(`📋 Found ${expiredOrders.length} expired orders to cancel`);

    // Xử lý từng đơn hàng hết hạn
    for (const order of expiredOrders) {
      try {
        await cancelExpiredOrder(order);
        console.log(`✅ Successfully cancelled order ${order._id}`);
      } catch (error) {
        console.error(`❌ Failed to cancel order ${order._id}:`, error);
      }
    }

    console.log(`🎯 Order cleanup completed: processed ${expiredOrders.length} orders`);

  } catch (error) {
    console.error('❌ Order cleanup job failed:', error);
  }
});

// Hàm hủy đơn hàng hết hạn
async function cancelExpiredOrder(order) {
  // 1. Cập nhật trạng thái đơn hàng
  await Order.findByIdAndUpdate(order._id, {
    status: 'cancelled',
    cancelledAt: new Date(),
    cancelReason: 'Tự động hủy sau 10 phút chưa thanh toán'
  });

  // 2. Hủy các booking liên quan
  await cancelRelatedBookings(order);

  // 3. Hủy các vé đã tạo (nếu có)
  await cancelRelatedTickets(order);

  // 4. Dọn dẹp Redis cache
  await cleanupRedisCache(order);

  // 5. Thông báo real-time
  await notifyOrderCancellation(order);
}

// Hủy các booking liên quan
async function cancelRelatedBookings(order) {
  if (!order.bookingIds || order.bookingIds.length === 0) {
    return;
  }

  if (order.bookingType === 'zone') {
    // Hủy zone bookings
    await ZoneBooking.updateMany(
      { _id: { $in: order.bookingIds } },
      { 
        status: 'cancelled',
        cancelledAt: new Date()
      }
    );
    console.log(`📍 Cancelled ${order.bookingIds.length} zone bookings for order ${order._id}`);

  } else if (order.bookingType === 'seat') {
    // Hủy seat bookings và giải phóng ghế
    const seatBookings = await SeatBooking.find({ _id: { $in: order.bookingIds } }).lean();
    
    // Giải phóng Redis locks cho từng ghế (chỉ xóa nếu thuộc về user này)
    for (const booking of seatBookings) {
      if (booking.seats && booking.seats.length > 0) {
        for (const seat of booking.seats) {
          const seatKey = `seatLock:${booking.eventId}:${booking.showtimeId}:${seat.seatId}`;
          const lockOwner = await redisClient.get(seatKey);
          if (lockOwner === order.userId.toString()) {
            await redisClient.del(seatKey);
          }
        }
      }

      // Gửi socket notification cho từng ghế được giải phóng
      const io = getSocketIO?.();
      if (io && booking.seats) {
        booking.seats.forEach(seat =>
          io.to(`event_${booking.eventId}`).emit('seat_updated', {
            seatId: seat.seatId,
            showtimeId: booking.showtimeId,
            status: 'available',
            userId: null
          })
        );
      }
    }

    // Cập nhật trạng thái booking
    await SeatBooking.updateMany(
      { _id: { $in: order.bookingIds } },
      { 
        status: 'cancelled',
        cancelledAt: new Date()
      }
    );
    console.log(`💺 Cancelled ${order.bookingIds.length} seat bookings for order ${order._id}`);
  }
}

// Hủy các vé đã tạo
async function cancelRelatedTickets(order) {
  const cancelledTickets = await Ticket.updateMany(
    { orderId: order._id },
    { 
      status: 'cancelled',
      cancelledAt: new Date()
    }
  );

  if (cancelledTickets.modifiedCount > 0) {
    console.log(`🎫 Cancelled ${cancelledTickets.modifiedCount} tickets for order ${order._id}`);
  }
}

// Dọn dẹp Redis cache
async function cleanupRedisCache(order) {
  try {
    // Xóa cache reservation keys và user selected seats
    const patterns = [
      `*Reserve:*:${order.userId}`,
      `userSeats:${order.userId}:*`,
      `seatLock:${order.eventId}:${order.showtimeId}:*`,
      `getEvents:${order.userId}`,
      `userTickets:${order.userId}`,
      `eventDetails:${order.eventId}`,
      `seatStatus:${order.eventId}:${order.showtimeId}`
    ];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
          // Đối với seatLock, chỉ xóa những key thuộc về user này
          if (pattern.includes('seatLock')) {
            for (const key of keys) {
              const lockOwner = await redisClient.get(key);
              if (lockOwner === order.userId.toString()) {
                await redisClient.del(key);
              }
            }
          } else {
            await redisClient.del(...keys);
          }
        }
      } else {
        await redisClient.del(pattern);
      }
    }

  } catch (error) {
    console.error('❌ Error cleaning up Redis cache:', error);
    // Không throw error để không làm gián đoạn quá trình hủy đơn
  }
}

// Thông báo real-time về việc hủy đơn
async function notifyOrderCancellation(order) {
  try {
    const io = getSocketIO?.();
    if (!io) return;

    // Thông báo cho user
    io.to(`user_${order.userId}`).emit('order_cancelled', {
      orderId: order._id,
      reason: 'Đơn hàng đã bị hủy tự động do quá thời gian thanh toán (10 phút)',
      cancelledAt: new Date()
    });

    // Thông báo cho event room (để cập nhật số vé available)
    if (order.showtimeId) {
      io.to(`event_${order.showtimeId}`).emit('tickets_released', {
        showtimeId: order.showtimeId,
        eventId: order.eventId,
        releasedCount: order.amount || 0
      });
    }

  } catch (error) {
    console.error('❌ Error sending notifications:', error);
    // Không throw error để không làm gián đoạn quá trình hủy đơn
  }
}

console.log('🚀 Order cleanup job initialized - running every 2 minutes'); 