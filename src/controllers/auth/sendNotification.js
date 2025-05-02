const { saveNotifications } = require("../events/saveNotification");
const { sendPushNotification } = require("../events/sendNotification");

// Hàm core để gửi thông báo
const sendNotificationCore = async (fcmToken, title, body, data = {}, type) => {
  if (!fcmToken || !title || !body || !type) {
    throw new Error('Thiếu thông tin bắt buộc: fcmToken, title, body, type');
  }

  await sendPushNotification(fcmToken, title, body, data);
  await saveNotifications(fcmToken, title, body, data, type);
};

// API endpoint để gửi thông báo
exports.sendNotification = async (req, res) => {
  try {
    const { fcmToken, title, body, data = {}, type } = req.body;
    await sendNotificationCore(fcmToken, title, body, data, type);
    return res.status(200).json({ message: 'Gửi thông báo thành công' });
  } catch (e) {
    console.error('❌ Lỗi khi gửi thông báo:', e);
    const errorMessage = e?.response?.data?.error || e.message || 'Unknown error';
    return res.status(500).json({ message: 'Lỗi khi gửi thông báo', error: errorMessage });
  }
};

// Gửi thông báo cho nhiều người dùng
exports.sendUserNotification = async (fcmTokens, title, body, data = {}, type) => {
  try {
    if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) return;

    const tasks = fcmTokens.map(token => sendNotificationCore(token, title, body, data, type));
    await Promise.all(tasks);
  } catch (e) {
    console.error("❌ Lỗi khi gửi thông báo đến user:", e.message);
    throw e;
  }
};

// Export hàm core để sử dụng trực tiếp
exports.sendNotificationCore = sendNotificationCore;
