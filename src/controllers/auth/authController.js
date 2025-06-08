const { OAuth2Client } = require('google-auth-library');
const JWT = require('jsonwebtoken');
const User = require('../../models/userModel');
const userModel = require('../../models/userModel');
const config = require("../../utils/tokenConfig");
const client = new OAuth2Client('518691740711-hpgf2l7sj9ec9f0uh8695ov0lnfoscka.apps.googleusercontent.com'); // your webClientId

exports.googleLogin = async (req, res) => {
    const { token } = req.body;

    try {
        // 1. Verify Google ID token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: '518691740711-hpgf2l7sj9ec9f0uh8695ov0lnfoscka.apps.googleusercontent.com',
        });

        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;

        // 2. Tìm hoặc tạo user
        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                username: name,
                email: email,
                picUrl: picture,
                role: 3, // mặc định là người dùng thường
                // provider: 'google',
            });
            await user.save();
        }
        const tokenPayload = {
            id: user._id,
            email: user.email,
            role: user.role,
        };

        const tokenUser = JWT.sign(tokenPayload, config.SECRETKEY, { expiresIn: "1h" });
        const refreshToken = JWT.sign({ id: user._id }, config.SECRETKEY, { expiresIn: '7d' });

        await userModel.findByIdAndUpdate(user._id, { refreshToken });
        // 4. Trả dữ liệu cho client
        res.status(200).json({
            status: 200,
            message: "Đăng nhập thành công",
            data: {
                id: user._id,
                email: user.email,
                token: tokenUser,
                refreshToken,
                fcmTokens: user.fcmTokens || [],
                role: user.role
            }
        });

    } catch (err) {
        console.error('Google login error:', err);
        res.status(401).json({ message: 'Xác thực Google thất bại' });
    }
};