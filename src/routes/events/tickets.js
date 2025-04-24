var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../../utils/tokenConfig");
const Ticket = require('../../models/events/ticketModel');
const Event = require('../../models/events/eventModel')
const User = require('../../models/userModel');

router.get("/all", async function (req, res) {
    try{
        const tickets = await Ticket.find();
        res.status(200).json({
            status: true,
            message: "Lấy danh sách vé đã đặt thành công",
            data: tickets
          });
    }
    catch(e){
        res.status(400).json({ status: false, message: "Lấy danh sách vé đã đặt thất bại" + e });
    }
})

router.get("/getTicket/:userId", async function (req, res) {
    try{
        const userId = req.params.userId
        //Lấy thông tin người dùng
        const user = await User.findOne({_id: userId})
        if(!user) return res.status(404).json({error: "Not Found User"});

        //Lấy vé của user
        const tickets = await Ticket.find({ userId: userId });
        if(!tickets) return res.status(404).json({error: "Not Found Ticket"});
        //Lấy danh sách eventId duy nhất
        const eventIds = [...new Set(tickets.map(t => t.eventId.toString()))];
        //Lấy thông tin sự kiện 
        const events = await Event.find({_id: {$in: eventIds}}).lean();
        //Gộp dữ liệu
        const result = {
            user,
            events: events.map(event => {
                const filteredTickets = tickets.filter(t => {
                    return t.eventId.toString() === event._id.toString();
                });
                return {
                    ...event,
                    tickets: filteredTickets
                };
            }),
        }
        res.status(200).json({
            status: true,
            message: "Lấy vé thành công",
            data: result
        })
    }
    catch(e){
        res.status(404).json({ status: false, message: "Not Found" })
    }
});

// routes/ticket.js
router.post("/verify-ticket", async (req, res) => {
    try {
      const { ticketId } = req.body;
  
      if (!ticketId) {
        return res.status(400).json({ success: false, message: "Thiếu mã vé." });
      }
  
      const ticket = await Ticket.findOne({ ticketId });
  
      if (!ticket) {
        return res.status(404).json({ success: false, message: "Không tìm thấy vé." });
      }
  
      if (ticket.status === "used") {
        return res.status(400).json({ success: false, message: "Vé đã được sử dụng." });
      }
  
      // Cập nhật trạng thái đã sử dụng
      ticket.status = "used";
      ticket.usedAt = new Date();
      await ticket.save();
  
      res.status(200).json({
        success: true,
        message: "Vé hợp lệ và đã được xác nhận.",
        data: {
          ticketId: ticket.ticketId,
          userId: ticket.userId,
          eventId: ticket.eventId,
          usedAt: ticket.usedAt,
        },
      });
    } catch (e) {
      console.error("Lỗi xác nhận vé:", e);
      res.status(500).json({ success: false, message: "Lỗi server." });
    }
  });  

module.exports = router;