# Ngân sách Gemini TTS (Sweet Home)

Hạn mức thật (Tier 1) của giọng đọc: 10 yêu cầu mỗi phút, **100 yêu cầu mỗi ngày** (reset nửa đêm giờ Thái Bình Dương), tính cả mọi app dùng chung khoá. Mô hình văn bản thì rộng hơn nhiều nên không phải vấn đề.

## Kiểm đếm trước khi sửa (theo code)

Mỗi câu khác nhau là một yêu cầu; câu đã có trong kho `MEDIA_DIR/tts` thì không tốn.

| Khoản | Trước | Sau |
|---|---|---|
| Nạp sẵn lúc khởi động (`warmFixedVoices`) | 13 câu x 3 vai x 2 ngôn ngữ = 78, dồn ngay sau 4 giây | 7 câu x 3 vai x 2 ngôn ngữ = 42 (bỏ ack), chỉ câu chưa có trong kho, 1 câu / 10 giây, dừng khi ngân sách ngày còn dưới 30% |
| Lời chào + câu hỏi đầu | 2 | 1 (gộp một file) |
| Câu hỏi 2, 3 (và câu nhắn cả nhà) | 2 đến 3 | 2 đến 3, xin trước đúng 1 câu kế tiếp |
| Lời tạm biệt | 1 | 1 (xin trước khi tới câu cuối) |
| Câu cố định (ack, nhắc, đáp mẫu, hỏi ảnh) | mỗi câu chưa có trong kho tốn 1, client xin trước cả 7 câu mỗi lượt | 0: chỉ lấy từ kho (`kind: fixed`), chưa có thì chuông nhẹ + chữ |
| Câu đáp theo nội dung (askQuick) | mỗi câu trả lời 1 (tối đa 4) | chỉ khi còn trên 30% ngân sách ngày, không thì chữ |
| Thử lại khi model trả chữ thay tiếng | 1 thêm, không tính | 1 thêm, có tính ngân sách |
| Kiểm giọng lúc nhấc máy | 1 yêu cầu thật | 0 (hỏi `GET /api/call/tts-status`) |

Một cuộc gọi bình thường: **trước 9 đến 11 yêu cầu mới** (lời chào, 4 câu hỏi, tạm biệt, 3 đến 4 câu đáp, cộng câu cố định nếu kho nguội); **sau 4 đến 5** (chào+câu 1, câu 2, câu 3, câu 4 nếu có, tạm biệt), thêm tối đa 4 câu đáp chỉ khi còn dư ngân sách. Kho nguội hoàn toàn: trước 78 + cuộc gọi, sau tối đa 42, rải trong hơn 7 phút.

## Cache bền và chung

- Khoá file = `sha1(CACHE_VER | model | giọng | câu dặn | chữ chuẩn hoá)`. Khoá **không đổi** so với trước (`CACHE_VER` vẫn `v2`), nên kho đang có trên volume `/data/media/tts` vẫn dùng được. Đừng tăng `CACHE_VER` nếu không đổi cách xử lý âm thanh: tăng là phải đọc lại toàn bộ.
- Chữ được gọn khoảng trắng trước khi tính khoá (cache và yêu cầu dùng cùng một dạng).
- Bộ câu cố định theo vai còn: slow, busy, skip, photo, 2 câu đáp ngắn, 3 câu đáp dài (7 câu) + ack chỉ dùng nếu tình cờ đã có trong kho. Chữ các câu giữ nguyên nên kho cũ vẫn trúng.

## Giới hạn trong `server/voice.ts` + `server/ttsgate.ts`

- Hàng đợi toàn máy chủ: tối đa **8 yêu cầu mỗi 60 giây** (cửa sổ trượt), ưu tiên 0 (cuộc gọi đang diễn ra) trước ưu tiên 1 (nạp sẵn). Câu của cuộc gọi chờ quá 20 giây thì bỏ (`busy`) thay vì làm kẹt cuộc gọi. Tối đa 2 yêu cầu chạy cùng lúc.
- Ngân sách ngày: biến `GEMINI_TTS_DAILY` (mặc định **70**). Đếm theo ngày Thái Bình Dương, lưu bảng `app_settings` key `tts_budget` (`{day, used, until, why}`), sống qua deploy.
- Câu không bắt buộc (nạp sẵn, câu đáp theo nội dung) chỉ chạy khi còn **trên 30%** ngân sách ngày.
- Gặp **429**: đặt cờ chặn, đọc `retryDelay` trong RetryInfo nếu có (cộng 2 giây); lỗi nói theo ngày (`PerDay`) thì chặn đến nửa đêm Thái Bình Dương; không rõ thì 10 phút. Cờ cũng lưu trong `tts_budget`. Các yêu cầu đang xếp hàng bị từ chối ngay.
- Giới hạn cũ mỗi người 80 câu mới mỗi giờ vẫn giữ.

## Máy khách

- Nhấc máy hỏi `GET /api/call/tts-status` (có auth) trả `{ ok, reason, used?, limit? }`; `reason` là `budget`, `cooldown` hoặc `nokey`. `used/limit` chỉ có khi người gọi là thành viên đã đăng nhập. `ok=false`: cả cuộc gọi dùng giọng máy từ đầu, không gọi `/api/call/tts` nữa (cơ chế `machine` đã có).
- `POST /api/call/tts` nhận `kind`: `fixed` (chỉ lấy từ kho, không bao giờ tốn hạn mức) hoặc `reply` (câu đáp theo nội dung, chỉ đọc khi còn dư ngân sách). Trả `url`, hoặc `url: null` kèm `reason`.
- **Hết hạn mức giữa cuộc gọi (đã chọn phương án ít khó chịu nhất):** không đổi giọng. Đã bắt đầu bằng Gemini thì từ câu hết trở đi hiện **phụ đề chữ + một tiếng chuông nhẹ** (`sparkle`), giữ chữ đủ lâu để đọc rồi đi tiếp, không chờ thêm; câu nào đã có trong kho hoặc đã tải xong vẫn đọc bằng Gemini. Không chen giọng máy vào, đúng nguyên tắc một giọng.
- Câu cố định chưa có sẵn trong kho (ack, đáp mẫu, nhắc): chuông nhẹ + chữ, không tốn yêu cầu.

## Log

Mỗi giờ và mỗi 20 yêu cầu, máy chủ ghi một dòng: `[voice] TTS hôm nay: N yêu cầu mới, M trúng kho, K lần 429, ngân sách used/limit (còn R)`. Không in khoá.

## Kiểm thử

`npm run test:tts` (fetch giả, không gọi Gemini): cửa sổ 8/60 giây, ưu tiên, ngân sách ngày và sang ngày mới, 429 đặt và gỡ cờ, câu trúng kho không tính ngân sách, nạp sẵn rải rác và dừng ở 30%.
