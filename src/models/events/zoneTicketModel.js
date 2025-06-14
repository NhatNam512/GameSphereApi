const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const zoneTicketSchema = new schema({
  showtimeId: {
    type: oid,
    ref: 'showtimes',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  eventId: {type: oid, ref: 'events'},
  totalTicketCount: {
    type: Number,
    required: true,
    min: 0,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  // Optional: Add fields for tracking created/updated by user
  createdBy: {
    type: oid,
    ref: 'users',
  },
  updatedBy: {
    type: oid,
    ref: 'users',
  },
}, { timestamps: true }); // Adds createdAt and updatedAt timestamps

const ZoneTicket = mongoose.model('zonetickets', zoneTicketSchema);

module.exports = ZoneTicket; 