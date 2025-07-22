const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const reviewEventSchema = new schema({
    eventId: {type: oid, ref: "games"},
    userId: {type: oid, ref: "users"},
    comment: { type: String, default: "" }, // Nội dung bình luận
    rating: { type: Number, min: 1, max: 5, required: true },
    image: {type: [String]},
    status: {type: Number}
}, { timestamps: true });

module.exports = mongoose.models.reviewEventSchema || mongoose.model("preview_event", reviewEventSchema);
