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
    images: { type: [String] }, // Better to enforce an array of strings (URLs)
    banner: { type: String },
    categories: { type: oid, ref: "categories" }, // Defining categories as an array of strings
    location: { type: String },
    ticketPrice: { type: Number },
    ticketQuantity: { type: Number },
    status: { type: String },
    rating: { type: Number }
});

module.exports = mongoose.models.events || mongoose.model("events", events);
