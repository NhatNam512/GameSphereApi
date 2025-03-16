var express = require('express');
var router = express.Router();
const plantModel = require('../models/plantModel');
const categoryModel = require('../models/plantCategoryModel');

router.get('/all', async function (req, res) {
    try{
        const plants = await plantModel.find();
        // Lấy danh mục cho từng loại cây
        const categories = await categoryModel.find({id: { $in: plants.map(plant => plant.type) } });
        
        // Tạo một đối tượng danh mục với tên
        const categoriesNames = categories.map(category => category.name);

        res.status(200).json({
            status: true,
            message: 'Lấy sản phẩm thành công',
            data: {
              plants,
              categories: categoriesNames // Trả về danh sách tên danh mục
            }
        });
    }catch(e){
        res.status(400).json({ status: false, message: "Lấy sản phẩm thất bại" + e });
    }
});

router.get('/detail/:id', async function (req, res) {
    try{
        const { id }= req.params;
        const plant = await plantModel.findById(id);
        const categories = await categoryModel.find({id: { $in: plant.map(plant => plant.type) } });
        // Tạo một đối tượng danh mục với tên
        const categoriesNames = categories.map(category => category.name);
        if(plant){
        res.status(200).json({
            status: true,
            message: 'Lấy sản phẩm thành công',
            data: {
              plant,
              categories: categoriesNames // Trả về danh sách tên danh mục
            }
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

module.exports = router;