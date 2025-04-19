var express = require('express');
var router = express.Router();
const { getSimilarEvents } = require("./contentBased");
const { recommendEvents } = require("./collaborative");
const client = require("../redis/redisClient")

async function hybridRecommendation(userId, eventId, alpha = 0.5) {
    const cfKey = `cf:${userId}`;
    const cbfKey = `cbf:${eventId}`;

    let cfEvents = JSON.parse(await client.get(cfKey));
    let cbfEvents = JSON.parse(await client.get(cbfKey));

    if (!cfEvents) {
        cfEvents = await recommendEvents(userId, 5);
        client.setex(cfKey, 86400, JSON.stringify(cfEvents)); // Cache 24h
    }

    if (!cbfEvents) {
        cbfEvents = await getSimilarEvents(eventId, 5);
        client.setex(cbfKey, 86400, JSON.stringify(cbfEvents)); // Cache 24h
    }
    const scores = {};

    // Gán trọng số cho Content-Based Filtering
    cbfEvents.forEach((e, idx) => (scores[e] = alpha * (5 - idx)));

    // Gán trọng số cho Collaborative Filtering
    cfEvents.forEach((e, idx) => {
        scores[e.eventId] = (scores[e.eventId] || 0) + (1 - alpha) * (5 - idx);
    });

    // Sắp xếp theo điểm số giảm dần
    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .map(e => e[0])
        .slice(0, 5);
}
module.exports = { hybridRecommendation };