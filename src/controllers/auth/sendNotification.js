const { saveNotifications } = require("../events/saveNotification");
const { sendPushNotification } = require("../events/sendNotification");

exports.sendNotification = async (req, res) => {
  try {
    const { fcmToken, title, body, data, type } = req.body;

    if (!fcmToken || !title || !body || !type) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: fcmToken, title, body, type' });
    }

    await sendPushNotification(fcmToken, title, body, data, type || {});
    await saveNotifications(fcmToken, title, body, data, type);

    res.status(200).json({ message: 'Notification sent' });
  } catch (e) {
    console.error('Error sending notification:', e);
    const errorMessage = e?.response?.data?.error || e.message || 'Unknown error';
    res.status(500).json({ message: 'Lỗi khi gửi thông báo', error: errorMessage });
  }
};
exports.sendUserNotification = async (fcmTokens, title, body, data = {}, type) => {
    try {
      if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) return;
  
      for (const token of fcmTokens) {
        await sendPushNotification(token, title, body, data, type);
        await saveNotifications(token, title, body, data, type);
      }
    } catch (e) {
      console.error("Lỗi khi gửi thông báo đến user:", e.message);
    }
  };
  