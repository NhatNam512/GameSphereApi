const axios = require('axios');
const { getAccessToken } = require('../../config/firebase');

// Gửi thông báo push đến 1 thiết bị
async function sendPushNotification(fcmToken, title, body, data = {}) {
  try {
    const accessToken = await getAccessToken();

    const response = await axios.post(
      'https://fcm.googleapis.com/v1/projects/gamesphere-42d9e/messages:send',
      {
        message: {
          token: fcmToken,
          notification: { title, body },
          data, // optional custom data
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Notification sent:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('❌ FCM Error:', error.response.data);
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

module.exports = {
  sendPushNotification,
};
