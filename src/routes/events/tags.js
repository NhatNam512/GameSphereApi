const express = require('express');
const router = express.Router();
const tagController = require('../../controllers/events/tagController');

router.get('/suggest', tagController.suggestTags);
router.post('/create', tagController.createTag);

module.exports = router; 