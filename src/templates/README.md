# Email Templates

Thư mục này chứa các template HTML để gửi email cho người dùng.

## Ticket Email Template

### File: `ticketEmail.html`

Template HTML được thiết kế để gửi thông tin vé và đơn hàng cho người dùng sau khi đặt vé thành công.

### Tính năng:
- **Responsive Design**: Tối ưu cho cả desktop và mobile
- **Professional Layout**: Thiết kế chuyên nghiệp với gradient và styling hiện đại
- **QR Code Display**: Hiển thị mã QR cho từng vé
- **Multi-ticket Support**: Hỗ trợ hiển thị nhiều vé trong một email
- **Dynamic Content**: Sử dụng Handlebars để render dữ liệu động
- **Ticket Types**: Hỗ trợ các loại vé khác nhau (ghế, khu vực, vé thường)

### Dữ liệu cần thiết:

```javascript
const ticketEmailData = {
  user: {
    fullName: "Tên người dùng",
    email: "user@example.com"
  },
  order: {
    _id: "orderId",
    createdAt: "2024-01-01",
    totalPrice: 500000,
    bookingType: "seat" // "seat", "zone", "none"
  },
  event: {
    name: "Tên sự kiện",
    startDate: "2024-01-15",
    location: "Địa điểm tổ chức"
  },
  showtime: {
    startTime: "2024-01-15T19:00:00Z"
  },
  tickets: [
    {
      ticketId: "ABC-TCK123456",
      ticketNumber: 123456,
      status: "issued",
      qrCode: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      seat: { // Optional - chỉ có khi bookingType = "seat"
        seatId: "A1",
        zoneId: "VIP"
      },
      zone: { // Optional - chỉ có khi bookingType = "zone"
        zoneId: "zoneObjectId",
        zoneName: "Khu VIP"
      }
    }
  ]
};
```

### Sử dụng:

```javascript
const { sendTicketEmail } = require('../services/mailService');

// Gửi email vé
try {
  const result = await sendTicketEmail(ticketEmailData);
  console.log('Email sent successfully:', result.messageId);
} catch (error) {
  console.error('Error sending email:', error.message);
}
```

### Template Variables:

- `{{userName}}` - Tên người dùng
- `{{orderId}}` - Mã đơn hàng
- `{{orderDate}}` - Ngày đặt hàng (định dạng tiếng Việt)
- `{{ticketCount}}` - Số lượng vé
- `{{totalPrice}}` - Tổng tiền (định dạng VNĐ)
- `{{eventName}}` - Tên sự kiện
- `{{eventDate}}` - Ngày sự kiện
- `{{showtime}}` - Giờ diễn ra
- `{{eventLocation}}` - Địa điểm
- `{{bookingType}}` - Loại đặt vé (Vé thường/Vé theo ghế/Vé theo khu vực)
- `{{#each tickets}}` - Vòng lặp qua từng vé
  - `{{ticketId}}` - Mã vé
  - `{{ticketNumber}}` - Số vé
  - `{{status}}` - Trạng thái vé
  - `{{qrCode}}` - Mã QR (base64 image)
  - `{{#if seat}}` - Nếu có thông tin ghế
  - `{{#if zone}}` - Nếu có thông tin khu vực

### Dependencies:

- `handlebars` - Template engine
- `nodemailer` - Email sending
- `fs` - File system (đọc template)
- `path` - Path utilities

### Customization:

Để tùy chỉnh template:

1. **Styling**: Chỉnh sửa CSS trong thẻ `<style>`
2. **Layout**: Thay đổi cấu trúc HTML
3. **Content**: Sửa đổi nội dung văn bản
4. **Colors**: Thay đổi màu sắc trong CSS variables
5. **Branding**: Cập nhật logo và thông tin công ty

### Notes:

- Template sử dụng inline CSS để đảm bảo tương thích với các email client
- Responsive design với media queries cho mobile
- QR code được hiển thị dưới dạng base64 image
- Template hỗ trợ tiếng Việt với encoding UTF-8