const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const inviteEmailSchema = new Schema({
  email: { type: String, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'users' },
  invitedAt: { type: Date, default: Date.now }
}, { _id: false });

const groupSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: 'events', required: true },
  showtimeId: { type: Schema.Types.ObjectId, ref: 'showtimes' },
  groupName: { type: String, required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'users', required: true },
  memberIds: [{ type: Schema.Types.ObjectId, ref: 'users' }],
  inviteEmails: [inviteEmailSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.group || mongoose.model('group', groupSchema); 