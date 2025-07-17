const { OAuth2Client } = require('google-auth-library');
const JWT = require('jsonwebtoken');
const User = require('../../models/userModel');
const userModel = require('../../models/userModel');
const config = require("../../utils/tokenConfig");
const client = new OAuth2Client('518691740711-hpgf2l7sj9ec9f0uh8695ov0lnfoscka.apps.googleusercontent.com'); // your webClientId

exports.googleLogin = async (req, res) => {
    const { idToken } = req.body; // Đổi từ 'token' sang 'idToken' để phù hợp với client side

    try {
        // 1. Verify Google ID token
        const ticket = await client.verifyIdToken({
            idToken: idToken, // Sử dụng idToken
            audience: '518691740711-hpgf2l7sj9ec9f0uh8695ov0lnfoscka.apps.googleusercontent.com',
        });

        const payload = ticket.getPayload();
        const { email, name, photo, sub: googleId } = payload;

        // 2. Tìm hoặc tạo user
        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                username: name,
                email: email,
                picUrl: photo,
                role: 3, // mặc định là người dùng thường
                // provider: 'google',
            });
            await user.save();
        }

        // 3. Tạo token và refresh token
        const tokenPayload = {
            id: user._id,
            email: user.email,
            role: user.role,
        };

        const tokenUser = JWT.sign(tokenPayload, config.SECRETKEY, { expiresIn: "1h" });
        const refreshToken = JWT.sign({ id: user._id }, config.SECRETKEY, { expiresIn: '7d' });

        // Cập nhật refreshToken vào user trong DB (Nếu có trường refreshToken trong UserModel)
        // Đảm bảo userModel được import hoặc bạn đang sử dụng User model trực tiếp
        await User.findByIdAndUpdate(user._id, { refreshToken }); // Đổi userModel thành User

        // 4. Trả dữ liệu cho client
        res.status(200).json({
            status: 200,
            message: "Đăng nhập thành công",
            data: {
                id: user._id,
                email: user.email,
                token: tokenUser,
                refreshToken,
                fcmTokens: user.fcmTokens || [], // Đảm bảo trường fcmTokens tồn tại trong model User
                role: user.role,
                tags: user.tags
            }
        });

    } catch (err) {
        console.error('Google login error:', err);
        res.status(401).json({ message: 'Xác thực Google thất bại' });
    }
};