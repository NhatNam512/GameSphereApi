var express = require('express');
const authenticate = require('../../middlewares/auth');
const { seat, blockSeats, reserveSeats } = require('../../controllers/events/zoneController');
const router = express.Router();

router.post('/addSeats', authenticate, seat);

router.post('/reserveSeats', authenticate, reserveSeats);

router.get('/blockedSeats', blockSeats);

module.exports = router;