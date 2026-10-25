# Đo độ mượt (25/10/2026)

Đo trên máy bàn, Browser pane, server local (production build, Postgres local). Nhà thử có 8 ảnh 2048x1536, 1 video, 11 tin chat.
"Trước" là bản ab2dfd4 (chưa sửa), "sau" là bản hiện tại. Thời gian là từ lúc bấm tới khi giao diện đổi (MutationObserver), không tính vẽ.
Mạng local quá nhanh nên đo thêm một lượt giả lập mạng chậm: mọi fetch chờ thêm 400 ms (gần với 4G yếu).

## Mạng giả lập chậm 400 ms

| Thao tác | Trước | Sau |
|---|---|---|
| Mở Trang chủ lần 1 (thấy ô ảnh) | 469 ms | 3 ms |
| Mở Trang chủ lần 2 | 418 ms | 2 ms |
| Mở Tin nhà lần 1 (thấy ảnh/video) | 435 ms | 9 ms |
| Mở Tin nhà lần 2 | 428 ms | 5 ms |
| Thả cảm xúc | 2 ms | 2 ms |
| Gửi trả lời dưới tin | 781 ms | 6 ms |
| Mở Chat (thấy tin) | 428 ms | 5 ms |
| Gửi tin chat | 418 ms | 2 ms |
| Mở Lọ lần đầu | 434 ms | 424 ms (lần sau hiện ngay từ bản lưu) |

Lần 1 của "sau" nhanh vì bản lưu lượt trước còn trong máy; máy mới tinh thì lần đầu vẫn chờ mạng như cũ.

## Mạng local

| Chỉ số | Trước | Sau |
|---|---|---|
| Fetch lúc mở app | 3 (me, chat/unread, call/due, song song) | 3 |
| Fetch thêm khi mở Trang chủ | 1 (/api/home) | 1 |
| Media tải ở Trang chủ | 4 tệp, 157 KB (ảnh gốc, video tự tải metadata) | 1 tệp, 3 KB (ảnh 160 px làm nền mờ; ô ảnh 360 px lazy) |
| Ảnh một trang Tin nhà | ảnh gốc ~128 KB | ảnh 1080 px ~72 KB (ảnh chụp thật 2-4 MB thì chênh nhiều hơn) |
| Thẻ img trong Tin nhà sau khi lướt hết | 8 | 2 (chỉ trang đang xem và hai bên có ảnh) |
| Video phát cùng lúc | 1 | 1 |
| Longtask lúc mở app và cả lượt | 0 | 0 (máy bàn mạnh, không phản ánh iPhone) |
| Gửi chat bị nhân đôi | không | không |

Kiểm thêm: lỗi mạng khi thả cảm xúc hoặc trả lời thì giao diện trả lại như cũ, chữ về lại ô, có báo lỗi. Đổi sang nhà khác không thấy tin chat nhà cũ (bản lưu khoá theo mã máy, đăng xuất thì xoá).

## Đã có từ trước, giữ nguyên
- /assets giữ 1 năm, immutable; nén gzip; /media giữ 30 ngày.
- three.js, GLTFLoader, Call, FaceTime, Recap, Podcast là chunk riêng, không vào bundle đầu (index 112 KB gzip).
- Nền Mesh đã đứng yên (không animation), tabbar không còn backdrop-filter.

## Chỉ kiểm được trên iPhone thật
- Cảm giác nút lún khi chạm (:active cần touchstart, đã thêm).
- Lướt Tin nhà có giật không khi ảnh thật 4 MB, content-visibility trên Safari.
- Linh vật 3D trong cuộc gọi tuần có nóng máy không.
