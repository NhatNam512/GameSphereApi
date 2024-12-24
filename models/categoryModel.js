const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;
const category = new schema({
    id:{type:oid},
    title:{type:String}
});
module.exports = mongoose.model.category || mongoose.model("category", category);