const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const categoriesGamesSchema = new schema({
    id: { type: oid },
    name: { type: String, required: true },
});

module.exports = mongoose.models.categoriesGames || mongoose.model("categories_games", categoriesGamesSchema);