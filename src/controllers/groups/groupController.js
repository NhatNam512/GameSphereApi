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
    // Populate eventId để lấy thông tin sự kiện
    const group = await Group.findById(groupId).populate('eventId', 'name avatar banner timeStart timeEnd');
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
    // Lấy thông tin sự kiện trả về
    const eventInfo = group.eventId ? {
      id: group.eventId._id,
      name: group.eventId.name,
      avatar: group.eventId.avatar,
      banner: group.eventId.banner,
      timeStart: group.eventId.timeStart,
      timeEnd: group.eventId.timeEnd
    } : null;
    res.json({ success: true, invite: { ...inviteObj, status: 'pending' }, event: eventInfo });
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
    const userId = req.user?.id || req.body.userId; // Ưu tiên dùng req.user nếu có xác thực

    if (!userId) return res.status(400).json({ message: 'Thiếu userId.' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group.' });

    // Nếu không phải thành viên
    if (!group.memberIds.includes(userId)) {
      return res.status(400).json({ message: 'Bạn không phải thành viên nhóm này.' });
    }

    // Nếu cần: kiểm tra nếu user là admin và là người duy nhất
    if (group.ownerId?.toString() === userId) {
      return res.status(403).json({ message: 'Chủ nhóm không thể rời nhóm. Vui lòng chuyển quyền trước.' });
    }

    group.memberIds = group.memberIds.filter(id => id.toString() !== userId);
    await group.save();

    res.json({ success: true, message: 'Rời nhóm thành công.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi máy chủ.' });
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
    const groups = await Group.find({ memberIds: userId })
      .populate('eventId', 'name avatar banner timeStart timeEnd')
      .populate('ownerId', 'username email');
    
    // Format lại dữ liệu để trả về thông tin sự kiện
    const formattedGroups = groups.map(group => {
      const groupObj = group.toObject();
      return {
        ...groupObj,
        event: groupObj.eventId ? {
          id: groupObj.eventId._id,
          name: groupObj.eventId.name,
          avatar: groupObj.eventId.avatar,
          banner: groupObj.eventId.banner,
          timeStart: groupObj.eventId.timeStart,
          timeEnd: groupObj.eventId.timeEnd
        } : null,
        owner: groupObj.ownerId ? {
          id: groupObj.ownerId._id,
          username: groupObj.ownerId.username,
          email: groupObj.ownerId.email
        } : null
      };
    });
    
    res.json(formattedGroups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId).populate('memberIds', 'id username email location picUrl');
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group.' });
    res.json(group.memberIds);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, latitude, longitude, isSharing } = req.body;
    if (!userId || typeof isSharing !== 'boolean') {
      return res.status(400).json({ message: 'Thiếu thông tin.' });
    }

    let update = {
      isSharing: isSharing === true,
      updatedAt: new Date()
    };

    if (isSharing) {
      if (latitude == null || longitude == null) {
        return res.status(400).json({ message: 'Thiếu thông tin vị trí.' });
      }
      update.latitude = latitude;
      update.longitude = longitude;
      update.location = {
        type: 'Point',
        coordinates: [longitude, latitude]
      };
    } else {
      // Nếu muốn xóa vị trí khi tắt chia sẻ:
      update.latitude = null;
      update.longitude = null;
      update.location = null;
    }

    const location = await GroupLocation.findOneAndUpdate(
      { groupId, userId },
      update,
      { upsert: true, new: true }
    );

    const io = getSocketIO && getSocketIO();
    if (io) {
      io.to(`group_${groupId}`).emit('location:update', {
        groupId,
        userId,
        latitude: location.latitude,
        longitude: location.longitude,
        isSharing: location.isSharing,
        updatedAt: location.updatedAt
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getLocations = async (req, res) => {
  const { groupId } = req.params;
  try {
    const locations = await GroupLocation.find({ groupId, isSharing: true });
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
