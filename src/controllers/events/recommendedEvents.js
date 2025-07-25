const Event = require('../../models/events/eventModel');
const Interaction = require('../../models/events/interactionModel');
const User = require('../../models/userModel');
const redis = require('../../redis/redisClient');
const zoneModel = require('../../models/events/zoneModel');
const zoneTicketModel = require('../../models/events/zoneTicketModel');
const showtimeModel = require('../../models/events/showtimeModel');

/**
 * Làm giàu dữ liệu event (thêm min/max giá vé, toạ độ...)
 */
async function enrichEventData(events) {
  return await Promise.all(events.map(async (ev) => {
    // Gán toạ độ nếu có
    if (ev.location_map?.coordinates) {
      [ev.longitude, ev.latitude] = ev.location_map.coordinates;
    }

    let ticketPrices = [];

    // Lấy tất cả giá vé của event
    if (ev.typeBase === 'seat') {
      const zones = await zoneModel.find({ eventId: ev._id }).select('layout.seats.price');
      zones.forEach(zone => {
        if (zone?.layout?.seats) {
          const prices = zone.layout.seats.map(seat => seat.price).filter(price => price != null);
          ticketPrices.push(...prices);
        }
      });
    } else if (ev.typeBase === 'zone') {
      const zoneTickets = await zoneTicketModel.find({ eventId: ev._id }).select('price');
      ticketPrices = zoneTickets.map(t => t.price).filter(price => price != null);
    } else if (ev.typeBase === 'none') {
      const showtimes = await showtimeModel.find({ eventId: ev._id }).select("ticketPrice");
      ticketPrices = showtimes.map(st => st.ticketPrice).filter(price => price != null);
    }

    // Gán giá min/max nếu có
    ev.minTicketPrice = ticketPrices.length ? Math.min(...ticketPrices) : null;
    ev.maxTicketPrice = ticketPrices.length ? Math.max(...ticketPrices) : null;

    return ev;
  }));
}

/**
 * Tạo truy vấn tìm kiếm sự kiện dựa vào user (cho cold start)
 */
function buildColdStartQuery(user, now) {
  let query = {
    status: 'active',
    startDate: { $gt: now },
    ticketsAvailable: { $gt: 0 }
  };
  if (user.tags?.length) query.tags = { $in: user.tags };
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
  return query;
}

/**
 * Lấy tất cả tag liên quan user
 */
function collectUserTags(user, topEvents) {
  const tagSet = new Set();
  topEvents.forEach(ev => ev.tags?.forEach(tag => tagSet.add(tag)));
  if (user.tags?.length) user.tags.forEach(tag => tagSet.add(tag));
  return Array.from(tagSet);
}

/**
 * Đếm số lượng tag trùng giữa event và user
 */
function countMatchingTags(eventTags, userTags) {
  if (!eventTags || !userTags) return 0;
  return eventTags.filter(tag => userTags.includes(tag)).length;
}

/**
 * Hàm API gợi ý sự kiện cho user
 */
exports.getRecommendedEvents = async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const skip = (page - 1) * limit;
  const cacheKey = `recommend:${userId}:v1:${page}:${limit}`;
  const now = new Date();
  const startTime = Date.now();

  try {
    // 1. Kiểm tra cache Redis
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=cache`);
      return res.json(JSON.parse(cached));
    }

    // 2. Lấy user & interaction
    const user = await User.findById(userId);

    const interactions = await Interaction.find({ userId });
    console.log("Interactions:", interactions);

    // 3. Cold start nếu user chưa có lịch sử
    if (interactions.length === 0) {
      const events = await Event.find(buildColdStartQuery(user, now))
        .select("_id name timeStart timeEnd avatar banner categories location latitude longitude location_map typeBase zone tags")
        .skip(skip).limit(limit).lean();
      const enrichedEvents = await enrichEventData(events);
      // Thêm showtimes cho từng event
      for (const ev of enrichedEvents) {
        ev.showtimes = await showtimeModel.find({ eventId: ev._id }).select("startTime endTime ticketPrice ticketQuantity");
      }
      const response = { from: 'cold-start', events: enrichedEvents };
      await redis.set(cacheKey, JSON.stringify(response), 'EX', 60 * 5);
      console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=cold-start`);
      return res.json({ status: 200, data: response });
    }

    // 4. Personalized: Lấy top events từng tương tác nhất
    const topInteractions = await Interaction.aggregate([
      { $match: { userId } },
      { $group: { _id: '$eventId', total: { $sum: '$value' } } },
      { $sort: { total: -1 } },
      { $limit: 3 }
    ]);
    const eventIds = topInteractions.map(i => i._id);
    const topEvents = await Event.find({ _id: { $in: eventIds } });
    const tags = collectUserTags(user, topEvents);
    const seenEventIds = interactions.map(i => i.eventId);

    // 5. Query sự kiện gợi ý
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
    console.log("Event query:", query);

    const recommended = await Event.find(query)
      .select("_id name timeStart timeEnd avatar banner categories location latitude longitude location_map typeBase zone tags")
      .skip(skip).limit(limit).lean();
    // Sắp xếp các sự kiện có nhiều tag trùng với user lên đầu
    const userTags = user.tags || [];
    recommended.sort((a, b) =>
      countMatchingTags(b.tags, userTags) - countMatchingTags(a.tags, userTags)
    );
    // Thêm showtimes cho từng event
    const enrichedRecommended = await enrichEventData(recommended);
    for (const ev of enrichedRecommended) {
      ev.showtimes = await showtimeModel.find({ eventId: ev._id }).select("startTime endTime ticketPrice ticketQuantity");
    }
    const response = { from: 'personalized', events: enrichedRecommended };
    await redis.set(cacheKey, JSON.stringify(response), 'EX', 60 * 5);
    console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=personalized`);
    return res.json({ status: 200, data: response });

  } catch (err) {
    // 6. Fallback: Recommend các sự kiện phổ biến nếu có lỗi ở trên
    try {
      const fallbackEvents = await Event.find({
        startDate: { $gt: now },
      })
        .select("_id name timeStart timeEnd avatar banner categories location latitude longitude location_map typeBase zone tags")
        .sort({ popularity: -1 }).limit(limit).lean();

      const enrichedFallback = await enrichEventData(fallbackEvents);
      for (const ev of enrichedFallback) {
        ev.showtimes = await showtimeModel.find({ eventId: ev._id }).select("startTime endTime ticketPrice ticketQuantity");
      }
      const response = { from: 'fallback', events: enrichedFallback };
      console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=fallback`);
      return res.json({ status: 200, data: response });
    } catch (fallbackErr) {
      return res.status(500).json({ error: fallbackErr.message });
    }
  }
};
