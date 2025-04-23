const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const interactionSchema = schema({
    userId: { type: String, required: true },
    eventId: { type: String, required: true },
    type: {
        type: String,
        enum: ['view', 'like', 'join', 'rate', 'share'],
        required: true
    },
    value: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
    date: { type: String, required: true }
});
// Index để truy vấn nhanh
interactionSchema.index({ userId: 1 });
interactionSchema.index({ eventId: 1 });
interactionSchema.index({ userId: 1, eventId: 1 });
interactionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
module.exports = mongoose.models.interactionSchema || mongoose.model("interactions", interactionSchema);
