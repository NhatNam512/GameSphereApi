const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;
const user = new schema({
    id:{type:oid},
    email:{type:String},
    password:{type:String},
    username:{type:String},
    follower:{typep:Number},
    picUrl:{type:String},
    createAt:{type: Date, default: Date.now()},
    updateAt:{type: Date, default: Date.now()},
    role: {type: Number},
    notification: {type: []},
    longitude: { type: Number },
    latitude: { type: Number },
    ticketsHave: {type: [oid], ref: "tickets"}
});
module.exports = mongoose.model.user || mongoose.model("user", user);