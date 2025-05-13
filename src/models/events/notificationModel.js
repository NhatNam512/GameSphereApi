const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const notificationSchema = new schema({
    user: { type: oid, ref: "users",required: true },
    title: {type: String},
    body: {type: String},
    data: {
        avatar: { type: String }, // URL ảnh đại diện người mời
        eventName: { type: String },
        eventId: { type: oid, ref: "events" },
    },
    isRead: {type: Boolean, default: false},
    createdAt: {
        type: Date,
        default: Date.now
      },
    type: {type: String},
    uniqueHash: { type: String, index: true }
});

module.exports = mongoose.models.notifications || mongoose.model("notifications", notificationSchema);
