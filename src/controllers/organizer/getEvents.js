const eventModel = require("../../models/events/eventModel");
const showtimeModel = require("../../models/events/showtimeModel");

exports.getEvents = async (req, res)=>{
    try {
        const userId = req.user.id;
        const events = await eventModel.find({ userId: userId })
        .select("_id name timeStart timeEnd ticketPrice soldTickets ticketQuantity avatar ");
        let totalTickets = 0;
        let totalRevenue = 0;
        const eventsWithShowtimes = await Promise.all(events.map(async (event) => {
          const showtimes = await showtimeModel.find({ eventId: event._id })
            .select("startTime endTime ticketPrice ticketQuantity soldTickets");
          
          event.soldTickets = event.soldTickets || 0;
          event.ticketPrice = event.ticketPrice || 0;

          totalTickets += event.soldTickets;
          totalRevenue += event.soldTickets * event.ticketPrice;
          
          return { ...event.toObject(), showtimes };
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