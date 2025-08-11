const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;
const ticket = new schema({
    id: {type: oid},
    ticketId: { type: String, unique: true },
    userId: {type: oid, ref: "users"},
    eventId: {type: oid, ref: "events"},
    orderId: {type: oid, ref: "order"},
    qrCode: {type: String},
    ticketNumber: { type: Number },
    price: {type: Number},
    showtimeId: {type: oid, ref: "showtimes"},
    seat: {
        seatId: { type: String },
        label: {string: String}
    },
    zone: {
        zoneId: { type: oid, ref: 'zonetickets' },
        zoneName: { type: String }
    },
    createdAt: { type: Date, default: Date.now }, 
    status: { type: String, enum: ["issued", "used"], default: "issued" },
    issuedAt: { type: Date, default: Date.now },
    // Gift fields
    recipientUserId: { type: oid, ref: "users" },
    isGift: { type: Boolean, default: false },
    giftMessage: { type: String, maxlength: 500 },
});
module.exports = mongoose.model.ticket || mongoose.model("tickets", ticket);