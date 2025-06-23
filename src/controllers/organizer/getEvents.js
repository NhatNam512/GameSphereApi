const eventModel = require("../../models/events/eventModel");
const showtimeModel = require("../../models/events/showtimeModel");
const seatBookingModel = require("../../models/events/seatBookingModel");
const zoneModel = require("../../models/events/zoneModel");

exports.getEvents = async (req, res)=>{
    try {
        const userId = req.user.id;
        const events = await eventModel.find({ userId: userId })
        .select("_id name timeStart timeEnd ticketPrice avatar");
        let totalTickets = 0;
        let totalRevenue = 0;
        const eventsWithShowtimes = await Promise.all(events.map(async (event) => {
          const showtimes = await showtimeModel.find({ eventId: event._id })
            .select("_id startTime endTime ticketPrice ticketQuantity soldTickets");
          
          // Tính tổng số vé đã bán cho event này từ các showtime
          const eventSoldTickets = showtimes.reduce((sum, showtime) => sum + (showtime.soldTickets || 0), 0);
          totalTickets += eventSoldTickets;

          // Tính doanh thu từng showtime và từng zone
          const revenueByShowtime = await Promise.all(showtimes.map(async (showtime) => {
            // Lấy các booking đã booked cho showtime này
            const bookings = await seatBookingModel.find({
              eventId: event._id,
              showtimeId: showtime._id,
              status: 'booked'
            });
            // Group by zone
            const revenueByZoneMap = {};
            let showtimeRevenue = 0;
            for (const booking of bookings) {
              for (const seat of booking.seats) {
                const zoneId = seat.zoneId ? seat.zoneId.toString() : null;
                if (!zoneId) continue;
                if (!revenueByZoneMap[zoneId]) revenueByZoneMap[zoneId] = 0;
                // Tìm giá vé của zone (nếu có), nếu không lấy ticketPrice của showtime
                let seatPrice = showtime.ticketPrice || 0;
                if (zoneId) {
                  const zone = await zoneModel.findById(zoneId);
                  // Tìm seat trong zone để lấy giá
                  if (zone && zone.layout && Array.isArray(zone.layout.seats)) {
                    const seatInfo = zone.layout.seats.find(s => s.seatId === seat.seatId);
                    if (seatInfo && seatInfo.price) seatPrice = seatInfo.price;
                  }
                }
                revenueByZoneMap[zoneId] += seatPrice;
                showtimeRevenue += seatPrice;
              }
            }
            // Lấy tên zone
            const revenueByZone = await Promise.all(Object.keys(revenueByZoneMap).map(async (zoneId) => {
              const zone = await zoneModel.findById(zoneId);
              return {
                zoneId,
                zoneName: zone ? zone.name : null,
                revenue: revenueByZoneMap[zoneId]
              };
            }));
            return {
              showtimeId: showtime._id,
              soldTickets: showtime.soldTickets || 0,
              revenue: showtimeRevenue,
              revenueByZone
            };
          }));

          // Tính lại totalRevenue từ revenueByShowtime
          const eventTotalRevenue = revenueByShowtime.reduce((sum, s) => sum + s.revenue, 0);
          totalRevenue += eventTotalRevenue;

          return { 
            ...event.toObject(), 
            showtimes, 
            revenueByShowtime, 
            eventTotalRevenue,
            soldTickets: eventSoldTickets // Thêm tổng số vé đã bán của event
          };
        }));

        res.status(200).json({
          status: 200,
          totalTickets: totalTickets,
          totalRevenue: totalRevenue,
          events: eventsWithShowtimes
        });
      } catch (e) {
        res.status(400).json({ status: false, message: "Error" + e });
      }
}