var express = require("express");
const moment = require("moment");
var router = express.Router();
const CryptoJS = require('crypto-js');
const { default: axios } = require("axios");

const config = {
  app_id: "2554",
  key1: "sdngKKJmqEMzvh5QQcdD2A9XBSKUNaYn",
  key2: "trMrHtvjo6myautxDUiAcYsVtaeQ8nhf",
  endpoint: "https://sb-openapi.zalopay.vn/v2/create",
};

router.post("/", async (req, res, next) => {
  try {
    const { amount, urlCalbackSuccess, dataSave, description, nameUser } =
      req.body;

    if (!amount || !nameUser) {
      return res.status(400).json({ error: "Thiếu dữ liệu đầu vào" });
    }

    const embed_data = {
      redirecturl: urlCalbackSuccess,
    };

    const items = [
      {
        dataSave: dataSave, 
        // dữ liệu bạn muốn lưu lại để khi thanh toán thành công sẽ xủ lý bên backend của mìnhmình
      },
    ];

    const transID = Math.floor(Math.random() * 1000000);

    const order = {
      app_id: config.app_id, // id của config
      app_trans_id: `${moment().format("YYMMDD")}_${transID}`, // mã đơn
      app_user: nameUser, // tên người dùng
      app_time: Date.now(), // ngày tạo
      item: JSON.stringify(items), // dữ lưu muốn lưu
      embed_data: JSON.stringify(embed_data), // sẽ dẫn qua đường dẫn này khi thanh toán thành công
      amount: amount, // giá tiền
      description: description, // mô tả
      bank_code: "",
      callback_url: "https://gamesphereapi.onrender.com/payments/callback",
      // cái này khi tạo thanh toán thành công sẽ chuyển sang api để xử lý dữ liệu cho db của mình
    };

    // Tạo chữ ký bảo mật (MAC)
    const data =
      config.app_id +
      "|" +
      order.app_trans_id +
      "|" +
      order.app_user +
      "|" +
      order.amount +
      "|" +
      order.app_time +
      "|" +
      order.embed_data +
      "|" +
      order.item;
    order.mac = CryptoJS.HmacSHA256(data, config.key1).toString();


    ///
    /// các bạn có thể thêm status waiting ngay đây nè
    ///

    // Gửi request tạo đơn hàng đến ZaloPay
    const orderResponse = await axios.post(config.endpoint, null, {
      params: order,
    });
    if (orderResponse.status !== 200 || !orderResponse.data) {
      console.error("Lỗi từ ZaloPay:", orderResponse.data);
        ///
    /// lỗi thì các bạn chỉnh lại db ngay đây 
    ///
      return res.status(400).json({ data: orderResponse.data.message });
    }
    return res.status(200).json({ data: orderResponse.data });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ data: "Lỗi hệ thống" });
  }
});

router.post("/callback", async (req, res) => {
  let result = {};
  try {
    const { data: dataStr, mac: reqMac } = req.body;

    if (!dataStr || !reqMac) {
      return res.status(400).json({ error: "Dữ liệu callback không hợp lệ" });
    }

    console.log(dataStr)
    console.log("mac 1 =", reqMac)

    let mac = CryptoJS.HmacSHA256(dataStr, config.key2).toString();
    console.log("mac 2=", mac);

    // kiểm tra callback hợp lệ (đến từ ZaloPay server)
    if (reqMac !== mac) {
      // callback không hợp lệ
      result.return_code = -1;
      result.return_message = "mac not equal";
    } else {
      // thanh toán thành công
      // merchant cập nhật trạng thái cho đơn hàng
      let dataJson = JSON.parse(dataStr);
      console.log(dataJson)

      let data = JSON.parse(dataJson.item);
      console.log(data)

      console.log(
        "\n update order's status = success where app_trans_id =",
        dataJson["app_trans_id"]
      );

      // TODO: Cập nhật trạng thái đơn hàng trong DB
      // xử lý dữ liệu ở  đây lưu dữ liệu db vân vân
      

      result.return_code = 1;
      result.return_message = "success";
    }
  } catch (ex) {
    result.return_code = 0; // ZaloPay server sẽ callback lại (tối đa 3 lần)
    result.return_message = ex.message;
  }

  // thông báo kết quả cho ZaloPay server
  res.json(result);
});

module.exports = router;
