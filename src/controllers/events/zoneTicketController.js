const eventModel = require("../../models/events/eventModel");
const zoneTicketModel = require("../../models/events/zoneTicketModel");
const zoneBookingModel = require("../../models/events/zoneBookingModel");
const redisClient = require("../../redis/redisClient");
const { getSocketIO } = require("../../../socket/socket"); 

exports.createZoneTicket = async (req, res) => {
  try {
    const { showtimeId, name, totalTicketCount, price } = req.body;
    const userId = req.user.id; 

    if (!showtimeId || !name || totalTicketCount === undefined || price === undefined) {
      return res.status(400).json({ message: "Thiếu thông tin tạo khu vực (showtimeId, name, totalTicketCount, price)." });
    }

    if (totalTicketCount < 0 || price < 0) {
       return res.status(400).json({ message: "Số lượng vé và giá không thể âm." });
    }

    const newZoneTicket = await zoneTicketModel.create({
      showtimeId,
      name,
      totalTicketCount,
      price,
      createdBy: userId,
      updatedBy: userId,
    });

    res.status(201).json({ message: "Tạo khu vực vé thành công.", zoneTicket: newZoneTicket });

  } catch (error) {
    console.error("Lỗi khi tạo khu vực vé:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getZonesTicket = async (req, res) => {
  try {
    const showtimeId = req.params.id;
    if (!showtimeId) {
      return res.status(400).json({ message: "Missing showtimeId in params." });
    }

    const zones = await zoneTicketModel.find({ showtimeId });

    // If no zones found, return an empty array
    if (!zones || zones.length === 0) {
      return res.status(200).json({ message: "Sự kiện chưa có khu vực vé.", zones: [] });
    }

    // Get all bookings (booked and reserved) for this event
    const bookings = await zoneBookingModel.find({
      showtimeId: showtimeId,
      status: { $in: ['booked', 'reserved'] },
      // Optional: Add logic here to filter out expired reserved bookings if not handled by TTL in MongoDB/Redis
    });

    // Calculate booked and reserved quantities for each zone
    const bookingCounts = bookings.reduce((acc, booking) => {
      const zoneId = String(booking.zoneId);
      acc[zoneId] = (acc[zoneId] || 0) + booking.quantity;
      return acc;
    }, {});

    // Combine zone info with available ticket count
    const zonesWithAvailability = zones.map(zone => {
      const bookedAndReservedCount = bookingCounts[String(zone._id)] || 0;
      const availableCount = zone.totalTicketCount - bookedAndReservedCount;
      return {
        ...zone.toObject(),
        availableCount: Math.max(0, availableCount), // Ensure availableCount is not negative
      };
    });

    res.status(200).json({ message: "Lấy thông tin khu vực vé thành công.", zones: zonesWithAvailability });

  } catch (error) {
    console.error("Lỗi khi lấy thông tin khu vực vé:", error);
    res.status(500).json({ error: error.message });
  }
};

// Function to reserve a quantity of tickets for multiple zones
exports.reserveTickets = async (req, res) => {
  try {
    const { showtimeId, zones } = req.body;
    const userId = req.user.id;

    // Basic validation
    if (!showtimeId || !Array.isArray(zones) || zones.length === 0) {
      return res.status(400).json({ message: "Thiếu thông tin giữ vé (showtimeId, zones)." });
    }

    // Prepare to collect errors and successful reservations
    const errors = [];
    const reservations = [];
    const reservationTimeMinutes = 10; // Example reservation time: 10 minutes
    const expiresAt = new Date(Date.now() + reservationTimeMinutes * 60 * 1000);

    for (const { zoneId, quantity } of zones) {
      if (!zoneId || !quantity || quantity <= 0) {
        errors.push({ zoneId, message: "Thiếu thông tin hoặc số lượng không hợp lệ cho zone." });
        continue;
      }
      // Find the zone ticket details
      const zone = await zoneTicketModel.findOne({ _id: zoneId, showtimeId });
      if (!zone) {
        errors.push({ zoneId, message: "Không tìm thấy khu vực vé." });
        continue;
      }
      const bookedAndReservedBookings = await zoneBookingModel.find({
        zoneId,
        showtimeId,
        $or: [
          { status: 'booked' },
          { status: 'reserved', expiresAt: { $gt: new Date() } }
        ]
      });
      const bookedAndReservedCount = bookedAndReservedBookings.reduce((acc, booking) => acc + booking.quantity, 0);
      const availableCount = zone.totalTicketCount - bookedAndReservedCount;
      if (quantity > availableCount) {
        errors.push({ zoneId, message: "Không đủ vé trong khu vực này.", available: availableCount });
        continue;
      }
      // Create a new reserved booking entry
      const newBooking = await zoneBookingModel.create({
        showtimeId,
        zoneId,
        userId,
        quantity,
        status: 'reserved',
        expiresAt,
      });
      await redisClient.set(`zoneReserve:${zoneId}:${userId}`, quantity, 'EX', reservationTimeMinutes * 60);
      reservations.push({ zoneId, bookingId: newBooking._id, expiresIn: reservationTimeMinutes * 60 });
    }

    const io = getSocketIO();
    if (io) {
      for (const r of reservations) {
        io.to(`event_${showtimeId}`).emit('zone_tickets_reserved', { zoneId: r.zoneId, quantity: zones.find(z => z.zoneId === r.zoneId)?.quantity, userId, expiresIn: reservationTimeMinutes * 60 });
      }
      io.to(`event_${showtimeId}`).emit('zone_data_changed', { showtimeId });
    }

    if (reservations.length === 0) {
      return res.status(409).json({ message: "Không thể giữ vé cho bất kỳ khu vực nào.", errors });
    }

    res.status(200).json({ message: "Giữ vé thành công cho các khu vực hợp lệ.", reservations, errors });
  } catch (error) {
    console.error("Lỗi khi giữ vé:", error);
    res.status(500).json({ error: error.message });
  }
};

// Function to book reserved tickets for multiple zones
exports.bookReservedTickets = async (req, res) => {
  try {
    const { bookings } = req.body; // bookings: [{ bookingId }]
    const userId = req.user.id;

    if (!Array.isArray(bookings) || bookings.length === 0) {
      return res.status(400).json({ message: "Thiếu thông tin xác nhận đặt vé (bookings)." });
    }

    const results = [];
    const errors = [];
    const io = getSocketIO();

    for (const { bookingId } of bookings) {
      if (!bookingId) {
        errors.push({ bookingId, message: "Thiếu bookingId." });
        continue;
      }
      // Find the reserved booking
      const booking = await zoneBookingModel.findOne({
        _id: bookingId,
        userId: userId,
        status: 'reserved',
      });
      if (!booking) {
        // Check if the booking exists but is already booked or cancelled
        const existingBooking = await zoneBookingModel.findById(bookingId);
        if (existingBooking) {
          if (existingBooking.status === 'booked') {
            errors.push({ bookingId, message: "Đặt vé này đã được xác nhận trước đó." });
            continue;
          } else if (existingBooking.status === 'cancelled') {
            errors.push({ bookingId, message: "Đặt vé này đã bị hủy." });
            continue;
          }
        }
        errors.push({ bookingId, message: "Không tìm thấy thông tin giữ vé tạm thời hoặc đã hết hạn." });
        continue;
      }
      // Update booking status to booked
      booking.status = 'booked';
      await booking.save();
      const redisKey = `zoneReserve:${booking.zoneId}:${userId}`;
      await redisClient.del(redisKey);
      if (io) {
        io.to(`event_${booking.showtimeId}`).emit('zone_tickets_booked', { zoneId: booking.zoneId, quantity: booking.quantity, userId: booking.userId });
        io.to(`event_${booking.showtimeId}`).emit('zone_data_changed', { showtimeId: booking.showtimeId });
      }
      results.push({ bookingId: booking._id, zoneId: booking.zoneId });
    }

    if (results.length === 0) {
      return res.status(409).json({ message: "Không thể xác nhận đặt vé cho bất kỳ booking nào.", errors });
    }

    res.status(200).json({ message: "Đặt vé thành công cho các booking hợp lệ.", results, errors });
  } catch (error) {
    console.error("Lỗi khi xác nhận đặt vé:", error);
    res.status(500).json({ error: error.message });
  }
};
