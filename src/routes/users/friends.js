var express = require('express');
const {authenticate} = require('../../middlewares/auth');
const { searchUsers, sendFriendRequest, getPendingRequests, acceptFriendRequest, declineFriendRequest, getFriendsList, unfriend, searchUserByEmailOrPhone } = require('../../controllers/friend/friendController');
const { inviteFriendsToEvent, acceptInviteToEvent, declineInviteToEvent, getPendingEventInvites, getFriendsToInvite, getEventParticipants, getJoinedEvents, joinEvent, unjoinEvent } = require('../../controllers/friend/inviteFriendController');
var router = express.Router();

//Friend
router.get("/search", authenticate, searchUsers);

router.post("/friendRequest", authenticate, sendFriendRequest);

router.get("/getPendingRequests", authenticate, getPendingRequests);

router.post("/accept/:requestId", authenticate, acceptFriendRequest);

router.post("/decline/:requestId", authenticate, declineFriendRequest);

router.post("/unfriend/:friendId", authenticate, unfriend);

router.get("/list", authenticate, getFriendsList);

//Invite
router.post("/join/:eventId", authenticate, joinEvent);

router.post("/unjoin/:eventId", authenticate, unjoinEvent);

router.post("/invites", authenticate, inviteFriendsToEvent);

router.post("/invites/accept/:inviteId", authenticate, acceptInviteToEvent);

router.post("/invites/decline/:inviteId", authenticate, declineInviteToEvent);

router.get("/invites/pending", authenticate, getPendingEventInvites);

router.get("/invites/friends", authenticate, getFriendsToInvite);

//Get Participants
router.get("/participants/:eventId", authenticate, getEventParticipants);

router.get("/joined", authenticate, getJoinedEvents);

router.get('/search', searchUserByEmailOrPhone);

module.exports = router;