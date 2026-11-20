# Vị trí cả nhà (20/11/2026)

Chủ app muốn thấy mỗi người đang ở đâu thật, cập nhật liền tay, thay cho thành phố chọn lúc vào nhà.

## Đã chốt

- Ai tự bật mới chia sẻ. Công tắc "chia sẻ vị trí với cả nhà" trong Cài đặt (src/LocationShare.tsx). Lần đầu bật hiện tấm hỏi: chỉ cả nhà thấy, tắt lúc nào cũng được; đồng ý rồi mới xin quyền vị trí của máy.
- App web trên iPhone chỉ đọc được vị trí lúc app đang mở: `watchPosition` khi app hiện, ẩn app là thôi, mở lại là theo dõi tiếp. Chữ trong app không hứa theo dõi chạy nền.
- Gửi lên máy chủ lâu nhất 60 giây một lần, sớm hơn nếu đi xa hơn 300 m, nhưng không dày hơn 15 giây (src/geo.ts `shouldSend`). `enableHighAccuracy: false` cho đỡ pin. Đứng yên vẫn gửi lại mỗi phút để dòng "vừa xong" còn đúng.
- Máy chủ (server/location.ts) chỉ giữ vị trí MỚI NHẤT trên chính hàng `members`: `loc_lat`, `loc_lon`, `loc_acc`, `loc_at`, `loc_share boolean default false`. Không lịch sử, không bảng riêng, xoá người là mất theo hàng.
- `POST /api/me/location` `{lat, lon, acc}`: kiểm khoảng, 10 lần mỗi phút mỗi người, chưa bật chia sẻ thì 409 `location_off` (điều kiện nằm ngay trong câu update).
- `PUT /api/me/location/share` `{on}`: tắt là xoá vị trí đã lưu và báo cả nhà bỏ vị trí đó.
- `/api/me`: người đang chia sẻ có `loc` (toạ độ làm tròn 4 số lẻ, `at`, `tz`, tên nơi ba thứ tiếng); người không chia sẻ không có gì. Chính mình có thêm `locShare`.
- Cập nhật tức thì qua kênh sự kiện chung: máy chủ gọi `toFamily` (server/facetime.ts, chỉ thêm chữ `export`), tin `{ type: 'loc', memberId, loc }`. App nghe bằng `onLive` (src/live.ts không sửa) trong `useLocationLive` (src/location.ts) rồi sửa đúng người đó.
- Tên nơi tra src/places.json, không gọi dịch vụ bản đồ: trong 60 km là tên nơi gần nhất, tới 300 km là "gần {nơi}", xa hơn chỉ nói tên nước của nơi gần nhất (chỗ quá xa mọi nơi có tên, ví dụ giữa sa mạc, có thể ra nước sai).
- Trang chủ, mục "cả nhà lúc này": người chia sẻ hiện giờ và thời tiết theo chỗ đang ở, tên nơi gạch chân chấm, dòng nhỏ "vừa xong / 5 phút trước". Chạm vào giờ và nơi là mở bản đồ: Apple Maps trên iPhone, iPad, Google Maps ở máy khác. Người không chia sẻ giữ như cũ.
- Thời tiết: máy người xem gửi toạ độ làm tròn 1 số lẻ (khoảng 10 km) tới Open-Meteo. Đã ghi vào trang public/privacy.html.

## Chưa kiểm được

- Hộp xin quyền vị trí thật trên iPhone (app trên Màn hình chính), và iPhone có hỏi lại mỗi lần mở app không.
- Di chuyển thật ngoài đường: nhịp gửi, độ nhảy vị trí khi sai số lớn.

## Pháp lý

Ra mắt công khai ở Hàn Quốc có thể phải đăng ký dịch vụ dựa trên vị trí theo 위치정보법. Chưa viết gì về pháp lý trong app.
