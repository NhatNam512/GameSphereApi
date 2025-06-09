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

// Function to reserve a quantity of tickets for a zone
exports.reserveTickets = async (req, res) => {
  try {
    const { showtimeId, zoneId, quantity } = req.body;
    const userId = req.user.id;

    // Basic validation
    if (!showtimeId || !zoneId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Thiếu thông tin giữ vé (showtimeId, zoneId, quantity > 0)." });
    }

    // Find the zone ticket details
    const zone = await zoneTicketModel.findOne({ _id: zoneId, showtimeId });
    if (!zone) {
      return res.status(404).json({ message: "Không tìm thấy khu vực vé." });
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

    // Calculate available tickets
    const availableCount = zone.totalTicketCount - bookedAndReservedCount;

    // Check if enough tickets are available
    if (quantity > availableCount) {
      return res.status(409).json({ message: "Không đủ vé trong khu vực này.", available: availableCount });
    }

    // Create a new reserved booking entry
    const reservationTimeMinutes = 10; // Example reservation time: 10 minutes
    const expiresAt = new Date(Date.now() + reservationTimeMinutes * 60 * 1000);

    const newBooking = await zoneBookingModel.create({
      showtimeId,
      zoneId,
      userId,
      quantity,
      status: 'reserved',
      expiresAt,
    });

    await redisClient.set(`zoneReserve:${zoneId}:${userId}`, quantity, 'EX', reservationTimeMinutes * 60);

    const io = getSocketIO(); 
    io.to(`event_${showtimeId}`).emit('zone_tickets_reserved', { zoneId, quantity, userId, expiresIn: reservationTimeMinutes * 60 });

    res.status(200).json({ message: "Giữ vé thành công.", bookingId: newBooking._id, expiresIn: reservationTimeMinutes * 60 });

  } catch (error) {
    console.error("Lỗi khi giữ vé:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.bookReservedTickets = async (req, res) => {
  try {
    const { bookingId, bookingDetails } = req.body; // Assuming bookingId is passed to identify the reservation
    const userId = req.user.id; // Assuming user info is available

    // Basic validation
    if (!bookingId) {
      return res.status(400).json({ message: "Thiếu thông tin xác nhận đặt vé (bookingId)." });
    }

    // Find the reserved booking
    const booking = await zoneBookingModel.findOne({
      _id: bookingId,
      userId: userId, // Ensure the booking belongs to the requesting user
      status: 'reserved',
    });

    if (!booking) {
      // Check if the booking exists but is already booked or cancelled
      const existingBooking = await zoneBookingModel.findById(bookingId);
      if (existingBooking) {
        if (existingBooking.status === 'booked') {
          return res.status(409).json({ message: "Đặt vé này đã được xác nhận trước đó." });
        } else if (existingBooking.status === 'cancelled') {
           return res.status(409).json({ message: "Đặt vé này đã bị hủy." });
        }
      }
      return res.status(404).json({ message: "Không tìm thấy thông tin giữ vé tạm thời hoặc đã hết hạn." });
    }

    // Update booking status to booked
    booking.status = 'booked';

    await booking.save();

    const redisKey = `zoneReserve:${booking.zoneId}:${userId}`; 
    await redisClient.del(redisKey);

    const io = getSocketIO();
    if(io) {
        io.to(`event_${booking.showtimeId}`).emit('zone_tickets_booked', { zoneId: booking.zoneId, quantity: booking.quantity, userId: booking.userId });
    }

    res.status(200).json({ message: "Đặt vé thành công.", bookingId: booking._id });

  } catch (error) {
    console.error("Lỗi khi xác nhận đặt vé:", error);
    res.status(500).json({ error: error.message });
  }
};
