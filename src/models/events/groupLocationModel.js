const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const groupLocationSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: 'group', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'users', required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  updatedAt: { type: Date, default: Date.now },
});

// Index để hỗ trợ truy vấn geospatial
groupLocationSchema.index({ location: '2dsphere' });

// Index để đảm bảo một user chỉ có 1 vị trí trong 1 group
groupLocationSchema.index({ groupId: 1, userId: 1 }, { unique: true });

module.exports =
  mongoose.models.groupLocation || mongoose.model('groupLocation', groupLocationSchema);
