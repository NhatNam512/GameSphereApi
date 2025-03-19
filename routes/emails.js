require("dotenv").config();
const express = require("express");
var router = express.Router();
const nodemailer = require("nodemailer");
const cryto = require("crypto");
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const otpStorage = new Map();

router.post("/send-otp", async function (req, res) {
    const {email} = req.body;
    if (!email) return res.status(400).json({ message: "Bắt buộc có email" });

    const otp = cryto.randomInt(100000, 999999).toString();
    otpStorage.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    try{
        // await transporter.sendMail({
        //     from: process.env.SMTP_USER,
        //     to: email,
        //     subject: "Your OTP Code",
        //     text: `Your OTP code is ${otp}. It will expire in 5 minutes.`,
        // });  
        await sgMail.send({
            from: {
                email: "namnnps38713@gmail.com",
                name: "EventSphere"
            },
            to: email,
            subject: "Your OTP Code",
            text: `Your OTP code is ${otp}. It will expire in 5 minutes.`,
        })
        res.status(200).json({ message: "OTP sent successfully" });
    }
    catch (error) {
        res.status(500).json({ message: "Error sending email", error });
    }
});

router.post("/verify-otp", async function(req, res) {
    const { email, otp } = req.body;
    const storedOtp = otpStorage.get(email);
  
    if (!storedOtp) return res.status(400).json({ message: "OTP expired or invalid" });
    if (storedOtp.otp !== otp) return res.status(400).json({ message: "Incorrect OTP" });
  
    otpStorage.delete(email);
    res.status(200).json({ message: "OTP verified successfully" });
  });

  module.exports = router;