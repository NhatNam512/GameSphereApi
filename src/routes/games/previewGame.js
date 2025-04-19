var express = require('express');
var router = express.Router();
const previewModel = require('../../models/games/previewGameModel');
const {getSocketIO} = require("../../../socket/socket");
const Game = require('../../models/games/gameModel')
const mongoose = require("mongoose");

const getAverageRating = async(gameId) => {
    const result = await previewModel.aggregate([
      { $match: { gameId: new mongoose.Types.ObjectId(gameId)} },
      {
        $group: {
          _id: "$gameId",
          averageRating: { $avg: "$rating" }
        }
      }
    ]);
   
    return result.length > 0 ? parseFloat(result[0].averageRating.toFixed(1)) : 0;
  }
  
  const updateGameRating = async (gameId) => {
    const average = await getAverageRating(gameId);
    await Game.findByIdAndUpdate(gameId, { averageRating: average });
  };

router.post("/post", async (req, res) => {
    try{
        const {userId, gameId, comment, rating, image} = req.body;
        const newPost = new previewModel({
            userId, gameId, comment, rating, image
        });
        await newPost.save();
        await updateGameRating(gameId);

        const populatedPost = await previewModel.findById(newPost._id).populate("userId", "username email picUrl");

        const io = getSocketIO(); // Lấy đối tượng Socket.IO
        io.emit("newPost", { message: "Có bài post mới!", post: populatedPost });

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

router.get("/:gameId", async (req, res) => {
    try {
        const { gameId } = req.params;
        const reviews = await previewModel.find({ gameId }).populate("userId", "username email picUrl");

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