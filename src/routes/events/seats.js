var express = require('express');
const authenticate = require('../../middlewares/auth');
const { reserveSeats, createZone, cancelAllReservedSeats } = require('../../controllers/events/zoneController');
const { createZoneTicket, reserveTickets } = require('../../controllers/events/zoneTicketController');
const router = express.Router();
const seatsController = require('../../controllers/events/seats');

router.post('/reserveSeats', authenticate, reserveSeats);

router.post('/createZone', authenticate, createZone);

router.post('/createZoneTicket', authenticate, createZoneTicket);

router.post('/reserveZoneTicket', authenticate, reserveTickets)

router.get('/checked-in/:eventId', seatsController.getCheckedInUsersByEvent);

module.exports = router;