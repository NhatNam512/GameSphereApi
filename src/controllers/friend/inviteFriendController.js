const eventModel = require("../../models/events/eventModel");
const friendRequestModel = require("../../models/user/friendRequestModel");
const inviteFriendModel = require("../../models/user/inviteFriendModel");
const userModel = require("../../models/userModel");
const notificationService = require("../../services/notificationService");

exports.inviteFriendsToEvent = async (req, res) => {
  try {
    const { eventId, userIds } = req.body;
    const inviterId = req.user.id;

    // Kiểm tra danh sách người mời hợp lệ
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'Danh sách người được mời không hợp lệ.' });
    }

    // Kiểm tra sự kiện có tồn tại không
    const event = await eventModel.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Sự kiện không tồn tại.' });
    }

    // Tạo danh sách lời mời
    const invitations = userIds.map(userId => ({
      eventId,
      inviterId,
      inviteeId: userId,
      status: 'pending',
    }));

    // Insert tất cả lời mời vào DB cùng lúc
    const insertedInvitations = await inviteFriendModel.insertMany(invitations);

    // Sau khi insert thành công, gửi thông báo cho tất cả người được mời
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
            inserted._id // <-- Đảm bảo đúng _id
          );
        }
      } catch (notificationErr) {
        console.warn(`Lỗi gửi thông báo tới ${inserted.inviteeId}:`, notificationErr);
      }
    }

    // Trả về phản hồi thành công
    return res.status(200).json({ message: 'Đã mời bạn bè thành công.' });
  } catch (err) {
    console.error('Error inviting friends:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống.' });
  }
};

exports.acceptInviteToEvent = async (req, res) => {
    try {
        const { inviteId } = req.params;
        const userId = req.user.id;

        const invite = await inviteFriendModel.findById(inviteId);
        if (!invite || invite.inviteeId.toString() !== userId) {
            return res.status(404).json({ message: 'Lời mời không tồn tại hoặc không hợp lệ.' });
        }

        invite.status = 'accepted';
        await invite.save();

        // Bạn có thể thêm user vào event participants ở đây (nếu có field đó)
        // await eventModel.findByIdAndUpdate(invite.eventId, { $addToSet: { participants: userId } });

        return res.status(200).json({ message: 'Bạn đã chấp nhận lời mời tham gia sự kiện.' });
    } catch (err) {
        console.error('❌ Lỗi khi chấp nhận lời mời:', err);
        return res.status(500).json({ message: 'Lỗi hệ thống.' });
    }
};

exports.declineInviteToEvent = async (req, res) => {
    try {
        const { inviteId } = req.params;
        const userId = req.user.id;

        const invite = await inviteFriendModel.findById(inviteId);
        if (!invite || invite.inviteeId.toString() !== userId) {
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
