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
router.get('/searchUser', groupController.searchUserByEmailOrPhone);
router.post('/:groupId/decline', groupController.declineInvite);
router.post('/:groupId/leave', groupController.leaveGroup);
router.delete('/:groupId', groupController.deleteGroup);
router.get('/by-event/:eventId', groupController.getGroupsByEvent);
router.get('/by-user/:userId', groupController.getGroupsByUser);
router.get('/user/:userId/groups', groupController.getGroupsByUser);
router.get('/invited/:userId', groupController.getGroupInvitesForUser);
router.delete('/delete/:groupId', groupController.deleteGroup);

module.exports = router; 