var express = require('express');
var router = express.Router();
const plantModel = require('../models/plants/plantModel');
const categoryModel = require('../models/plants/plantCategoryModel');

router.get('/all', async function (req, res) {
    try{
        // Sử dụng populate để lấy danh mục tương ứng với loại cây
        const plants = await plantModel.find().populate('type');

        res.status(200).json({
            status: true,
            message: 'Lấy sản phẩm thành công',
            plants
        });
    }catch(e){
        res.status(400).json({ status: false, message: "Lấy sản phẩm thất bại: " + e.message });
    }
});

router.get("/home", async function (req, res) {
  try{
  const plants = await plantModel.find()
  .populate('type')
  .select("_id name type price images");

  res.status(200).json({
    status: true,
    message: "Lấy danh sách cây thành công",
    data: plants 
  });
  }catch(e){
    res.status(400).json({ status: false, message: "Error" + e});
  }
});

router.get('/detail/:id', async function (req, res) {
    try{
      const { id }= req.params;
        const plant = await plantModel.findById(id).populate('type');
        if(plant){
        res.status(200).json({
            status: true,
            message: 'Lấy sản phẩm thành công',
            plant
        });
    }
    else{
        res.status(404).json({ status: false, message: "Không thấy sản phẩm"});
    }
    }catch(e){
        res.status(400).json({ status: false, message: "Lấy sản phẩm thất bại" + e });
    }
})

router.post('/add', async function (req, res) {
    try{
        const {name, type, price, quantity, size, source, images} = req.body;
        const newPlant = {name, type, price, quantity, size, source, images};
        await plantModel.create(newPlant);
        res.status(200).json({
            status: true,
            message: "Successfully"
          });
    }catch(e){
        res.status(400).json({ status: false, message: "Thêm sản phẩm thất bại" + e });
    }
});

router.get("/search", async function (req, res) {
    try {
      const { query } = req.query;
      const plants = await plantModel.find({
        $or: [
          { name: { $regex: query, $options: "i" } },
        ]
      });
  
      if (plants.length > 0) {
        res.status(200).json({
          status: true,
          message: "Tìm kiếm sản phẩm thành công",
          data: plants
        });
      } else {
        res.status(404).json({ status: false, message: "Không tìm thấy sản phẩm" });
      }
    } catch (e) {
      res.status(400).json({ status: false, message: "Error: " + e });
    }
  });
  router.get('/getPlant', async function (req, res) {
    try {
        const { type } = req.query;
        const plants = await plantModel.find({type: type}).populate('type');
        if (plants.length > 0) {
            res.status(200).json({
                status: true,
                message: 'Lấy sản phẩm thành công',
                plants
            });
        } else {
            res.status(404).json({ status: false, message: "Không thấy sản phẩm" });
        }
    } catch (e) {
        res.status(400).json({ status: false, message: "Lấy sản phẩm thất bại: " + e.message });
    }
});

module.exports = router;