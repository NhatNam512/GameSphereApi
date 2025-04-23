const JWT = require("jsonwebtoken");
const tokenConfig = require("../utils/tokenConfig");
const userModel = require("../models/userModel");

const authenticate = async(req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
    
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res.status(401).json({ message: "Unauthorized: No token provided" });
        }
    
        const token = authHeader.split(" ")[1];
    
        // Xác minh token
        const decoded = JWT.verify(token, tokenConfig.SECRETKEY);
    
        // Lấy thông tin user từ DB (có thể bỏ nếu bạn chỉ cần id/email trong token)
        const user = await userModel.findById(decoded.id);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
    
        // Lưu thông tin user vào request để các route sau dùng
        req.user = {
          id: user._id,
          email: user.email
        };
    
        next();
      } catch (err) {
        res.status(401).json({ message: "Unauthorized: " + err.message });
      }
    };

module.exports = authenticate;
