const express = require('express');
const { createInteraction, getEventTotalScores } = require('../../controllers/events/interactionController');
const { authenticate } = require('../../middlewares/auth');
const router = express.Router();

router.post('/addInteraction', authenticate, createInteraction);

router.get('/topViewed', getEventTotalScores);

module.exports = router;