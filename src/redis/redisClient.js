const Redis = require("ioredis");
const serverConfig = require('../config/server')

const redis = new Redis({
  ...serverConfig.redis,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
});

redis.on("connect", () => {
  console.log("✅ Kết nối Redis thành công!");
});

redis.on("error", (err) => {
  console.error("❌ Lỗi Redis:", err);
});

redis.on("reconnecting", () => {
  console.log("🔄 Đang thử kết nối lại Redis...");
});

redis.on("close", () => {
  console.log("❌ Kết nối Redis đã đóng");
});

// Xử lý khi process kết thúc
process.on('SIGINT', async () => {
  await redis.quit();
  console.log("Redis connection closed.");
  process.exit(0);
});

// redisClient.js
redis.xAdd = (stream, id, data) => {
  const args = [stream, id];
  for (const [key, value] of Object.entries(data)) {
    args.push(key, value.toString());
  }
  return redis.xadd(...args);
};


module.exports = redis;