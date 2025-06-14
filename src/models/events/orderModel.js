const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;
const order = new schema({
    id: {type: oid},
    eventId: {type: oid, ref: "events"},
    userId: {type: oid, ref: "users"},
    amount: {type: Number},
    totalPrice: {type: Number},
    status: {type: String, enum: ["pending", "paid", "failed"], default: "pending"},
    seats: [{
        seatId: { type: String,},
        zoneId: { type: oid, ref: 'zones' }
    }],
    zoneId: {type: oid, ref: "zonetickets"},
    bookingId: {type: oid, ref: "seatbookings"},
    bookingType: {type: String, enum: ["seat", "zone", "none"], default: "none"},
    createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose.models.order || mongoose.model("order", order);