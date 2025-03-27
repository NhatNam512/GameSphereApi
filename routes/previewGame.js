var express = require('express');
var router = express.Router();
const previewModel = require('../models/games/previewGameModel');
const {getSocketIO} = require("../socket/socket");

router.post("/post", async (req, res) => {
    try{
        const {userId, gameId, comment, rating, image} = req.body;
        const newPost = new previewModel({
            userId, gameId, comment, rating, image
        });
        await newPost.save();

        const io = getSocketIO();
        io.emit("new_review", newPost);

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
        const reviews = await previewModel.find({ gameId }).populate("userId");

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