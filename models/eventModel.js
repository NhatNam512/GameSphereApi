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
    status: { type: String },
    rating: { type: Number },
    longitude: { type: Number },
    latitude: { type: Number },
});

module.exports = mongoose.models.events || mongoose.model("events", events);
