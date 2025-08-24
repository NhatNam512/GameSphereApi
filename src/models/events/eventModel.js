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

    tags: { type: [oid], ref: 'tags', index: true },

    status: { type: String },
    approvalStatus: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'postponed'], 
        default: 'pending' 
    },
    approvalReason: { 
        type: String, 
        default: '' 
    },
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

    typeBase: {type: String, enum: ['seat', 'zone', 'none'], require: true},

    userId: { type: oid, ref: "users" },

    zone: { type: oid, ref: 'zones' },
    
    embedding: { type: [Number] },
    
    isPreview: { type: Boolean, default: false },

    isPayment: { type: Boolean, default: false }
}, {
    timestamps: true // Thêm createdAt và updatedAt tự động
});

events.index({ timeStart: 1 });
events.index({ categories: 1 });
events.index({ userId: 1 });
events.index({ status: 1 });
events.index({ approvalStatus: 1 });
events.index({ name: 1 });
events.index({ description: 1 });
events.index({ tags: 1 });
events.index({ embedding: '2dsphere' }); 

module.exports = mongoose.models.events || mongoose.model("events", events);
