const Event = require('../../models/events/eventModel');
const Interaction = require('../../models/events/interactionModel');
const User = require('../../models/userModel');
const redis = require('../../redis/redisClient');

exports.getRecommendedEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const cacheKey = `recommend:${userId}`;

    // Kiểm tra cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Lấy thông tin user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const interactions = await Interaction.find({ userId });

    // 👉 COLD START
    if (interactions.length === 0) {
      let query = {};

      if (user.tags?.length) {
        query.tags = { $in: user.tags };
      }

      if (user.location?.coordinates?.length) {
        query.location = {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: user.location.coordinates
            },
            $maxDistance: 20000 // 20km
          }
        };
      }

      const events = await Event.find(query).limit(limit);

      const response = { from: 'cold-start', events };
      await redis.set(cacheKey, JSON.stringify(response), 'EX', 60 * 5); // Cache 5 phút
      return res.json({
        status: 200,
        data: response
      });
    }

    const topInteractions = await Interaction.aggregate([
      { $match: { userId } },
      { $group: { _id: '$eventId', total: { $sum: '$value' } } },
      { $sort: { total: -1 } },
      { $limit: 3 }
    ]);

    const eventIds = topInteractions.map(i => i._id);
    const topEvents = await Event.find({ _id: { $in: eventIds } });

    const tagSet = new Set();
    topEvents.forEach(ev => ev.tags?.forEach(tag => tagSet.add(tag)));

    // Thêm tags của user vào tập hợp tags
    if (user.tags?.length) {
      user.tags.forEach(tag => tagSet.add(tag));
    }

    const seenEventIds = interactions.map(i => i.eventId);

    const recommended = await Event.find({
      tags: { $in: Array.from(tagSet) },
      _id: { $nin: seenEventIds }
    }).limit(limit);

    const response = { from: 'personalized', events: recommended };
    await redis.set(cacheKey, JSON.stringify(response), 'EX', 60 * 5);
    return res.json({
      status: 200,
      data: response
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
