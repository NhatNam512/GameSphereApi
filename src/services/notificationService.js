const { sendUserNotification } = require("../controllers/auth/sendNotification");

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

    async sendInviteFriendNotification(invitee, inviter, eventName, avatar, eventId) {
        const tokens = invitee?.fcmTokens || [];
        if (tokens.length === 0) return;

        return sendUserNotification(
            tokens,
            "Lời mời tham gia sự kiện",
            `${inviter.username} đã mời bạn tham gia sự kiện ${eventName}`,
            { 
                avatar, 
                eventName,
                eventId,
            },
            "event"
        );
    }
}

module.exports = new NotificationService();
