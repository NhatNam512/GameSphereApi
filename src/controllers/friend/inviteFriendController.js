const eventModel = require("../../models/events/eventModel");
const friendRequestModel = require("../../models/user/friendRequestModel");
const inviteFriendModel = require("../../models/user/inviteFriendModel");
const userModel = require("../../models/userModel");
const notificationService = require("../../services/notificationService");

// POST /events/:eventId/join
exports.joinEvent = async (req, res) => {
  const userId = req.user.id;
  const { eventId } = req.params;

  // Kiểm tra đã có lời mời hoặc đã tham gia chưa
  const existing = await inviteFriendModel.findOne({
    eventId,
    inviteeId: userId,
    status: { $in: ['accepted', 'joined'] }
  });
  if (existing) {
    return res.status(400).json({ message: 'Bạn đã tham gia sự kiện này.' });
  }

  await inviteFriendModel.create({
    eventId,
    inviteeId: userId,
    inviterId: null, // tự tham gia
    status: 'joined',
    joinedAt: new Date()
  });

  return res.status(200).json({ message: 'Tham gia sự kiện thành công.' });
};

exports.unjoinEvent = async (req, res) => {
  const userId = req.user.id;
  const { eventId } = req.params;

  try {
    // Kiểm tra người dùng đã tham gia chưa
    const joinedRecord = await inviteFriendModel.findOne({
      eventId,
      inviteeId: userId,
      status: 'joined'
    });

    if (!joinedRecord) {
      return res.status(400).json({ message: 'Bạn chưa tham gia sự kiện này.' });
    }

    // Xóa bản ghi hoặc cập nhật trạng thái
    await inviteFriendModel.deleteOne({ _id: joinedRecord._id });

    // Hoặc nếu muốn giữ lại log thì:
    // await inviteFriendModel.updateOne({ _id: joinedRecord._id }, { status: 'cancelled' });

    return res.status(200).json({ message: 'Bạn đã rời khỏi sự kiện.' });
  } catch (error) {
    console.error('Error in unjoinEvent:', error);
    return res.status(500).json({ message: 'Có lỗi xảy ra khi rời sự kiện.' });
  }
};

exports.inviteFriendsToEvent = async (req, res) => {
  try {
    const { eventId, userIds } = req.body;
    const inviterId = req.user.id;

    // 1. Kiểm tra danh sách người mời hợp lệ
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'Danh sách người được mời không hợp lệ.' });
    }

    // 2. Kiểm tra sự kiện có tồn tại không
    const event = await eventModel.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Sự kiện không tồn tại.' });
    }

    // 3. Kiểm tra người đã được mời trước đó
    const existing = await inviteFriendModel.find({
      eventId,
      inviteeId: { $in: userIds }
    });
    const alreadyInvitedIds = new Set(existing.map(inv => inv.inviteeId.toString()));

    const newInvitations = userIds
      .filter(userId => !alreadyInvitedIds.has(userId.toString()))
      .map(userId => ({
        eventId,
        inviterId,
        inviteeId: userId,
        status: 'pending',
      }));

    if (newInvitations.length === 0) {
      return res.status(400).json({ message: 'Tất cả người dùng đã được mời trước đó.' });
    }

    // 4. Insert lời mời mới
    const insertedInvitations = await inviteFriendModel.insertMany(newInvitations);

    // 5. Gửi thông báo
    for (const inserted of insertedInvitations) {
      try {
        const invitee = await userModel.findById(inserted.inviteeId).select('fcmTokens username');
        if (invitee) {
          await notificationService.sendInviteFriendNotification(
            invitee,
            req.user,
            event.name,
            req.user.picUrl,
            eventId,
            inserted._id
          );
        }
      } catch (notificationErr) {
        console.warn(`Lỗi gửi thông báo tới ${inserted.inviteeId}:`, notificationErr);
      }
    }

    // 6. Trả về kết quả thành công
    return res.status(200).json({
      message: `Đã mời thành công ${insertedInvitations.length} người.`,
      invitedCount: insertedInvitations.length,
      skippedCount: userIds.length - insertedInvitations.length
    });
  } catch (err) {
    console.error('Lỗi khi mời bạn bè:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống.' });
  }
};

exports.acceptInviteToEvent = async (req, res) => {
    try {
        const { inviteId } = req.params;
        const userId = req.user.id;

        const invite = await inviteFriendModel.findById(inviteId);
        if (!invite || invite.inviteeId.toString() !== userId.toString()) {
            return res.status(404).json({ message: 'Lời mời không tồn tại hoặc không hợp lệ.' });
        }

        invite.status = 'accepted';
        invite.joinedAt = new Date();
        await invite.save();

        // Bạn có thể thêm user vào event participants ở đây (nếu có field đó)
        // await eventModel.findByIdAndUpdate(invite.eventId, { $addToSet: { participants: userId } });

        return res.status(200).json({ message: 'Bạn đã chấp nhận lời mời tham gia sự kiện.' });
    } catch (err) {
        console.error('Lỗi khi chấp nhận lời mời:', err);
        return res.status(500).json({ message: 'Lỗi hệ thống.' });
    }
};

exports.declineInviteToEvent = async (req, res) => {
    try {
        const { inviteId } = req.params;
        const userId = req.user.id;

        const invite = await inviteFriendModel.findById(inviteId);
        if (!invite || invite.inviteeId.toString() !== userId.toString()) {
            return res.status(404).json({ message: 'Lời mời không tồn tại hoặc không hợp lệ.' });
        }

        invite.status = 'declined';
        await invite.save();

        return res.status(200).json({ message: 'Bạn đã từ chối lời mời tham gia sự kiện.' });
    } catch (err) {
        console.error('❌ Lỗi khi từ chối lời mời:', err);
        return res.status(500).json({ message: 'Lỗi hệ thống.' });
    }
};

exports.getPendingEventInvites = async (req, res) => {
    try {
        const userId = req.user.id;

        const pendingInvites = await inviteFriendModel.find({
            inviteeId: userId,
            status: 'pending',
        }).populate('eventId inviterId', 'name picUrl username');

        return res.status(200).json({ invites: pendingInvites });
    } catch (err) {
        console.error('❌ Lỗi khi lấy danh sách lời mời:', err);
        return res.status(500).json({ message: 'Lỗi hệ thống.' });
    }
};

exports.getFriendsToInvite = async (req, res) => {
    try {
        const { eventId } = req.params;
        const userId = req.user.id;

        // 1. Lấy danh sách bạn bè (giả sử bạn có collection friends)
        const friendships = await friendRequestModel.find({
            $or: [{ user1: userId }, { user2: userId }],
            status: 'accepted',
        });

        const friendIds = friendships.map(f =>
            f.user1.toString() === userId ? f.user2.toString() : f.user1.toString()
        );

        // 2. Lấy danh sách đã mời
        const existingInvites = await inviteFriendModel.find({
            eventId,
            inviteeId: { $in: friendIds }
        });

        const invitedMap = {};
        existingInvites.forEach(invite => {
            invitedMap[invite.inviteeId.toString()] = invite.status; // 'pending', 'accepted', 'declined'
        });

        // 3. Lấy thông tin bạn bè
        const friends = await userModel.find({ _id: { $in: friendIds } }).select('username avatar');

        // 4. Trả về danh sách kèm trạng thái
        const result = friends.map(friend => ({
            _id: friend._id,
            username: friend.username,
            avatar: friend.avatar,
            status: invitedMap[friend._id.toString()] || 'not_invited',
        }));

        return res.status(200).json({ friends: result });
    } catch (err) {
        console.error('❌ Lỗi khi lấy danh sách bạn bè có thể mời:', err);
        return res.status(500).json({ message: 'Lỗi hệ thống.' });
    }
};

exports.getEventParticipants = async (req, res) => {
  const { eventId } = req.params;

  const participants = await inviteFriendModel.find({
    eventId,
    status: { $in: ['accepted', 'joined'] }
  }).populate('inviteeId', 'username picUrl');

  return res.status(200).json({
    participants: participants.map(p => ({
      _id: p.inviteeId._id,
      username: p.inviteeId.username,
      picUrl: p.inviteeId.picUrl,
      joinedAt: p.joinedAt,
    }))
  });
};

exports.getJoinedEvents = async (req, res) => {
  try {
    const userId = req.user.id;

    const joinedInvitations = await inviteFriendModel.find({
      inviteeId: userId,
      status: { $in: ['accepted', 'joined'] },
    }).populate('eventId', 'name avatar timeStart');

    const events = joinedInvitations
      .map(invite => invite.eventId)
      .filter(event => event); // loại bỏ null nếu event bị xóa

    return res.status(200).json({ events });
  } catch (err) {
    console.error('❌ Lỗi khi lấy sự kiện đã tham gia:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống.' });
  }
};
