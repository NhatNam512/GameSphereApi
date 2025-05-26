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
}

module.exports = new NotificationService();
