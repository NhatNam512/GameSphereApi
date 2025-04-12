var express = require('express');
var router = express.Router();
const previewModel = require('../models/events/previewEventModel');
const {getSocketIO} = require("../socket/socket");
const Event = require('../models/events/eventModel')
const mongoose = require("mongoose");

const getAverageRating = async(eventId) => {
    const result = await previewModel.aggregate([
      { $match: { gameId: new mongoose.Types.ObjectId(eventId)} },
      {
        $group: {
          _id: "$eventId",
          averageRating: { $avg: "$rating" }
        }
      }
    ]);
   
    return result.length > 0 ? parseFloat(result[0].averageRating.toFixed(1)) : 0;
  }
  
  const updateEventRating = async (eventId) => {
    const average = await getAverageRating(eventId);
    await Event.findByIdAndUpdate(eventId, { averageRating: average });
  };

router.post("/post", async (req, res) => {
    try{
        const {userId, eventId, comment, rating, image} = req.body;
        const newPost = new previewModel({
            userId, eventId, comment, rating, image
        });
        await newPost.save();
        await updateEventRating(eventId);

        const populatedPost = await previewModel.findById(newPost._id).populate("userId", "username email picUrl");

        const io = getSocketIO(); // Lấy đối tượng Socket.IO
        io.emit("newPostEvent", { message: "Có bài post mới!", post: populatedPost });

        res.status(200).json({ status: true, message: "Đăng bài thành công", data: newPost});
    }catch(e){
        res.status(500).json({ status: false, message: "Lỗi server: " + e.message });
    }
});

router.get("/all", async (req, res) => {
    try{
        const preview = await previewModel.find().populate("userId");
        res.status(200).json({
            status: true,
            message: "Lấy danh sách preview thành công",
            data: preview 
          });
    }catch(e){
        res.status(500).json({ status: false, message: "Lỗi server: " + e.message });
    }
});

router.get("/:eventId", async (req, res) => {
    try {
        const { eventId } = req.params;
        const reviews = await previewModel.find({ eventId }).populate("userId", "username email picUrl");

        res.status(200).json({
            status: true,
            message: "Lấy danh sách review thành công",
            data: reviews
        });
    } catch (e) {
        res.status(500).json({ status: false, message: "Lỗi server: " + e.message });
    }
});

module.exports = router