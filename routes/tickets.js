var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const Ticket = require('../models/ticketModel');
const Event = require('../models/eventModel')
const User = require('../models/userModel');
const mongoose = require('mongoose');

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
        const eventIds = [...new Set(tickets.map(t=>t.eventId))];
        //Lấy thông tin sự kiện 
        const events = await Event.find({_id: {$in: eventIds}});
        //Gộp dữ liệu
        const result = {
            user,
            events: events.map(event=>({
                ...event,
                tickets: tickets.filter(t=>t.eventId === event._id),
            })),
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
})

module.exports = router;