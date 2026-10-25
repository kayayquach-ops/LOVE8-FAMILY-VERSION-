# Sweet Home (tên cũ Homeletter): bàn giao cho phiên làm việc tiếp theo

App gia đình cho du học sinh ở xa và bố mẹ. Bản thật: **https://homeletter-production.up.railway.app** (tên miền giữ tên cũ). Cập nhật lần cuối: 2026-10-25, commit `dafe118`, nhánh `ux-simple-poetic`, đã fast-forward vào `main`.

## Code ở đâu

- Repo `C:\Users\YT KOREA\homeletter\LOVE8`, làm việc trên nhánh `ux-simple-poetic`, mỗi lần deploy xong thì `git push origin ux-simple-poetic:main` (fast-forward, không force).
- App thật nằm trong **`app/`**: React 19 + Vite (`app/src`), Express 5 + Postgres (`app/server`), TypeScript chạy bằng tsx.
- `mobile/` là bản Expo cũ, **không dùng**. Đừng sửa, đừng commit `mobile/src/components/Mesh.tsx` và `mobile/tsconfig.json` (luôn hiện "modified", để nguyên).
- Ghi chú rà soát UX và danh sách thử trên iPhone: `app/docs/ux-audit.md`. Phân tích nền màn chào: `app/docs/bg-analysis.md`.

### Máy chủ (`app/server`)
`index.ts` (nhà, vào nhà bằng mã 6 số, feed, cảm xúc, ôm, media qua multer vào `MEDIA_DIR`, phục vụ `/media`, `/api/survey/hug` và `/api/survey/voice` chỉ trả số đếm), `calendar.ts` (sự kiện, sinh nhật, lịch âm Việt Nam), `jar.ts` (lọ hạt), `home.ts`, `chat.ts` (SSE), `recap.ts` (phim tuần ffmpeg), `call.ts` + `voice.ts` + `ai.ts` (cuộc gọi AI hằng tuần, Gemini TTS/chép lời/soạn câu hỏi, có lớp lọc chống bịa), `podcast.ts`, `facetime.ts` (WebRTC, signaling SSE, phòng giữ trong bộ nhớ nên chỉ đúng khi Railway chạy 1 instance), `push.ts` (Web Push, khoá VAPID tự sinh lưu bảng `app_settings`), `db.ts`.

### Giao diện (`app/src`)
`App.tsx`, `Onboarding.tsx` (màn chào kiểu cánh đồng có khung hoa văn chấm, các câu hỏi nhịp chậm đằm, chạm để hiện nhanh, thu "lời thương đầu tiên"), `Camera.tsx`, `Feed.tsx`, `Home.tsx` (thẻ mời gọi AI `CallCard.tsx`), `Chat.tsx`, `Calendar.tsx` (+ `lunar.ts`), `Jar.tsx`, `Recap.tsx`, `Podcast.tsx`, `Call.tsx` (cuộc gọi AI với linh vật), `Mascot.tsx` (SVG) và `Mascot3D.tsx` (three.js, model `public/mascot.glb` dựng bằng Blender, file nguồn `C:\Users\YT KOREA\homeletter\mascot.blend`), `FaceTime.tsx` (+ `strip.ts`, `booth.ts`, `booth.css`: photobooth dải ảnh 8 khung), `CityPicker.tsx` (+ `places.json` 506 nơi), `Notify.tsx`, `Sheets.tsx` (Gia đình), `sound.ts`.

## Cuộc gọi AI hằng tuần: cơ chế (đọc trước khi sửa call.ts, voice.ts, ttsgate.ts, Call.tsx, speech.ts)

Ba bộ phận độc lập, đừng nhầm:
1. **Nghe** (chữ từ lời nói): máy khách ghi âm (VAD tự biết khi nói xong) và chép bằng Web Speech nếu có; không có thì máy chủ đổi file sang mp3 16 kHz và nhờ **Gemini** chép (`transcribe`, tối đa 8 giây). Hạn mức rộng.
2. **Hiểu và nghĩ** (soạn câu hỏi `aiScript`, câu đáp `quickReply`, rút ngày tháng `saveDates`): **Gemini văn bản** (`GEMINI_MODEL`, mặc định gemini-2.5-flash), hạn mức rộng (Tier 1: 1000 RPM, 10000 RPD). Dữ liệu đưa vào chỉ là sự thật có trong DB; prompt có luật cấm bịa và lớp lọc `suspect()`. Cuộc gọi đầu của mỗi người là bộ câu soạn sẵn (`firstScript`, không gọi AI). Người không dùng tiếng Việt tạm dùng bộ câu mẫu (đợt 3 i18n sẽ làm AI cho en/ko).
3. **Nói** (đọc câu ra tiếng): **Gemini TTS** (`gemini-2.5-flash-preview-tts`, giọng Zephyr, `GEMINI_VOICE`). Đây là chỗ DUY NHẤT bị giới hạn thấp: Tier 1 chỉ **10 yêu cầu mỗi phút và 100 mỗi ngày** (reset nửa đêm giờ Thái Bình Dương). Vì vậy: hàng đợi `ttsgate.ts` tối đa 8 yêu cầu mỗi 60 giây, ngân sách ngày `GEMINI_TTS_DAILY` (mặc định 70, lưu `app_settings.tts_budget`), cache bền ở `/data/media/tts` (khoá không đổi, đừng bump `CACHE_VER` nếu không cần), câu cố định chỉ lấy từ kho. Lúc nhấc máy máy khách hỏi `GET /api/call/tts-status`: `ok=false` thì CẢ cuộc gọi dùng giọng máy (`speechSynthesis`), không trộn giọng; hết hạn mức giữa chừng thì hiện phụ đề chữ + chuông nhẹ.
Luồng: thẻ mời ở Trang chủ (`CallCard.tsx`, không tự đổ chuông, người mới dưới 24 giờ không bị nhắc) → "Nghe máy" → `/api/call/start` → chào + câu 1 (một file TTS) → mic mở sau khi Mây nói xong → trả lời → chép lời → câu đáp ngắn → câu kế (xin trước đúng một câu) → tạm biệt ngay → máy chủ làm nền: ngày tháng vào lịch, ảnh vào kho, ghép podcast bằng ffmpeg.
**Hướng lâu dài cho giọng:** chuyển sang **Google Cloud Text-to-Speech** (Chirp 3 HD, có vi/en/ko, hạn mức rộng hơn nhiều, không phụ thuộc bậc chi tiêu); người dùng bật API trong Google Cloud Console rồi đưa khoá, chỉ thay phần "Nói", phần nghe và nghĩ vẫn là Gemini. Lên Tier 2 của Gemini cần khoảng 250 đô chi tiêu cộng 30 ngày nên không thực tế.

## Deploy

```bash
cd app
export MSYS2_ARG_CONV_EXCL='*'   # bắt buộc trên Git Bash
npx tsc --noEmit && npm run build
railway up --service homeletter --ci
git push origin ux-simple-poetic:main
```
Railway project `homeletter`: service `homeletter` + Postgres + volume `/data` (`MEDIA_DIR=/data/media`), `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg`. Biến đã đặt: `GEMINI_API_KEY` (lấy từ `topik-app/.env`), `MEDIA_DIR`. Local: `app/.env` trỏ Postgres container `simshop-pg` cổng 5433, db `homeletter`. Commit message kết thúc bằng dòng `Co-Authored-By: ...` theo model đang dùng.

Dọn nhà thử trên live (CHỈ khi người dùng bảo, vì nay đã có người dùng thật): `railway ssh --service homeletter -- node scripts/cleanup-families.mjs` (liệt kê), thêm `--delete ID1,ID2` (xem trước) và `--yes` (xoá thật). Tuyệt đối không dùng `--delete all` nữa.

## Người dùng đã chốt

- Chữ trong app: tiếng Việt, ngắn, ấm, như người thật nói; **không dùng dấu gạch dài (—)**; không thuyết minh giao diện.
- Nhịp phần hỏi đầu chậm, đằm, nhưng người dùng muốn chạm là hiện nhanh. Âm thanh ấm, không chói, không meme.
- iPhone hay giật: chỉ animate opacity và transform; tránh filter, blur lớn, lớp gradient lớn chuyển động. Nếu iPhone bật "Giảm chuyển động" thì vẫn hiện dần bằng độ mờ.
- AI gọi điện: **một giọng Gemini duy nhất** (Zephyr, đổi bằng `GEMINI_VOICE`), không trộn giọng máy; không tự đổ chuông khi vào app mà hiện thẻ mời nhẹ ở Trang chủ; người mới (dưới 24 giờ) không bị nhắc; cuộc gọi đầu chỉ chào hỏi và 3 câu đơn giản; AI không được bịa (chỉ dùng dữ liệu có thật).
- Màn chào và nền theo ảnh thiết kế của chính người dùng (đã cho phép dùng trực tiếp); nếu họ gửi file gốc có lớp, chỉnh chữ "bạn" cho to và đậm đúng mẫu.
- Ngôn ngữ: **làm khung tra bảng (i18n) với tiếng Việt, tiếng Anh, tiếng Hàn**; không làm nhiều hơn.
- Không làm thanh toán hạt.

## Việc người dùng tự làm

- **TURN** cho gọi video qua 4G: đăng ký dịch vụ (Metered hoặc Cloudflare), đưa ba giá trị `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`, mình đặt lên Railway bằng `railway variables --service homeletter --set ...` (không in giá trị ra).
- Kiểm hạn mức và bật thanh toán Gemini (đã gặp lỗi 429 khi thử).
- Thử trên iPhone thật theo danh sách ở cuối `app/docs/ux-audit.md`.

## Còn phải làm

### 1. Khung đa ngôn ngữ (i18n) vi, en, ko: đợt 1 và 2 xong, còn đợt 3 (tiếng Hàn)
- Đã có: khoá tra bảng (`app/src/i18n`, `app/server/i18n`), tiếng Việt và **tiếng Anh đầy đủ** (505 khoá máy khách, 138 máy chủ), chỗ chọn ngôn ngữ ở màn chào (VI · EN · KO) và mục Ngôn ngữ trong màn Gia đình. Công cụ: `npm run i18n:check` (khoá, biến, bản Anh không còn chữ Việt có dấu trừ tên "Mây"), `npm run i18n:compare` (tiếng Việt không đổi so với bản gốc).
- Chọn ngôn ngữ: `localStorage['sh-lang']`; chưa chọn và chưa đăng nhập thì theo máy (vi, ko, còn lại en); **đã có mã máy mà chưa từng chọn thì giữ tiếng Việt** (người dùng cũ). Đổi thì `PUT /api/me/lang`; mọi `fetch('/api/...')` mang header `x-lang`. Máy chủ chọn ngôn ngữ theo `x-lang`, rồi `members.lang`, rồi `Accept-Language`, mặc định vi (`reqLang()`/`tReq()` trong `server/i18n.ts`, dùng AsyncLocalStorage). Lỗi API trả `{ error, message, code }`.
- Máy chủ theo ngôn ngữ từng người: thông báo đẩy (từng người nhận một bản), chú thích bài, tiêu đề podcast, câu hỏi cuộc gọi (bộ câu lưu kèm `lang`, đổi ngôn ngữ giữa tuần thì soạn lại), giọng đọc Gemini (lời dặn tiếng Anh khi câu không có dấu Việt; kho âm thanh khoá theo cả lời dặn lẫn chữ), chép lời và giọng đọc của trình duyệt (`speechLang()`), ngày giờ (`fmtDate`, `fmtTime`, `fmtDayMonth`, `monthLabel` trong `src/i18n`), tên địa danh (`places.json` phần tử thứ 7 và `ce`, thêm bằng `scripts/places-en.mjs`; chạy lại `build-places.mjs` thì phải chạy tiếp `places-en.mjs`).
- **TODO đợt 3 (ko + AI đa ngôn ngữ):** dịch `ko.json` (client, server); với en, ko hiện đang TẮT các lớp dựa vào tiếng Việt: AI soạn câu hỏi (`aiScript`, dùng bộ câu mẫu), câu đáp theo nội dung (`quickReply`, máy khách dùng câu đáp mẫu), chép lời Gemini (`transcribe`, vẫn dùng chép lời của trình duyệt), rút ngày tháng sau cuộc gọi (`saveDates`, prompt và regex tiếng Việt), bộ lọc chống bịa `suspect` (từ khoá tiếng Việt). Viết prompt tiếng Anh một lần kèm dòng "trả lời bằng {ngôn ngữ}", lời dặn giọng đọc tiếng Hàn trong `voice.ts`, giọng Gemini kiểm cho en/ko, tên Hàn trong `places.json`. Bản Anh chưa kiểm trên iPhone thật (giọng máy, chép lời, thông báo đẩy).
- Còn lệch nhỏ: tên thành phố lưu theo ngôn ngữ lúc chọn; tiêu đề sự kiện lịch người dùng tự gõ giữ nguyên chữ họ gõ; tên ngày sinh tự sinh và các câu máy chủ khác đọc lại theo ngôn ngữ người xem.

### 2. Sau đó
- Thông báo đẩy: thử thật trên iPhone (PWA Màn hình chính, iOS 16.4+).
- 7 việc "để sau" trong `app/docs/ux-audit.md` (đường vào nhà bằng link mời ngắn hơn cho bố mẹ, loại sự kiện mặc định ở Lịch, bỏ `user-scalable=no`, nén nhạc nền, blur nền thẻ Trang chủ, màu thanh trạng thái).
- `npm audit` báo 1 lỗ hổng mức high chưa kiểm là có sẵn hay mới.
- Gemini Live (nói chuyện thời gian thực) nếu muốn cuộc gọi tự nhiên hơn nữa.
- Dịch tự động tin nhắn giữa các thành viên (tính năng riêng, tốn token theo số tin).
