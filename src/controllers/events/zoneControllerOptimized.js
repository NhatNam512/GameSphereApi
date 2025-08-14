const SeatBookingModel = require('../../models/events/seatBookingModel');
const { getSocketIO } = require('../../socket/socket');
const redisClient = require('../../redis/redisClient');

// Constants
const RESERVATION_TIME_SECONDS = 10 * 60; // 10 minutes
const CACHE_TTL = 60; // 1 minute
const BATCH_SIZE = 50; // For bulk operations

// Utility functions
const generateSeatKey = (eventId, showtimeId, seatId) => 
  `seatLock:${eventId}:${showtimeId}:${seatId}`;

const generateCacheKey = (eventId, showtimeId) => 
  `seatStatus:${eventId}:${showtimeId}`;

const generateRoomName = (eventId, showtimeId) => 
  `event_${eventId}_showtime_${showtimeId}`;

// Optimized cache management
class SeatCacheManager {
  static async getSeatStatus(eventId, showtimeId) {
    const cacheKey = generateCacheKey(eventId, showtimeId);
    try {
      const cacheData = await redisClient.get(cacheKey);
      if (cacheData) {
        return JSON.parse(cacheData);
      }
    } catch (error) {
      console.error('Cache read error:', error);
    }
    return null;
  }

  static async updateSeatStatus(eventId, showtimeId, seatId, action) {
    const cacheKey = generateCacheKey(eventId, showtimeId);
    try {
      const cacheData = await this.getSeatStatus(eventId, showtimeId);
      let { booked = [], reserved = [] } = cacheData || {};

      if (action === 'select') {
        if (!reserved.includes(seatId)) {
          reserved.push(seatId);
        }
      } else if (action === 'deselect') {
        reserved = reserved.filter(id => id !== seatId);
      } else if (action === 'book') {
        booked.push(seatId);
        reserved = reserved.filter(id => id !== seatId);
      }

      await redisClient.set(cacheKey, JSON.stringify({ booked, reserved }), 'EX', CACHE_TTL);
      return { booked, reserved };
    } catch (error) {
      console.error('Cache update error:', error);
      // Invalidate cache on error
      await redisClient.del(cacheKey);
    }
  }

  static async invalidateCache(eventId, showtimeId) {
    const cacheKey = generateCacheKey(eventId, showtimeId);
    await redisClient.del(cacheKey);
  }
}

// Optimized socket emitter
class SocketEmitter {
  static emitSeatUpdate(io, eventId, showtimeId, seatId, action, additionalData = {}) {
    if (!io) return;

    const roomName = generateRoomName(eventId, showtimeId);
    const basePayload = {
      eventId,
      showtimeId,
      timestamp: Date.now(),
      ...additionalData
    };

    // Single optimized event with all necessary data
    const payload = {
      ...basePayload,
      seatId,
      action,
      type: 'seat_update'
    };

    io.to(roomName).emit('seat_state_changed', payload);
  }

  static emitZoneUpdate(io, eventId, showtimeId, reason = 'general') {
    if (!io) return;

    const roomName = generateRoomName(eventId, showtimeId);
    io.to(roomName).emit('zone_data_changed', {
      eventId,
      showtimeId,
      reason,
      timestamp: Date.now()
    });
  }

  static emitBatchUpdate(io, updates) {
    if (!io || !updates.length) return;

    // Group updates by room
    const updatesByRoom = updates.reduce((acc, update) => {
      const roomName = generateRoomName(update.eventId, update.showtimeId);
      if (!acc[roomName]) {
        acc[roomName] = [];
      }
      acc[roomName].push(update);
      return acc;
    }, {});

    // Emit batch updates to each room
    Object.entries(updatesByRoom).forEach(([roomName, roomUpdates]) => {
      io.to(roomName).emit('batch_seat_updates', {
        updates: roomUpdates,
        timestamp: Date.now()
      });
    });
  }
}

// Optimized seat locking with Lua script
class SeatLockManager {
  static async acquireLock(eventId, showtimeId, seatId, userId) {
    const seatKey = generateSeatKey(eventId, showtimeId, seatId);
    
    // Lua script for atomic lock acquisition
    const luaLockScript = `
      local current = redis.call('get', KEYS[1])
      if current == false then
        redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
        return 1
      elseif current == ARGV[1] then
        redis.call('expire', KEYS[1], ARGV[2])
        return 1
      else
        return 0
      end
    `;

    try {
      const result = await redisClient.eval(
        luaLockScript,
        1,
        seatKey,
        userId,
        RESERVATION_TIME_SECONDS
      );
      return result === 1;
    } catch (error) {
      console.error('Lock acquisition error:', error);
      return false;
    }
  }

  static async releaseLock(eventId, showtimeId, seatId, userId) {
    const seatKey = generateSeatKey(eventId, showtimeId, seatId);
    
    // Lua script for safe lock release
    const luaUnlockScript = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;

    try {
      await redisClient.eval(luaUnlockScript, 1, seatKey, userId);
    } catch (error) {
      console.error('Lock release error:', error);
    }
  }

  static async releaseMultipleLocks(locks) {
    if (!locks.length) return;

    const pipeline = redisClient.pipeline();
    locks.forEach(({ eventId, showtimeId, seatId, userId }) => {
      const seatKey = generateSeatKey(eventId, showtimeId, seatId);
      pipeline.eval(
        `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
        1,
        seatKey,
        userId
      );
    });

    try {
      await pipeline.exec();
    } catch (error) {
      console.error('Batch lock release error:', error);
    }
  }
}

// Main controller functions
exports.reserveSeats = async (req, res) => {
  const { eventId, showtimeId, seat, action } = req.body;
  const userId = req.user.id;

  if (!eventId || !showtimeId || !seat?.seatId || !seat?.zoneId || !['select', 'deselect'].includes(action)) {
    return res.status(400).json({ 
      message: "Thiếu thông tin hoặc hành động không hợp lệ." 
    });
  }

  const io = getSocketIO();

  try {
    if (action === 'select') {
      // Check if seat is already booked
      const isBooked = await SeatBookingModel.exists({
        eventId, 
        showtimeId, 
        status: 'booked', 
        'seats.seatId': seat.seatId,
      });

      if (isBooked) {
        return res.status(409).json({ 
          message: `Ghế ${seat.seatId} đã được đặt.` 
        });
      }

      // Try to acquire lock
      const lockAcquired = await SeatLockManager.acquireLock(
        eventId, 
        showtimeId, 
        seat.seatId, 
        userId
      );

      if (!lockAcquired) {
        return res.status(409).json({ 
          message: `Ghế ${seat.seatId} đang được giữ bởi người khác.` 
        });
      }

      try {
        const expiresAt = new Date(Date.now() + RESERVATION_TIME_SECONDS * 1000);
        
        // Update booking with upsert
        const result = await SeatBookingModel.updateOne(
          {
            userId, 
            eventId, 
            showtimeId, 
            status: 'reserved',
          },
          {
            $addToSet: { seats: seat },
            $set: { expiresAt },
          },
          { upsert: true }
        );

        // Get updated booking
        const booking = await SeatBookingModel.findOne({
          userId, 
          eventId, 
          showtimeId, 
          status: 'reserved',
        }, { seats: 1 }).lean();

        // Update cache
        await SeatCacheManager.updateSeatStatus(eventId, showtimeId, seat.seatId, 'select');

        // Emit optimized socket event
        SocketEmitter.emitSeatUpdate(io, eventId, showtimeId, seat.seatId, 'selected', {
          bookingId: booking?._id,
          expiresIn: RESERVATION_TIME_SECONDS
        });

        return res.status(200).json({
          message: "Chọn ghế thành công.",
          bookingId: booking?._id,
          expiresIn: RESERVATION_TIME_SECONDS,
          currentSeats: booking?.seats || []
        });

      } catch (error) {
        // Release lock on error
        await SeatLockManager.releaseLock(eventId, showtimeId, seat.seatId, userId);
        throw error;
      }
    }

    if (action === 'deselect') {
      // Get current booking
      const booking = await SeatBookingModel.findOne({
        userId, 
        eventId, 
        showtimeId, 
        status: 'reserved',
      }, { seats: 1 }).lean();

      if (!booking || !booking.seats.some(s => s.seatId === seat.seatId)) {
        return res.status(400).json({ 
          message: "Ghế không tồn tại trong booking." 
        });
      }

      const updatedSeats = booking.seats.filter(s => s.seatId !== seat.seatId);

      // Parallel operations
      const [dbResult] = await Promise.all([
        updatedSeats.length === 0
          ? SeatBookingModel.deleteOne({ _id: booking._id })
          : SeatBookingModel.updateOne(
              { _id: booking._id },
              {
                $set: {
                  seats: updatedSeats,
                  expiresAt: new Date(Date.now() + RESERVATION_TIME_SECONDS * 1000),
                }
              }
            ),
        SeatLockManager.releaseLock(eventId, showtimeId, seat.seatId, userId),
        SeatCacheManager.updateSeatStatus(eventId, showtimeId, seat.seatId, 'deselect')
      ]);

      // Get updated booking if seats remain
      const updatedBooking = updatedSeats.length === 0 ? null : await SeatBookingModel.findOne({
        userId, 
        eventId, 
        showtimeId, 
        status: 'reserved',
      }, { seats: 1 }).lean();

      // Emit optimized socket event
      SocketEmitter.emitSeatUpdate(io, eventId, showtimeId, seat.seatId, 'deselected', {
        available: true
      });

      return res.status(200).json({
        message: "Bỏ chọn ghế thành công.",
        seatId: seat.seatId,
        currentSeats: updatedBooking?.seats || []
      });
    }

  } catch (error) {
    console.error("Lỗi reserveSeats:", error);
    return res.status(500).json({ error: error.message });
  }
};

exports.cancelAllReservedSeats = async (req, res) => {
  const userId = req.user.id;
  if (!userId) {
    return res.status(400).json({ message: "Thiếu userId." });
  }

  try {
    // Get all reserved bookings for user
    const bookings = await SeatBookingModel.find({
      userId, 
      status: 'reserved',
    }).lean();

    if (!bookings.length) {
      return res.status(200).json({ 
        message: "Không có ghế nào đang được giữ." 
      });
    }

    const io = getSocketIO();
    const updates = [];

    // Prepare batch operations
    const locksToRelease = [];
    const cacheKeysToInvalidate = new Set();

    bookings.forEach(booking => {
      const { eventId, showtimeId, seats } = booking;
      cacheKeysToInvalidate.add(generateCacheKey(eventId, showtimeId));
      
      seats.forEach(seat => {
        locksToRelease.push({ eventId, showtimeId, seatId: seat.seatId, userId });
        updates.push({
          eventId,
          showtimeId,
          seatId: seat.seatId,
          action: 'cancelled',
          type: 'seat_update'
        });
      });
    });

    // Execute batch operations
    await Promise.all([
      // Delete all bookings
      SeatBookingModel.deleteMany({ 
        _id: { $in: bookings.map(b => b._id) } 
      }),
      // Release all locks
      SeatLockManager.releaseMultipleLocks(locksToRelease),
      // Invalidate all cache keys
      Promise.all([...cacheKeysToInvalidate].map(key => redisClient.del(key)))
    ]);

    // Emit batch updates
    SocketEmitter.emitBatchUpdate(io, updates);

    return res.status(200).json({ 
      message: "Đã hủy tất cả ghế đang giữ.",
      cancelledCount: bookings.reduce((sum, b) => sum + b.seats.length, 0)
    });

  } catch (error) {
    console.error("Lỗi cancelAllReservedSeats:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Additional optimized functions
exports.getSeatStatus = async (req, res) => {
  const { eventId, showtimeId } = req.query;
  
  if (!eventId || !showtimeId) {
    return res.status(400).json({ message: "Thiếu eventId hoặc showtimeId." });
  }

  try {
    // Try cache first
    let seatStatus = await SeatCacheManager.getSeatStatus(eventId, showtimeId);
    
    if (!seatStatus) {
      // Cache miss - fetch from DB
      const [bookedBookings, reservedBookings] = await Promise.all([
        SeatBookingModel.find({ 
          eventId, 
          showtimeId, 
          status: 'booked' 
        }, { seats: 1 }).lean(),
        SeatBookingModel.find({ 
          eventId, 
          showtimeId, 
          status: 'reserved' 
        }, { seats: 1 }).lean(),
      ]);

      const booked = bookedBookings.flatMap(booking => 
        booking.seats.map(seat => seat.seatId)
      );
      const reserved = reservedBookings.flatMap(booking => 
        booking.seats.map(seat => seat.seatId)
      );

      seatStatus = { booked, reserved };
      
      // Cache the result
      const cacheKey = generateCacheKey(eventId, showtimeId);
      await redisClient.set(cacheKey, JSON.stringify(seatStatus), 'EX', CACHE_TTL);
    }

    return res.status(200).json({
      eventId,
      showtimeId,
      seatStatus,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error("Lỗi getSeatStatus:", error);
    return res.status(500).json({ error: error.message });
  }
};

// Health check for seat locks
exports.cleanupExpiredLocks = async () => {
  try {
    // This would be called by a cron job
    const pattern = 'seatLock:*';
    const keys = await redisClient.keys(pattern);
    
    if (keys.length > 0) {
      const pipeline = redisClient.pipeline();
      keys.forEach(key => {
        pipeline.ttl(key);
      });
      
      const results = await pipeline.exec();
      const expiredKeys = [];
      
      results.forEach((result, index) => {
        if (result[0] === null && result[1] === -1) {
          expiredKeys.push(keys[index]);
        }
      });
      
      if (expiredKeys.length > 0) {
        await redisClient.del(...expiredKeys);
        console.log(`Cleaned up ${expiredKeys.length} expired locks`);
      }
    }
  } catch (error) {
    console.error('Cleanup expired locks error:', error);
  }
};

module.exports = exports;
