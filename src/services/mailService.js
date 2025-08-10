// services/mail.service.js
const { resend } = require('../config/email');
const { transporter } = require('../utils/mailConfig');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

async function sendOtpEmail(to, otp) {
  return resend.emails.send({
    from: 'EventSphere <noreply@api.eventsphere.io.vn>',
    to,
    subject: 'Mã xác nhận đăng ký',
    html: `<p>Mã OTP của bạn là: <strong>${otp}</strong>. Có hiệu lực trong 5 phút.</p>`,
  });
}

async function sendTicketEmail(ticketData) {
  try {
    // Đọc template HTML
    const templatePath = path.join(__dirname, '../templates/ticketEmail.html');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    
    // Compile template với Handlebars
    const template = handlebars.compile(templateSource);
    
    // Chuẩn bị dữ liệu cho template
    const emailData = {
      userName: ticketData.user.fullName || ticketData.user.email,
      orderId: ticketData.order._id,
      orderDate: new Date(ticketData.order.createdAt).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      ticketCount: ticketData.tickets.length,
      totalPrice: ticketData.order.totalPrice.toLocaleString('vi-VN'),
      eventName: ticketData.event.name,
      eventDate: new Date(ticketData.event.startDate).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      showtime: new Date(ticketData.showtime.startTime).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      eventLocation: ticketData.event.location,
      bookingType: ticketData.order.bookingType === 'none' ? 'Vé thường' : 
                   ticketData.order.bookingType === 'seat' ? 'Vé theo ghế' : 'Vé theo khu vực',
      tickets: ticketData.tickets.map(ticket => ({
        ticketId: ticket.ticketId,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status === 'issued' ? 'Đã phát hành' : ticket.status,
        qrCode: ticket.qrCode,
        seat: ticket.seat,
        zone: ticket.zone
      }))
    };
    
    // Tạo HTML từ template
    const htmlContent = template(emailData);
    
    // Cấu hình email
    const mailOptions = {
      from: 'EventSphere <nhatnam5122004@gmail.com>',
      to: ticketData.user.email,
      subject: `🎫 Vé sự kiện "${ticketData.event.name}" - Đặt vé thành công`,
      html: htmlContent,
      attachments: []
    };
    
    // Gửi email
    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Error sending ticket email:', error);
    throw new Error('Không thể gửi email vé: ' + error.message);
  }
}

module.exports = { sendOtpEmail, sendTicketEmail };