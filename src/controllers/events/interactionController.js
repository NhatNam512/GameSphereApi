const dayjs = require('dayjs');
const Interaction = require('../../models/events/interactionModel');
const redis = require('../../redis/redisClient');

exports.createInteraction = async (req, res) => {
    try {
        const userId = req.user.id;
        const { eventId, type } = req.body;
        const SCORE_MAP = { view: 1, like: 2, join: 3, rate: 2, share: 3 };
        const value = SCORE_MAP[type] || 1;

        let interaction;
        let isNew = false;

        if (type === 'view') {
            const today = dayjs().format('YYYY-MM-DD');
            const existing = await Interaction.findOne({ userId, eventId, type, date: today });

            if (existing) {
                existing.value += 1;
                interaction = await existing.save();
            } else {
                interaction = new Interaction({ userId, eventId, type, value, date: today });
                await interaction.save();
                isNew = true;
            }
        } else {
            const existing = await Interaction.findOne({ userId, eventId, type });
            if (existing) {
                existing.createdAt = new Date(); // Cập nhật timestamp để TTL reset
                interaction = await existing.save();
            } else {
                interaction = new Interaction({ userId, eventId, type, value });
                await interaction.save();
                isNew = true;
            }
        }

        await redis.xAdd('event_view', '*', {
            userId,
            eventId,
            type,
            value: value.toString(), // Redis chỉ nhận string
            date: interaction.date || '', // view thì có, loại khác thì không
            timestamp: new Date().toISOString()
        });

        res.status(200).json({ message: isNew ? 'Interaction saved' : 'Interaction updated', interaction });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEventTotalScores = async (req, res) => {
    const fromDate = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const limit = parseInt(req.query.limit) || 10;

    const result = await Interaction.aggregate([
        { $match: { date: { $gte: fromDate } } },
        {
            $group: {
                _id: '$eventId',
                totalScore: { $sum: '$value' }
            }
        },
        {
            $addFields: {
                eventIdObj: {
                    $convert: {
                        input: '$_id',
                        to: 'objectId',
                        onError: null,
                        onNull: null
                    }
                }
            }
        },
        {
            $lookup: {
                from: 'events',
                localField: 'eventIdObj',
                foreignField: '_id',
                as: 'event'
            }
        },
        { $unwind: '$event' },
        { $sort: { totalScore: -1 } },
        { $limit: limit },
        {
            $project: {
                _id: 0,
                eventId: '$_id',
                totalScore: 1,
                name: '$event.name',
                timeStart: '$event.timeStart',
                timeEnd: '$event.timeEnd',
                avatar: '$event.avatar',
                categories: '$event.categories',
                tags: '$event.tags',
                ticketPrice: '$event.ticketPrice',
                ticketQuantity: '$event.ticketQuantity',
            }
        }
    ]);

    res.json(result);
};


