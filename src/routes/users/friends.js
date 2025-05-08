var express = require('express');
const authenticate = require('../../middlewares/auth');
const { searchUsers, sendFriendRequest, getPendingRequests, acceptFriendRequest, declineFriendRequest, getFriendsList, unfriend } = require('../../controllers/friend/friendController');
const { inviteFriendsToEvent, acceptInviteToEvent, declineInviteToEvent, getPendingEventInvites, getFriendsToInvite } = require('../../controllers/friend/inviteFriendController');
var router = express.Router();

router.get("/search", authenticate, searchUsers);

router.post("/friendRequest", authenticate, sendFriendRequest);

router.get("/getPendingRequests", authenticate, getPendingRequests);

router.post("/accept/:requestId", authenticate, acceptFriendRequest);

router.post("/decline/:requestId", authenticate, declineFriendRequest);

router.post("/unfriend/:friendId", authenticate, unfriend);

router.get("/list", authenticate, getFriendsList);

router.post("/invites", authenticate, inviteFriendsToEvent);

router.post("/invites/accept/:inviteId", authenticate, acceptInviteToEvent);

router.post("/invites/decline/:inviteId", authenticate, declineInviteToEvent);

router.get("/invites/pending", authenticate, getPendingEventInvites);

router.get("/invites/friends", authenticate, getFriendsToInvite);

module.exports = router;