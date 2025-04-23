const Event = require('../../models/events/eventModel');
const Interaction = require('../../models/events/interactionModel');
const User = require('../../models/userModel');

exports.getRecommendedEvents = async (req, res) => {
  try {
    const userId = req.user.id; // Lấy từ middleware auth
    const limit = parseInt(req.query.limit) || 10;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const interactions = await Interaction.find({ userId });

    // 👉 Nếu user mới
    if (interactions.length === 0) {
      let query = {};

      // Ưu tiên theo tag
      if (user.tags?.length) {
        query.tags = { $in: user.tags };
      }

      // Ưu tiên theo vị trí nếu có
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
      return res.json({ from: 'cold-start', events });
    }

    // Nếu user có tương tác
    const topInteractions = await Interaction.aggregate([
      { $match: { userId } },
      { $group: { _id: '$eventId', total: { $sum: '$value' } } },
      { $sort: { total: -1 } },
      { $limit: 3 }
    ]);

    const eventIds = topInteractions.map(i => i._id);
    const topEvents = await Event.find({ _id: { $in: eventIds } });

    // Gom tags từ topEvents
    const tagSet = new Set();
    topEvents.forEach(ev => ev.tags?.forEach(tag => tagSet.add(tag)));

    // Tránh gợi ý lại event đã xem
    const seenEventIds = interactions.map(i => i.eventId);

    // Gợi ý theo tag trùng
    const recommended = await Event.find({
      tags: { $in: Array.from(tagSet) },
      _id: { $nin: seenEventIds }
    }).limit(limit);

    return res.json({ from: 'personalized', events: recommended });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
