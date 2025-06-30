const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groups/groupController');

router.post('/createGroup', groupController.createGroup);
router.post('/:groupId/invite', groupController.inviteMember);
router.get('/:groupId/invites', groupController.getInvites);
router.post('/:groupId/accept', groupController.acceptInvite);
router.get('/:groupId/members', groupController.getMembers);
router.post('/:groupId/location', groupController.updateLocation);
router.get('/:groupId/locations', groupController.getLocations);

module.exports = router; 