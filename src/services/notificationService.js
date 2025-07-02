const { sendUserNotification } = require("../controllers/auth/sendNotification");
const inviteFriendModel = require("../models/user/inviteFriendModel");

class NotificationService {
    async sendFriendRequestNotification(receiver, data = {}) {
        const tokens = receiver?.fcmTokens || [];
        if (tokens.length === 0) return;

        console.log("FCM Token: "+tokens);
        
        return sendUserNotification(
            tokens,
            "Lời mời kết bạn",
            "Bạn có lời mời kết bạn mới!",
            data,
            "friend"
        );
    }

    async sendFriendAcceptNotification(sender, username, avatar) {
        const tokens = sender?.fcmTokens || [];
        if (tokens.length === 0) return;

        return sendUserNotification(
            tokens,
            "Lời mời kết bạn",
            `${username} đã chấp nhận lời mời của bạn!`,
            { avatar },
            "friend"
        );
    }

    async sendInviteFriendNotification(invitee, inviter, eventName, avatar, eventId, inviteId) {
        const tokens = invitee?.fcmTokens || [];
        if (tokens.length === 0) return;
        const invite = await inviteFriendModel.findById(inviteId).lean();
        if (!invite) return;

        return sendUserNotification(
            tokens,
            "Lời mời tham gia sự kiện",
            `${inviter.username} đã mời bạn tham gia sự kiện ${eventName}`,
            { 
                avatar, 
                eventName,
                eventId,
                inviteId,
                status: invite.status
            },
            "invite"
        );
    }

    async sendTicketNotification(user, eventName, avatar, eventId, order) {
        const tokens = user?.fcmTokens || [];
        if (tokens.length === 0) return;

        return sendUserNotification(
            tokens,
            "Đặt vé thành công",
            `Bạn đã đặt ${order.amount} vé cho sự kiện "${eventName}"`,
            {
                eventId: eventId,
            },
            "ticket"
        );
    }

    async sendGroupInviteNotification(receiver, group, inviter) {
        const token = receiver?.fcmTokens;
        if (!token) return;
        return sendUserNotification(
            token,
            "Lời mời tham gia nhóm",
            `${inviter?.username || 'Một người dùng'} đã mời bạn vào nhóm "${group.groupName}"`,
            {
                groupId: group._id,
                groupName: group.groupName,
                eventId: group.eventId,
                inviterId: inviter?._id,
                inviterName: inviter?.username
            },
            "group"
        );
    }

    async sendGroupAcceptNotification(owner, user, group) {
        const tokens = owner?.fcmTokens || [];
        if (tokens.length === 0) return;
        return sendUserNotification(
            tokens,
            "Thành viên mới tham gia nhóm",
            `${user.username} đã chấp nhận lời mời vào nhóm "${group.groupName}"`,
            {
                groupId: group._id,
                groupName: group.groupName,
                userId: user._id,
                username: user.username
            },
            "group"
        );
    }

    async sendGroupDeclineNotification(owner, user, group) {
        const tokens = owner?.fcmTokens || [];
        if (tokens.length === 0) return;
        return sendUserNotification(
            tokens,
            "Từ chối lời mời nhóm",
            `${user.username} đã từ chối lời mời vào nhóm "${group.groupName}"`,
            {
                groupId: group._id,
                groupName: group.groupName,
                userId: user._id,
                username: user.username
            },
            "group"
        );
    }

    async sendGroupLeaveNotification(owner, user, group) {
        const tokens = owner?.fcmTokens || [];
        if (tokens.length === 0) return;
        return sendUserNotification(
            tokens,
            "Thành viên rời nhóm",
            `${user.username} đã rời khỏi nhóm "${group.groupName}"`,
            {
                groupId: group._id,
                groupName: group.groupName,
                userId: user._id,
                username: user.username
            },
            "group"
        );
    }
}

module.exports = new NotificationService();
