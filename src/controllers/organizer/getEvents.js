const eventModel = require("../../models/events/eventModel");
const showtimeModel = require("../../models/events/showtimeModel");
const seatBookingModel = require("../../models/events/seatBookingModel");
const zoneModel = require("../../models/events/zoneModel");
const ZoneTicket = require("../../models/events/zoneTicketModel");
const redisClient = require('../../redis/redisClient');

exports.getEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `getEvents:${userId}`;
    // Kiểm tra cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }
    const events = await eventModel.find({ userId }).select("_id name typeBase timeStart timeEnd ticketPrice avatar").lean();
    let totalTickets = 0;
    let totalRevenue = 0;

    const eventsWithDetails = await Promise.all(events.map(async (event) => {
      const [showtimes, zones] = await Promise.all([
        showtimeModel.find({ eventId: event._id }).select("_id startTime endTime ticketPrice ticketQuantity soldTickets").lean(),
        zoneModel.find({ eventId: event._id }).lean()
      ]);

      const zoneMap = {};
      let seatTotal = 0;

      zones.forEach(zone => {
        zoneMap[zone._id.toString()] = zone;
        if (event.typeBase === 'seat') {
          seatTotal += zone.layout?.seats?.length || 0;
        }
      });

      const showtimesWithTickets = await Promise.all(showtimes.map(async (showtime) => {
        let totalTickets = 0;
        if (event.typeBase === 'zone') {
          const zoneTickets = await ZoneTicket.find({ showtimeId: showtime._id }).lean();
          totalTickets = zoneTickets.reduce((sum, z) => sum + (z.totalTicketCount || 0), 0);
        } else if (event.typeBase === 'seat') {
          totalTickets = seatTotal;
        } else if (event.typeBase === 'none') {
          totalTickets = showtime.ticketQuantity || 0;
        }
        return { ...showtime, totalTickets };
      }));

      const totalTicketsEvent = showtimesWithTickets.reduce((sum, s) => sum + s.totalTickets, 0);
      const eventSoldTickets = showtimes.reduce((sum, s) => sum + (s.soldTickets || 0), 0);
      totalTickets += eventSoldTickets;

      const revenueByShowtime = await Promise.all(showtimes.map(async (showtime) => {
        const bookings = await seatBookingModel.find({
          eventId: event._id,
          showtimeId: showtime._id,
          status: 'booked'
        }).lean();

        const revenueByZoneMap = {};
        let showtimeRevenue = 0;

        for (const booking of bookings) {
          for (const seat of booking.seats) {
            const zoneId = seat.zoneId?.toString();
            if (!zoneId) continue;

            let seatPrice = showtime.ticketPrice || 0;
            const zone = zoneMap[zoneId];
            if (zone?.layout?.seats) {
              const seatInfo = zone.layout.seats.find(s => s.seatId === seat.seatId);
              if (seatInfo?.price) seatPrice = seatInfo.price;
            }

            revenueByZoneMap[zoneId] = (revenueByZoneMap[zoneId] || 0) + seatPrice;
            showtimeRevenue += seatPrice;
          }
        }

        const revenueByZone = Object.keys(revenueByZoneMap).map(zoneId => ({
          zoneId,
          zoneName: zoneMap[zoneId]?.name || null,
          revenue: revenueByZoneMap[zoneId]
        }));

        return {
          showtimeId: showtime._id,
          soldTickets: showtime.soldTickets || 0,
          revenue: showtimeRevenue,
          revenueByZone
        };
      }));

      const eventTotalRevenue = revenueByShowtime.reduce((sum, s) => sum + s.revenue, 0);
      totalRevenue += eventTotalRevenue;

      return {
        ...event,
        showtimes: showtimesWithTickets,
        totalTicketsEvent,
        soldTickets: eventSoldTickets,
        revenueByShowtime,
        eventTotalRevenue
      };
    }));

    const response = {
      status: 200,
      totalTickets,
      totalRevenue,
      events: eventsWithDetails
    };
    // Lưu vào cache, hết hạn sau 5 phút (300 giây)
    await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 300);
    res.status(200).json(response);

  } catch (e) {
    res.status(400).json({ status: false, message: "Error: " + e.message });
  }
};
