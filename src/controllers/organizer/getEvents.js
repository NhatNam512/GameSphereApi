const eventModel = require("../../models/events/eventModel");
const showtimeModel = require("../../models/events/showtimeModel");
const seatBookingModel = require("../../models/events/seatBookingModel");
const zoneModel = require("../../models/events/zoneModel");
const ZoneTicket = require("../../models/events/zoneTicketModel");
const redisClient = require('../../redis/redisClient');

// Helper: Group array by key
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key]?.toString();
    if (!k) return acc;
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

async function getShowtimesWithTickets(event, showtimes, zones, zoneTicketsMap) {
  let seatTotal = 0;
  const zoneMap = new Map();
  const seatPriceMap = new Map();

  zones.forEach(zone => {
    const zoneId = zone._id?.toString();
    if (!zoneId) return;
    zoneMap.set(zoneId, zone);
    if (event.typeBase === 'seat') {
      const seats = zone.layout?.seats || [];
      // Không tính ghế có seatId là "none"
      const validSeats = seats.filter(seat => seat.seatId && seat.seatId !== 'none');
      seatTotal += validSeats.length;
      seatPriceMap.set(zoneId, Object.fromEntries(validSeats.map(s => [s.seatId, s.price || event.ticketPrice || 0])));
    }
  });

  const showtimesWithTickets = showtimes.map((showtime) => {
    let totalTickets = 0;
    if (event.typeBase === 'zone') {
      const zoneTickets = zoneTicketsMap[showtime._id.toString()] || [];
      totalTickets = zoneTickets.reduce((sum, z) => sum + (z.totalTicketCount || 0), 0);
    } else if (event.typeBase === 'seat') {
      totalTickets = seatTotal;
    } else if (event.typeBase === 'none') {
      totalTickets = showtime.ticketQuantity || 0;
    }
    return { ...showtime, totalTickets };
  });

  return { showtimesWithTickets, zoneMap, seatPriceMap };
}

function calculateRevenueByShowtime(event, showtimes, ordersByShowtime) {
  return showtimes.map((showtime) => {
    const orders = ordersByShowtime[showtime._id.toString()] || [];
    const showtimeRevenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    return {
      showtimeId: showtime._id,
      soldTickets: orders.reduce((sum, o) => sum + (o.amount || 0), 0),
      revenue: showtimeRevenue,
    };
  });
}

// Helper: Group revenue by day, month, year
function groupRevenueByDate(orders, type = 'day') {
  // type: 'day' | 'month' | 'year'
  const formatDate = (date) => {
    const d = new Date(date);
    if (type === 'year') return d.getFullYear();
    if (type === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // default: day
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return orders.reduce((acc, order) => {
    const key = formatDate(order.createdAt);
    acc[key] = (acc[key] || 0) + (order.totalPrice || 0);
    return acc;
  }, {});
}

exports.getEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `getEvents:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    // 1. Lấy tất cả events của user
    const events = await eventModel.find({ userId }).select("_id name typeBase timeStart timeEnd ticketPrice avatar location location_map").lean();
    const eventIds = events.map(e => e._id);

    // 2. Lấy tất cả showtimes, zones, zoneTickets, seatBookings, tickets, orders cho các event này
    const [allShowtimes, allZones, allZoneTickets, allSeatBookings, allTickets, allOrders] = await Promise.all([
      showtimeModel.find({ eventId: { $in: eventIds } }).select("_id eventId startTime endTime ticketPrice ticketQuantity soldTickets").lean(),
      zoneModel.find({ eventId: { $in: eventIds } }).lean(),
      ZoneTicket.find({ eventId: { $in: eventIds } }).lean(),
      seatBookingModel.find({ eventId: { $in: eventIds }, status: 'booked' }).select("eventId showtimeId seats").lean(),
      require('../../models/events/ticketModel').find({ eventId: { $in: eventIds }, status: { $in: ['issued', 'used'] } }).lean(),
      require('../../models/events/orderModel').find({ eventId: { $in: eventIds }, status: 'paid' }).select('eventId showtimeId totalPrice createdAt').lean(),
    ]);

    // 3. Group lại theo eventId/showtimeId
    const showtimesByEvent = groupBy(allShowtimes, 'eventId');
    const zonesByEvent = groupBy(allZones, 'eventId');
    const zoneTicketsByShowtime = groupBy(allZoneTickets, 'showtimeId');
    const seatBookingsByShowtime = groupBy(allSeatBookings, 'showtimeId');
    const ticketsByShowtime = groupBy(allTickets, 'showtimeId');
    const ordersByShowtime = groupBy(allOrders, 'showtimeId');
    const ordersByEvent = groupBy(allOrders, 'eventId');

    let totalTicketsSold = 0, totalRevenue = 0;

    const eventsWithDetails = await Promise.all(events.map(async (event) => {
      const showtimes = showtimesByEvent[event._id.toString()] || [];
      const zones = zonesByEvent[event._id.toString()] || [];
      const { showtimesWithTickets, zoneMap, seatPriceMap } = await getShowtimesWithTickets(event, showtimes, zones, zoneTicketsByShowtime);
      const eventSoldTickets = showtimes.reduce((sum, s) => sum + (s.soldTickets || 0), 0);
      const totalTicketsEvent = showtimesWithTickets.reduce((sum, s) => sum + (s.totalTickets || 0), 0);
      const revenueByShowtime = calculateRevenueByShowtime(event, showtimes, ordersByShowtime);
      const eventTotalRevenue = Array.isArray(revenueByShowtime) ? revenueByShowtime.reduce((sum, s) => sum + s.revenue, 0) : 0;

      // Map showtimeId -> revenue
      const revenueMap = {};
      if (Array.isArray(revenueByShowtime)) {
        revenueByShowtime.forEach(r => {
          revenueMap[r.showtimeId?.toString()] = r.revenue;
        });
      }
      // Gắn revenue vào từng showtime
      const showtimesWithRevenue = showtimesWithTickets.map(st => ({
        ...st,
        revenue: revenueMap[st._id?.toString()] || 0
      }));

      // Doanh thu theo ngày, tháng, năm cho từng event
      const eventOrders = ordersByEvent[event._id.toString()] || [];
      const revenueByDay = groupRevenueByDate(eventOrders, 'day');
      const revenueByMonth = groupRevenueByDate(eventOrders, 'month');
      const revenueByYear = groupRevenueByDate(eventOrders, 'year');

      totalTicketsSold += eventSoldTickets;
      totalRevenue += eventTotalRevenue;
      return {
        ...event,
        showtimes: showtimesWithRevenue,
        totalTicketsEvent,
        soldTickets: eventSoldTickets,
        revenueByShowtime,
        eventTotalRevenue,
        revenueByDay,
        revenueByMonth,
        revenueByYear
      };
    }));

    // Tổng doanh thu theo ngày, tháng, năm cho tất cả event
    const totalRevenueByDay = groupRevenueByDate(allOrders, 'day');
    const totalRevenueByMonth = groupRevenueByDate(allOrders, 'month');
    const totalRevenueByYear = groupRevenueByDate(allOrders, 'year');

    const response = {
      status: 200,
      totalTicketsSold,
      totalRevenue,
      events: eventsWithDetails,
      totalRevenueByDay,
      totalRevenueByMonth,
      totalRevenueByYear
    };
    await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 300);
    res.status(200).json(response);
  } catch (e) {
    console.error("❌ getEvents error:", e);
    res.status(400).json({ status: false, message: "Error: " + e.message });
  }
};


