# Chức Năng Tặng Vé - Gift Ticket Feature

## Tổng Quan
Chức năng tặng vé cho phép người dùng mua vé và tặng cho người khác. Vé sẽ thuộc về người nhận quà và email thông báo sẽ được gửi đến người nhận.

## Luồng Hoạt Động

### 1. Tạo Đơn Hàng Quà Tặng
**Endpoint:** `POST /orders/createOrder`

**Request Body:**
```json
{
  "userId": "64a7b8c9d1e2f3a4b5c6d7e8",
  "eventId": "64a7b8c9d1e2f3a4b5c6d7e9", 
  "showtimeId": "64a7b8c9d1e2f3a4b5c6d7ea",
  "bookingIds": [...],
  "bookingType": "seat",
  "totalPrice": 500000,
  
  // Thông tin quà tặng
  "giftRecipientUserId": "64a7b8c9d1e2f3a4b5c6d7eb",
  "giftMessage": "Chúc mừng sinh nhật bạn!"
}
```

**Validation:**
- `giftRecipientUserId` phải là ObjectId hợp lệ của user tồn tại
- Không được tặng cho chính mình
- `giftMessage` tối đa 500 ký tự

### 2. Tạo Vé
**Endpoint:** `POST /orders/createTicket`

**Luồng xử lý:**
- Nếu `order.isGift = true`:
  - Vé được tạo với `userId = giftRecipientUserId` (vé thuộc về người nhận)
  - Thêm thông tin gift vào vé: `recipientUserId`, `isGift`, `giftMessage`
  - Gửi email đặc biệt cho người nhận quà

### 3. Tìm Kiếm Người Nhận Quà
**Endpoint:** `GET /users/search?query=email_or_username`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Tìm kiếm người dùng thành công",
  "data": [
    {
      "userId": "64a7b8c9d1e2f3a4b5c6d7eb",
      "email": "recipient@example.com",
      "username": "recipient_user",
      "fullName": "Người Nhận",
      "avatar": "https://..."
    }
  ]
}
```

## Database Schema

### Order Model (Thêm Fields)
```javascript
{
  // ... existing fields
  giftRecipientUserId: { type: ObjectId, ref: "users" },
  isGift: { type: Boolean, default: false },
  giftMessage: { type: String, maxlength: 500 }
}
```

### Ticket Model (Thêm Fields)
```javascript
{
  // ... existing fields
  recipientUserId: { type: ObjectId, ref: "users" },
  isGift: { type: Boolean, default: false },
  giftMessage: { type: String, maxlength: 500 }
}
```

## Email Templates

### Vé Quà Tặng
Template `ticketEmail.html` đã được cập nhật để hỗ trợ:
- Hiển thị thông báo quà tặng với background gradient đặc biệt
- Thông tin người tặng
- Lời nhắn quà tặng (nếu có)
- Subject line khác biệt: "🎁 Bạn nhận được vé quà tặng..."

## API Examples

### 1. Tạo Đơn Hàng Quà Tặng
```bash
curl -X POST http://localhost:3000/orders/createOrder \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "64a7b8c9d1e2f3a4b5c6d7e8",
    "eventId": "64a7b8c9d1e2f3a4b5c6d7e9",
    "showtimeId": "64a7b8c9d1e2f3a4b5c6d7ea",
    "bookingType": "none",
    "totalAmount": 2,
    "totalPrice": 500000,
    "giftRecipientUserId": "64a7b8c9d1e2f3a4b5c6d7eb",
    "giftMessage": "Chúc mừng sinh nhật!"
  }'
```

### 2. Tìm Kiếm User
```bash
curl -X GET "http://localhost:3000/users/search?query=john" \
  -H "Authorization: Bearer <token>"
```

## Frontend Integration

### 1. Search Component
```javascript
// Tìm kiếm người nhận quà
const searchUsers = async (query) => {
  const response = await fetch(`/users/search?query=${query}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};
```

### 2. Gift Form
```javascript
const orderData = {
  // ... order fields
  giftRecipientUserId: selectedUser.userId, // từ search results
  giftMessage: giftMessage // từ textarea
};
```

## Business Rules

### Validation
- ✅ User nhận quà phải tồn tại
- ✅ Không được tặng cho chính mình  
- ✅ Lời nhắn tối đa 500 ký tự
- ✅ Tất cả validation hiện tại vẫn áp dụng

### Performance
- ✅ Sử dụng ObjectId lookup (nhanh nhất)
- ✅ Search API có limit 10 kết quả
- ✅ Email gửi async không block response

### Security
- ✅ API search yêu cầu authentication
- ✅ Không cho phép tặng cho chính mình
- ✅ Validate user tồn tại trước khi tạo order

## Testing

### Test Cases
1. **Tạo đơn hàng quà tặng thành công**
2. **Validation lỗi khi tặng cho chính mình**
3. **Validation lỗi khi user nhận không tồn tại**
4. **Email được gửi đến đúng người nhận**
5. **Vé thuộc về người nhận quà**
6. **Search user hoạt động chính xác**

### Sample Test Data
```javascript
// User A tặng vé cho User B
const giftOrder = {
  userId: "userA_id",           // Người mua/tặng
  giftRecipientUserId: "userB_id", // Người nhận
  giftMessage: "Happy Birthday!",
  // ... other fields
};

// Kết quả: Vé có userId = "userB_id"
```

## Migration Notes

### Existing Data
- Các order và ticket hiện tại sẽ có `isGift = false` (default)
- Không ảnh hưởng đến chức năng hiện có
- Backward compatible 100%

### Database Indexes (Khuyến nghị)
```javascript
// Thêm index để tối ưu search
db.users.createIndex({ "email": "text", "username": "text" });
db.orders.createIndex({ "isGift": 1, "giftRecipientUserId": 1 });
db.tickets.createIndex({ "isGift": 1, "recipientUserId": 1 });
```

## Troubleshooting

### Common Issues
1. **"Không tìm thấy người dùng nhận quà"**
   - Kiểm tra `giftRecipientUserId` có đúng format ObjectId
   - Kiểm tra user có tồn tại trong database

2. **Email không được gửi**
   - Kiểm tra log console để xem lỗi chi tiết
   - Kiểm tra email service configuration

3. **Search không trả về kết quả**
   - Đảm bảo từ khóa có ít nhất 2 ký tự
   - Kiểm tra authentication token

## Future Enhancements
- [ ] Email xác nhận cho người tặng
- [ ] Lịch sử quà đã tặng/nhận
- [ ] Notification push cho người nhận
- [ ] Gift voucher/coupon codes
- [ ] Batch gift (tặng cho nhiều người cùng lúc)