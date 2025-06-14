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
    expireAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000), 
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
SeatBookingSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('seatbookings', SeatBookingSchema);