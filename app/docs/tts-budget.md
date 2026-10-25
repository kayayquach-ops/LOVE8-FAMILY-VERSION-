# Ngân sách TTS (Sweet Home): OpenAI chính, Gemini dự phòng

## Chọn nhà cung cấp (mới)

- `TTS_PROVIDER` = `auto` (mặc định) | `openai` | `gemini`. `auto`: có `OPENAI_API_KEY` thì **OpenAI `gpt-4o-mini-tts`** là giọng chính; OpenAI đang bị chặn (key sai, hết số dư, 429) thì **Gemini** (nếu có key và còn ngân sách); không thì giọng máy. `openai` hoặc `gemini` ép một nhà, không rơi sang nhà kia.
- **Một giọng cho cả cuộc gọi:** nhà cung cấp được chốt lúc nhấc máy qua `GET /api/call/tts-status` (trả `provider`: `openai` | `gemini` | `device`), máy khách gửi `provider` trong mọi `POST /api/call/tts`, máy chủ dùng đúng nhà đó và không tự đổi. Giữa cuộc gọi nhà đó lỗi thì câu ấy hiện phụ đề chữ + chuông nhẹ (cơ chế cũ), không đổi giọng.
- Biến môi trường: `OPENAI_API_KEY` (bắt buộc để dùng OpenAI), `TTS_PROVIDER`, `OPENAI_TTS_MODEL` (mặc định `gpt-4o-mini-tts`), `OPENAI_TTS_VOICE` (mặc định **`coral`**), `OPENAI_TTS_STYLE` (ghi đè câu dặn giọng), `OPENAI_TTS_DAILY` (mặc định 400 yêu cầu/ngày giờ Việt Nam), `OPENAI_STT_MODEL` (mặc định `gpt-4o-mini-transcribe`).
- Gọi `POST https://api.openai.com/v1/audio/speech` với `{ model, voice, input, instructions, response_format: 'mp3' }`, trả thẳng mp3, lưu vào `MEDIA_DIR/tts`. Không chạy loudnorm (âm lượng OpenAI đều, đỡ chậm). `instructions` theo ngôn ngữ của câu (vi, en, ko): tự nhiên, rõ, ấm, không thì thầm, không ru ngủ. Từ 25/10 lời dặn en và ko đổi sang giọng ấm, chậm vừa, có ngắt nghỉ như người nhà gọi hỏi thăm ("Mây" đọc gần "May" / "머이"); vi giữ nguyên. Đổi lời dặn là đổi khoá kho, nên câu cố định en, ko sẽ đọc lại một lần (vài xu). Kết quả thử: `app/docs/ai-lang-test.md`.
- **Kho riêng:** khoá file `sha1('oa1' | model | giọng | câu dặn | chữ)`; khoá Gemini cũ không đổi nên kho Gemini vẫn dùng được. Đổi giọng/model/câu dặn là đọc lại.
- **Giới hạn OpenAI** (`oaGate`): tối đa 4 yêu cầu cùng lúc, ~60 yêu cầu/phút toàn máy chủ, ngân sách ngày `OPENAI_TTS_DAILY` (lưu `app_settings` key `tts_budget_openai`, ngày theo giờ Việt Nam), mỗi người tối đa 40 câu mới/giờ, chữ tối đa 300 ký tự, chờ tối đa 20 giây. **401/403** hoặc **429 `insufficient_quota`/billing**: chặn OpenAI 30 phút, log rõ nguyên nhân (chỉ mã lỗi, không in khoá); **429 do tốc độ**: chặn theo `retry-after` (5 đến 120 giây). Lỗi 5xx chỉ làm câu đó hiện chữ, không đặt cờ.
- **Chép lời dự phòng:** chạy cho cả vi, en, ko theo thứ tiếng của bộ câu hỏi (`script.lang`). Gemini không có tham số ngôn ngữ nên lời dặn ghi rõ thứ tiếng và mã ISO 639-1 (vi giữ lời dặn tiếng Việt cũ). `transcribe` thử Gemini trước; Gemini lỗi/429 thì `POST /v1/audio/transcriptions` model `gpt-4o-mini-transcribe` (mp3 16 kHz, `language` vi/en/ko, `response_format: text`), cùng hạn 8 giây, ngân sách 200/ngày (`stt_budget_openai`). Chỉ chạy khi có `OPENAI_API_KEY`.
- **Tài khoản OpenAI:** có số dư trả trước (lúc làm khoảng 6,5 đô), tự nạp thêm, giới hạn tự nạp 10 đô/tháng. Key đang **dùng chung với app ytk-marketing-room**, nên một app hết số dư thì cả hai cùng chịu (log sẽ ghi `insufficient_quota`).
- **Ước chi phí:** một cuộc gọi chừng 5 yêu cầu mới, khoảng 350 đến 450 chữ, 25 đến 35 giây tiếng. `gpt-4o-mini-tts` tính theo thời lượng khoảng 0,015 đô/phút (kiểm lại bảng giá hiện hành), tức **khoảng 0,01 đô một cuộc gọi**; kho câu cố định đọc một lần. 10 đô/tháng đủ cho vài trăm đến nghìn cuộc gọi.
- **Chọn giọng mặc định `coral`:** thử 5 giọng (`coral`, `nova`, `sage`, `shimmer`, `marin`; đều có) với lời chào + câu 1 và câu 2 tiếng Việt thật của app. Độ trễ 0,8 đến 2,4 giây (câu ngắn 1,1 đến 1,8 giây; chào + câu 1 dài 107 chữ, 0,8 đến 2,2 giây), nên giữ chờ 4 giây rồi 8 giây ở máy khách. Chọn `coral` vì là giọng nữ ấm, rõ, tốc độ vừa (chào + câu 1 dài 8,7 giây, không kéo dài như `sage` 10 giây và `shimmer` 10,6 giây). Kiểm bằng chép lại: tiếng Việt, tiếng Anh, tiếng Hàn đều đọc đúng ngôn ngữ ("Mây" trong câu tiếng Anh đọc như "May"). Người dùng nên tự nghe và đổi bằng `OPENAI_TTS_VOICE`. File mẫu ở `C:\Users\YT KOREA\homeletter\tts-samples\openai\` (ngoài repo).
- Log mỗi giờ/20 yêu cầu, mỗi nhà một dòng: `[voice] TTS openai hôm nay: N yêu cầu mới, M trúng kho, K lần 429, E lỗi, ngân sách used/limit (còn R)`.
- Nạp sẵn câu cố định (`warmFixedVoices`) chạy theo nhà cung cấp chính; với OpenAI cách nhau 1 giây. Nay gồm cả tiếng Hàn: 7 câu x 3 vai x 3 thứ tiếng, tối đa 63 câu (trùng thì gộp), vài xu với OpenAI. Nếu lúc đó chỉ có Gemini thì vẫn dừng khi ngân sách ngày còn dưới 30%.
- **Gemini TTS tiếng Hàn:** câu có chữ Hàn dùng lời dặn tiếng Hàn (`STYLE_KO`); nhánh vi, en không đổi nên kho Gemini cũ vẫn trúng.

---

# Ngân sách Gemini TTS (dự phòng)

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
