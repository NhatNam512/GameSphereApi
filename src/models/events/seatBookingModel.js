const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const SeatBookingSchema = new schema(
  {
    eventId: { type: oid, ref: 'events', required: true },
    showtimeId: { type: oid, ref: 'showtimes', required: true },
    userId: { type: oid, ref: 'users', required: true },
    seats: [
      {
        seatId: { type: String, required: true },
        zoneId: { type: oid, ref: 'zones' },
      }
    ],
    totalPrice: { type: Number},
    status: {
      type: String,
      enum: ['pending', 'reserved', 'booked', 'cancelled', 'expired'],
      default: 'pending',
      required: true,
    },
    reservedAt: {
      type: Date,
      default: () => new Date(),
    },
    orderId: {
      type: oid,
      ref: 'orders',
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

SeatBookingSchema.index({ eventId: 1, userId: 1, status: 1 });

module.exports = mongoose.model('seatbookings', SeatBookingSchema);