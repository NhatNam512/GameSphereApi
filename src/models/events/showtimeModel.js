const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const showtime = new schema({
    eventId: { type: oid, ref: "events", required: true },
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    ticketPrice: { type: Number },
    ticketQuantity: { type: Number },
    soldTickets: { type: Number, default: 0 }, 
});

showtime.index({ eventId: 1 });
showtime.index({ startTime: 1 });

module.exports = mongoose.models.showtimes || mongoose.model("showtimes", showtime);