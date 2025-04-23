// redis/streamConsumer.js
const redis = require('./redisClient');

async function consumeStream() {
    let lastId = '0'; // hoặc dùng '>' nếu chỉ muốn dữ liệu mới

    while (true) {
        const response = await redis.xRead(
            { key: 'event_interactions', id: lastId },
            { BLOCK: 5000, COUNT: 10 }
        );

        if (response) {
            for (const stream of response) {
                for (const message of stream.messages) {
                    const { userId, eventId, type, timestamp } = message.message;
                    console.log(`[Redis] ${userId} ${type} ${eventId} @ ${timestamp}`);
                    lastId = message.id;
                }
            }
        }
    }
}

consumeStream().catch(console.error);
