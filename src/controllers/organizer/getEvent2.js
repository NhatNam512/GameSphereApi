const eventModel = require("../../models/events/eventModel");
const showtimeModel = require("../../models/events/showtimeModel");
const seatBookingModel = require("../../models/events/seatBookingModel");
const zoneModel = require("../../models/events/zoneModel");
const ZoneTicket = require("../../models/events/zoneTicketModel");
const ZoneBooking = require("../../models/events/zoneBookingModel");

exports.getEvent2 = async (req, res) => {
  try {
    const userId = req.user.id;
    const events = await eventModel.find({ userId }).select("_id name typeBase").lean();
    let totalTickets = 0, totalRevenue = 0;
    const eventsResult = await Promise.all(events.map(async (event) => {
      // Get all showtimes for this event
      const showtimes = await showtimeModel.find({ eventId: event._id }).lean();
      let eventTotalTickets = 0, eventSoldTickets = 0, eventTotalRevenue = 0;
      const showtimeResults = await Promise.all(showtimes.map(async (showtime) => {
        let stTotalTickets = 0, stSoldTickets = 0, stRevenue = 0, revenueByZone = [];
        if (event.typeBase === 'seat') {
          const zones = await zoneModel.find({ eventId: event._id }).lean();
          stTotalTickets = zones.reduce((sum, z) => sum + ((z.layout && z.layout.seats) ? z.layout.seats.length : 0), 0);
          const booked = await seatBookingModel.find({ eventId: event._id, showtimeId: showtime._id, status: 'booked' }).lean();
          stSoldTickets = booked.reduce((sum, b) => sum + (b.seats ? b.seats.length : 0), 0);
          console.log(`\n[SEAT] Event: ${event.name}, Showtime: ${showtime._id}`);
          console.log('Zones:', zones);
          console.log('Booked seatBookings:', booked);
          const zoneMap = Object.fromEntries(zones.map(z => [z._id.toString(), z]));
          const zoneRevenueMap = {};
          for (const b of booked) {
            for (const seat of b.seats || []) {
              const zoneId = seat.zoneId?.toString();
              if (!zoneId) continue;
              const zone = zoneMap[zoneId];
              const seatObj = (zone && zone.layout && Array.isArray(zone.layout.seats)) ? zone.layout.seats.find(s => s.seatId === seat.seatId) : null;
              const price = seatObj ? seatObj.price : 0;
              if (!seatObj) {
                console.log(`  [WARN] Không tìm thấy seatId ${seat.seatId} trong zone ${zoneId}`);
              }
              zoneRevenueMap[zoneId] = (zoneRevenueMap[zoneId] || 0) + price;
              stRevenue += price;
              console.log(`  + Seat: ${seat.seatId}, Zone: ${zoneId}, Price: ${price}`);
            }
          }
          revenueByZone = Object.entries(zoneRevenueMap).map(([zoneId, revenue]) => ({
            zoneId,
            zoneName: zoneMap[zoneId]?.name || null,
            revenue
          }));
          console.log('Revenue by zone:', revenueByZone);
          console.log('Showtime revenue:', stRevenue);
        } else if (event.typeBase === 'zone') {
          const zoneTickets = await ZoneTicket.find({ eventId: event._id, showtimeId: showtime._id }).lean();
          stTotalTickets = zoneTickets.reduce((sum, z) => sum + (z.totalTicketCount || 0), 0);
          const bookings = await ZoneBooking.find({ eventId: event._id, showtimeId: showtime._id, status: 'booked' }).lean();
          stSoldTickets = bookings.reduce((sum, b) => sum + (b.quantity || 0), 0);
          console.log(`\n[ZONE] Event: ${event.name}, Showtime: ${showtime._id}`);
          console.log('ZoneTickets:', zoneTickets);
          console.log('Booked zoneBookings:', bookings);
          const zoneTicketMap = Object.fromEntries(zoneTickets.map(z => [z._id.toString(), z]));
          const zoneRevenueMap = {};
          for (const b of bookings) {
            const zoneId = b.zoneId?.toString();
            const zoneTicket = zoneTicketMap[zoneId];
            if (!zoneId || !zoneTicket) {
              console.log(`  [WARN] Không tìm thấy zoneTicket cho booking zoneId ${zoneId}`);
              continue;
            }
            const price = zoneTicket.price || 0;
            const revenue = price * (b.quantity || 0);
            zoneRevenueMap[zoneId] = (zoneRevenueMap[zoneId] || 0) + revenue;
            stRevenue += revenue;
            console.log(`  + ZoneTicket: ${zoneId}, Price: ${price}, Quantity: ${b.quantity}, Revenue: ${revenue}`);
          }
          revenueByZone = Object.entries(zoneRevenueMap).map(([zoneId, revenue]) => ({
            zoneId,
            zoneName: zoneTicketMap[zoneId]?.name || null,
            revenue
          }));
          console.log('Revenue by zone:', revenueByZone);
          console.log('Showtime revenue:', stRevenue);
        } else if (event.typeBase === 'none') {
          stTotalTickets = showtime.ticketQuantity || 0;
          stSoldTickets = showtime.soldTickets || 0;
          stRevenue = (showtime.ticketPrice || 0) * stSoldTickets;
          console.log(`\n[NONE] Event: ${event.name}, Showtime: ${showtime._id}`);
          console.log('Showtime:', showtime);
          console.log('Showtime revenue:', stRevenue);
        }
        eventTotalTickets += stTotalTickets;
        eventSoldTickets += stSoldTickets;
        eventTotalRevenue += stRevenue;
        return {
          _id: showtime._id,
          startTime: showtime.startTime,
          totalTickets: stTotalTickets,
          soldTickets: stSoldTickets,
          revenue: stRevenue,
          revenueByZone
        };
      }));
      totalTickets += eventTotalTickets;
      totalRevenue += eventTotalRevenue;
      return {
        _id: event._id,
        name: event.name,
        typeBase: event.typeBase,
        showtimes: showtimeResults,
        totalTicketsEvent: eventTotalTickets,
        soldTickets: eventSoldTickets,
        eventTotalRevenue
      };
    }));
    res.status(200).json({
      status: 200,
      totalTickets,
      totalRevenue,
      events: eventsResult
    });
  } catch (e) {
    console.error("❌ getEvent2 error:", e);
    res.status(400).json({ status: false, message: "Error: " + e.message });
  }
};
