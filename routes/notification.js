const { default: axios } = require('axios');
var express = require('express');
var router = express.Router();

router.post("/send", async (req, res) => {
    const { token, title, body } = req.body;
  
    try {
      const result = await axios.post(
        "https://exp.host/--/api/v2/push/send",
        {
          to: token,
          title,
          body,
          sound: "default",
          priority: "high",
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
  
      res.json(result.data);
    } catch (err) {
      console.error(err.response?.data || err.message);
      res.status(500).send("Lỗi khi gửi notification");
    }
  });

  module.exports = router;