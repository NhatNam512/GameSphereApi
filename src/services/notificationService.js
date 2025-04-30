const { sendNotification } = require("../controllers/auth/sendNotification");

class NotificationService {
    async sendFriendRequestNotification(receiver, data = {}) {
        const tokens = receiver?.fcmTokens || [];
        if (tokens.length === 0) return;

        return sendNotification(
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

        return sendNotification(
            tokens,
            "Lời mời kết bạn",
            `${username} đã chấp nhận lời mời của bạn!`,
            { avatar },
            "friend"
        );
    }
}

module.exports = new NotificationService();
