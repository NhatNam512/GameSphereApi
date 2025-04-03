const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const orderSchema = new schema({
    id: {type: oid},
    plantId: {type: [oid], ref: "plants"},
    userId: {type: oid, ref: "users"},
    amount: {type: Number},
    status: {type: Number, default: 0},
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.orderSchema || mongoose.model("order_plant", orderSchema);
