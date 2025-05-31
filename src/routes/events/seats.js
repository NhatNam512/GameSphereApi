var express = require('express');
const authenticate = require('../../middlewares/auth');
const { reserveSeats, createZone } = require('../../controllers/events/zoneController');
const { createZoneTicket, reserveTickets } = require('../../controllers/events/zoneTicketController');
const router = express.Router();

router.post('/reserveSeats', authenticate, reserveSeats);

router.post('/createZone', authenticate, createZone);

router.post('/createZoneTicket', authenticate, createZoneTicket);

router.post('/reserveZoneTicket', authenticate, reserveTickets)

module.exports = router;