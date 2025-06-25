const Event = require('../../models/events/eventModel');
const Interaction = require('../../models/events/interactionModel');
const User = require('../../models/userModel');
const redis = require('../../redis/redisClient');
const zoneModel = require('../../models/events/zoneModel');
const zoneTicketModel = require('../../models/events/zoneTicketModel');
const showtimeModel = require('../../models/events/showtimeModel');

// Hàm enrich event data giống như ở /home
async function enrichEventData(events) {
  return await Promise.all(events.map(async (ev) => {
    // Lấy latitude/longitude từ location_map nếu có
    if (ev.location_map && ev.location_map.coordinates) {
      ev.longitude = ev.location_map.coordinates[0];
      ev.latitude = ev.location_map.coordinates[1];
    }

    let ticketPrices = [];

    if (ev.typeBase === 'seat') {
      const zones = await zoneModel.find({ eventId: ev._id }).select('layout.seats.price');
      zones.forEach(zone => {
        if (zone && zone.layout && zone.layout.seats) {
          const currentZonePrices = zone.layout.seats.map(seat => seat.price).filter(price => price !== undefined && price !== null);
          ticketPrices.push(...currentZonePrices);
        }
      });
    } else if (ev.typeBase === 'zone') {
      const zoneTickets = await zoneTicketModel.find({ eventId: ev._id }).select('price');
      ticketPrices = zoneTickets.map(t => t.price).filter(price => price !== undefined && price !== null);
    } else if (ev.typeBase === 'none') {
      const showtimes = await showtimeModel.find({ eventId: ev._id }).select("ticketPrice");
      ticketPrices = showtimes.map(st => st.ticketPrice).filter(price => price !== undefined && price !== null);
    }

    if (ticketPrices.length > 0) {
      ev.minTicketPrice = Math.min(...ticketPrices);
      ev.maxTicketPrice = Math.max(...ticketPrices);
    } else {
      ev.minTicketPrice = null;
      ev.maxTicketPrice = null;
    }
    return ev;
  }));
}

exports.getRecommendedEvents = async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Giới hạn tối đa 50
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const skip = (page - 1) * limit;
  const cacheKey = `recommend:${userId}:v1:${page}:${limit}`;
  const now = new Date();
  const startTime = Date.now();

  try {
    // Kiểm tra cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=cache`);
      return res.json(JSON.parse(cached));
    }

    // Lấy thông tin user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const interactions = await Interaction.find({ userId });

    // 👉 COLD START
    if (interactions.length === 0) {
      let query = {
        status: 'active',
        startDate: { $gt: now },
        ticketsAvailable: { $gt: 0 }
      };

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

      const events = await Event.find(query).skip(skip).limit(limit);
      const enrichedEvents = await enrichEventData(events);
      const response = { from: 'cold-start', events: enrichedEvents };
      await redis.set(cacheKey, JSON.stringify(response), 'EX', 60 * 5); // Cache 5 phút
      console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=cold-start`);
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

    let query = {
      tags: { $in: Array.from(tagSet) },
      _id: { $nin: seenEventIds },
      status: 'active',
      startDate: { $gt: now },
      ticketsAvailable: { $gt: 0 }
    };

    const recommended = await Event.find(query).skip(skip).limit(limit);
    const enrichedRecommended = await enrichEventData(recommended);
    const response = { from: 'personalized', events: enrichedRecommended };
    await redis.set(cacheKey, JSON.stringify(response), 'EX', 60 * 5);
    console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=personalized`);
    return res.json({
      status: 200,
      data: response
    });

  } catch (err) {
    // Fallback: recommend event phổ biến còn hoạt động
    try {
      const fallbackEvents = await Event.find({
        status: 'active',
        startDate: { $gt: now },
        ticketsAvailable: { $gt: 0 }
      }).sort({ popularity: -1 }).limit(limit);
      const enrichedFallback = await enrichEventData(fallbackEvents);
      const response = { from: 'fallback', events: enrichedFallback };
      console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=fallback`);
      return res.json({ status: 200, data: response });
    } catch (fallbackErr) {
      return res.status(500).json({ error: err.message });
    }
  }
};
