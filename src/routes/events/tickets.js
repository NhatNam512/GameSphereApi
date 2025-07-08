var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../../utils/tokenConfig");
const Ticket = require('../../models/events/ticketModel');
const Event = require('../../models/events/eventModel')
const User = require('../../models/userModel');
const ZoneTicket = require('../../models/events/zoneTicketModel');
const ZoneModel = require('../../models/events/zoneModel');
const Showtime = require('../../models/events/showtimeModel');
const mongoose = require('mongoose');
const ticketController = require('../../controllers/events/ticketController');

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
            .select('_id username email phoneNumber picUrl address')
            .lean();
        if(!user) return res.status(404).json({error: "Not Found User"});

        //Lấy vé của user
        const tickets = await Ticket.find({ userId: userId })
            .select('_id ticketId userId eventId showtimeId seat zone ticketNumber status createdAt qrCode')
            .populate('showtimeId', '_id startTime endTime') // Populate showtime details
            .lean();
        if(!tickets) return res.status(404).json({error: "Not Found Ticket"});
        //Lấy danh sách eventId duy nhất
        const eventIds = [...new Set(tickets.map(t => t.eventId.toString()))];
        //Lấy thông tin sự kiện 
        const events = await Event.find({_id: {$in: eventIds}})
            .select('_id name avatar location typeBase')
            .lean();

        //Gộp dữ liệu
        const result = {
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                phoneNumber: user.phoneNumber,
                picUrl: user.picUrl,
                address: user.address
            },
            events: events.map(event => {
                const filteredTickets = tickets.filter(t => t.eventId.toString() === event._id.toString());
                return {
                    _id: event._id,
                    name: event.name,
                    avatar: event.avatar,
                    location: event.location,
                    typeBase: event.typeBase,
                    tickets: filteredTickets.map(ticket => ({
                        _id: ticket._id,
                        ticketId: ticket.ticketId,
                        showtimeId: ticket.showtimeId ? {
                            _id: ticket.showtimeId._id,
                            startTime: ticket.showtimeId.startTime,
                            endTime: ticket.showtimeId.endTime
                        } : null,
                        seat: ticket.seat || undefined,
                        zone: ticket.zone || undefined,
                        ticketNumber: ticket.ticketNumber,
                        status: ticket.status,
                        createdAt: ticket.createdAt,
                        qrCode: ticket.qrCode
                    }))
                };
            })
        }
        res.status(200).json({
            status: true,
            message: "Lấy vé thành công",
            data: result
        })
    }
    catch(e){
        res.status(404).json({ status: false, message: "Not Found" + e})
    }
});

// routes/ticket.js
router.post("/verify-ticket", async (req, res) => {
    try {
      const { ticketId } = req.body;
  
      if (!ticketId) {
        return res.status(400).json({ success: false, message: "Thiếu mã vé." });
      }
  
      const ticket = await Ticket.findOne({ ticketId })
        .select('_id ticketId userId eventId status usedAt');
  
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

// API: Lấy danh sách người tham dự của 1 sự kiện
router.get('/attendees/:eventId', async function (req, res) {
  try {
    const { eventId } = req.params;
    const Ticket = require('../../models/events/ticketModel');
    const User = require('../../models/userModel');
    const ZoneTicket = require('../../models/events/zoneTicketModel');
    const ZoneModel = require('../../models/events/zoneModel');
    const Showtime = require('../../models/events/showtimeModel');

    // Lấy tất cả vé đã issued hoặc used cho event này
    const tickets = await Ticket.find({ eventId, status: { $in: ['issued', 'used'] } })
      .select('_id ticketId userId eventId showtimeId seat zone status usedAt')
      .populate('userId', '_id username email phoneNumber')
      .populate('showtimeId', '_id startTime')
      .lean();

    // Lấy thông tin zone ticket (nếu có)
    const zoneTicketIds = tickets.map(t => t.zone && t.zone.zoneId).filter(Boolean);
    let zoneTicketMap = {};
    if (zoneTicketIds.length > 0) {
      const zoneTickets = await ZoneTicket.find({ _id: { $in: zoneTicketIds } })
        .select('_id name')
        .lean();
      zoneTicketMap = Object.fromEntries(zoneTickets.map(z => [z._id.toString(), z]));
    }
    // Lấy thông tin zone (cho vé ghế)
    const seatZoneIds = [];
    tickets.forEach(t => {
      if (t.seat && t.seat.zoneId) seatZoneIds.push(t.seat.zoneId);
    });
    let seatZoneMap = {};
    if (seatZoneIds.length > 0) {
      const seatZones = await ZoneModel.find({ _id: { $in: seatZoneIds } })
        .select('_id name')
        .lean();
      seatZoneMap = Object.fromEntries(seatZones.map(z => [z._id.toString(), z]));
    }

    // Chuẩn hóa kết quả
    const result = tickets.map(ticket => {
      // attendeeId: _id của user
      const attendeeId = ticket.userId?._id?.toString() || ticket.userId?.toString();
      // fullName: username, nếu không có thì fallback là email
      const fullName = ticket.userId?.username || ticket.userId?.email || '';
      // email
      const email = ticket.userId?.email || '';
      // phone: phoneNumber
      const phone = ticket.userId?.phoneNumber || '';
      // ticketType: zone ticket name hoặc seat zone name hoặc ''
      let ticketType = '';
      if (ticket.zone && ticket.zone.zoneId && zoneTicketMap[ticket.zone.zoneId.toString()]) {
        ticketType = zoneTicketMap[ticket.zone.zoneId.toString()].name;
      } else if (ticket.seat && ticket.seat.zoneId && seatZoneMap[ticket.seat.zoneId.toString()]) {
        ticketType = seatZoneMap[ticket.seat.zoneId.toString()].name;
      }
      // ticketCode
      const ticketCode = ticket.ticketId;
      // status: mapped
      let status = 'not_used';
      if (ticket.status === 'used') status = 'checked_in';
      // (Nếu có trạng thái canceled thì bổ sung logic ở đây)
      // checkInTime
      const checkInTime = ticket.usedAt || null;
      // zone
      let zone = '';
      if (ticket.zone && ticket.zone.zoneName) zone = ticket.zone.zoneName;
      // seat
      let seat = '';
      if (ticket.seat && ticket.seat.label) seat = ticket.seat.label;
      // showtimeTime
      let showtimeTime = ticket.showtimeId?.startTime || null;
      return {
        attendeeId,
        fullName,
        email,
        phone,
        ticketType,
        ticketCode,
        status,
        checkInTime,
        zone,
        seat,
        showtimeTime
      };
    });
    res.status(200).json({
      status: true,
      message: 'Lấy danh sách người tham dự thành công',
      data: result
    });
  } catch (e) {
    res.status(500).json({ status: false, message: 'Lỗi server: ' + e.message });
  }
});

router.get('/user/:userId/events', async function (req, res) {
  try {
    const { userId } = req.params;
    // Lấy tất cả vé của user
    const tickets = await Ticket.find({ userId }).select('eventId').lean();
    if (!tickets.length) {
      return res.status(200).json({ status: true, message: 'Người dùng chưa mua vé sự kiện nào', data: [] });
    }
    // Lấy danh sách eventId duy nhất
    const eventIds = [...new Set(tickets.map(t => t.eventId.toString()))];
    // Lấy thông tin sự kiện
    const events = await Event.find({ _id: { $in: eventIds } })
      .select('_id name avatar location typeBase timeStart timeEnd')
      .lean();
    res.status(200).json({ status: true, message: 'Lấy danh sách sự kiện đã mua vé thành công', data: events });
  } catch (e) {
    res.status(500).json({ status: false, message: 'Lỗi server: ' + e.message });
  }
});

router.get('/all-tickets/:eventId', ticketController.getAllTicketsByEvent);

module.exports = router;