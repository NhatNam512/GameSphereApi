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
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.interactionSchema || mongoose.model("interactions", interactionSchema);
