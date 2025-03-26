const Redis = require("ioredis");

const redis = new Redis({
    host: "redis-16250.c322.us-east-1-2.ec2.redns.redis-cloud.com", // hoặc dùng "localhost"
    port: 16250, // cổng mặc định của Redis
    password: "1jvdQTrZIrlRhloE8spmP5QGGNlUpCBw", // Nếu Redis có mật khẩu, nhập vào đây
});

redis.on("connect", () => {
    console.log("✅ Kết nối Redis thành công!");
  });
  
  redis.on("error", (err) => {
    console.error("❌ Lỗi Redis:", err);
  });
  
  module.exports = redis;