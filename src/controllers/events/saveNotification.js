const { getSocketIO } = require('../../../socket/socket');
const Notification = require('../../models/events/notificationModel');
const User = require('../../models/userModel');
const crypto = require('crypto');
async function saveNotifications(fcmToken, title, body, data = {}, type) {
  try {
    // Tìm user theo FCM token
    const user = await User.findOne({ fcmTokens: fcmToken });
    if (!user) {
      console.log('⚠️ Không tìm thấy user với FCM Token này.');
      return;
    }
    const hash = crypto.createHash('md5').update(`${user._id}-${title}-${body}-${type}`).digest('hex');
    const isDuplicate = await Notification.findOne({
      user: user._id,
      uniqueHash: hash,
      createdAt: { $gte: new Date(Date.now() - 1000 * 60 * 1) }// trong 1 phút gần nhất
    });
    if (isDuplicate) {
      console.log('Trùng thông báo, không lưu lại.');
      return;
    }
    // Tạo notification mới
    const newNoti = new Notification({
      user: user._id,
      title: title || 'Thông báo',
      body: body,
      data: data ,
      createdAt: new Date(),
      isRead: false,
      type: type
    });

    await newNoti.save();
    console.log('Notification saved to database');

    // Gửi socket tới đúng user
    const io = getSocketIO();
    io.to(user._id.toString()).emit('newNoti', {
      message: '📬 Có thông báo mới!',
      notification: newNoti,
    });

  } catch (error) {
    console.error('Error save notification:', error.message);
  }
}

module.exports = {
  saveNotifications,
};
