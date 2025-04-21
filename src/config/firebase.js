const axios = require('axios');
const qs = require('qs'); // hoặc querystring nếu thích

async function getAccessToken() {
  try {
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      qs.stringify({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refresh_token: process.env.REFRESH_TOKEN,
        grant_type: 'refresh_token'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    console.log('New Access Token:', tokenResponse.data.access_token);
    return tokenResponse.data.access_token;

  } catch (err) {
    console.error('Lỗi khi lấy access_token:', err.response?.data || err.message);
    return null;
  }
}

module.exports = {
  getAccessToken
};
