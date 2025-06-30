const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const groupLocationSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: 'group', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'users', required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now }
});

groupLocationSchema.index({ groupId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.groupLocation || mongoose.model('groupLocation', groupLocationSchema); 