// controllers/friendController.js

const FriendRequest = require('../../models/user/friendRequestModel');
const User = require('../../models/userModel');
const redisClient = require('../../redis/redisClient');
const notificationService = require('../../services/notificationService');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');
const friendshipModel = require('../../models/user/friendshipModel');

// Rate limiting middleware
exports.friendRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Quá nhiều yêu cầu kết bạn, vui lòng thử lại sau.'
});

// Middleware validate khi gửi lời mời
exports.validateFriendRequest = async (req, res, next) => {
    const { receiverId } = req.body;
    const senderId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ message: "ID người nhận không hợp lệ" });
    }
    if (senderId === receiverId) {
        return res.status(400).json({ message: "Không thể gửi lời mời cho chính mình" });
    }
    next();
};

exports.searchUsers = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const searchTerm = req.query.searchTerm;
        if (!searchTerm || searchTerm.length < 2) {
            return res.status(400).json({ message: "Từ khóa tìm kiếm phải có ít nhất 2 ký tự" });
        }

        const userId = req.user.id;
        const cacheKey = `search:${userId}:${searchTerm}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            logger.info(`Cache hit for search term: ${searchTerm}`);
            return res.json(JSON.parse(cached));
        }

        logger.info(`Cache miss for search term: ${searchTerm}`);
        session.startTransaction();

        const users = await User.aggregate([
            {
                $match: {
                    $and: [
                        {
                            $or: [
                                { username: { $regex: searchTerm, $options: 'i' } },
                                { email: { $regex: searchTerm, $options: 'i' } }
                            ]
                        },
                        { _id: { $ne: new mongoose.Types.ObjectId(userId) } }
                    ]
                }
            },
            {
                $project: {
                    username: 1,
                    email: 1,
                    picUrl: 1,
                }
            },
            { $limit: 20 }
        ]).session(session);

        const result = await Promise.all(users.map(async (user) => {
            const friendRequest = await FriendRequest.findOne({
                $or: [
                    { senderId: userId, receiverId: user._id },
                    { senderId: user._id, receiverId: userId }
                ]
            }).session(session);

            return {
                ...user,
                relationshipStatus: friendRequest ? friendRequest.status : 'none'
            };
        }));

        await session.commitTransaction();
        await redisClient.setex(cacheKey, 3600, JSON.stringify(result));
        logger.info(`Search completed for term: ${searchTerm}, found ${result.length} results`);

        return res.json(result);

    } catch (error) {
        await session.abortTransaction();
        logger.error('Error in searchUsers:', { error: error.message });
        return res.status(500).json({ message: 'Internal Server Error' });
    } finally {
        session.endSession();
    }
};

exports.sendFriendRequest = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const senderId = req.user.id;
        const { receiverId } = req.body;

        const receiver = await User.findById(receiverId).session(session);
        if (!receiver) {
            await session.abortTransaction();
            return res.status(404).json({ message: "Người nhận không tồn tại." });
        }

        const existing = await FriendRequest.findOne({
            $or: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId }
            ]
        }).session(session);

        if (existing) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Đã tồn tại lời mời hoặc đã là bạn." });
        }

        const request = new FriendRequest({ senderId, receiverId });
        await request.save({ session });

        try {
            await notificationService.sendFriendRequestNotification(receiver);
        } catch (notiErr) {
            await session.abortTransaction();
            logger.error('Notification failed:', notiErr);
            return res.status(500).json({ message: 'Không thể gửi thông báo.' });
        }

        await session.commitTransaction();
        logger.info(`Friend request sent from ${senderId} to ${receiverId}`);
        return res.status(200).json({ message: "Gửi lời mời thành công.", request });
    } catch (error) {
        await session.abortTransaction();
        logger.error('Error in sendFriendRequest:', error);
        return res.status(500).json({ message: "Internal Server Error" });
    } finally {
        session.endSession();
    }
};

exports.acceptFriendRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.user.id;
        const username = req.user.username;

        const request = await FriendRequest.findById(requestId);
        if (!request || request.receiverId.toString() !== userId.toString()) {
            return res.status(404).json({ message: "Lời mời không hợp lệ hoặc không tồn tại." });
        }

        if (request.status === 'accepted') {
            return res.status(400).json({ message: "Lời mời đã được chấp nhận trước đó." });
        }

        request.status = "accepted";
        const [uid1, uid2] = [request.senderId.toString(), request.receiverId.toString()].sort();
        await friendshipModel.create({ user1: uid1, user2: uid2 });

        await request.save();

        const sender = await User.findById(request.senderId);
        if (sender?.fcmTokens?.length > 0) {
            await notificationService.sendFriendAcceptNotification(
                sender,
                username,
                req.user.picUrl
            );
        }

        await redisClient.del(`friendList:${userId}`);
        await redisClient.del(`friendList:${request.senderId}`);

        return res.status(200).json({ message: "Đã chấp nhận lời mời kết bạn.", request });
    } catch (error) {
        logger.error("Error in acceptFriendRequest:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.declineFriendRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.user.id;

        const request = await FriendRequest.findById(requestId);
        if (!request || request.receiverId.toString() !== userId) {
            return res.status(404).json({ message: "Lời mời không hợp lệ hoặc không tồn tại." });
        }

        request.status = "declined";
        await request.save();

        return res.status(200).json({ message: "Đã từ chối lời mời kết bạn.", request });
    } catch (error) {
        logger.error("Error in declineFriendRequest:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getPendingRequests = async (req, res) => {
    try {
        const userId = req.user.id;
        const requests = await FriendRequest.find({
            receiverId: userId,
            status: 'pending'
        })
            .populate('senderId', 'username email name picUrl')
            .sort({ createdAt: -1 });

        return res.status(200).json({ requests });
    } catch (error) {
        logger.error("Error in getPendingRequests:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getFriendsList = async (req, res) => {
    try {
        const userId = req.user.id;
        const cacheKey = `friendList:${userId}`;
        const cached = await redisClient.get(cacheKey);

        if (cached) {
            return res.status(200).json({ friends: JSON.parse(cached) });
        }

        const friendships = await friendshipModel.find({
            $or: [
                { user1: userId },
                { user2: userId }
            ]
        }).populate('user1 user2', 'username picUrl');

        const friends = friendships.map(f => {
            const u1 = f.user1._id.toString();
            const u2 = f.user2._id.toString();
            return u1 === userId.toString() ? f.user2 : f.user1;
        });

        await redisClient.set(cacheKey, JSON.stringify(friends), 'EX', 300);
        return res.status(200).json({ friends });
    } catch (error) {
        logger.error("Error in getFriendsList:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.unfriend = async (req, res) => {
    try {
        const userId = req.user.id;
        const { friendId } = req.params;

        const [uid1, uid2] = [userId, friendId].sort();
        const result = await friendshipModel.findOneAndDelete({ user1: uid1, user2: uid2 });

        if (!result) {
            return res.status(404).json({ message: "Không tìm thấy quan hệ bạn bè." });
        }

        await redisClient.del(`friendList:${userId}`);
        await redisClient.del(`friendList:${friendId}`);
        await FriendRequest.deleteMany({
            $or: [
                { senderId: userId, receiverId: friendId },
                { senderId: friendId, receiverId: userId }
            ]
        });

        return res.status(200).json({ message: "Đã huỷ kết bạn." });
    } catch (error) {
        logger.error("Error in unfriend:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};
exports.checkFriendship = async (req, res) => {
    const userId = req.user.id;
    const { otherUserId } = req.params;

    const [uid1, uid2] = [userId, otherUserId].sort();
    const isFriend = await friendshipModel.exists({ user1: uid1, user2: uid2 });

    return res.status(200).json({ isFriend: !!isFriend });
};

