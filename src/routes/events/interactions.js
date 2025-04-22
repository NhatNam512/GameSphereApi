const express = require('express');
const { createInteraction } = require('../../controllers/events/interactionController');
const router = express.Router();

router.post('/', createInteraction);

module.exports = router;