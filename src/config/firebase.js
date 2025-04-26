const { GoogleAuth } = require('google-auth-library');
const serviceAccount = require('../../eventsphere-e9bf4-144bdb8c8b83.json');

let cachedAccessToken = null;
let cachedExpireTime = 0;

async function getAccessToken() {
  const now = Date.now();

  if (cachedAccessToken && cachedExpireTime - now > 60 * 1000) {
    return cachedAccessToken;
  }

  try {
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });

    const client = await auth.getClient();
    const headers = await client.getRequestHeaders(); // headers.Authorization

    const accessToken = headers['Authorization'].split('Bearer ')[1];

    cachedAccessToken = accessToken;
    cachedExpireTime = now + (50 * 60 * 1000); // Token sống 1h, cache 50p

    console.log('✅ Access token refreshed.');
    return cachedAccessToken;

  } catch (err) {
    console.error('❌ Lỗi khi lấy access_token:', err.response?.data || err.message || err);
    return null;
  }
}

module.exports = { getAccessToken };
