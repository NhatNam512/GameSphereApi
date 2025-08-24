# API Lọc Sự Kiện - EventSphere

## Tổng quan
API này cho phép lọc sự kiện theo nhiều tiêu chí khác nhau với cấu trúc dữ liệu giống như API `/home`.

## Endpoints

### 1. Lọc sự kiện
**POST** `/api/events/sort`

#### Request Body
```json
{
  "tags": ["concert", "live"],                 // Mảng tags (optional)
  "minTicketPrice": 100000,                   // Giá vé tối thiểu (optional)
  "timeStart": "2024-01-15T00:00:00.000Z",    // Thời gian bắt đầu (optional)
  "limit": 20,                                // Số lượng kết quả (default: 50)
  "page": 1                                   // Trang hiện tại (default: 1)
}
```

#### Response
```json
{
  "status": true,
  "message": "Lọc sự kiện thành công",
  "data": [
    {
      "_id": "event_id",
      "name": "Tên sự kiện",
      "timeStart": "2024-01-15T19:00:00.000Z",
      "timeEnd": "2024-01-15T21:00:00.000Z",
      "avatar": "url_avatar",
      "banner": "url_banner",
      "categories": ["Music"],
      "location": "Địa điểm",
      "latitude": 10.762622,
      "longitude": 106.660172,
      "typeBase": "seat",
      "zone": [],
      "tags": ["concert", "live"],
      "userId": {
        "_id": "user_id",
        "username": "username",
        "picUrl": "url_pic"
      },
      "createdAt": "2024-01-10T10:00:00.000Z",
      "approvalStatus": "approved",
      "minTicketPrice": 150000,
      "maxTicketPrice": 500000,
      "showtimes": [
        {
          "_id": "showtime_id",
          "startTime": "2024-01-15T19:00:00.000Z",
          "endTime": "2024-01-15T21:00:00.000Z",
          "ticketPrice": 150000,
          "ticketQuantity": 100
        }
      ]
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 100,
    "itemsPerPage": 20
  }
}
```

### 2. Lấy danh sách tags
**GET** `/api/events/tags`

#### Response
```json
{
  "status": true,
  "message": "Lấy danh sách tags thành công",
  "data": [
    {
      "_id": "tag_id",
      "name": "concert"
    },
    {
      "_id": "tag_id_2", 
      "name": "live"
    }
  ]
}
```

## Tính năng

### 1. Lọc theo Tags
- Sử dụng mảng `tags` để lọc sự kiện theo tag
- Hỗ trợ lọc nhiều tags cùng lúc

### 3. Lọc theo Giá vé tối thiểu
- Sử dụng `minTicketPrice` để lọc sự kiện có giá vé từ mức giá này trở lên
- Giá vé được tính toán dựa trên loại vé (seat, zone, none)

### 4. Lọc theo Thời gian bắt đầu
- Sử dụng `timeStart` để lọc sự kiện có showtime bắt đầu từ thời gian này trở đi
- Dựa vào `showtime.startTime` thay vì `event.timeStart`

### 5. Pagination
- Hỗ trợ phân trang với `limit` và `page`
- Trả về thông tin pagination đầy đủ

### 6. Cấu trúc dữ liệu
- Giống hệt API `/home`
- Bao gồm thông tin giá vé min/max
- Bao gồm showtimes
- Bao gồm thông tin user và tags

## Ví dụ sử dụng

### Lọc sự kiện theo tag có giá vé từ 200k trở lên
```javascript
const response = await fetch('/api/events/sort', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tags: ['concert'],
    minTicketPrice: 200000,
    limit: 10,
    page: 1
  })
});
```

### Lọc sự kiện theo tag và thời gian
```javascript
const response = await fetch('/api/events/sort', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tags: ['concert', 'live'],
    timeStart: '2024-02-01T00:00:00.000Z',
    limit: 20,
    page: 1
  })
});
```

## Lưu ý

1. **Cache**: API sử dụng Redis cache để tăng hiệu suất
2. **Performance**: Lọc theo thời gian sử dụng subquery để tối ưu
3. **Flexibility**: Tất cả các tham số lọc đều optional
4. **Consistency**: Cấu trúc dữ liệu giống hệt API `/home`
5. **Error Handling**: Xử lý lỗi đầy đủ với thông báo chi tiết
