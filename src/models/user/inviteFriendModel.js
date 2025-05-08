// models/friendship.model.js
const mongoose = require('mongoose');
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const inviteFriendSchema = new mongoose.Schema({
  eventId: { type: oid, ref: "events"},
  inviterId: { type: oid, ref: "users"},
  inviteeId: { type: oid, ref: "users"},
  status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.friendships || mongoose.model('friendships', friendshipSchema);
