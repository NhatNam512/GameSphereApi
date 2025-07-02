const { saveNotifications } = require("../events/saveNotification");
const { sendPushNotification } = require("../events/sendNotification");

// Hàm core để gửi thông báo
const sendNotificationCore = async (fcmToken, title, body, data = {}, type) => {
  if (!fcmToken || !title || !body || !type) {
    console.error('[Notification] Thiếu thông tin bắt buộc:', { fcmToken, title, body, type });
    throw new Error('Thiếu thông tin bắt buộc: fcmToken, title, body, type');
  }
  try {
    console.log(`[Notification] Sending push to token: ${fcmToken}, title: ${title}, type: ${type}`);
    await sendPushNotification(fcmToken, title, body, data);
    console.log(`[Notification] Push sent to ${fcmToken}`);
  } catch (e) {
    console.error(`[Notification] Lỗi khi gửi push notification:`, e.message);
  }
  try {
    console.log(`[Notification] Saving notification to DB for token: ${fcmToken}, title: ${title}, type: ${type}`);
    await saveNotifications(fcmToken, title, body, data, type);
    console.log(`[Notification] Notification saved for token: ${fcmToken}`);
  } catch (e) {
    console.error(`[Notification] Lỗi khi lưu notification vào DB:`, e.message);
  }
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
    // Nếu chỉ là chuỗi đơn thì chuyển thành mảng 1 phần tử
    if (typeof fcmTokens === 'string') {
      fcmTokens = [fcmTokens];
    }

    if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) return;

    if (fcmTokens.length === 1) {
      await sendNotificationCore(fcmTokens[0], title, body, data, type);
    } else {
      const tasks = fcmTokens.map(token =>
        sendNotificationCore(token, title, body, data, type)
      );
      await Promise.all(tasks);
    }
  } catch (e) {
    console.error("❌ Lỗi khi gửi thông báo đến user:", e.message);
    throw e;
  }
};

// Export hàm core để sử dụng trực tiếp
exports.sendNotificationCore = sendNotificationCore;
