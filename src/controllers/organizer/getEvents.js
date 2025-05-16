const eventModel = require("../../models/events/eventModel");

exports.getEvents = async (req, res)=>{
    try {
        const userId = req.user.id;
        const events = await eventModel.find({ userId: userId })
        .select("_id name timeStart timeEnd ticketPrice soldTickets ticketQuantity avatar ");
        let totalTickets = 0;
        let totalRevenue = 0;
        events.forEach(event => {
          totalTickets += event.soldTickets || 0;
          totalRevenue += (event.soldTickets || 0) * (event.ticketPrice || 0);
        });
        res.status(200).json({
          status: 200,
          totalTickets: totalTickets,
          totalRevenue: totalRevenue,
          events: events
        });
      } catch (e) {
        res.status(400).json({ status: false, message: "Error" + e });
      }
}