const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const users = new schema({
    email: { type: String, required: true },
    password: { type: String },
    username: { type: String },
    follower: { type: Number, default: 0 },
    picUrl: { type: String },
    tags: { type: [oid], ref: 'tags',default: [] },
    role: { type: Number },
    longitude: { type: Number },
    latitude: { type: Number },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            index: '2dsphere'
        }
    },
    ticketsHave: [{ type: schema.Types.ObjectId, ref: "tickets" }],
    phoneNumber: { type: String },
    address: { type: String },
    fcmTokens: { type: String },
    refreshToken: { type: String },
    gender: {type: String},
    date: {type: Number},
}, {
    timestamps: {
        createdAt: 'createAt',
        updatedAt: 'updateAt'
    }
});

// Indexes
users.index({ username: 1 });
users.index({ email: 1 });
users.index({ fcmTokens: 1 });

module.exports = mongoose.model.users || mongoose.model("users", users);
