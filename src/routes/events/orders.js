var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../../utils/tokenConfig");
const orderModel = require('../../models/events/orderModel');
const { createOrder, createTicket } = require('../../controllers/orders/orders');

router.get("/getOrders", async function (req, res) {
    try {
        const orders = await orderModel.find()
            .populate('eventId', 'name')
            .populate('userId', 'username email');

        return res.status(200).json({
            success: true,
            message: "Lấy đơn hàng thành công",
            data: orders
        });
    } catch (e) {
        return res.status(500).json({ success: false, message: "Lấy đơn hàng thất bại" + e });
    }
});

router.post("/createOrder", createOrder);
router.post("/createTicket", createTicket);

module.exports = router;