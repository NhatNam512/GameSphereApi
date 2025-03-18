const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: 'nhatnam5122004@gmail.com',
      pass: 'ayszfrkiosurxumg'
    }
  });

module.exports = { transporter };