# Thiết kế Homeletter

## Phiên bản hiện tại: tối giản, như một lá thư (tháng 10/2026)

Bỏ phong cách nền đen và dải tím hồng cam. App giờ sáng, yên, gần gũi với bố mẹ.

| Thành phần | Cách làm |
|---|---|
| Nền | Trắng ngà `#FAF9F6` như giấy viết thư, mặt nền thứ hai xám ấm `#F0EEE9` |
| Chữ | Mực đen ấm `#1F1D1A`, chữ phụ `#76726A`. Vẫn một họ chữ Be Vietnam Pro |
| Màu nhấn | Một màu duy nhất, nâu đỏ như mực dấu thư `#9A5A44`. Nút chính tô mực đen, chữ trắng |
| Thẻ của từng người | Tông trầm như ảnh phim cũ, nét lượn mờ chỉ còn 35% |
| Bắt đầu | Câu hỏi đầu tiên viết trên một lá thư cũ (giấy ngả màu, dòng kẻ, tem, dấu bưu điện). Sau đó hỏi từng câu một: vai trong nhà, con trai hay con gái, ngày sinh, ảnh, tuổi, lần cuối được ôm nhau, món nhớ nhất, câu chưa nói. Chọn xong có một lời đáp nhẹ. Cuối cùng kể chuyện vì sao có Homeletter qua năm trang có tranh nét mực (`branding/story/*.svg`) |
| Chụp gửi cả nhà | Kiểu Locket: khung vuông, một nút chụp, viết một dòng lên ảnh, gửi. Bỏ hàng nhãn |
| Xem ảnh | Trang Nhà là lưới ảnh vuông hai cột. Bấm vào là xem từng ảnh, vuốt lên xem ảnh tiếp, thả cảm xúc và trả lời ngay ở dưới |

Luật giữ nguyên: không dùng emoji thay icon, chữ nhỏ nhất 13px, vùng chạm từ 44pt, chữ trắng chỉ đặt trên thẻ màu, ảnh hoặc nút mực đen.

## Phiên bản trước: theo tham khảo MAD (Social Dares) của Nixtio

Nhóm chọn phong cách của bản thiết kế [MAD – Social Dares Mobile App UI](https://dribbble.com/shots/26700967-Social-Dares-Mobile-App-UI) (Nixtio): nền đen, thẻ màu bo tròn lớn, avatar tròn, chữ đậm khít, điểm nhấn là dải chuyển màu tím, hồng, cam. Chỉ lấy phong cách; nội dung và tính năng vẫn là của Homeletter.

| Thành phần | Cách làm |
|---|---|
| Nền | Đen `#000000`, mặt nền thứ hai `#141416`, khi bấm `#222226` |
| Thẻ màu | Mỗi người trong nhà một màu, lấy mẫu từ bản tham khảo rồi đậm hơn chút để chữ trắng đọc rõ: đất nung `#A8775A`, hồng phấn `#B9788D`, xanh lá xám `#5E8C78`, vàng mù tạt `#A38842`, tím oải hương `#8A5DA6`, gạch cam `#A44A3B`. Thẻ có dải màu nhẹ, nét lượn mờ, lớp tối nhẹ ở dưới chữ |
| Dải chuyển màu | `#8F20B3` → `#E0306E` → `#F28A3C`: viền nút chính, nút "+", vòng số thông báo, ngày hôm nay trên lịch, nút gửi và nút phát |
| Chữ | Be Vietnam Pro, tiêu đề đậm vừa (600) và khít (giãn chữ âm). Chữ nhấn trên nền đen `#FF8FB1`, ngày âm lịch `#C4B5FD`, Chủ nhật và ngày giỗ `#FF7A6B` |
| Avatar | Avataaars (Pablo Stanley), sinh bằng `branding/build-art.mjs`. Người dùng thật sẽ dùng ảnh của mình |
| Thanh menu | Viên thuốc nổi: nút "+" viền chuyển màu để chụp gửi cả nhà, các tab bằng chữ, avatar của mình ở cuối |
| Cột nút nổi | Ở trang chủ, bên phải: gọi người lâu chưa gọi (kèm số), để Thư gọi hỏi chuyện, ngày sắp tới |
| Chuyển động | Thẻ và nút nảy nhẹ khi chạm; thẻ trượt lên lần lượt khi mở màn hình. Tắt khi máy bật "giảm chuyển động" |

### Tham khảo thêm: mẫu friendlyhours

Lấy thêm vài ý từ một mẫu app nhóm bạn (friendlyhours), vẫn giữ phong cách MAD:

- Nhóm avatar xếp chồng có ô "+n" kèm tên nhà và số người (trang chủ, màn chat).
- Màn chat với Thư: khung đầu xanh đậm `#06252E` có nét lượn, bo hai góc dưới; chấm xanh "Đang trực" `#22E06B`; giờ dưới mỗi tin; tin nhắn thoại là viên thuốc có nút phát; ô nhập có nút micro.
- Thẻ tin: nhãn mờ (loại tin, lời nhắn thoại, số trả lời) và hàng nút ngay trong thẻ, nút "Thả tim" dài tô dải màu.
- Màn mới "Gọi video cả nhà" (`/room`): lưới khuôn mặt từng người, góc trên có biểu tượng đang nói hoặc tắt mic, hàng nút tròn và nút cúp máy màu cam `#E8602A`. Bản demo chưa nối cuộc gọi thật.

### Bố cục chính (bản đơn giản, tháng 10/2026)

Mục tiêu: dễ dùng nhất có thể. Bốn tab có cả biểu tượng và chữ, mỗi màn hình một việc chính, nút to, bố mẹ được chữ to hơn.

- **Bắt đầu**: một câu hỏi "Bạn là ai trong nhà?" với bốn ô lớn (Mẹ, Bố, Con gái, Con trai), rồi một màn giải thích ba ý và nút "Vào nhà".
- **Nhà**: mâm cơm chung (lưới ba cột, ô của mình là nút chụp viền chuyển màu, đếm chuỗi ngày), thẻ xanh "Hẹn nhau tuần này", lời nhắc gửi ảnh xưa, ảnh của cả nhà xếp dọc.
- **Chat**: khung đầu xanh đậm có nhóm avatar và ngày sắp tới; tin thoại là viên thuốc có chữ chép lại; lời chào buổi sáng có nhãn giờ hẹn; ghi âm xong chọn "Hẹn 07:00 sáng mai" hoặc "Gửi ngay".
- **Hiểu nhau**: chọn người ở dải avatar; thẻ màu "Hiểu mẹ hơn", thẻ cuộc gọi tới với hai chế độ "Hỏi khéo" và "Nhắn hộ", kế hoạch cuộc gọi kèm lý do, điều đã hiểu, đố vui.
- **Lịch**: lịch tháng có ngày âm, ngày lễ chấm đỏ, dòng đời nhà mình dạng trục thời gian.
- **Lời chào buổi sáng**: lớp phủ toàn màn hình trên thẻ màu của người gửi, tự phát khi mở app.
- **Video**: ảnh xưa tông nâu `#8C6A4F` chuyển động chậm, năm in rất lớn, phụ đề Việt, Hàn, Anh.

## Phiên bản trước

Bản trước dùng nền trắng, chữ có chân Literata và ý tưởng tờ lịch bóc; nhóm thấy "cứng" nên chuyển sang phong cách trên. Những luật vẫn giữ: không dùng emoji thay icon, chữ nhỏ nhất 13px, vùng chạm từ 44pt, chữ trên nền đạt độ tương phản tối thiểu (chữ trắng trên các thẻ màu từ 3,4:1, dùng cho chữ lớn; chữ nhỏ có lớp tối phía sau).

![Trước và sau lần làm lại đầu tiên](design-before-after.png)
