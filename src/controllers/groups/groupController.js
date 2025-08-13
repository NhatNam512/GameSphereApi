const Group = require('../../models/events/groupModel');
const GroupLocation = require('../../models/events/groupLocationModel');
const userModel = require('../../models/userModel');
const notificationService = require('../../services/notificationService');
const { getSocketIO } = require('../../../socket/socket');

// Map để lưu các timeout cho mỗi user trong mỗi group
const sharingTimeouts = new Map();

// Hàm tạo key cho timeout map
const getTimeoutKey = (groupId, userId) => `${groupId}_${userId}`;

// Hàm để tự động tắt sharing sau timeout
const autoDisableSharing = async (groupId, userId) => {
  try {
    const update = {
      isSharing: false,
      updatedAt: new Date(),
      latitude: null,
      longitude: null,
      location: null
    };

    const location = await GroupLocation.findOneAndUpdate(
      { groupId, userId },
      update,
      { new: true }
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
  } catch (error) {
    console.error('Error in autoDisableSharing:', error);
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { eventId, showtimeId, groupName, ownerId, memberIds = [] } = req.body;
    if (!eventId || !groupName || !ownerId) {
      return res.status(400).json({ message: 'Thiếu thông tin tạo group.' });
    }
    
    // Kiểm tra showtimeId có hợp lệ không (nếu có)
    if (showtimeId) {
      const Showtime = require('../../models/events/showtimeModel');
      const showtime = await Showtime.findById(showtimeId);
      if (!showtime) {
        return res.status(400).json({ message: 'Showtime không tồn tại.' });
      }
      // Kiểm tra showtime có thuộc về event này không
      if (showtime.eventId.toString() !== eventId) {
        return res.status(400).json({ message: 'Showtime không thuộc về sự kiện này.' });
      }
    }
    
    const group = await Group.create({ 
      eventId, 
      showtimeId, 
      groupName, 
      ownerId, 
      memberIds: [ownerId, ...memberIds] 
    });
    
    if (memberIds.length && notificationService?.sendGroupInviteNotification) {
      const owner = await userModel.findById(ownerId);
      // Lấy thông tin event để gửi trong email
      const eventModel = require('../../models/events/eventModel');
      const event = await eventModel.findById(eventId).select('name avatar banner timeStart timeEnd').lean();
      
      for (const memberId of memberIds) {
        if (memberId.toString() === ownerId.toString()) continue;
        const user = await userModel.findById(memberId);
        if (user) {
          await notificationService.sendGroupInviteNotification(user, group, owner, event);
        }
      }
    }
    
    // Populate thông tin showtime trước khi trả về
    const populatedGroup = await Group.findById(group._id)
      .populate('showtimeId', '_id startTime endTime ticketPrice')
      .lean();
    
    res.status(201).json(populatedGroup);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.inviteMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Thiếu email.' });
    
    // Populate eventId và showtimeId để lấy thông tin sự kiện và showtime
    const group = await Group.findById(groupId)
      .populate('eventId', 'name avatar banner timeStart timeEnd')
      .populate('showtimeId', '_id startTime endTime ticketPrice');
      
    if (!group) return res.status(404).json({ message: 'Không tìm thấy group.' });
    if (group.inviteEmails.some(inv => inv.email === email)) {
      return res.status(400).json({ message: 'Email đã được mời.' });
    }
    
    const inviteObj = { email, invitedBy: req.user?._id };
    group.inviteEmails.push(inviteObj);
    await group.save();
    
    const user = await userModel.findOne({ email });
    console.log('🔍 Debug email sending:');
    console.log('- Email to invite:', email);
    console.log('- User found:', !!user);
    console.log('- User email:', user?.email);
    console.log('- NotificationService exists:', !!notificationService);
    console.log('- sendGroupInviteNotification exists:', !!notificationService?.sendGroupInviteNotification);
    
    if (user && notificationService?.sendGroupInviteNotification) {
      const owner = await userModel.findById(group.ownerId);
      // Truyền thêm thông tin event và showtime để gửi trong email
      const eventInfo = group.eventId ? {
        name: group.eventId.name,
        avatar: group.eventId.avatar,
        banner: group.eventId.banner,
        timeStart: group.eventId.timeStart,
        timeEnd: group.eventId.timeEnd
      } : null;
      
      const showtimeInfo = group.showtimeId ? {
        id: group.showtimeId._id,
        startTime: group.showtimeId.startTime,
        endTime: group.showtimeId.endTime,
        ticketPrice: group.showtimeId.ticketPrice
      } : null;
      
      console.log('📧 Attempting to send email...');
      await notificationService.sendGroupInviteNotification(user, group, owner, eventInfo, showtimeInfo);
      console.log('✅ Email sent successfully');
    } else {
      console.log('❌ Email not sent - conditions not met');
    }
    
    // Lấy thông tin sự kiện và showtime trả về
    const eventInfo = group.eventId ? {
      id: group.eventId._id,
      name: group.eventId.name,
      avatar: group.eventId.avatar,
      banner: group.eventId.banner,
      timeStart: group.eventId.timeStart,
      timeEnd: group.eventId.timeEnd
    } : null;
    
    const showtimeInfo = group.showtimeId ? {
      id: group.showtimeId._id,
      startTime: group.showtimeId.startTime,
      endTime: group.showtimeId.endTime,
      ticketPrice: group.showtimeId.ticketPrice
    } : null;
    
    res.json({ 
      success: true, 
      invite: { ...inviteObj, status: 'pending' }, 
      event: eventInfo,
      showtime: showtimeInfo
    });
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
    const { showtimeId } = req.query;
    
    let filter = { eventId };
    if (showtimeId) {
      filter.showtimeId = showtimeId;
    }
    
    const groups = await Group.find(filter)
      .populate('showtimeId', '_id startTime endTime ticketPrice')
      .populate('ownerId', '_id username email')
      .lean();
    
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
      .populate('showtimeId', '_id startTime endTime ticketPrice')
      .populate('ownerId', 'username email')
      .lean();
    
    // Format lại dữ liệu để trả về thông tin sự kiện và showtime
    const formattedGroups = groups.map(group => {
      const groupObj = group;
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
        showtime: groupObj.showtimeId ? {
          id: groupObj.showtimeId._id,
          startTime: groupObj.showtimeId.startTime,
          endTime: groupObj.showtimeId.endTime,
          ticketPrice: groupObj.showtimeId.ticketPrice
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

    // Clear existing timeout if any
    const timeoutKey = getTimeoutKey(groupId, userId);
    if (sharingTimeouts.has(timeoutKey)) {
      clearTimeout(sharingTimeouts.get(timeoutKey));
      sharingTimeouts.delete(timeoutKey);
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

      // Set new timeout for 60 minutes
      const timeout = setTimeout(() => {
        autoDisableSharing(groupId, userId);
        sharingTimeouts.delete(timeoutKey);
      }, 60 * 60 * 1000); // 60 minutes in milliseconds

      sharingTimeouts.set(timeoutKey, timeout);
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
      const payload = {
        groupId,
        userId,
        latitude: location.latitude,
        longitude: location.longitude,
        isSharing: location.isSharing,
        updatedAt: location.updatedAt
      };
      
      io.to(`group_${groupId}`).emit('location:update', payload);
      console.log(`[Socket] 🔄 Emitted 'location:update' to group_${groupId}:`, payload);
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

exports.getShowtimesByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const Showtime = require('../../models/events/showtimeModel');
    const showtimes = await Showtime.find({ eventId })
      .select('_id startTime endTime ticketPrice ticketQuantity soldTickets')
      .lean();
    
    res.json({
      success: true,
      message: 'Lấy danh sách showtime thành công',
      data: showtimes
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getGroupById = async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId)
      .populate('eventId', '_id name avatar banner timeStart timeEnd description location')
      .populate('showtimeId', '_id startTime endTime ticketPrice ticketQuantity soldTickets')
      .populate('ownerId', '_id username email picUrl')
      .populate('memberIds', '_id username email picUrl')
      .lean();
    
    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy group.' });
    }
    
    // Format lại dữ liệu
    const formattedGroup = {
      ...group,
      event: group.eventId ? {
        id: group.eventId._id,
        name: group.eventId.name,
        avatar: group.eventId.avatar,
        banner: group.eventId.banner,
        timeStart: group.eventId.timeStart,
        timeEnd: group.eventId.timeEnd,
        description: group.eventId.description,
        location: group.eventId.location
      } : null,
      showtime: group.showtimeId ? {
        id: group.showtimeId._id,
        startTime: group.showtimeId.startTime,
        endTime: group.showtimeId.endTime,
        ticketPrice: group.showtimeId.ticketPrice,
        ticketQuantity: group.showtimeId.ticketQuantity,
        soldTickets: group.showtimeId.soldTickets
      } : null,
      owner: group.ownerId ? {
        id: group.ownerId._id,
        username: group.ownerId.username,
        email: group.ownerId.email,
        picUrl: group.ownerId.picUrl
      } : null,
      members: group.memberIds ? group.memberIds.map(member => ({
        id: member._id,
        username: member.username,
        email: member.email,
        picUrl: member.picUrl
      })) : []
    };
    
    res.json({
      success: true,
      message: 'Lấy thông tin group thành công',
      data: formattedGroup
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupName, showtimeId } = req.body;
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy group.' });
    }
    
    // Cập nhật thông tin
    if (groupName) {
      group.groupName = groupName;
    }
    
    if (showtimeId !== undefined) {
      // Nếu showtimeId là null, xóa showtime
      if (showtimeId === null) {
        group.showtimeId = null;
      } else {
        // Kiểm tra showtimeId có hợp lệ không
        const Showtime = require('../../models/events/showtimeModel');
        const showtime = await Showtime.findById(showtimeId);
        if (!showtime) {
          return res.status(400).json({ message: 'Showtime không tồn tại.' });
        }
        // Kiểm tra showtime có thuộc về event này không
        if (showtime.eventId.toString() !== group.eventId.toString()) {
          return res.status(400).json({ message: 'Showtime không thuộc về sự kiện này.' });
        }
        group.showtimeId = showtimeId;
      }
    }
    
    await group.save();
    
    // Populate và trả về thông tin cập nhật
    const updatedGroup = await Group.findById(groupId)
      .populate('eventId', '_id name avatar banner timeStart timeEnd description location')
      .populate('showtimeId', '_id startTime endTime ticketPrice ticketQuantity soldTickets')
      .populate('ownerId', '_id username email picUrl')
      .lean();
    
    res.json({
      success: true,
      message: 'Cập nhật group thành công',
      data: updatedGroup
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getGroupsByShowtime = async (req, res) => {
  try {
    const { showtimeId } = req.params;
    
    const groups = await Group.find({ showtimeId })
      .populate('eventId', '_id name avatar banner timeStart timeEnd')
      .populate('showtimeId', '_id startTime endTime ticketPrice')
      .populate('ownerId', '_id username email picUrl')
      .populate('memberIds', '_id username email picUrl')
      .lean();
    
    // Format lại dữ liệu
    const formattedGroups = groups.map(group => ({
      ...group,
      event: group.eventId ? {
        id: group.eventId._id,
        name: group.eventId.name,
        avatar: group.eventId.avatar,
        banner: group.eventId.banner,
        timeStart: group.eventId.timeStart,
        timeEnd: group.eventId.timeEnd
      } : null,
      showtime: group.showtimeId ? {
        id: group.showtimeId._id,
        startTime: group.showtimeId.startTime,
        endTime: group.showtimeId.endTime,
        ticketPrice: group.showtimeId.ticketPrice
      } : null,
      owner: group.ownerId ? {
        id: group.ownerId._id,
        username: group.ownerId.username,
        email: group.ownerId.email,
        picUrl: group.ownerId.picUrl
      } : null,
      members: group.memberIds ? group.memberIds.map(member => ({
        id: member._id,
        username: member.username,
        email: member.email,
        picUrl: member.picUrl
      })) : []
    }));
    
    res.json({
      success: true,
      message: 'Lấy danh sách group theo showtime thành công',
      data: formattedGroups
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    })
    .populate('ownerId', 'username email')
    .populate('showtimeId', '_id startTime endTime ticketPrice')
    .lean();
    
    const result = groups.map(group => {
      const invite = group.inviteEmails.find(inv => inv.email === user.email && inv.status === 'pending');
      return {
        groupId: group._id,
        groupName: group.groupName,
        eventId: group.eventId,
        showtimeId: group.showtimeId,
        showtime: group.showtimeId ? {
          id: group.showtimeId._id,
          startTime: group.showtimeId.startTime,
          endTime: group.showtimeId.endTime,
          ticketPrice: group.showtimeId.ticketPrice
        } : null,
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
