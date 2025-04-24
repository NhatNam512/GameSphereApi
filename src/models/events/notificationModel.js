const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const notificationSchema = new schema({
    user: { type: oid, ref: "users",require: true },
    title: {type: String},
    body: {type: String},
    data: {
        type: {type: String},
        referenceId: {type: oid}
    },
    isRead: {type: Boolean, default: false},
    createdAt: {
        type: Date,
        default: Date.now
      },
    type: {type: Number}
});

module.exports = mongoose.models.notifications || mongoose.model("notifications", notificationSchema);
