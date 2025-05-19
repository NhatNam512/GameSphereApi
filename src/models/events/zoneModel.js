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
      totalPrice: { type: Number, required: true },
      status: { type: String, enum: ['booked', 'cancelled'], default: 'booked' },
    },
    { timestamps: true }
  );
  
  module.exports = mongoose.model('SeatBooking', SeatBookingSchema);