const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const gameSchema = new schema({
    id: { type: oid },
    name: { type: String, required: true },
    description: { type: String },
    developer: { type: String },
    size: { type: Number },
    avatar: {type: String},
    video: {type: String},
    background: {type: String},
    screenshot: { type: [String] }, // Better to enforce an array of strings (URLs)
    categories: { type: [oid], ref: "categories_games" }, // Defining categories as an array of strings
    timeReleases: { type: Number },
    upComing: { type: Boolean },
    urlDownload: { type: String },
    preview: { type: oid, ref: "preview_game" },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
}, { timestamps: true });

module.exports = mongoose.models.game || mongoose.model("games", gameSchema);
