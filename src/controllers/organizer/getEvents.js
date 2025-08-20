const eventModel = require("../../models/events/eventModel");
const showtimeModel = require("../../models/events/showtimeModel");
const seatBookingModel = require("../../models/events/seatBookingModel");
const zoneModel = require("../../models/events/zoneModel");
const ZoneTicket = require("../../models/events/zoneTicketModel");

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

// Hàm tính toán số lượng vé đã bán theo từng loại cho mỗi showtime
async function calculateTicketSalesByType(event, showtime, zones, tickets, orders) {
	const showtimeId = showtime._id.toString();
	const showtimeTickets = tickets.filter(t => t.showtimeId?.toString() === showtimeId);
	const showtimeOrders = orders.filter(o => o.showtimeId?.toString() === showtimeId);
	
	const result = {
		totalSold: 0,
		byType: { none: 0, seat: 0, zone: 0 }
	};

	// Đếm theo loại booking (none, seat, zone)
	showtimeOrders.forEach(order => {
		if (order.bookingType === 'none') result.byType.none += order.amount || 0;
		else if (order.bookingType === 'seat') result.byType.seat += order.amount || 0;
		else if (order.bookingType === 'zone') result.byType.zone += order.amount || 0;
		result.totalSold += order.amount || 0;
	});

	// Trường hợp event theo zone: trả về mảng zones, không bao bọc theo zoneId
	if (event.typeBase === 'zone') {
		const zoneTickets = zones.filter(z => z.showtimeId?.toString() === showtimeId);
		const zonesArray = zoneTickets.map(z => {
			const zoneId = z._id.toString();
			const sold = showtimeTickets.filter(t => t.zone && t.zone.zoneId?.toString() === zoneId).length;
			const total = z.totalTicketCount || 0;
			return {
				zoneId,
				zoneName: z.name || `Zone ${zoneId.slice(-4)}`,
				totalTickets: total,
				soldTickets: sold,
				availableTickets: Math.max(0, total - sold),
				price: z.price || event.ticketPrice || 0
			};
		});
		result.zones = zonesArray;
	}

	// Trường hợp event theo seat: nhóm theo area (suy ra area từ seatId)
	if (event.typeBase === 'seat') {
		const seatZones = zones.filter(z => z.eventId?.toString() === event._id.toString());

		// Map seatId -> area và đồng thời tính tổng số ghế theo area
		const seatIdToArea = new Map();
		const areaMap = new Map(); // area -> { area, totalSeats, soldSeats }
		seatZones.forEach(zone => {
			const seats = Array.isArray(zone.layout?.seats) ? zone.layout.seats : [];
			seats
				.filter(seat => seat.seatId && seat.seatId !== 'none')
				.forEach(seat => {
					const areaName = seat.area || 'Khác';
					seatIdToArea.set(seat.seatId, areaName);
					if (!areaMap.has(areaName)) {
						areaMap.set(areaName, { area: areaName, totalSeats: 0, soldSeats: 0 });
					}
					areaMap.get(areaName).totalSeats += 1;
				});
		});

		// Đếm số ghế đã bán theo area dựa vào seatId trong ticket
		const countedSeatIds = new Set();
		showtimeTickets.forEach(t => {
			const seatId = t.seat?.seatId;
			if (!seatId || countedSeatIds.has(seatId)) return;
			const areaName = seatIdToArea.get(seatId) || 'Khác';
			if (!areaMap.has(areaName)) {
				areaMap.set(areaName, { area: areaName, totalSeats: 0, soldSeats: 0 });
			}
			areaMap.get(areaName).soldSeats += 1;
			countedSeatIds.add(seatId);
		});

		result.areas = Array.from(areaMap.values()).map(a => ({
			area: a.area,
			totalSeats: a.totalSeats,
			soldSeats: a.soldSeats,
			availableSeats: Math.max(0, a.totalSeats - a.soldSeats)
		}));
	}

	// Với type 'none' không cần thêm zones/areas
	return result;
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

    // 1. Lấy tất cả events của user
    const events = await eventModel.find({ userId }).select("_id name typeBase timeStart timeEnd ticketPrice avatar location location_map createdAt approvalStatus approvalReason").lean();
    const eventIds = events.map(e => e._id);

    // 2. Lấy tất cả showtimes, zones, zoneTickets, seatBookings, tickets, orders cho các event này
    const [allShowtimes, allZones, allZoneTickets, allSeatBookings, allTickets, allOrders] = await Promise.all([
      showtimeModel.find({ eventId: { $in: eventIds } }).select("_id eventId startTime endTime ticketPrice ticketQuantity soldTickets").lean(),
      zoneModel.find({ eventId: { $in: eventIds } }).lean(),
      ZoneTicket.find({ eventId: { $in: eventIds } }).lean(),
      seatBookingModel.find({ eventId: { $in: eventIds }, status: 'booked' }).select("eventId showtimeId seats").lean(),
      require('../../models/events/ticketModel').find({ eventId: { $in: eventIds }, status: { $in: ['issued', 'used'] } }).lean(),
      require('../../models/events/orderModel').find({ eventId: { $in: eventIds }, status: 'paid' }).select('eventId showtimeId totalPrice createdAt amount bookingType').lean(),
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
      
      // Tính toán ticket sales theo loại cho từng showtime
      const showtimesWithDetails = await Promise.all(showtimesWithTickets.map(async (st) => {
        const ticketSalesByType = await calculateTicketSalesByType(
          event, 
          st, 
          event.typeBase === 'zone' ? allZoneTickets : zones, 
          allTickets, 
          allOrders
        );
        
        return {
          ...st,
          revenue: revenueMap[st._id?.toString()] || 0,
          ticketSalesByType
        };
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
        showtimes: showtimesWithDetails,
        totalTicketsEvent,
        soldTickets: eventSoldTickets,
        revenueByShowtime,
        eventTotalRevenue,
        revenueByDay,
        revenueByMonth,
        revenueByYear,
        // Thông tin trạng thái duyệt
        approval: {
          status: event.approvalStatus || 'pending',
          reason: event.approvalReason || '',
          statusText: getApprovalStatusText(event.approvalStatus)
        }
      };
    }));

    // Tổng doanh thu theo ngày, tháng, năm cho tất cả event
    const totalRevenueByDay = groupRevenueByDate(allOrders, 'day');
    const totalRevenueByMonth = groupRevenueByDate(allOrders, 'month');
    const totalRevenueByYear = groupRevenueByDate(allOrders, 'year');

    // Thống kê trạng thái duyệt
    const approvalStats = {
      pending: events.filter(e => e.approvalStatus === 'pending').length,
      approved: events.filter(e => e.approvalStatus === 'approved').length,
      rejected: events.filter(e => e.approvalStatus === 'rejected').length,
      total: events.length
    };

    const response = {
      status: 200,
      totalTicketsSold,
      totalRevenue,
      events: eventsWithDetails,
      totalRevenueByDay,
      totalRevenueByMonth,
      totalRevenueByYear,
      approvalStats
    };
    res.status(200).json(response);
  } catch (e) {
    console.error("❌ getEvents error:", e);
    res.status(400).json({ status: false, message: "Error: " + e.message });
  }
};

// Helper function để trả về text hiển thị cho trạng thái duyệt
const getApprovalStatusText = (status) => {
  const statusMap = {
    'pending': 'Chờ duyệt',
    'approved': 'Đã duyệt',
    'rejected': 'Bị từ chối'
  };
  return statusMap[status] || 'Không xác định';
};



