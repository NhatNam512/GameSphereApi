var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const Ticket = require('../models/ticketModel');
const Event = require('../models/eventModel')
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
        const tickets = await Ticket.find({ userId: req.params.userId });
        if(tickets.length>0){
            res.status(200).json({
              status: true,
              message: "Lấy vé thành công",
              data: tickets
            })
          }
    }
    catch(e){
        res.status(404).json({ status: false, message: "Not Found" })
    }
})

module.exports = router;