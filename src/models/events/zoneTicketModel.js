const mongoose = require('mongoose');

const zoneTicketSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'events',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
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
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
  },
}, { timestamps: true }); // Adds createdAt and updatedAt timestamps

const ZoneTicket = mongoose.model('zonetickets', zoneTicketSchema);

module.exports = ZoneTicket; 