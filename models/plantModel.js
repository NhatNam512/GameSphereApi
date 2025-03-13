const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const plants = new schema({
    id: { type: oid },
    name: { type: String},
    type: { type: [String] },
    price: { type: Number },
    quantity: { type: Number },
    size: { type: String },
    source: { type: String },
    images: { type: [String] }
});

module.exports = mongoose.models.plants || mongoose.model("plants", plants);