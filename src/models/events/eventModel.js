const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const events = new schema({
    id: { type: oid },
    name: { type: String, required: true },
    description: { type: String },
    timeStart: { type: Number },
    timeEnd: { type: Number },
    avatar: { type: String },
    images: { type: [String] },
    banner: { type: String },

    categories: { type: oid, ref: "categories" },
    tags: { type: [String], index: true },

    ticketPrice: { type: Number },
    ticketQuantity: { type: Number },
    soldTickets: { type: Number, default: 0 }, 

    status: { type: String },
    rating: { type: Number },
    
    longitude: { type: Number },
    latitude: { type: Number },
    location: { type: String },
    location_map: {
        type: { 
            type: String, 
            enum: ['Point'], 
            default: 'Point' 
        },
        coordinates: { 
            type: [Number], 
            index: '2dsphere' 
        }, // [lng, lat]
    },
    userId: { type: oid, ref: "users" },

    hasSeats: { type: Boolean, default: false },
    
    embedding: { type: [Number] }
});

events.index({ timeStart: 1 });
events.index({ categories: 1 });
events.index({ userId: 1 });
events.index({ status: 1 });
events.index({ name: 1 });
events.index({ description: 1 });

module.exports = mongoose.models.events || mongoose.model("events", events);
