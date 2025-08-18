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

async function sendForgetOtpEmail(to, otp) {
  return resend.emails.send({
    from: 'EventSphere <noreply@api.eventsphere.io.vn>',
    to,
    subject: 'Mã xác nhận lấy lại mật khẩu',
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
      })),
      // Gift fields
      isGift: ticketData.isGift || false,
      giverName: ticketData.giver ? (ticketData.giver.fullName || ticketData.giver.email) : null,
      giftMessage: ticketData.giftMessage || null
    };
    
    // Tạo HTML từ template
    const htmlContent = template(emailData);
    
    // Cấu hình email
    const subject = emailData.isGift 
      ? `🎁 Bạn nhận được vé quà tặng cho sự kiện "${ticketData.event.name}"`
      : `🎫 Vé sự kiện "${ticketData.event.name}" - Đặt vé thành công`;
      
    const mailOptions = {
      from: 'EventSphere <nhatnam5122004@gmail.com>',
      to: ticketData.user.email,
      subject: subject,
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

async function sendGroupInviteEmail(inviteData) {
  try {
    // Đọc template HTML
    const templatePath = path.join(__dirname, '../templates/groupInviteEmail.html');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    
    // Compile template với Handlebars
    const template = handlebars.compile(templateSource);
    
    // Helper function để format date
    handlebars.registerHelper('formatDate', function(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    });
    
    // Chuẩn bị dữ liệu cho template
    const emailData = {
      inviterName: inviteData.inviter.username || inviteData.inviter.email,
      groupName: inviteData.group.groupName,
      inviteUrl: inviteData.inviteUrl,
      eventInfo: inviteData.event ? {
        name: inviteData.event.name,
        avatar: inviteData.event.avatar,
        banner: inviteData.event.banner,
        timeStart: inviteData.event.timeStart,
        timeEnd: inviteData.event.timeEnd
      } : null
    };
    
    // Tạo HTML từ template
    const htmlContent = template(emailData);
    
    // Cấu hình email
    const mailOptions = {
      from: 'EventSphere <noreply@eventsphere.io.vn>',
      to: inviteData.email,
      subject: `🎉 Lời mời tham gia nhóm "${inviteData.group.groupName}" - EventSphere`,
      html: htmlContent
    };
    
    // Gửi email qua transporter (giống như vé email)
    const result = await transporter.sendMail(mailOptions);
    console.log('Group invite email sent via transporter:', result.messageId);
    console.log('📧 Email details - To:', inviteData.email, 'Subject:', mailOptions.subject);
    
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Error sending group invite email:', error);
    throw new Error('Không thể gửi email mời nhóm: ' + error.message);
  }
}

// Gửi email thông báo hoãn sự kiện
async function sendEventPostponeEmail({ to, eventName, reason, timeStart, timeEnd, contact }) {
  try {
    const templatePath = path.join(__dirname, '../templates/postponeEmail.html');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateSource);

    const emailData = {
      eventName,
      reason: reason || 'Sự kiện đã được hoãn bởi ban tổ chức',
      timeStart: timeStart ? new Date(timeStart).toLocaleString('vi-VN') : '',
      timeEnd: timeEnd ? new Date(timeEnd).toLocaleString('vi-VN') : '',
      contact: contact || 'support@eventsphere.io.vn'
    };

    const htmlContent = template(emailData);

    const mailOptions = {
      from: 'EventSphere <noreply@eventsphere.io.vn>',
      to,
      subject: `Thông báo hoãn sự kiện: ${eventName}`,
      html: htmlContent
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Postpone email sent:', to, result.messageId);
    return { success: true };
  } catch (error) {
    console.error('Error sending postpone email:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendOtpEmail, sendTicketEmail, sendGroupInviteEmail, sendForgetOtpEmail, sendEventPostponeEmail };