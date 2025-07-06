const Group = require('../../models/events/groupModel');
const GroupLocation = require('../../models/events/groupLocationModel');
const userModel = require('../../models/userModel');
const notificationService = require('../../services/notificationService');
const { getSocketIO } = require('../../../socket/socket');

exports.createGroup = async (req, res) => {
  try {
    const { eventId, groupName, ownerId, memberIds = [] } = req.body;
    if (!eventId || !groupName || !ownerId) {
      return res.status(400).json({ message: 'Thiếu thông tin tạo group.' });
    }
    const group = await Group.create({ eventId, groupName, ownerId, memberIds: [ownerId, ...memberIds] });
    if (memberIds.length && notificationService?.sendGroupInviteNotification) {
      const owner = await userModel.findById(ownerId);
      for (const memberId of memberIds) {
        if (memberId.toString() === ownerId.toString()) continue;
        const user = await userModel.findById(memberId);
        if (user) {
          await notificationService.sendGroupInviteNotification(user, group, owner);
        }
      }
    }
    res.status(201).json(group.toObject());
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
    if (group.inviteEmails.some(inv => inv.email === email)) {
      return res.status(400).json({ message: 'Email đã được mời.' });
    }
    const inviteObj = { email, invitedBy: req.user?._id };
    group.inviteEmails.push(inviteObj);
    await group.save();
    const user = await userModel.findOne({ email });
    if (user && notificationService?.sendGroupInviteNotification) {
      const owner = await userModel.findById(group.ownerId);
      await notificationService.sendGroupInviteNotification(user, group, owner);
    }
    res.json({ success: true, invite: { ...inviteObj, status: 'pending' } });
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
    const invite = group.inviteEmails.find(inv => inv.email === user.email);
    if (!invite) return res.status(400).json({ message: 'Không tìm thấy lời mời.' });
    invite.status = 'accepted';
    if (!group.memberIds.includes(userId)) group.memberIds.push(userId);
    await group.save();
    if (notificationService?.sendGroupAccept) {
      await notificationService.sendGroupAccept(group.ownerId, userId, group._id, group.groupName);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.declineInvite = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group.' });
    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user.' });
    const invite = group.inviteEmails.find(inv => inv.email === user.email);
    if (!invite) return res.status(400).json({ message: 'Không tìm thấy lời mời.' });
    invite.status = 'declined';
    await group.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group.' });
    group.memberIds = group.memberIds.filter(id => id.toString() !== userId);
    await group.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    await Group.findByIdAndDelete(groupId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getGroupsByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const groups = await Group.find({ eventId });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getGroupsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const groups = await Group.find({ memberIds: userId });
    res.json(groups);
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
    const location = await GroupLocation.findOneAndUpdate(
      { groupId, userId },
      {
        latitude,
        longitude,
        location: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    const io = getSocketIO && getSocketIO();
    if (io) {
      io.to(`group_${groupId}`).emit('location:update', { groupId, userId, latitude, longitude, updatedAt: location.updatedAt });
    }
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

exports.searchUserByEmailOrPhone = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ status: false, message: 'Thiếu từ khóa tìm kiếm.' });

    let query = {};
    if (q.includes('@')) {
      query.email = q.trim().toLowerCase();
    } else {
      query.phone = q.trim();
    }

    const users = await userModel.find(query).select('_id username email phone picUrl');
    if (users.length === 0) {
      return res.status(404).json({ status: false, message: 'Không tìm thấy người dùng.' });
    }
    res.json({ status: true, data: users });
  } catch (e) {
    res.status(500).json({ status: false, message: 'Lỗi hệ thống.' });
  }
};

exports.getGroupInvitesForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await userModel.findById(userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user.' });
    const groups = await Group.find({
      inviteEmails: {
        $elemMatch: { email: user.email, status: 'pending' }
      }
    }).populate('ownerId', 'username email');
    const result = groups.map(group => {
      const invite = group.inviteEmails.find(inv => inv.email === user.email && inv.status === 'pending');
      return {
        groupId: group._id,
        groupName: group.groupName,
        eventId: group.eventId,
        invitedBy: invite?.invitedBy,
        owner: group.ownerId,
        invitedAt: invite?.invitedAt,
        status: invite?.status
      };
    });
    res.json({ success: true, invites: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
