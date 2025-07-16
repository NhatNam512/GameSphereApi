const express = require('express');
const router = express.Router();
const tagController = require('../../controllers/events/tagController');

router.get('/suggest', tagController.suggestTags);
router.post('/create', tagController.createTag);
router.get('/default', tagController.getDefaultTags);

module.exports = router; 