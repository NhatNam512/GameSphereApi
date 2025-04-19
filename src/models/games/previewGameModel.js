const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const reviewGameSchema = new schema({
    gameId: {type: oid, ref: "games"},
    userId: {type: oid, ref: "users"},
    comment: { type: String, default: "" }, // Nội dung bình luận
    rating: { type: Number, min: 1, max: 5, required: true },
    image: {type: String},
}, { timestamps: true });

module.exports = mongoose.models.reviewGameSchema || mongoose.model("preview_game", reviewGameSchema);
