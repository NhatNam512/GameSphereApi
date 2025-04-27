const { getSocketIO } = require('../../../socket/socket');
const Notification = require('../../models/events/notificationModel');
const User = require('../../models/userModel');

async function saveNotifications(fcmToken, title, body, data = {}) {
  try {
    // Tìm user theo FCM token
    const user = await User.findOne({ fcmTokens: fcmToken });
    if (!user) {
      console.log('⚠️ Không tìm thấy user với FCM Token này.');
      return;
    }

    // Tạo notification mới
    const newNoti = new Notification({
      user: user._id,
      title,
      body,
      data,
      createdAt: new Date(),
      isRead: false,
    });

    await newNoti.save();
    console.log('✅ Notification saved to database');

    // Gửi socket tới đúng user
    const io = getSocketIO();
    io.to(user._id.toString()).emit('newNoti', {
      message: '📬 Có thông báo mới!',
      notification: newNoti,
    });

  } catch (error) {
    console.error('❌ Error save notification:', error.message); 
  }
}

module.exports = {
  saveNotifications,
};
