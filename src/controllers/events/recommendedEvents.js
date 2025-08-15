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
  const limit = 10; // Cố định lấy 10 sự kiện
  const cacheKey = `recommend:${userId}:v2`;
  const now = new Date();
  const startTime = Date.now();

  try {
    // 1. Kiểm tra cache Redis
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=cache`);
      return res.json(JSON.parse(cached));
    }

    // 2. Lấy thông tin user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 3. Lấy tất cả sự kiện sắp diễn ra
    const events = await Event.find({
      timeStart: { $gt: now } // Chỉ lấy sự kiện chưa diễn ra
    })
      .select("_id name timeStart timeEnd avatar banner categories location latitude longitude location_map typeBase zone tags")
      .lean();

    // 4. Tính điểm tag matching và sắp xếp
    const userTags = user.tags || [];
    const eventsWithScore = events.map(event => {
      const matchingTags = countMatchingTags(event.tags || [], userTags);
      return {
        ...event,
        matchingScore: matchingTags
      };
    });

    // 5. Sắp xếp theo số tag trùng khớp (cao nhất lên đầu) và lấy top 10
    const recommended = eventsWithScore
      .sort((a, b) => b.matchingScore - a.matchingScore)
      .slice(0, limit);

    // 6. Thêm showtimes và tính giá vé min/max cho từng event
    for (const ev of recommended) {
      ev.showtimes = await showtimeModel.find({ eventId: ev._id }).select("startTime endTime ticketPrice ticketQuantity");
      
      // Tính giá vé min/max giống như trong /home
      let ticketPrices = [];

      if (ev.typeBase === 'seat') {
        const zones = await zoneModel.find({ eventId: ev._id }).select('layout.seats.price');
        zones.forEach(zone => {
          if (zone?.layout?.seats) {
            const prices = zone.layout.seats
              .filter(seat => seat.price > 0) // Loại bỏ seat có price = 0
              .map(seat => seat.price)
              .filter(price => price !== undefined && price !== null);
            ticketPrices.push(...prices);
          }
        });
      } else if (ev.typeBase === 'zone') {
        const zoneTickets = await zoneTicketModel.find({ eventId: ev._id }).select('price');
        ticketPrices = zoneTickets
          .map(t => t.price)
          .filter(price => price > 0 && price !== undefined && price !== null); // Loại bỏ price = 0
      } else if (ev.typeBase === 'none') {
        const showtimes = await showtimeModel.find({ eventId: ev._id }).select("ticketPrice");
        ticketPrices = showtimes
          .map(st => st.ticketPrice)
          .filter(price => price > 0 && price !== undefined && price !== null); // Loại bỏ price = 0
      }
      
      if (ticketPrices.length > 0) {
        ev.minTicketPrice = Math.min(...ticketPrices);
        ev.maxTicketPrice = Math.max(...ticketPrices);
      } else {
        ev.minTicketPrice = null;
        ev.maxTicketPrice = null;
      }
      
      delete ev.matchingScore; // Xóa score khỏi response
    }

    const response = { 
      from: 'tag-based', 
      events: recommended,
      userTags: userTags
    };

    // Cache trong 5 phút
    await redis.set(cacheKey, JSON.stringify(response), 'EX', 60 * 5);
    
    console.log(`[Recommend] user=${userId} time=${Date.now() - startTime}ms source=tag-based events=${recommended.length}`);
    return res.json({ status: 200, data: response });

  } catch (err) {
    console.error('Error in getRecommendedEvents:', err);
    return res.status(500).json({ error: err.message });
  }
};
