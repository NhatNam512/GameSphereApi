const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const plantCategories = new schema({
    id: { type: oid },
    name: { type: String, required: true },
});

module.exports = mongoose.models.plantCategories || mongoose.model("plantCategories", plantCategories);