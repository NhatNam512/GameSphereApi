const express = require("express");
const redisClient = require("../redis/redisClient");
const { hybridRecommendation } = require("../service/hydrid");
var router = express.Router();

router.get("/:userId/:eventId", async (req, res) => {
    try {
        const { userId, eventId } = req.params;
        const key = `recommend:${userId}`; // Key Redis để lưu cache

        redisClient.get(key, async (err, cached) => {
            if (cached) return res.json(JSON.parse(cached)); // Nếu có cache, trả về ngay

            const recommendations = await hybridRecommendation(userId, eventId);
            redisClient.setex(key, 3600, JSON.stringify(recommendations)); // Lưu cache trong 1 giờ

            res.status(200).json({
                status: true,
                message: "Lấy danh sách sự kiện thành công",
                data:
                    recommendations
            });

        });
    } catch (e) {
        res.status(400).json({ status: false, message: "Error" + e });
    }
})

module.exports = router;