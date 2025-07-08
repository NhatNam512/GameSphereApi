const eventModel = require("../../models/events/eventModel");
const showtimeModel = require("../../models/events/showtimeModel");
const seatBookingModel = require("../../models/events/seatBookingModel");
const zoneModel = require("../../models/events/zoneModel");
const ZoneTicket = require("../../models/events/zoneTicketModel");
const redisClient = require('../../redis/redisClient');
const SeatBooking = require('../../models/events/seatBookingModel');
const ZoneBooking = require('../../models/events/zoneBookingModel');
const mongoose = require('mongoose');

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

// Helper: Group revenue by day, month, year
function groupRevenueByDate(orders, type = 'day') {
  const formatDate = (date) => {
    const d = new Date(date);
    if (type === 'year') return d.getFullYear();
    if (type === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return orders.reduce((acc, order) => {
    const key = formatDate(order.createdAt);
    acc[key] = (acc[key] || 0) + (order.totalPrice || 0);
    return acc;
  }, {});
}

// GET /api/events/revenue
exports.getRevenue = async (req, res) => {
  try {
    // Không lọc theo userId nữa
    const cacheKey = `getRevenue:all`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    // 1. Lấy tất cả events
    const events = await eventModel.find().select("_id name typeBase timeStart timeEnd ticketPrice avatar").lean();
    const eventIds = events.map(e => e._id);

    // 2. Lấy tất cả orders cho các event này
    const allOrders = await require('../../models/events/orderModel').find({ eventId: { $in: eventIds }, status: 'paid' }).select('eventId amount totalPrice createdAt').lean();
    const ordersByEvent = groupBy(allOrders, 'eventId');

    // 2.1. Lấy tổng số vé đã bán và số vé đã bán mỗi ngày từ Order
    const soldMap = {};
    const soldByDayMap = {};
    allOrders.forEach(order => {
      const key = order.eventId.toString();
      const date = order.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      const amount = order.amount || 0;
      soldMap[key] = (soldMap[key] || 0) + amount;
      if (!soldByDayMap[key]) soldByDayMap[key] = {};
      soldByDayMap[key][date] = (soldByDayMap[key][date] || 0) + amount;
    });

    // 3. Tính doanh thu theo ngày, tháng, năm cho từng event
    const eventsRevenue = events.map(event => {
      const eventOrders = ordersByEvent[event._id.toString()] || [];
      // Số vé đã bán tổng
      const totalSold = soldMap[event._id.toString()] || 0;
      // Số vé đã bán theo ngày
      const soldByDay = soldByDayMap[event._id.toString()] || {};
      return {
        eventId: event._id,
        name: event.name,
        revenueByDay: groupRevenueByDate(eventOrders, 'day'),
        revenueByMonth: groupRevenueByDate(eventOrders, 'month'),
        revenueByYear: groupRevenueByDate(eventOrders, 'year'),
        totalSold,
        soldByDay
      };
    });

    // 4. Tổng doanh thu theo ngày, tháng, năm cho tất cả event
    const totalRevenueByDay = groupRevenueByDate(allOrders, 'day');
    const totalRevenueByMonth = groupRevenueByDate(allOrders, 'month');
    const totalRevenueByYear = groupRevenueByDate(allOrders, 'year');

    const response = {
      status: 200,
      eventsRevenue,
      totalRevenueByDay,
      totalRevenueByMonth,
      totalRevenueByYear
    };
    await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 300);
    res.status(200).json(response);
  } catch (e) {
    console.error("❌ getRevenue error:", e);
    res.status(400).json({ status: false, message: "Error: " + e.message });
  }
}; 