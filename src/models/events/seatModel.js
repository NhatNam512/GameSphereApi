const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const SeatBookingSchema = new schema(
  {
    eventId: { type: oid, required: true },
    userId: { type: oid, ref: 'users', required: true },
    seats: [
      {
        seatId: { type: String, required: true },
        type: { type: String, enum: ['normal', 'vip'], required: true },
      }
    ],
    totalPrice: { type: Number},
    status: {
      type: String,
      enum: ['booked', 'cancelled', 'reserved'],
      default: 'booked',
    },
    reservedAt: {
      type: Date,
      default: () => new Date(),
    },
    expireAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000), 
    },
  },
  { timestamps: true }
);

SeatBookingSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SeatBooking', SeatBookingSchema);