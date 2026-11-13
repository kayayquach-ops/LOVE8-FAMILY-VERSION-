# Sweet Home (tên cũ Homeletter): bàn giao cho phiên làm việc tiếp theo

App gia đình cho du học sinh ở xa và bố mẹ. Bản thật: **https://homeletter-production.up.railway.app** (tên miền giữ tên cũ). Cập nhật lần cuối: 2026-11-13, nhánh `ux-simple-poetic`. Bản live vẫn là `f0e9258` (26/10); mọi thứ ở mục "Đợt 13/11/2026" dưới đây CHƯA deploy.

## Đợt 13/11/2026 (đã gộp vào `ux-simple-poetic`, chưa deploy)

Làm song song bằng nhiều agent, mỗi agent một nhánh `worktree-agent-*` (trong `.claude/worktrees`, đã gộp hết). Lưu ý khi dùng worktree: nhánh mới được tách từ `origin` (bản đã push), không phải HEAD trên máy, nên phải `git reset --hard <commit>` hoặc rebase trước khi làm.

- **Linh vật**: mỗi nhà đặt tên (mặc định Mây, chữ `{mascot}` trong bảng i18n, prompt AI theo tên) và chọn 1 trong 8 hình (`PUT /api/family/mascot`, `MascotSheet.tsx`). 8 hình là thú bông vải nỉ dựng bằng Blender (người dùng chọn kiểu này, chê bản khối tròn). Mã nhà mới 7 số, nhà cũ giữ 6 số.
- **Logo** mới từ ảnh người dùng gửi (`branding/logo-source.webp`, giữ nguyên, không đổi màu): icon app dùng nguyên ảnh có nền giấy; trong app dùng `public/logo-mark.png` (chữ đen tách nền). Sinh lại bằng `node scripts/icons.mjs`. Chữ "sweet home" ở màn chào vẫn là chữ thường, chưa hỏi người dùng có muốn thay bằng logo không.
- **Camera**: chụm hai ngón để zoom (phần cứng nếu có, không thì zoom số, ảnh/video ra đúng khung), nút 1×/2×. **Photobooth**: nền sau dải tự chọn màu tương phản với khung (`stageColor` trong `booth.ts`).
- **Trang chủ** làm lại (`Home.tsx`, `home.css`): lọ yêu thương là khối lớn ở màn đầu; nền giấy ngà chỉ ở Trang chủ, tab khác vẫn nền cũ. Ảnh trước/sau: `app/docs/home-redesign/`.
- **Phim tuần** làm lại theo tinh thần Yope (`app/docs/recap-design.md`): tự dựng 20 giờ tối Chủ nhật giờ VN cho mọi nhà rồi đẩy thông báo; server tắt đúng lúc thì dựng bù; lần deploy đầu sẽ dựng bù tuần 2-8/11 (không báo). `sharp` đã chuyển sang dependencies vì phim tuần dùng lúc chạy.
- **Podcast và video sau cuộc gọi**: xem mục trong phần cuộc gọi AI bên dưới. Phụ đề khớp từ dùng `whisper-1` (trần `WHISPER_DAILY_MIN`), chưa chạy thật với khoá OpenAI.
- **Đăng nhập Google** (`server/google.ts`, `googleVerify.ts`, `app/docs/google-login.md`): OIDC chuyển cả trang, chạy được ở PWA iPhone; ẩn tới khi đặt `GOOGLE_CLIENT_ID`. Bộ giả chỉ cho dev (`GOOGLE_FAKE=1`, tự tắt trên Railway). Test: `npm run test:google`.
- **Rà soát toàn app (Fable)** và sửa lỗi: `app/docs/audit-2026-11.md` (mục 7 cuối file là các mục để lại và các câu cần người dùng quyết). Đã sửa: giới hạn thử mã nhà (`server/limit.ts`), hàng chờ gửi lại câu trả lời và `/finish` của cuộc gọi (`src/outbox.ts`), ErrorBoundary + tự tải lại khi chunk cũ mất, chờ AI tối đa 7 giây khi nhấc máy, chặn cảm xúc/trả lời chéo nhà, giới hạn API cuộc gọi, gọi video vào lại phòng sau khi server khởi động lại, lỗi 500 không lộ câu Postgres, thư (khoá thiếu, nháp, viết cho mình không đẩy, HEIC, 413, công tắc thông báo thư).
- **Lọ yêu thương làm lại** (người dùng đã duyệt ảnh mẫu): lọ thuỷ tinh dựng bằng Blender (nút bần, dây gai, nơ, thẻ kraft treo cao ở vai), 10 hạt là charm thủ công (4 hạt nỉ có mũi chỉ, ngọc trai có chụp vàng, hoa anh đào satin, tim vàng, pha lê, sao cầu vồng, giọt sương). Asset WebP trong `app/public/jar/` (khoảng 360 KB), lọ hai lớp kẹp lớp hạt. `JarArt.tsx` xếp hạt bằng mô phỏng vật lý 2D (`jarSim.ts`, số liệu `jarData.json`): hạt cũ không nhảy chỗ, vị trí lưu theo nhà ở `localStorage['hl-jar:<nhà>']`. Hạt mới rơi (tối đa 5, nảy, xoay, lọ rung, lấp lánh, tiếng `pop`) khi bấm Xong nhiệm vụ và khi mở Trang chủ/màn lọ mà số hạt tăng so với lần xem trước trên máy đó; "Giảm chuyển động" thì chỉ hiện dần. Dựng lại asset: đọc đầu `branding/jar/run.py`, file nguồn `C:\Users\YT KOREA\homeletter\jar.blend`. Ảnh chụp thử: `app/docs/jar-redesign/`. Chưa thử trên iPhone thật (độ mượt lúc rơi, lần đầu mở máy phải tính xếp cả lọ khoảng 0,1 giây trên máy dev).
- **Nhạc nền chung**: thả bài không lời vào `app/server/music/` (`server/music.ts`, `pickTrack`), chưa có thì dùng nhạc tổng hợp. Người dùng sẽ gen 4-5 bài bằng Suno (đã đưa prompt).

Sau khi deploy đợt này: xem log `[limit]` (nếu mọi dòng cùng một IP thì số tầng `trust proxy` sai), `[voice-edit]` và `[recap]`; nghe vài video sau cuộc gọi đầu; thử trên iPhone thật (zoom camera, nháp thư, gửi lại khi tắt app, linh vật 3D, phim tuần).

Người dùng cần làm: tạo OAuth Client ID theo `app/docs/google-login.md` rồi đưa để đặt `GOOGLE_CLIENT_ID` trên Railway; gửi nhạc Suno.

## Code ở đâu

- Repo `C:\Users\YT KOREA\homeletter\LOVE8`, làm việc trên nhánh `ux-simple-poetic`, mỗi lần deploy xong thì `git push origin ux-simple-poetic:main` (fast-forward, không force).
- App thật nằm trong **`app/`**: React 19 + Vite (`app/src`), Express 5 + Postgres (`app/server`), TypeScript chạy bằng tsx.
- `mobile/` là bản Expo cũ, **không dùng**. Đừng sửa, đừng commit `mobile/src/components/Mesh.tsx` và `mobile/tsconfig.json` (luôn hiện "modified", để nguyên).
- Ghi chú rà soát UX và danh sách thử trên iPhone: `app/docs/ux-audit.md`. Phân tích nền màn chào: `app/docs/bg-analysis.md`.

### Máy chủ (`app/server`)
`index.ts` (nhà, vào nhà bằng mã 6 số, feed, cảm xúc, ôm, media qua multer vào `MEDIA_DIR`, phục vụ `/media`, `/api/survey/hug` và `/api/survey/voice` chỉ trả số đếm), `calendar.ts` (sự kiện, sinh nhật, lịch âm Việt Nam), `jar.ts` (lọ hạt), `home.ts`, `chat.ts` (SSE), `recap.ts` (phim tuần ffmpeg), `call.ts` + `voice.ts` + `ai.ts` (cuộc gọi AI hằng tuần, Gemini TTS/chép lời/soạn câu hỏi, có lớp lọc chống bịa), `podcast.ts`, `facetime.ts` (WebRTC, signaling SSE, phòng giữ trong bộ nhớ nên chỉ đúng khi Railway chạy 1 instance), `push.ts` (Web Push, khoá VAPID tự sinh lưu bảng `app_settings`), `db.ts`.

### Giao diện (`app/src`)
`App.tsx`, `Onboarding.tsx` (màn chào kiểu cánh đồng có khung hoa văn chấm, các câu hỏi nhịp chậm đằm, chạm để hiện nhanh, thu "lời thương đầu tiên"), `Camera.tsx`, `Feed.tsx`, `Home.tsx` (thẻ mời gọi AI `CallCard.tsx`), `Chat.tsx`, `Calendar.tsx` (+ `lunar.ts`), `Jar.tsx`, `Recap.tsx`, `Podcast.tsx`, `Call.tsx` (cuộc gọi AI với linh vật), `Mascot.tsx` (SVG) và `Mascot3D.tsx` + `mascotModels.ts` (three.js; 8 linh vật thú bông vải nỉ `public/mascots/<hình>.glb` cùng vân nỉ dùng chung `felt-normal.jpg` phủ kiểu triplanar trong shader, dựng bằng Blender từ script `branding/mascots/` (đọc đầu `run_plush.py`), file nguồn `C:\Users\YT KOREA\homeletter\mascots-plush.blend`), `FaceTime.tsx` (+ `strip.ts`, `booth.ts`, `booth.css`: photobooth dải ảnh 8 khung), `CityPicker.tsx` (+ `places.json` 506 nơi), `Notify.tsx`, `Sheets.tsx` (Gia đình), `sound.ts`.

## Cuộc gọi AI hằng tuần: cơ chế (đọc trước khi sửa call.ts, voice.ts, ttsgate.ts, Call.tsx, speech.ts)

Ba bộ phận độc lập, đừng nhầm:
1. **Nghe** (chữ từ lời nói): máy khách ghi âm (VAD tự biết khi nói xong) và chép bằng Web Speech nếu có; không có thì máy chủ đổi file sang mp3 16 kHz và nhờ **Gemini** chép (`transcribe`, tối đa 8 giây); Gemini lỗi/429 thì dự phòng **OpenAI `gpt-4o-mini-transcribe`** (cần `OPENAI_API_KEY`, ngân sách 200/ngày). Hạn mức rộng.
2. **Hiểu và nghĩ** (soạn câu hỏi `aiScript`, câu đáp `quickReply`, rút ngày tháng `saveDates`): **Gemini văn bản** (`GEMINI_MODEL`, mặc định gemini-2.5-flash), hạn mức rộng (Tier 1: 1000 RPM, 10000 RPD). Dữ liệu đưa vào chỉ là sự thật có trong DB; prompt có luật cấm bịa và lớp lọc `suspect()`. Cuộc gọi đầu của mỗi người là bộ câu soạn sẵn (`firstScript`, không gọi AI). Chạy cho cả vi, en, ko: prompt viết tiếng Anh một lần kèm dòng "Reply in {ngôn ngữ}"; `suspect()` nằm ở `server/guard.ts` (dấu hiệu bịa riêng cho vi, en, ko, tên riêng và số phải có trong dữ liệu; test ở `guard.test.ts`). Kết quả kiểm Gemini ở `app/docs/ai-lang-test.md`.
3. **Nói** (đọc câu ra tiếng): nhà cung cấp theo `TTS_PROVIDER` = `auto` (mặc định) | `openai` | `gemini`. `auto`: có `OPENAI_API_KEY` thì **OpenAI `gpt-4o-mini-tts`** (giọng `coral`, `OPENAI_TTS_VOICE`) là chính; OpenAI bị chặn (key sai, hết số dư, 429) thì **Gemini TTS** (`gemini-2.5-flash-preview-tts`, giọng Zephyr, `GEMINI_VOICE`); không thì giọng máy. **Một giọng cho cả cuộc gọi:** nhà cung cấp chốt lúc nhấc máy qua `GET /api/call/tts-status` (trả `provider`: openai | gemini | device), máy khách gửi `provider` trong mọi `/api/call/tts`, máy chủ không tự đổi; nhà đó lỗi giữa chừng thì câu ấy hiện phụ đề chữ + chuông nhẹ. Biến môi trường: `OPENAI_API_KEY`, `TTS_PROVIDER`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `OPENAI_TTS_STYLE`, `OPENAI_TTS_DAILY` (mặc định 400/ngày giờ VN, `app_settings.tts_budget_openai`), `GEMINI_TTS_DAILY`. Kho âm thanh chung `/data/media/tts`, khoá OpenAI riêng (`oa1|model|giọng|câu dặn|chữ`), khoá Gemini không đổi. OpenAI: hàng đợi riêng `oaGate` (4 cùng lúc, ~60/phút), mỗi người 40 câu mới/giờ, 401/403 và 429 hết số dư chặn 30 phút, 429 tốc độ theo `retry-after`. **Tài khoản OpenAI** là trả trước có tự nạp, giới hạn 10 đô/tháng, key **dùng chung với app ytk-marketing-room** (hết số dư thì cả hai cùng hết); ước ~0,01 đô/cuộc gọi. Chi tiết và số đo giọng: `app/docs/tts-budget.md`. **Gemini TTS** ở Tier 1 chỉ **10 yêu cầu/phút và 100/ngày** (reset nửa đêm giờ Thái Bình Dương) nên chỉ là dự phòng: `ttsgate.ts` tối đa 8 yêu cầu/60 giây, `GEMINI_TTS_DAILY` (mặc định 70, `app_settings.tts_budget`), câu cố định chỉ lấy từ kho (đừng bump `CACHE_VER`). Lúc nhấc máy `ok=false` (provider `device`) thì CẢ cuộc gọi dùng giọng máy (`speechSynthesis`), không trộn giọng.
Luồng: thẻ mời ở Trang chủ (`CallCard.tsx`, không tự đổ chuông, người mới dưới 24 giờ không bị nhắc) → "Nghe máy" → `/api/call/start` → chào + câu 1 (một file TTS) → mic mở sau khi Mây nói xong → trả lời → chép lời → câu đáp ngắn → câu kế (xin trước đúng một câu) → tạm biệt ngay → máy chủ làm nền: ngày tháng vào lịch, ảnh vào kho, ghép podcast bằng ffmpeg.
**Hướng lâu dài cho giọng (nếu OpenAI không đủ):** chuyển sang **Google Cloud Text-to-Speech** (Chirp 3 HD, có vi/en/ko, hạn mức rộng hơn nhiều, không phụ thuộc bậc chi tiêu); người dùng bật API trong Google Cloud Console rồi đưa khoá, chỉ thay phần "Nói", phần nghe và nghĩ vẫn là Gemini. Lên Tier 2 của Gemini cần khoảng 250 đô chi tiêu cộng 30 ngày nên không thực tế.

**Podcast và video sau cuộc gọi** (`podcast.ts` hàng đợi + DB, `voiceedit.ts` tiếng, `callvideo.ts` hình). Chỉ còn giọng người kể: không giọng Mây, không giọng máy đọc lời dẫn; câu hỏi là thẻ chữ trong video và mục lục (chapters, `say` rỗng) trong tập nghe. Mỗi đoạn trả lời: đo nền ồn (khung 10 ms), highpass 80 Hz, `afftdn` theo độ ồn, EQ ấm nhẹ, đưa về cùng mức, `agate` (giãn nhẹ), nén hai tầng, `deesser`, cắt lặng đầu cuối và rút khoảng lặng trên 0,8 s còn khoảng 0,55 s (chỗ cắt luôn ở chỗ lặng, fade 12 ms), cắt tiếng ậm ờ (ờ, ừm, um, 음...) theo mốc từng từ của OpenAI `whisper-1` khi hai đầu chỗ cắt đủ yên. Cả tập: nhạc nền `server/music` qua `pickTrack` (chưa có bài thì nhạc tổng hợp lặp vòng 32 giây dựng sẵn trong thư mục tạm), duck bằng sidechain, loudnorm hai lượt về -16 LUFS, đỉnh thật dưới -1,5 dBTP, AAC 160 kbps. Tập theo cuộc gọi có thêm video dọc 720x1280 24 hình/giây: nền giấy ấm, ảnh trong khung ảnh in chạy Ken Burns (perspective, mượt dưới 1 px), ảnh chỉnh màu ấm + vignette, hạt rất nhẹ, phụ đề libass tối đa 2 dòng, thẻ câu hỏi, mở đầu, lời kết; câu không có ảnh thì thẻ màu đất nung nhạt có sóng âm trôi. Ảnh: ảnh gửi trong cuộc gọi về đúng câu xin ảnh, câu khác lấy ảnh xưa trong kho rồi ảnh người đó gửi gần đây (mỗi ảnh một lần). Font ffmpeg ở `server/fonts` (TTF đổi tên họ, nguồn và giấy phép trong `OFL.txt`; không để trong `public` để máy khách không tải). Hai hàng riêng (tiếng, video), mỗi hàng một việc; tập còn `rendering` khi máy chủ khởi động lại thì 20 giây sau dựng lại, tối đa 3 lần (`podcasts.tries`). Bảng thêm: `podcasts.video, poster, video_status, tries`, `podcast_words` (mốc từ đã chép, khỏi trả tiền lại). Biến: `WHISPER_DAILY_MIN` (mặc định 30 phút âm thanh mỗi ngày giờ VN, `app_settings.whisper_budget`, hết thì phụ đề chia theo độ dài chữ trên các đoạn có tiếng), `PODCAST_VIDEO_THREADS` (mặc định 2), `MUSIC_DIR`. `/call/:id/finish` gọi lặp được; câu trả lời tới sau khi đã chốt thì 30 giây sau dựng lại tập của cuộc gọi đó. Đo trên máy dev (Ryzen 5 7500F, máy đang bận): 5 câu, tập 5 phút 54 giây, tiếng xong khoảng 40 giây (gồm 4 tập theo chủ đề), video 100 giây; đo được -16,0 LUFS, LRA 5 LU, đỉnh thật -5,6 dBTP; video khoảng 350 kbps (15 MB). Chưa chạy thật với OpenAI `whisper-1` (máy dev không có khoá; đã thử bằng faster-whisper giả lập API): lúc đầu trên live nên xem log `[voice-edit]` và vài video đầu. Tập cũ (có lời dẫn giọng máy) giữ nguyên, trình nghe cũ vẫn đọc lời dẫn.

## Deploy

```bash
cd app
export MSYS2_ARG_CONV_EXCL='*'   # bắt buộc trên Git Bash
npx tsc --noEmit && npm run build
railway up --service homeletter --ci
git push origin ux-simple-poetic:main
```
Railway project `homeletter`: service `homeletter` + Postgres + volume `/data` (`MEDIA_DIR=/data/media`), `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg`. Biến đã đặt: `GEMINI_API_KEY` (lấy từ `topik-app/.env`), `MEDIA_DIR`. Cần đặt thêm `OPENAI_API_KEY` (người dùng tự đặt) để bật giọng OpenAI. Local: `app/.env` trỏ Postgres container `simshop-pg` cổng 5433, db `homeletter`. Commit message kết thúc bằng dòng `Co-Authored-By: ...` theo model đang dùng.

Dọn nhà thử trên live (CHỈ khi người dùng bảo, vì nay đã có người dùng thật): `railway ssh --service homeletter -- node scripts/cleanup-families.mjs` (liệt kê), thêm `--delete ID1,ID2` (xem trước) và `--yes` (xoá thật). Tuyệt đối không dùng `--delete all` nữa.

## Người dùng đã chốt

- Chữ trong app: tiếng Việt, ngắn, ấm, như người thật nói; **không dùng dấu gạch dài (—)**; không thuyết minh giao diện.
- Nhịp phần hỏi đầu chậm, đằm, nhưng người dùng muốn chạm là hiện nhanh. Âm thanh ấm, không chói, không meme.
- iPhone hay giật: chỉ animate opacity và transform; tránh filter, blur lớn, lớp gradient lớn chuyển động. Nếu iPhone bật "Giảm chuyển động" thì vẫn hiện dần bằng độ mờ.
- AI gọi điện: **một giọng duy nhất cho cả cuộc gọi** (OpenAI `coral` là chính, đổi bằng `OPENAI_TTS_VOICE`; Gemini Zephyr dự phòng), không trộn giọng máy; không tự đổ chuông khi vào app mà hiện thẻ mời nhẹ ở Trang chủ; người mới (dưới 24 giờ) không bị nhắc; cuộc gọi đầu chỉ chào hỏi và 3 câu đơn giản; AI không được bịa (chỉ dùng dữ liệu có thật).
- Màn chào và nền theo ảnh thiết kế của chính người dùng (đã cho phép dùng trực tiếp); nếu họ gửi file gốc có lớp, chỉnh chữ "bạn" cho to và đậm đúng mẫu.
- Ngôn ngữ: **làm khung tra bảng (i18n) với tiếng Việt, tiếng Anh, tiếng Hàn**; không làm nhiều hơn.
- Không làm thanh toán hạt.

## Việc người dùng tự làm

- **TURN** cho gọi video qua 4G: đăng ký dịch vụ (Metered hoặc Cloudflare), đưa ba giá trị `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`, mình đặt lên Railway bằng `railway variables --service homeletter --set ...` (không in giá trị ra).
- Kiểm hạn mức và bật thanh toán Gemini (đã gặp lỗi 429 khi thử).
- Thử trên iPhone thật theo danh sách ở cuối `app/docs/ux-audit.md`.

## Còn phải làm

### 1. Khung đa ngôn ngữ (i18n) vi, en, ko: đã xong cả 3 đợt
- Đã có: khoá tra bảng (`app/src/i18n`, `app/server/i18n`), tiếng Việt và **tiếng Anh đầy đủ** (505 khoá máy khách, 138 máy chủ), chỗ chọn ngôn ngữ ở màn chào (VI · EN · KO) và mục Ngôn ngữ trong màn Gia đình. Công cụ: `npm run i18n:check` (khoá, biến, bản Anh không còn chữ Việt có dấu trừ tên "Mây"), `npm run i18n:compare` (tiếng Việt không đổi so với bản gốc).
- Chọn ngôn ngữ: `localStorage['sh-lang']`; chưa chọn và chưa đăng nhập thì theo máy (vi, ko, còn lại en); **đã có mã máy mà chưa từng chọn thì giữ tiếng Việt** (người dùng cũ). Đổi thì `PUT /api/me/lang`; mọi `fetch('/api/...')` mang header `x-lang`. Máy chủ chọn ngôn ngữ theo `x-lang`, rồi `members.lang`, rồi `Accept-Language`, mặc định vi (`reqLang()`/`tReq()` trong `server/i18n.ts`, dùng AsyncLocalStorage). Lỗi API trả `{ error, message, code }`.
- Máy chủ theo ngôn ngữ từng người: thông báo đẩy (từng người nhận một bản), chú thích bài, tiêu đề podcast, câu hỏi cuộc gọi (bộ câu lưu kèm `lang`, đổi ngôn ngữ giữa tuần thì soạn lại), giọng đọc Gemini (lời dặn tiếng Anh khi câu không có dấu Việt; kho âm thanh khoá theo cả lời dặn lẫn chữ), chép lời và giọng đọc của trình duyệt (`speechLang()`), ngày giờ (`fmtDate`, `fmtTime`, `fmtDayMonth`, `monthLabel` trong `src/i18n`), tên địa danh (`places.json` phần tử thứ 7 và `ce`, thêm bằng `scripts/places-en.mjs`; chạy lại `build-places.mjs` thì phải chạy tiếp `places-en.mjs`).
- **Đợt 3 xong:** `ko.json` đủ (505 khoá máy khách, 138 máy chủ; Mây xưng 저, 해요체, kính ngữ nhẹ, bỏ biến xưng hô), tên Hàn trong `places.json` (phần tử thứ 8 `ko`, `cko`; `scripts/places-ko.mjs` chạy sau `places-en.mjs`), font Noto Sans/Serif KR chỉ tải khi ko (`loadKoFonts` trong `src/i18n/index.ts`), AI en/ko (aiScript, quickReply, transcribe, saveDates, suspect), lời dặn giọng OpenAI en/ko. `i18n:check` báo thiếu khoá ko là lỗi và bắt chữ Việt lẫn trong en, ko. Chưa kiểm trên iPhone thật: giọng OpenAI en/ko (mới chỉ chạy 4 câu, chưa có người nghe), chép lời, photobooth ảnh thật với chữ Hàn, cuộc gọi sau khi nhấc máy ở en/ko. Còn lại nhỏ: `onboarding.invite.how` và câu hỏi tuần luôn nói "엄마 아빠" bất kể vai; giá lọ thương hiện VND ở en/ko; tên có "엄마" thành "엄마님".
- Còn lệch nhỏ: tên thành phố lưu theo ngôn ngữ lúc chọn; tiêu đề sự kiện lịch người dùng tự gõ giữ nguyên chữ họ gõ; tên ngày sinh tự sinh và các câu máy chủ khác đọc lại theo ngôn ngữ người xem.

### 2. Sau đó
- Thông báo đẩy: thử thật trên iPhone (PWA Màn hình chính, iOS 16.4+).
- 7 việc "để sau" trong `app/docs/ux-audit.md` (đường vào nhà bằng link mời ngắn hơn cho bố mẹ, loại sự kiện mặc định ở Lịch, bỏ `user-scalable=no`, nén nhạc nền, blur nền thẻ Trang chủ, màu thanh trạng thái).
- `npm audit` báo 1 lỗ hổng mức high chưa kiểm là có sẵn hay mới.
- Gemini Live (nói chuyện thời gian thực) nếu muốn cuộc gọi tự nhiên hơn nữa.
- Dịch tự động tin nhắn giữa các thành viên (tính năng riêng, tốn token theo số tin).
