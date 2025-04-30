const { saveNotifications } = require("../events/saveNotification");
const { sendPushNotification } = require("../events/sendNotification");

// Gửi thông báo qua API endpoint
exports.sendNotification = async (req, res) => {
  try {
    const { fcmToken, title, body, data = {}, type } = req.body;

    if (!fcmToken || !title || !body || !type) {
      return res.status(400).json({
        error: 'Thiếu thông tin bắt buộc: fcmToken, title, body, type',
      });
    }

    await sendPushNotification(fcmToken, title, body, data);
    await saveNotifications(fcmToken, title, body, data, type);

    return res.status(200).json({ message: 'Gửi thông báo thành công' });
  } catch (e) {
    console.error('❌ Lỗi khi gửi thông báo:', e);
    const errorMessage = e?.response?.data?.error || e.message || 'Unknown error';
    return res.status(500).json({ message: 'Lỗi khi gửi thông báo', error: errorMessage });
  }
};

// Gửi thông báo cho nhiều người dùng (từ service hoặc controller)
exports.sendUserNotification = async (fcmTokens, title, body, data = {}, type) => {
  try {
    if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) return;

    const tasks = fcmTokens.map(token => (
      Promise.all([
        sendPushNotification(token, title, body, data),
        saveNotifications(token, title, body, data, type)
      ])
    ));

    await Promise.all(tasks);
  } catch (e) {
    console.error("❌ Lỗi khi gửi thông báo đến user:", e.message);
  }
};
