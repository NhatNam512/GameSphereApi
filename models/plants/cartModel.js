const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const carts = new schema({
    userId: { type: oid, ref: "users", required: true },
    products: [
      {
        productId: { type: oid, ref: "plants", required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true }, 
      },
    ],
    status: {type: Number, default: 0},
    updatedAt: { type: Date, default: Date.now },
  });
module.exports = mongoose.models.carts || mongoose.model("carts", carts);