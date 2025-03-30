const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;
const users = new schema({
    id:{type:oid},
    email:{type:String},
    password:{type:String},
    username:{type:String},
    follower:{type:Number},
    picUrl:{type:String},
    createAt:{type: Date, default: Date.now()},
    updateAt:{type: Date, default: Date.now()},
    role: {type: Number},
    notification: {type: []},
    longitude: { type: Number },
    latitude: { type: Number },
    ticketsHave: {type: [oid], ref: "tickets"},
    phoneNumber: {type: String},
    address: {type: String},
});
module.exports = mongoose.model.users || mongoose.model("users", users);