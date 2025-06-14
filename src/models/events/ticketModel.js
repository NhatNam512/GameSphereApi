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
    seat: {
        seatId: { type: String },
        type: {string: String}
    },
    zone: {
        zoneId: { type: oid, ref: 'zonetickets' },
        zoneName: { type: String }
    },
    createdAt: { type: Date, default: Date.now }, 
    status: { type: String, enum: ["issued", "used"], default: "issued" },
    issuedAt: { type: Date, default: Date.now },
});
module.exports = mongoose.model.ticket || mongoose.model("tickets", ticket);