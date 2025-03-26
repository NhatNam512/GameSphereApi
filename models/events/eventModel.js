const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const events = new schema({
    id: { type: oid },
    name: { type: String, required: true },
    description: { type: String },
    timeStart: { type: Number },
    timeEnd:{ type: Number },
    avatar: { type: String },
    images: { type: [String] }, 
    banner: { type: String },
    categories: { type: oid, ref: "categories" },
    ticketPrice: { type: Number },
    ticketQuantity: { type: Number },
    soldTickets: { type: Number, default: 0 }, // Số vé đã bán 
    status: { type: String },
    rating: { type: Number },
    longitude: { type: Number },
    latitude: { type: Number },
    location: {type: String},
    userId: {type: String, ref: "users"},
});

module.exports = mongoose.models.events || mongoose.model("events", events);
