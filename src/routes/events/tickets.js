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
const eventModel = require('../../models/events/eventModel');
const authenticate = require('../../middlewares/auth');

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
router.post("/verify-ticket", authenticate, async (req, res) => {
    try {
      const { ticketId, showtimeId } = req.body;
      const userId = req.user.id;
      if (!ticketId) {
        return res.status(400).json({ success: false, message: "Thiếu mã vé." });
      }
  
      const ticket = await Ticket.findOne({ ticketId })
        .select('_id ticketId userId eventId status usedAt showtimeId');
      if (!ticket) {
        return res.status(404).json({ success: false, message: "Không tìm thấy vé." });
      }
      // Lấy thông tin sự kiện
      const event = await Event.findById(ticket.eventId).select('_id userId');
      if (!event) {
        return res.status(404).json({ success: false, message: "Không tìm thấy sự kiện." });
      }
      // Kiểm tra người xác nhận có phải là người tạo sự kiện không
      if (event.userId.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: "Bạn không có quyền xác nhận vé cho sự kiện này." });
      }
      // Kiểm tra showtimeId nếu có truyền vào
      if (showtimeId && ticket.showtimeId && ticket.showtimeId.toString() !== showtimeId.toString()) {
        return res.status(400).json({ success: false, message: "Không đúng suất diễn." });
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

// Endpoint: Lấy số lượng vé theo status used và issued của 1 sự kiện
router.get('/count/:eventId', async function (req, res) {
  try {
    const { eventId } = req.params;
    // Đếm số lượng vé status = 'used'
    const usedCount = await Ticket.countDocuments({ eventId, status: 'used' });
    // Đếm số lượng vé status = 'issued'
    const issuedCount = await Ticket.countDocuments({ eventId, status: 'issued' });
    res.status(200).json({
      status: true,
      message: 'Lấy số lượng vé theo trạng thái thành công',
      data: {
        used: usedCount,
        issued: issuedCount
      }
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

// Endpoint: Lấy vé gộp theo sự kiện và showtime
router.get('/grouped/:userId', async function (req, res) {
  try {
    const { userId } = req.params;
    
    // Lấy tất cả vé của user với thông tin cần thiết
    const tickets = await Ticket.find({ userId })
      .select('_id ticketId eventId showtimeId orderId price status createdAt')
      .populate('eventId', '_id name avatar location')
      .populate('showtimeId', '_id startTime endTime')
      .populate('orderId', '_id totalPrice status createdAt')
      .lean();

    if (!tickets.length) {
      return res.status(200).json({
        status: true,
        message: 'Người dùng chưa có vé nào',
        data: []
      });
    }

    // Gộp vé theo eventId và showtimeId
    const groupedTickets = {};
    
    tickets.forEach(ticket => {
      const eventId = ticket.eventId?._id?.toString();
      const showtimeId = ticket.showtimeId?._id?.toString() || 'no-showtime';
      const groupKey = `${eventId}-${showtimeId}`;
      
      if (!groupedTickets[groupKey]) {
        groupedTickets[groupKey] = {
          eventId: ticket.eventId?._id,
          eventName: ticket.eventId?.name,
          eventAvatar: ticket.eventId?.avatar,
          eventLocation: ticket.eventId?.location,
          showtimeId: ticket.showtimeId?._id || null,
          showtimeStart: ticket.showtimeId?.startTime || null,
          showtimeEnd: ticket.showtimeId?.endTime || null,
          orderId: ticket.orderId?._id,
          orderTotalPrice: ticket.orderId?.totalPrice || 0,
          orderStatus: ticket.orderId?.status,
          orderCreatedAt: ticket.orderId?.createdAt,
          ticketStatus: ticket.status,
          ticketCreatedAt: ticket.createdAt,
          quantity: 0,
          totalPrice: 0,
          ticketIds: []
        };
      }
      
      // Cộng dồn số lượng và giá tiền
      groupedTickets[groupKey].quantity += 1;
      groupedTickets[groupKey].totalPrice += ticket.price || 0;
      groupedTickets[groupKey].ticketIds.push(ticket.ticketId);
    });

    // Chuyển đổi object thành array và format lại
    const result = Object.values(groupedTickets).map(group => ({
      eventId: group.eventId,
      eventName: group.eventName,
      eventAvatar: group.eventAvatar,
      eventLocation: group.eventLocation,
      showtime: group.showtimeId ? {
        id: group.showtimeId,
        startTime: group.showtimeStart,
        endTime: group.showtimeEnd
      } : null,
      order: {
        orderId: group.orderId,
        totalPrice: group.orderTotalPrice,
        status: group.orderStatus,
        createdAt: group.orderCreatedAt
      },
      tickets: {
        quantity: group.quantity,
        totalPrice: group.totalPrice,
        status: group.ticketStatus,
        createdAt: group.ticketCreatedAt,
        ticketIds: group.ticketIds
      }
    }));

    res.status(200).json({
      status: true,
      message: 'Lấy danh sách vé gộp thành công',
      data: result
    });

  } catch (e) {
    console.error('Lỗi lấy vé gộp:', e);
    res.status(500).json({ 
      status: false, 
      message: 'Lỗi server: ' + e.message 
    });
  }
});

// Endpoint: Lấy chi tiết tất cả vé theo eventId và showtimeId
router.get('/details/:userId/:eventId/:showtimeId?', async function (req, res) {
  try {
    const { userId, eventId, showtimeId } = req.params;
    
    // Tạo query filter
    const filter = { userId, eventId };
    if (showtimeId && showtimeId !== 'null' && showtimeId !== 'undefined') {
      filter.showtimeId = showtimeId;
    } else {
      // Nếu không có showtimeId hoặc là null, tìm vé không có showtime
      filter.showtimeId = { $exists: false };
    }

    // Lấy chi tiết tất cả vé
    const tickets = await Ticket.find(filter)
      .select('_id ticketId userId eventId showtimeId ticketNumber status createdAt qrCode price orderId')
      .populate('eventId', '_id name avatar location typeBase timeStart timeEnd')
      .populate('showtimeId', '_id startTime endTime')
      .populate('orderId', '_id totalPrice status createdAt')
      .populate('userId', '_id username email phoneNumber')
      .lean();

    if (!tickets.length) {
      return res.status(404).json({
        status: false,
        message: 'Không tìm thấy vé nào'
      });
    }

    // Lấy thông tin zone ticket (nếu có)
    const zoneTicketIds = tickets.map(t => t.zone && t.zone.zoneId).filter(Boolean);
    let zoneTicketMap = {};
    if (zoneTicketIds.length > 0) {
      const zoneTickets = await ZoneTicket.find({ _id: { $in: zoneTicketIds } })
        .select('_id name price')
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

    // Format response
    const eventInfo = tickets[0].eventId;
    const showtimeInfo = tickets[0].showtimeId;
    const userInfo = tickets[0].userId;
    const orderInfo = tickets[0].orderId;

    const result = {
      event: {
        _id: eventInfo._id,
        name: eventInfo.name,
        avatar: eventInfo.avatar,
        location: eventInfo.location,
        typeBase: eventInfo.typeBase,
        timeStart: eventInfo.timeStart,
        timeEnd: eventInfo.timeEnd,
        description: eventInfo.description
      },
      showtime: showtimeInfo ? {
        _id: showtimeInfo._id,
        startTime: showtimeInfo.startTime,
        endTime: showtimeInfo.endTime
      } : null,
      user: {
        _id: userInfo._id,
        username: userInfo.username,
        email: userInfo.email,
        phoneNumber: userInfo.phoneNumber
      },
      order: orderInfo ? {
        _id: orderInfo._id,
        totalPrice: orderInfo.totalPrice,
        status: orderInfo.status,
        createdAt: orderInfo.createdAt
      } : null,
      tickets: tickets.map(ticket => {
        // Xác định loại vé và zone
        let ticketType = '';
        let zoneName = '';
        
        if (ticket.zone && ticket.zone.zoneId && zoneTicketMap[ticket.zone.zoneId.toString()]) {
          const zoneTicket = zoneTicketMap[ticket.zone.zoneId.toString()];
          ticketType = 'zone';
          zoneName = zoneTicket.name;
        } else if (ticket.seat && ticket.seat.zoneId && seatZoneMap[ticket.seat.zoneId.toString()]) {
          const seatZone = seatZoneMap[ticket.seat.zoneId.toString()];
          ticketType = 'seat';
          zoneName = seatZone.name;
        }

        return {
          _id: ticket._id,
          ticketId: ticket.ticketId,
          ticketNumber: ticket.ticketNumber,
          price: ticket.price,
          status: ticket.status,
          createdAt: ticket.createdAt,
          qrCode: ticket.qrCode,
        };
      }),
      summary: {
        totalTickets: tickets.length,
        totalPrice: tickets.reduce((sum, ticket) => sum + (ticket.price || 0), 0),
        ticketStatuses: tickets.reduce((acc, ticket) => {
          acc[ticket.status] = (acc[ticket.status] || 0) + 1;
          return acc;
        }, {})
      }
    };

    res.status(200).json({
      status: true,
      message: 'Lấy chi tiết vé thành công',
      data: result
    });

  } catch (e) {
    console.error('Lỗi lấy chi tiết vé:', e);
    res.status(500).json({ 
      status: false, 
      message: 'Lỗi server: ' + e.message 
    });
  }
});

module.exports = router;