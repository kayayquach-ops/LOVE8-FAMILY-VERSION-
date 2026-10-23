# Homeletter: bàn giao cho phiên làm việc tiếp theo

App gia đình cho du học sinh ở xa và bố mẹ. Bản thật đang chạy: **https://homeletter-production.up.railway.app**

## Code ở đâu

- Repo `C:\Users\YT KOREA\homeletter\LOVE8`, nhánh **`ux-simple-poetic`** (đã push, chưa gộp vào main).
- App thật nằm trong **`app/`**: React 19 + Vite (`app/src`), Express 5 + Postgres (`app/server`), TypeScript chạy bằng tsx.
- Thư mục `mobile/` là bản demo Expo cũ, **không dùng nữa**. Đừng sửa, đừng commit `mobile/src/components/Mesh.tsx` và `mobile/tsconfig.json` (đang sửa dở).

### Máy chủ (`app/server`)
- `index.ts`: tạo nhà, vào nhà bằng mã 6 số (không mật khẩu, mỗi máy giữ token trong localStorage `homeletter-token`), tải media (multer → `MEDIA_DIR`, phục vụ ở `/media`), feed, cảm xúc, trả lời, ôm, `/api/week` (câu hỏi tuần, nhiệm vụ, tóm tắt), `/api/missions/:key`. Hàm `h()` bọc async, middleware `auth` đặt `req.member = {id, family_id}`.
- Các router riêng, gắn sau `auth`: `calendar.ts` (sự kiện + sinh nhật từ `members.dob`, hàm `upcoming()`), `jar.ts` (lọ hạt, mỗi người một loại hạt, cửa hàng hạt chưa thu tiền), `home.ts` (`/api/home`, trường `podcasts: []` đang chờ), `chat.ts` (tin nhắn, sticker, SSE `/api/chat/stream?token=` gắn **trước** auth), `recap.ts` (phim tuần dựng bằng ffmpeg, tự chạy tối Chủ nhật).
- `db.ts`: bảng families, members (có `intro` JSON câu trả lời lúc mới vào, `dob`, `city` dạng JSON), posts, reactions, replies, missions_done, seen.

### Giao diện (`app/src`)
- `App.tsx`: mở app vào camera; thanh dưới `TabBar.tsx` (Nhà · Chat · camera · Lịch · Lọ thương); các màn toàn màn hình là "sheet".
- `Onboarding.tsx`: xin chào viết tay → bạn là ai → con trai/gái → tên → ngày sinh → nơi ở (gõ tìm, `CityPicker.tsx`) → bao lâu chưa gặp → giữ để ôm → món ăn (tự viết) → đã nói "thương" chưa → điều chưa nói (tự viết) → 5 trang kể chuyện → tạo nhà / vào nhà → mời. Chữ hiện dần từng từ (`Typed` trong `ui.tsx`), nhịp **chậm, đằm** cho bố mẹ, nhạc piano nền (`startMusic/stopMusic` trong `sound.ts`).
- `Camera.tsx` (kiểu Locket: chạm chụp, giữ quay, giữ để nói; gửi xong hiện bản vẽ máy bay giấy `Letter.tsx`), `Feed.tsx` (tin nhà + thẻ Tuần này), `Home.tsx`, `Chat.tsx` + `stickers.tsx`, `Calendar.tsx`, `Jar.tsx`, `Recap.tsx`, `Sheets.tsx` (Gia đình).
- Nền sương mờ (`Mesh` trong `ui.tsx`, CSS `.mist`) theo ảnh Pinterest người dùng gửi: trắng giữa, hồng đào dưới trái, xám tím dưới phải, hạt phim.
- Âm thanh: `app/public/sfx/*.mp3` lấy từ Mixkit (miễn phí dùng trong app), phát bằng Web Audio trong `sound.ts`.

## Deploy

```bash
cd app
export MSYS2_ARG_CONV_EXCL='*'   # bắt buộc trên Git Bash, nếu không /data bị đổi thành đường dẫn Windows
npx tsc --noEmit && npm run build
railway up --service homeletter --ci
```
Railway project `homeletter`: service `homeletter` + Postgres + volume `/data` (`MEDIA_DIR=/data/media`), `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg`. Local: `app/.env` trỏ Postgres container `simshop-pg` cổng 5433, db `homeletter`; `npm run dev` (api 3010, web 5180). Commit message kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; git identity của repo đã đặt sẵn.

## Người dùng đã chốt

- Giọng chữ trong app: tiếng Việt, ngắn, ấm, như người thật nói; **không dùng dấu gạch dài (—)**; không thuyết minh giao diện; không chữ có chân (trừ chữ "xin chào" viết tay).
- Người dùng dễ chán khi app nhanh và nhí nhảnh: phần hỏi đầu phải chậm, đượm cảm xúc. Âm thanh phải ấm, sang, không meme.
- **AI gọi điện làm ngay trong app** (không gọi số thật). Được mượn `ANTHROPIC_API_KEY` trong `C:\Users\YT KOREA\minhhieu-money\.env` (đặt vào Railway bằng `railway variables --set`, không in key ra chat).
- Làm bằng subagent cho tiết kiệm: Sonnet việc dễ, Opus việc khó, mỗi agent làm trọn gói đến deploy.
- Theo dõi giới hạn tuần, dừng khi chạm 90%.

## Còn phải làm

### Đợt 3 (làm tiếp ngay)
1. **AI gọi điện hằng tuần trong app.** Đến lịch, app hiện "Homeletter đang gọi". AI đọc câu hỏi bằng giọng tiếng Việt của máy (speechSynthesis vi-VN), người nghe trả lời bằng giọng nói; ghi âm từng câu trả lời + chép lời bằng Web Speech Recognition nếu máy hỗ trợ. Claude soạn **bộ câu hỏi riêng cho từng người** từ `members.intro`, lịch và câu chuyện cũ (ví dụ hỏi bố mẹ về ngày cưới, bảo kể lại ngày đó, xin gửi ảnh ngày xưa). Sau cuộc gọi Claude rút ra ngày tháng quan trọng (ngày cưới, số năm) → tự thêm vào lịch; ảnh xưa lưu vào kho.
2. **Podcast từ các câu chuyện**: máy chủ ghép đoạn giọng thật + lời dẫn + nhạc nền (ffmpeg) thành tập ngắn; **album theo từng người và từng chủ đề**; điền `podcasts` trong `/api/home`; màn nghe podcast (sheet `podcast` trong App đang chưa có).
3. Lỗi nhỏ: nút "Gửi lời chúc" ở Lịch (App đang chỉ đóng sheet) phải mở Chat hoặc camera; thêm nút xoá tin đã gửi (máy chủ có `DELETE /api/posts/:id`).

### Đợt 4
4. **FaceTime cả nhà** (WebRTC, signaling qua máy chủ; cần TURN cho mạng di động) nối vào nút gọi trong Chat; **photobooth** nhiều chủ đề, nền phía sau, mỗi người một ô.

### Sau đó
5. Lịch âm quy đổi đúng (đang tính như dương).
6. Thông báo đẩy; thanh toán hạt đẹp (cần dịch vụ ngoài, hỏi người dùng trước).
7. Thử trên điện thoại thật: camera, mic, âm thanh, rung, nhạc phim tuần.
8. Dọn: nhà thử "Test", "Nha thu", "Test2" trên máy chủ; link GitHub Pages cũ (bản Expo); gộp nhánh khi người dùng đồng ý.
