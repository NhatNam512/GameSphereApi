const mongoose = require('mongoose');
const ZoneTicket = require('../../models/events/zoneTicketModel');
const SeatBooking = require('../../models/events/seatBookingModel');
const ZoneBooking = require('../../models/events/zoneBookingModel');
const eventModel = require('../../models/events/eventModel');
const zoneModel = require('../../models/events/zoneModel');
const showtimeModel = require('../../models/events/showtimeModel');
const ticketModel = require('../../models/events/ticketModel');

exports.getAllTicketsByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await eventModel.findById(eventId);
    if (!event) {
      return res.status(404).json({ status: false, message: 'Không tìm thấy sự kiện.' });
    }

    let result = {
      eventId: event._id,
      eventName: event.name,
      typeBase: event.typeBase,
      tickets: [],
      soldTickets: []
    };

    let soldTicketsByZone = [];

    switch (event.typeBase) {
      case 'zone': {
        const zoneResult = await handleZoneTickets(eventId);
        result = { ...result, ...zoneResult };
        // Gộp soldTickets theo zoneName
        const zoneCountMap = {};
        for (const ticket of zoneResult.soldTickets) {
          const zone = ticket.zoneName || 'Unknown';
          zoneCountMap[zone] = (zoneCountMap[zone] || 0) + 1;
        }
        soldTicketsByZone = Object.entries(zoneCountMap).map(([zoneName, soldCount]) => ({ zoneName, soldCount }));
        break;
      }
      case 'seat': {
        // Build tickets trực tiếp từ layout của từng zone
        const zones = await zoneModel.find({ eventId });
        const seatResult = await handleSeatTickets(eventId);
        const soldTickets = seatResult.soldTickets;
        // Gộp tickets theo area
        const areaMap = {};
        for (const zone of zones) {
          for (const seat of (zone.layout?.seats || [])) {
            if (seat.seatId && seat.seatId !== 'none') {
              const area = seat.area || 'Unknown';
              if (!areaMap[area]) {
                areaMap[area] = {
                  area,
                  price: seat.price,
                  soldCount: 0,
                  total: 0
                };
              }
              areaMap[area].total += 1;
            }
          }
        }
        // Đếm số lượng đã bán cho từng area
        for (const sold of soldTickets) {
          // Tìm ticket theo seatId để lấy area
          let found = false;
          for (const zone of zones) {
            const seat = (zone.layout?.seats || []).find(s => s.seatId === sold.seatId);
            if (seat) {
              const area = seat.area || 'Unknown';
              areaMap[area].soldCount += 1;
              found = true;
              break;
            }
          }
        }
        const tickets = Object.values(areaMap);
        result = { ...result, tickets };
        // Gộp soldTickets theo zoneName (mapping từ seatId sang zoneName)
        const zoneCountMap = {};
        for (const sold of soldTickets) {
          let zoneName = 'Unknown';
          let seatId = sold.seatId || sold.seat?.seatId;
          if (seatId) {
            for (const zone of zones) {
              if (zone.layout?.seats?.some(s => s.seatId === seatId)) {
                zoneName = zone.name;
                break;
              }
            }
          }
          zoneCountMap[zoneName] = (zoneCountMap[zoneName] || 0) + 1;
        }
        soldTicketsByZone = Object.entries(zoneCountMap).map(([zoneName, soldCount]) => ({ zoneName, soldCount }));
        break;
      }
      case 'none': {
        result = { ...result, ...(await handleNoneTickets(eventId)) };
        break;
      }
    }

    // Thêm trường soldTicketsByZone nếu có
    if (soldTicketsByZone.length > 0) {
      result.soldTicketsByZone = soldTicketsByZone;
    }

    return res.json({ status: true, data: result });
  } catch (e) {
    console.error('Error in getAllTicketsByEvent:', e);
    return res.status(500).json({ status: false, message: 'Lỗi hệ thống.' });
  }
};

const handleZoneTickets = async (eventId) => {
  const zoneTickets = await ZoneTicket.find({ eventId }).populate('showtimeId');

  // Lấy vé đã phát hành từ ticketModel
  const issuedTickets = await ticketModel.find({
    eventId: eventId,
    status: { $in: ['issued', 'used'] }
  }).populate('userId');

  // Tạo map để đếm vé đã phát hành theo zoneTicket
  const issuedTicketMap = new Map();
  for (const ticket of issuedTickets) {
    if (ticket.zone && ticket.zone.zoneId) {
      const zoneTicketId = ticket.zone.zoneId.toString();
      issuedTicketMap.set(zoneTicketId, (issuedTicketMap.get(zoneTicketId) || 0) + 1);
    }
  }

  // Lấy booking để backup
  const zoneBookingsAgg = await ZoneBooking.aggregate([
    { $match: { eventId: eventId, status: 'booked' } },
    { $group: { _id: '$zoneTicketId', total: { $sum: '$quantity' } } }
  ]);
  const soldMap = new Map(zoneBookingsAgg.map(b => [b._id.toString(), b.total]));

  const tickets = zoneTickets.map(t => {
    const issuedCount = issuedTicketMap.get(t._id.toString()) || 0;
    const bookingCount = soldMap.get(t._id.toString()) || 0;
    const sold = Math.max(issuedCount, bookingCount);
    return {
      ticketId: t._id,
      name: t.name,
      price: t.price,
      total: t.totalTicketCount,
      sold,
      available: t.totalTicketCount - sold,
      showtimeId: t.showtimeId?._id,
      startTime: t.showtimeId?.startTime,
      endTime: t.showtimeId?.endTime
    };
  });

  // Lấy soldTickets từ issued tickets, fallback sang booking nếu không có
  let soldTickets = issuedTickets.map(ticket => ({
    ticketId: ticket._id,
    zoneTicketId: ticket.zone?.zoneId,
    zoneName: ticket.zone?.zoneName,
    userId: ticket.userId._id,
    userName: ticket.userId.name || ticket.userId.email,
    status: ticket.status,
    issuedAt: ticket.issuedAt,
    price: ticket.price
  }));
  if (soldTickets.length === 0) {
    const soldZoneBookings = await ZoneBooking.find({ eventId: eventId, status: 'booked' }).populate('userId');
    soldTickets = soldZoneBookings.map(booking => ({
      bookingId: booking._id,
      ticketId: booking.zoneTicketId,
      quantity: booking.quantity,
      userId: booking.userId._id,
      userName: booking.userId.name || booking.userId.email
    }));
  }

  return { tickets, soldTickets };
};

const handleSeatTickets = async (eventId) => {
  const zones = await zoneModel.find({ eventId });
  const showtimes = await showtimeModel.find({ eventId });
  const showtimeIds = showtimes.map(s => s._id);
  const zoneTickets = await ZoneTicket.find({ showtimeId: { $in: showtimeIds } }).populate('showtimeId');

  const ticketGroups = new Map();

  // Lấy vé đã phát hành từ ticketModel
  const issuedTickets = await ticketModel.find({
    eventId: eventId,
    status: { $in: ['issued', 'used'] }
  }).populate('userId');

  // Tạo map để đếm vé đã phát hành theo seat
  const issuedTicketMap = new Map();
  for (const ticket of issuedTickets) {
    if (ticket.seat && ticket.seat.seatId) {
      const key = `${ticket.zone?.zoneId || 'unknown'}_${ticket.seat.seatId}`;
      issuedTicketMap.set(key, (issuedTicketMap.get(key) || 0) + 1);
    }
  }

  const allSeatBookingsAgg = await SeatBooking.aggregate([
    { $match: { eventId: eventId, status: 'booked' } },
    { $unwind: '$seats' },
    {
      $group: {
        _id: { zoneId: '$seats.zoneId', seatId: '$seats.seatId' },
        count: { $sum: 1 }
      }
    }
  ]);
  const soldSeatMap = new Map(allSeatBookingsAgg.map(b => [`${b._id.zoneId}_${b._id.seatId}`, b.count]));

  for (const ticket of zoneTickets) {
    const seatLabel = ticket.name.split(' - ')[1];
    let zoneMatch = null, seatMatch = null;

    for (const zone of zones) {
      const seat = zone.layout?.seats?.find(s => s.label === seatLabel);
      if (seat) {
        zoneMatch = zone;
        seatMatch = seat;
        break;
      }
    }

    if (zoneMatch && seatMatch) {
      const area = seatMatch.area || 'Unknown';
      const showtimeId = ticket.showtimeId._id.toString();
      const key = `${area}_${showtimeId}`;

      const issuedCount = issuedTicketMap.get(`${zoneMatch._id}_${seatLabel}`) || 0;
      const bookingCount = soldSeatMap.get(`${zoneMatch._id}_${seatLabel}`) || 0;
      const sold = Math.max(issuedCount, bookingCount);

      if (!ticketGroups.has(key)) {
        ticketGroups.set(key, {
          area,
          showtimeId: ticket.showtimeId._id,
          startTime: ticket.showtimeId.startTime,
          endTime: ticket.showtimeId.endTime,
          totalTickets: 0,
          soldTickets: 0,
          availableTickets: 0,
          price: ticket.price,
          zoneId: zoneMatch._id,
          zoneName: zoneMatch.name
        });
      }

      const group = ticketGroups.get(key);
      group.totalTickets += ticket.totalTicketCount;
      group.soldTickets += sold;
      group.availableTickets += (ticket.totalTicketCount - sold);
    }
  }

  const tickets = Array.from(ticketGroups.values());

  // Lấy soldTickets từ issued tickets, fallback sang booking nếu không có
  let soldGroups = new Map();
  for (const ticket of issuedTickets) {
    if (ticket.seat && ticket.seat.seatId) {
      const zone = zones.find(z => z._id.toString() === (ticket.zone?.zoneId?.toString() || ''));
      const seatInfo = zone?.layout?.seats?.find(s => s.seatId === ticket.seat.seatId);
      if (seatInfo) {
        const area = seatInfo.area || 'Unknown';
        const key = `${area}_${ticket.showtimeId}`;
        if (!soldGroups.has(key)) {
          soldGroups.set(key, {
            area,
            showtimeId: ticket.showtimeId,
            totalSold: 0,
            soldSeats: [],
            users: new Set()
          });
        }
        const group = soldGroups.get(key);
        group.totalSold += 1;
        group.soldSeats.push({
          ticketId: ticket._id,
          seatId: ticket.seat.seatId,
          zoneId: ticket.zone?.zoneId,
          zoneName: ticket.zone?.zoneName,
          userId: ticket.userId._id,
          userName: ticket.userId.name || ticket.userId.email,
          status: ticket.status,
          issuedAt: ticket.issuedAt
        });
        group.users.add(ticket.userId._id.toString());
      }
    }
  }
  let soldTickets = Array.from(soldGroups.values()).map(g => ({
    area: g.area,
    showtimeId: g.showtimeId,
    totalSold: g.totalSold,
    uniqueUsers: g.users.size,
    soldSeats: g.soldSeats
  }));
  if (soldTickets.length === 0) {
    const soldSeatBookings = await SeatBooking.find({ eventId: eventId, status: 'booked' }).populate('userId');
    soldTickets = soldSeatBookings.flatMap(booking =>
      booking.seats.map(seat => ({
        bookingId: booking._id,
        seatId: seat.seatId,
        zoneId: seat.zoneId,
        userId: booking.userId._id,
        userName: booking.userId.name || booking.userId.email
      }))
    );
  }

  return { tickets, soldTickets };
};

const handleNoneTickets = async (eventId) => {
  const showtimes = await showtimeModel.find({ eventId });

  // Lấy vé đã phát hành từ ticketModel
  const issuedTickets = await ticketModel.find({
    eventId: eventId,
    status: { $in: ['issued', 'used'] }
  }).populate('userId');

  // Tạo map để đếm vé đã phát hành theo showtime
  const issuedTicketMap = new Map();
  for (const ticket of issuedTickets) {
    if (ticket.showtimeId) {
      const showtimeId = ticket.showtimeId.toString();
      issuedTicketMap.set(showtimeId, (issuedTicketMap.get(showtimeId) || 0) + 1);
    }
  }

  const tickets = showtimes.map(showtime => {
    const issuedCount = issuedTicketMap.get(showtime._id.toString()) || 0;
    const sold = Math.max(issuedCount, showtime.soldTickets || 0);
    return {
      ticketId: showtime._id,
      name: `Vé cho suất chiếu ${new Date(showtime.startTime).toLocaleString()}`,
      price: showtime.ticketPrice,
      total: showtime.ticketQuantity,
      sold,
      available: (showtime.ticketQuantity || 0) - sold,
      showtimeId: showtime._id,
      startTime: showtime.startTime,
      endTime: showtime.endTime
    };
  });

  // Lấy soldTickets từ issued tickets, fallback sang booking nếu không có
  let soldTickets = issuedTickets.map(ticket => ({
    ticketId: ticket._id,
    showtimeId: ticket.showtimeId,
    userId: ticket.userId._id,
    userName: ticket.userId.name || ticket.userId.email,
    status: ticket.status,
    issuedAt: ticket.issuedAt,
    price: ticket.price,
    ticketNumber: ticket.ticketNumber
  }));
  // Nếu không có vé issued, fallback sang booking (nếu có logic booking cho none)
  // soldTickets = [] nếu không có booking

  return {
    tickets,
    soldTickets
  };
};

// API: GET /api/events/tickets/event/:eventId/zone-sold-count
exports.getSoldTicketCountByZone = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await eventModel.findById(eventId);
    if (!event) {
      return res.status(404).json({ status: false, message: 'Không tìm thấy sự kiện.' });
    }
    // Lấy soldTickets theo typeBase
    let soldTickets = [];
    switch (event.typeBase) {
      case 'zone': {
        const issuedTickets = await ticketModel.find({
          eventId: eventId,
          status: { $in: ['issued', 'used'] }
        });
        soldTickets = issuedTickets.map(ticket => ({
          zoneName: ticket.zone?.zoneName || 'Unknown'
        }));
        break;
      }
      case 'seat': {
        const issuedTickets = await ticketModel.find({
          eventId: eventId,
          status: { $in: ['issued', 'used'] }
        });
        soldTickets = issuedTickets.map(ticket => ({
          zoneName: ticket.zone?.zoneName || 'Unknown'
        }));
        break;
      }
      case 'none': {
        // Không có zone, trả về empty hoặc group theo showtime nếu muốn
        soldTickets = [];
        break;
      }
    }
    // Gộp theo zoneName
    const zoneCountMap = {};
    for (const ticket of soldTickets) {
      const zone = ticket.zoneName || 'Unknown';
      zoneCountMap[zone] = (zoneCountMap[zone] || 0) + 1;
    }
    const result = Object.entries(zoneCountMap).map(([zoneName, soldCount]) => ({
      zoneName,
      soldCount
    }));
    return res.json({ status: true, data: result });
  } catch (e) {
    console.error('Error in getSoldTicketCountByZone:', e);
    return res.status(500).json({ status: false, message: 'Lỗi hệ thống.' });
  }
};
