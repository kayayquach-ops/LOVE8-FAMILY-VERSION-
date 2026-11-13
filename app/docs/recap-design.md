# Phim tuần: cách làm

Cập nhật 13/11/2026. Mã: `server/recap.ts` (dựng phim, lịch tự dựng, API), `src/Recap.tsx` + `src/recap.css` (màn xem), `server/recap-assets/` (font, giấy), `scripts/recap-fonts.py` (dựng lại font).

## 1. Học gì từ recap của Yope

Yope là app chia sẻ ảnh trong nhóm bạn thân (không thuật toán, không quảng cáo). Tìm được trên App Store, trang chủ yope.app, TechCrunch (2/2025, 7/2026), Business Insider, Marketing4Ecommerce. Video TikTok/YouTube không mở được bằng công cụ, nên phần nhịp và chuyển cảnh dưới đây là suy ra từ mô tả, không phải xem từng khung.

Họ làm:
- **Recap là trình chiếu ảnh của chính nhóm**, giống Google Photos/Apple Photos, theo ngày, tuần, tháng, và bản cả năm "Wrapped" dạng story. Recap đặt ngay trong trang nhóm, mở là có, không phải bấm làm.
- **Chọn khoảnh khắc nổi bật** (họ nói dùng AI chọn "top moments"), không đổ cả cuộn ảnh vào.
- **Dạng story**: ảnh tràn màn hình dọc, chạm để qua, có thanh tiến độ, cuối có "xem lại".
- **Ảnh như đồ vật thật**: ảnh cắt nền thành sticker, xếp thành bức tường ảnh lộn xộn có chủ đích; từ 4/2026 recap thành "walls" sửa được, lưu, chia sẻ.
- **Chữ ít và giọng bạn bè**: chữ thường, vài chữ in đậm, không thuyết minh. Mở bằng một màn chào ngắn, kết bằng nút xem lại.
- Nhạc: chưa thấy họ nói nhạc nền trong recap; bản 1.232 mới thêm chia sẻ nhạc.

Sweet Home lấy tinh thần, không lấy nhận diện:
- Phim tự có mỗi tối Chủ nhật, kèm thông báo; mở màn là thấy bìa phim mới.
- Chọn khoảnh khắc theo số cảm xúc, nhưng xoay vòng từng người để ai trong nhà cũng có mặt.
- Ảnh tràn màn hình dọc, chữ ngắn: tên người gửi, thứ trong tuần, lời kèm của chính họ.
- "Ảnh như đồ vật" thành **ảnh in có viền giấy, nghiêng nhẹ, bóng mềm** trên nền giấy hoa văn của logo; bức tường ảnh ở cuối phim là phiên bản gia đình của "wall".
- Xem kiểu story trong app; danh sách các tuần trước là lưới bìa phim.

## 2. Vì sao bản cũ xấu

Trích khung từ phim cũ (`media/recaps/*-2026-10-19.mp4`) và đọc mã cũ:
- **Ảnh nhỏ trong khung vuông** 960x960 giữa nền xám tím mờ: ảnh dọc bị cắt vuông, trên dưới thừa hơn nửa màn hình trống, nhìn như mẫu slideshow.
- **Màu không có chủ đích**: nền sương xám tím pha cam, không ăn với ảnh, không ăn với thương hiệu mới (giấy trắng, mực đen).
- **Chữ mảnh và đều**: Be Vietnam Pro Light cho mọi dòng, căn giữa hết, không có thứ bậc; tên người to hơn lời kèm.
- **Nhịp đều đều, không theo nhạc**: mỗi ảnh 1,6 đến 2,2 giây tính chia đều, cảnh nào cũng mờ chồng 0,45 giây.
- **Nhạc tổng hợp nghe rẻ**: sóng sin và hộp nhạc dựng bằng `aevalsrc`, không trống, không có cấu trúc mở và kết.
- **Mở và kết nhạt**: mở là ngày trong tuần trên nền sương; kết là bảng đếm "12 tấm ảnh".
- **Phải bấm mới có**: lịch chỉ chạy từ 19 giờ tối Chủ nhật đến nửa đêm; máy chủ tắt hay deploy đúng lúc đó là mất tuần. Nhà nào bấm "Làm phim" giữa tuần thì có dòng trong bảng `recaps`, tối Chủ nhật lịch thấy đã có và bỏ qua, nên phim chỉ có nửa tuần. Làm xong không báo ai, màn Phim tuần lại luôn hiện nút "Làm phim tuần này", nên mọi người hiểu là phải bấm. Hàng đợi `queue.then()` không bắt lỗi, một lần hỏng có thể làm kẹt cả hàng tới lần khởi động sau.

## 3. Bản mới

**Khung**: dọc 720x1280, 30 hình/giây, 30 đến 46 giây. 720 thay vì 1080 để dựng nhanh trên CPU Railway và nhẹ khi xem bằng 4G (khoảng 1,3 Mbps, 45 giây chừng 7 MB).

**Màu**: giấy ấm `#F4F0E8` lấy từ hoa văn giấy của logo (`branding/logo-source.webp`, cắt góc trái không có chữ, làm ấm và giảm tương phản, thành `server/recap-assets/paper.jpg`), mực `#1B1714`, chữ phụ nâu xám `#7A6F64`. Mọi ảnh và video được chỉnh chung một kiểu: trắng ngả kem, đen ngả nâu, bớt rực chút, để ảnh từ nhiều máy trông như một cuộn phim.

**Chữ**: Noto Serif KR SemiBold cho tên nhà, lời kèm, tên người; Noto Sans KR Medium cho dòng phụ (thứ, số khoảnh khắc). Ghép từ gói @fontsource có sẵn (latin, latin-ext, vietnamese, korean) bằng fonttools, không tải gì từ mạng. Font có chân chỉ giữ 2350 chữ Hàn thông dụng cho nhẹ (1,5 MB); dòng nào có chữ Hàn hiếm thì tự chuyển sang font không chân (đủ 11172 chữ, 2,4 MB). Bề ngang chữ đọc thẳng từ file font để ngắt dòng cân nhau và căn giữa đúng; biểu tượng cảm xúc bị bỏ vì ffmpeg không vẽ được.

**Cấu trúc**:
1. **Bìa** (khoảng 3 giây): "Phim tuần", tên nhà thật lớn, ngày trong tuần; ba tấm ảnh nhiều cảm xúc nhất rơi xuống lần lượt như ảnh in. Khung cuối của cảnh này lưu thành ảnh bìa cho màn Phim tuần.
2. **Từng khoảnh khắc**, xếp theo thời gian, tối đa 16:
   - Ảnh dọc: tràn màn hình, vào cảnh hơi phóng rồi lắng lại, sau đó trôi chậm (phóng vào và lùi ra xen kẽ). Phủ tối dần ở dưới, chữ kem căn trái: "Mẹ · Thứ Ba" nhỏ, lời kèm lớn tới 3 dòng.
   - Ảnh ngang hoặc vuông: ảnh in viền giấy, nghiêng 1,5 đến 3 độ, bóng mềm, trượt lên rồi đứng yên trên nền giấy; chữ mực căn giữa bên dưới.
   - Video dọc tràn màn hình, video ngang đặt trong khung giấy; giữ tiếng gốc, tối đa khoảng 4,5 giây.
   - Chữ hiện dần và nhích lên (chỉ đổi độ mờ và vị trí).
3. **Kết** (khoảng 4,5 giây): bức tường tối đa 9 ảnh của tuần hiện lần lượt, "Hẹn tuần sau", dòng "Nhà Hùng · 16 khoảnh khắc · 5 cái ôm", rồi lặng về màu giấy.

**Nhịp**: mọi chỗ cắt rơi đúng phách nhạc. Có bài thật trong `server/music/` thì `pickTrack(fid-tuần)` chọn bài, máy chủ tự đo nhịp (năng lượng đột biến, tự tương quan, rồi tinh chỉnh chu kỳ và phách đầu trên 50 giây đầu), cắt nhạc từ phách đầu. Ảnh khoảng 2,2 giây (có lời kèm dài thì 2,8), làm tròn ra số phách chẵn; thời điểm cắt tính theo phách cộng dồn rồi mới đổi ra khung hình nên không trôi. Bài không rõ nhịp thì cắt đều khoảng 2,2 giây.

**Nhạc tổng hợp** khi chưa có bài: viết lại bằng JS (không dùng `aevalsrc`), 112 nhịp/phút: piano điện FM, pad ấm, bass, trống mềm, hi-hat lắc nhẹ, vang Schroeder, lọc bớt chói. Nhạc theo cấu trúc phim: phần bìa chỉ có piano và pad, trống vào đúng lúc ảnh đầu tiên hiện, tới cảnh kết thì trống dừng và một hợp âm Cmaj9 ngân dài. `musicExpr` cũ giữ nguyên cho podcast.

**Tiếng**: nhạc bài thật được chuẩn âm lượng (loudnorm -19 LUFS), vào 0,4 giây, ra 2,8 giây; tiếng gốc của video chuẩn về -17 LUFS, nhạc tự hạ khi có tiếng (sidechain). Cả phim khoảng -16 LUFS.

**Cách dựng**: mỗi cảnh một lệnh ffmpeg (tối đa `RECAP_JOBS`, mặc định 2, cùng lúc, mỗi lệnh 2 luồng), ảnh chuẩn bị trước bằng sharp (xoay theo EXIF, cắt theo vùng nổi bật, chỉnh màu, ảnh in và bóng), sau đó nối các cảnh không mã hoá lại và trộn tiếng. Cảnh khoảnh khắc nào lỗi thì bỏ cảnh đó, các cảnh sau dịch lên. Chỉ dùng filter có trong ffmpeg 5.1 của Debian (scale eval=frame, crop, overlay, loop, fade, drawtext, lutyuv, sidechaincompress, loudnorm, alimiter, adelay, amix).

Đo trên máy dev (12 luồng): 45 giây phim, 14 khoảnh khắc + 2 video, dựng 11 giây (14,5 giây khi chỉ một cảnh một lúc). CPU Railway chậm hơn vài lần vẫn dưới 1 phút.

## 4. Tự có mỗi tuần

- Giờ chốt: **20 giờ tối Chủ nhật** giờ Việt Nam. Lịch kiểm mỗi 10 phút và một lần 45 giây sau khi khởi động.
- Mỗi lượt lấy tuần gần nhất đã tới giờ chốt: nhà nào có từ 3 ảnh/video trong tuần đó mà chưa có bản dựng **sau** giờ chốt thì dựng. Bản xem trước bấm giữa tuần vẫn được dựng lại thành bản đủ tuần. Máy chủ tắt đúng tối Chủ nhật thì lần khởi động sau vẫn dựng bù (trong tuần kế tiếp).
- Không dựng trùng: giành quyền bằng một câu `insert ... on conflict do update ... where status <> 'rendering'`, cộng tập `busy` trong bộ nhớ. Khởi động lại thì dòng `rendering` dở được dọn về `ready` (còn bản cũ) hoặc `failed`, lịch thử lại tối đa 3 lần (`attempts`).
- Hàng đợi: mỗi lúc `RECAP_PARALLEL` nhà (mặc định 1). Mỗi việc tự bắt lỗi; một nhà hỏng không làm kẹt hàng.
- Ngôn ngữ chữ trong phim: thứ tiếng nhiều người trong nhà dùng nhất.
- Xong bản đủ tuần (trong 3 ngày sau giờ chốt) thì gửi thông báo đẩy một lần cho cả nhà, chữ theo ngôn ngữ từng người (`push.recap.*`, loại `post`, mở thẳng màn Phim tuần). Cột `notified_at` giữ để không báo hai lần.

## 5. Màn xem

- Bìa phim mới nhất to giữa màn (ảnh bìa từ cảnh mở đầu), chữ "Mới" khi chưa xem trên máy này, chạm là phát.
- Xem toàn màn hình kiểu story: thanh tiến độ, chạm để dừng, hết phim có "Xem lại", nút chia sẻ. `play()` gọi ngay trong lúc chạm để iPhone phát có tiếng.
- Tuần đang dở: "Tuần này đã có N khoảnh khắc", "Tối Chủ nhật, phim tuần này sẽ tự có.", nút nhỏ "Xem trước tuần này" khi đủ ảnh và có thêm khoảnh khắc từ lần dựng trước.
- Các tuần trước: lưới 3 cột bìa phim. Phim cũ chưa có bìa thì lấy khung đầu video.

## 6. Còn để sau

- Bài nhạc thật: bỏ 4 đến 5 bài không lời vào `server/music/` là dùng ngay, không cần sửa mã. Nên chọn bài có nhịp rõ (85 đến 125 nhịp/phút), dài hơn 1 phút.
- Chưa xem trên iPhone thật (phát có tiếng, thanh tiến độ, safe area).
- Phim chỉ dựng một thứ tiếng cho cả nhà; nhà nói hai thứ tiếng thì người kia đọc chữ phim theo ngôn ngữ đa số.
- Ảnh HEIC không đọc được (app hiện chỉ nhận jpg, png, webp).
