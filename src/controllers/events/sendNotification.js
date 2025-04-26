const axios = require('axios');
const { getAccessToken } = require('../../config/firebase');
const serviceAccount = require('../../../eventsphere-e9bf4-144bdb8c8b83.json'); 
// Gửi thông báo push đến 1 thiết bị
async function sendPushNotification(fcmToken, title, body, data = {}) {
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    console.error('❌ Không thể lấy access token.');
    return;
  }
  if (!fcmToken) {
    console.error('❌ FCM Token không hợp lệ.');
    return;
  }

  const message = {
    message: {
      token: fcmToken,
      notification: {
        title: title,
        body: body,
      },
      data,
    }
  };
  
  try {
    const response = await axios.post(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      message,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('✅ Push notification sent:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('❌ FCM Error:', JSON.stringify(error.response.data, null, 2)); // log chi tiết
    } else {
      console.log('❌ Error:', error.message);
    }
}
}

module.exports = {
  sendPushNotification,
};
