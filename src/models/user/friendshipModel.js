// models/friendship.model.js
const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  createdAt: { type: Date, default: Date.now },
}, {
  versionKey: false
});

// Đảm bảo không trùng lặp cặp bạn bè
friendshipSchema.index({ user1: 1, user2: 1 }, { unique: true });
// Tối ưu truy vấn
friendshipSchema.index({ user1: 1 });
friendshipSchema.index({ user2: 1 });

module.exports = mongoose.models.friendships || mongoose.model('friendships', friendshipSchema);
