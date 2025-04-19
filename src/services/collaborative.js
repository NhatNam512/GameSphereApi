const tf = require("@tensorflow/tfjs");
const redis = require("../redis/redisClient")

const userEventMatrix = tf.tensor2d([
    //User \ Event  event1
    //user0           5 
    [5, 3, 0, 1],
    [4, 0, 0, 1],
    [1, 1, 0, 5],
    [0, 0, 5, 4],
]);
async function updateSVDMatrix() {
    const { u, s, v } = tf.svd(userEventMatrix);

    await redis.set("svd_u", JSON.stringify(u.arraySync()));
    await redis.set("svd_v", JSON.stringify(v.arraySync()));

    console.log("✅ SVD Matrix updated in Redis!");
}
async function recommendEvents(userIndex, topN = 5) {
    // Tính toán SVD (Singular Value Decomposition)
    //U (user embedding): Đại diện sở thích của người dùng.
    //S (độ quan trọng của từng thành phần).
    //V (event embedding): Đại diện đặc điểm của sự kiện.
    const uMatrix = JSON.parse(await redis.get("svd_u"));
    const vMatrix = JSON.parse(await redis.get("svd_v"));

    if (!uMatrix || !vMatrix) {
        console.error("❌ SVD Matrix not found in Redis. Please run updateSVDMatrix() first.");
        return [];
    }
    const userPreferences = tf.tensor(uMatrix).slice([userIndex, 0], [1, -1]).flatten();
    const eventScores = userPreferences.dot(tf.tensor(vMatrix)).arraySync();
    // Quy trình:
    // Trích xuất đặc trưng người dùng từ U.
    // Nhân với V để tính toán điểm phù hợp với sự kiện.
    return eventScores.map((score, index) => ({ eventId: `event_${index + 1}`, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
}
recommendEvents(0).then(console.log);
module.exports = { recommendEvents };