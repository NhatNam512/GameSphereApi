const Group = require('../../models/events/groupModel');
const GroupLocation = require('../../models/events/groupLocationModel');
const userModel = require('../../models/userModel');
const notificationService = require('../../services/notificationService');

exports.createGroup = async (req, res) => {
  try {
    const { eventId, groupName, ownerId, memberIds = [] } = req.body;
    if (!eventId || !groupName || !ownerId) {
      return res.status(400).json({ message: 'Thiếu thông tin tạo group.' });
    }
    const group = await Group.create({ eventId, groupName, ownerId, memberIds: [ownerId, ...memberIds] });
    // Gửi notification cho các memberIds (trừ owner)
    if (memberIds.length && notificationService?.sendGroupInvite) {
      for (const memberId of memberIds) {
        await notificationService.sendGroupInvite(memberId, group._id, groupName, eventId);
      }
    }
    res.status(201).json({ groupId: group._id, ...group.toObject() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.inviteMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Thiếu email.' });
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group.' });
    // Kiểm tra trùng lặp
    if (group.inviteEmails.some(inv => inv.email === email)) {
      return res.status(400).json({ message: 'Email đã được mời.' });
    }
    group.inviteEmails.push({ email, invitedBy: req.user?._id });
    await group.save();
    // Nếu user đã đăng ký, gửi notification
    const user = await userModel.findOne({ email });
    if (user && notificationService?.sendGroupInvite) {
      await notificationService.sendGroupInvite(user._id, groupId, group.groupName, group.eventId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getInvites = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group.' });
    res.json(group.inviteEmails);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.acceptInvite = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group.' });
    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user.' });
    // Tìm invite
    const invite = group.inviteEmails.find(inv => inv.email === user.email);
    if (!invite) return res.status(400).json({ message: 'Không tìm thấy lời mời.' });
    invite.status = 'accepted';
    if (!group.memberIds.includes(userId)) group.memberIds.push(userId);
    await group.save();
    // Gửi notification cho owner và các thành viên khác
    if (notificationService?.sendGroupAccept) {
      await notificationService.sendGroupAccept(group.ownerId, userId, group._id, group.groupName);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate('memberIds', 'id name email location');
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group.' });
    res.json(group.memberIds);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, latitude, longitude } = req.body;
    if (!userId || latitude == null || longitude == null) {
      return res.status(400).json({ message: 'Thiếu thông tin vị trí.' });
    }
    await GroupLocation.findOneAndUpdate(
      { groupId, userId },
      { latitude, longitude, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    // TODO: Emit socket event location:update nếu có socket
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getLocations = async (req, res) => {
  try {
    const { groupId } = req.params;
    const locations = await GroupLocation.find({ groupId });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}; 