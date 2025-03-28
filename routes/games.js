var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const gameModel = require('../models/games/gameModel');
const PreviewGame = require('../models/games/previewGameModel');

router.get("/all", async function (req, res) {
  try{
  const games = await gameModel.find().populate('categories');
  res.status(200).json({
    status: true,
    message: "Lấy danh sách games thành công",
    data: games 
  });
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e});
  }
});

router.get("/home", async function (req, res) {
  try{
  const games = await gameModel.find()
  .populate('categories')
  .select("_id name avatar background categories description createdAt updatedAt");

  res.status(200).json({
    status: true,
    message: "Lấy danh sách games thành công",
    data: games 
  });
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e});
  }
});

router.post("/add", async (req, res) => {
  try {
    const { name, description, developer, size, urlDownload, categories, avatar, video, background, screenshot, timeReleases, upComing } = req.body;

    // Tạo game mới
    const newGame = new gameModel({
      name,
      description,
      developer,
      size,
      urlDownload,
      categories,
      avatar,
      video,
      background,
      screenshot,
    });

    await newGame.save();
    res.status(200).json({ status: true, message: "Game đã được thêm!", data: newGame });

  } catch (error) {
    res.status(500).json({ status: false, message: "Lỗi server: " + error.message });
  }
});

/** 
 * @route   PUT /games/update/:id
 * @desc    Cập nhật game
 */
router.put("/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, developer, size, urlDownload, categories, avatar, video, background, screenshot, timeReleases, upComing } = req.body;

    // Kiểm tra game có tồn tại không
    const existingGame = await gameModel.findById(id);
    if (!existingGame) {
      return res.status(404).json({ status: false, message: "Game không tồn tại!" });
    }

    // Cập nhật game
    existingGame.name = name || existingGame.name;
    existingGame.description = description || existingGame.description;
    existingGame.developer = developer || existingGame.developer;
    existingGame.size = size || existingGame.size;
    existingGame.urlDownload = urlDownload || existingGame.urlDownload;
    existingGame.categories = categories || existingGame.categories;
    existingGame.avatar = avatar || existingGame.avatar;
    existingGame.video = video || existingGame.video;
    existingGame.background = background || existingGame.background;
    existingGame.screenshot = screenshot || existingGame.screenshot;

    await existingGame.save();
    res.status(200).json({ status: true, message: "Game đã được cập nhật!", data: existingGame });

  } catch (error) {
    res.status(500).json({ status: false, message: "Lỗi server: " + error.message });
  }
});

router.get('/detail/:id', async function (req, res) {
  try{
    const { id }= req.params;
      const game = await gameModel.findById(id).populate('categories');
      if(game){
      res.status(200).json({
          status: true,
          message: 'Lấy sản phẩm thành công',
          data: game
      });
  }
  else{
      res.status(404).json({ status: false, message: "Không thấy sản phẩm"});
  }
  }catch(e){
      res.status(400).json({ status: false, message: "Lấy sản phẩm thất bại" + e });
  }
})

module.exports = router;