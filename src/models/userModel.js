const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;
const users = new schema({
    id: { type: oid },
    email: { type: String },
    password: { type: String },
    username: { type: String },
    follower: { type: Number },
    picUrl: { type: String },
    createAt: { type: Date, default: Date.now() },
    updateAt: { type: Date, default: Date.now() },
    tags: { type: [String] },
    role: { type: Number },
    longitude: { type: Number },
    latitude: { type: Number },
    location: {             // Geo location
        type: { type: String, default: 'Point' },
        coordinates: [Number] // [lng, lat]
    },
    ticketsHave: { type: [oid], ref: "tickets" },
    phoneNumber: { type: String },
    address: { type: String },
    fcmTokens: { type: [] },
    refreshToken: { type: String },
});
users.index({username: 1});
users.index({email: 1});
module.exports = mongoose.model.users || mongoose.model("users", users);