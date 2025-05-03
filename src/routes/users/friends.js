var express = require('express');
const authenticate = require('../../middlewares/auth');
const { searchUsers, sendFriendRequest, getPendingRequests, acceptFriendRequest, declineFriendRequest, getFriendsList, unfriend } = require('../../controllers/friend/friendController');
var router = express.Router();

router.get("/search", authenticate, searchUsers);

router.post("/friendRequest", authenticate, sendFriendRequest);

router.get("/getPendingRequests", authenticate, getPendingRequests);

router.post("/accept/:requestId", authenticate, acceptFriendRequest);

router.post("/decline/:requestId", authenticate, declineFriendRequest);

router.post("/unfriend/:friendId", authenticate, unfriend);

router.get("/list", authenticate, getFriendsList);
module.exports = router;