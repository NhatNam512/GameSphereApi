var express = require('express');
const authenticate = require('../../middlewares/auth');
const { reserveSeats, createZone } = require('../../controllers/events/zoneController');
const router = express.Router();

router.post('/reserveSeats', authenticate, reserveSeats);

router.post('/createZone', authenticate, createZone);

module.exports = router;