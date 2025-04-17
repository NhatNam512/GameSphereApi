const Redis = require("ioredis");

const redis = new Redis({
    host: "redis-14461.c295.ap-southeast-1-1.ec2.redns.redis-cloud.com", // hoặc dùng "localhost"
    port: 14461, // cổng mặc định của Redis
    password: "oKGHyO3kTSC7NcaVmr0Rwn5FrB9yIXdj", // Nếu Redis có mật khẩu, nhập vào đây
});

redis.on("connect", () => {
    console.log("✅ Kết nối Redis thành công!");
  });
  
  redis.on("error", (err) => {
    console.error("❌ Lỗi Redis:", err);
  });
  
  module.exports = redis;