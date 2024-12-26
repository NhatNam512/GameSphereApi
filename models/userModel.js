const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;
const user = new schema({
    id:{type:oid},
    email:{type:String},
    password:{type:String},
    username:{type:String},
    follower:{typep:Number},
    createAt:{type: Date, default: Date.now()},
    updateAt:{type: Date, default: Date.now()}
});
module.exports = mongoose.model.user || mongoose.model("user", user);