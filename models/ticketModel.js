const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;
const ticket = new schema({
    id: {type: oid},
    userId: {type: oid, ref: "users"},
    eventId: {type: oid, ref: "events"},
    orderId: {type: oid, ref: "order"},
    qrCode: {type: String},
    ticketNumber: { type: Number },
    ticketType: {type: String},
    price: {type: Number},
    createdAt: { type: Date, default: Date.now }, 
    status: { type: String, enum: ["issued", "used"], default: "issued" },
    issuedAt: { type: Date, default: Date.now },
});
module.exports = mongoose.model.ticket || mongoose.model("tickets", ticket);