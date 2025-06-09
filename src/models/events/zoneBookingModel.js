const mongoose = require('mongoose');
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const zoneBookingSchema = new mongoose.Schema({
  eventId: {
    type: oid,
    ref: 'events',
  },
  showtimeId: {
    type: oid,
    ref: 'showtimes'
  },
  zoneId: {
    type: oid,
    ref: 'zonetickets', // Reference to the ZoneTicket model
    required: true,
  },
  userId: {
    type: oid,
    ref: 'users',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    enum: ['reserved', 'booked', 'cancelled'],
    required: true,
  },
}, { timestamps: true });
zoneBookingSchema.index({ zoneId: 1, status: 1, expiresAt: 1 });
zoneBookingSchema.index({ userId: 1, zoneId: 1, status: 1 }); // dùng để kiểm tra đã giữ vé chưa
zoneBookingSchema.index({ eventId: 1 });
const ZoneBooking = mongoose.model('ZoneBooking', zoneBookingSchema);

module.exports = ZoneBooking; 