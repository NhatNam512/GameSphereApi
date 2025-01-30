const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const categories = new schema({
    id: { type: oid },
    name: { type: String, required: true },
    image: { type: String }
});

module.exports = mongoose.models.categories || mongoose.model("categories", categories);