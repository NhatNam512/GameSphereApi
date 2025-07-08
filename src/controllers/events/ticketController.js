const ZoneTicket = require('../../models/events/zoneTicketModel');
const SeatBooking = require('../../models/events/seatBookingModel');
const ZoneBooking = require('../../models/events/zoneBookingModel');

exports.getAllTicketsByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    // Lấy tất cả zone ticket của sự kiện
    const zoneTickets = await ZoneTicket.find({ eventId });

    // Đếm số lượng đã bán cho từng zone ticket
    const zones = await Promise.all(zoneTickets.map(async (zone) => {
      // Đếm số ghế đã đặt (seat booking) cho zone này
      const seatBookings = await SeatBooking.aggregate([
        { $match: { eventId: zone.eventId, status: 'booked', 'seats.zoneId': zone._id } },
        { $unwind: '$seats' },
        { $match: { 'seats.zoneId': zone._id } },
        { $count: 'soldSeats' }
      ]);
      const soldSeats = seatBookings[0]?.soldSeats || 0;

      // Đếm số lượng zone đã đặt (zone booking) cho zone này
      const zoneBookings = await ZoneBooking.aggregate([
        { $match: { eventId: zone.eventId, zoneId: zone._id, status: 'booked' } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]);
      const soldZones = zoneBookings[0]?.total || 0;

      return {
        zoneId: zone._id,
        name: zone.name,
        price: zone.price,
        total: zone.totalTicketCount,
        sold: soldSeats + soldZones
      };
    }));

    // Lấy danh sách ghế đã bán
    const seatBookings = await SeatBooking.find({ eventId, status: 'booked' });
    const soldSeats = seatBookings.flatMap(booking =>
      booking.seats.map(seat => ({
        seatId: seat.seatId,
        zoneId: seat.zoneId,
        userId: booking.userId,
        bookingId: booking._id
      }))
    );

    res.json({ status: true, data: { zones, soldSeats } });
  } catch (e) {
    res.status(500).json({ status: false, message: 'Lỗi hệ thống.' });
  }
}; 