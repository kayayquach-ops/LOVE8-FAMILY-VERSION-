# Đợt 14/11/2026 (chiều): Mây hỏi thêm, podcast theo câu chuyện, lời nhắn khó nói, camera kiểu YOPE, sáng tối

Người dùng duyệt ý chung trong chat và bảo "làm hết đi, tham khảo YOPE và Setlog thật kĩ". Những chỗ ghi **(mình chốt)** là Claude tự quyết, người dùng chưa nói.

Ảnh mẫu YOPE và Setlog (khung hình cắt từ video người dùng gửi) nằm ngoài repo:
`C:\Users\YTKORE~1\AppData\Local\Temp\claude\5f5d670418beed28\cd58c497-0b10-4ae5-9d88-9d72aee22a36\scratchpad\yope\`
(`a_sheet_0*.jpg` là màn giới thiệu YOPE, `b_sheet_0*.jpg` là camera và màn "gửi tới", `setlog/` là ảnh Setlog, `a.mp4` `b.mp4` là video gốc).

## Nguyên tắc chung

- Có người dùng thật. Không đụng database trên Railway, không deploy, không push. Thử ở máy với Postgres local (`app/.env`).
- Chữ trong app: tiếng Việt ngắn, ấm, không dấu gạch dài, không thuyết minh giao diện. Đủ khoá vi, en, ko (`npm run i18n:check` phải sạch).
- iPhone: chỉ animate `transform` và `opacity`, tôn trọng `prefers-reduced-motion`.
- Giọng Mây chỉ Gemini (`server/voice.ts`), hạn mức chừng 70 câu mới mỗi ngày cho cả app. Câu mới nào Mây nói (câu hỏi thêm, câu chuyển lời) đều tốn hạn mức: hỏi thêm có trần, hết giọng thì hiện chữ + chuông nhẹ như cơ chế đang có.
- AI không được bịa: mọi câu AI soạn đi qua `suspect()` (`server/guard.ts`) và chỉ dùng dữ liệu có thật.

## Hợp đồng dữ liệu (các phần đều theo)

- `call_answers`: thêm `turn int not null default 0`. `idx` vẫn là số thứ tự **câu chuyện** (câu hỏi chính). `turn = 0` là câu trả lời chính, `turn = 1, 2` là các lần Mây hỏi thêm trong cùng câu chuyện. Cột `question` của mỗi hàng là đúng câu Mây đã hỏi ở lượt đó.
- `vault`: thêm `story int` (null được). Ảnh gửi cho câu chuyện nào thì `call_id` + `story = idx` của câu chuyện đó.
- Bảng mới `relays` (lời nhắn khó nói): `id, family_id, call_id, from_id, to_id, transcript, media, said text, created_at, pushed_at, delivered_call_id, delivered_at`. `said` là câu Mây sẽ nói lại (AI soạn, ngôi thứ ba). Một lời nhắn gửi cho nhiều người thì mỗi người một hàng.
- Câu trả lời của bước lời nhắn lưu `call_answers.topic = 'loi-nhan'` như cũ nhưng **không bao giờ** vào podcast hay chỗ nào cả nhà thấy. Chỉ người nhận nghe qua Mây và thông báo.
- Mọi `alter table ... add column if not exists` viết lặp lại được, phần nào cần thì tự thêm ở phần khởi tạo của mình.

## A1. Cuộc gọi: Mây hỏi thêm, hỏi ngày, chuyển lời nhắn, thông báo

File chính: `server/call.ts`, `src/Call.tsx`, `server/push.ts`, `src/shared.ts`, `server/guard.ts`, i18n.

1. **Hỏi thêm cho câu chuyện liền mạch.** Sau mỗi câu trả lời chính, một lần gọi AI trả về: câu đáp ngắn, câu hỏi thêm (hoặc null), và ngày tháng nếu nghe được. Người kể ngập ngừng, ngắn, thiếu ý quan trọng thì Mây hỏi thêm một câu nối đúng chuyện họ đang kể. Kể đủ thì không hỏi. Tối đa 2 câu hỏi thêm mỗi câu chuyện, tối đa 4 mỗi cuộc gọi **(mình chốt)**. AI quá hạn (khoảng 2,5 giây) thì đi tiếp như cũ, không hỏi thêm.
2. **Hỏi ngày.** Câu hỏi có `event` (cưới, kỷ niệm, sinh nhật, kỷ niệm khác) mà chưa nghe đủ ngày và tháng thì một câu hỏi thêm phải hỏi đúng ngày. Có ngày rồi Mây nhắc lại ngắn cho chắc ("vậy là 12 tháng 3 năm 1995, Mây ghi vào lịch nhà mình nhé"). Sau cuộc gọi `saveDates` đọc cả các lượt hỏi thêm.
3. **Ảnh cho câu chuyện.** Câu chuyện nào kể hay (AI báo có chuyện thật) hoặc câu hỏi có `photo` thì Mây xin ảnh: chọn **nhiều ảnh** một lần, hoặc "để sau". Gửi `POST /call/:id/photo` kèm `idx`, mỗi ảnh một hàng `vault` có `story`. Kiểm đúng là ảnh.
4. **Lời nhắn khó nói** (thay câu `loi-nhan` cũ, nằm cuối cuộc gọi):
   - Có lời nhắn chưa chuyển cho người đang nghe thì Mây chuyển trước: "An nhắn là dạo này nhớ mẹ lắm mà bận quá. Lát mẹ gọi hay nhắn cho An nhé." Đánh dấu `delivered_*`.
   - Rồi Mây hỏi: có lời nào muốn nhắn ai trong nhà mà khó nói không. Con thì gợi ý bố mẹ, bố mẹ thì gợi ý con **(mình chốt)**. AI rút người nhận từ câu trả lời (tên, vai). Không rõ thì gửi theo gợi ý đó.
   - Người kia không có gì thì thôi, không ép.
5. **Thông báo.** Cuộc gọi xong, mỗi lời nhắn mới gửi một push cho người nhận, giọng người gửi, gọi tên người nhận, gợi ý liên lạc lại. Ví dụ: "An ơi, dạo này mẹ nhớ An lắm đấy, gọi cho mẹ nhé". Chạm vào thì mở app. Không lộ cho người khác.

## A2. Podcast theo câu chuyện

File chính: `server/podcast.ts`, `server/voiceedit.ts`, `server/callvideo.ts`, `src/Podcast.tsx`, CSS mới riêng.

1. **Chỉ chuyện hay mới thành tập.** Sau cuộc gọi, AI chấm từng câu chuyện (câu chính + các lượt hỏi thêm): có chuyện thật, có chi tiết, đủ dài (gợi ý tổng tiếng nói từ khoảng 25 giây). Mỗi câu chuyện đạt thành **một tập riêng**, key `story:<callId>:<idx>`, AI đặt tên ngắn ấm. Cuộc gọi không có chuyện nào đạt thì không làm tập.
2. **Dựng liền mạch.** Ghép các đoạn người kể theo thứ tự lượt, bỏ giọng Mây, cắt ậm ờ và im lặng như `cleanClip` đang làm, nối mềm. Phụ đề theo lời thật.
3. **Phần đuôi.** Những câu trả lời khác trong cùng cuộc gọi không đủ làm tập riêng nhưng hợp thì nối vào cuối tập, sau một chỗ chuyển nhẹ. Mỗi đoạn chỉ vào một tập. Lời nhắn khó nói không bao giờ vào.
4. **Có ảnh thì video, không thì chỉ tiếng.** Ảnh của câu chuyện (`vault.story`) có thì ra video dọc: các ảnh đó trôi chậm, lọc màu cổ điển nhẹ (ấm, hơi bạc, hạt phim, tối góc), phụ đề nhẹ nhàng, nhạc chill nhỏ dưới giọng. Không có ảnh thì chỉ có tiếng, không lấy ảnh cũ hay thẻ chữ chèn vào.
5. **Thêm ảnh sau.** Ở tab podcast, tập câu chuyện có chỗ thêm nhiều ảnh. Thêm xong thì dựng lại video.
6. Tập cũ (theo cả cuộc gọi, theo chủ đề) vẫn giữ và phát được. Tập theo chủ đề loại bỏ mọi câu `loi-nhan`.

**Đã làm (A2):** `podcast.ts` chấm một lần mỗi cuộc gọi rồi giữ ở bảng `podcast_plans` (khoá theo câu trả lời, đổi câu trả lời thì chấm lại; thêm ảnh hay dựng lại không gọi AI). AI (`rateStories`) báo `good`, `title`, `joins`; chuyện AI khen mà dưới 15 giây tiếng nói vẫn không thành tập; tên qua `suspect()`, không ổn thì dùng "{tên} kể {chủ đề}". Không có AI: đạt khi tiếng nói thật (đo bằng `voicedSeconds`, bỏ lặng) từ 25 giây và lời chép từ 25 từ (không có lời chép thì 30 giây); phần đuôi chỉ nối chuyện cùng chủ đề. Đuôi tối đa 3 chuyện, 90 giây. Ảnh: `vault.call_id` + `vault.story`; thêm sau qua `POST /api/podcasts/:id/photos` (trường `files`, tối đa 12 ảnh, sharp xoay đúng chiều, thu về 2048 px JPEG), tập vẫn nghe được trong lúc dựng lại và giữ ngày. Video câu chuyện ở `renderStoryVideo` (`callvideo.ts`), font mới `sh-display.ttf` (Bricolage 700) và `sh-hand.ttf` (Patrick Hand). Nhạc: thư mục `server/music/story`, trống thì dùng `music/podcast`. Kiểm: `node --import tsx --test server/podcast.test.ts`.

## C. Camera giống YOPE thật

File chính: `src/Camera.tsx`, `src/camera.css`. Xem kỹ `b_sheet_0*.jpg` và video `b.mp4`.

YOPE: nền đen, khung ngắm lớn gần hết bề ngang (khoảng 3:4) bo góc, dải bộ lọc vuốt ngang ở đáy khung ngắm, nút 1x và đèn flash trong khung, nút chụp tròn trắng có vòng viền màu, giữ để quay video (viền khung ngắm chạy tiến độ), bên trái là ảnh vừa chụp hoặc thư viện, bên phải là nút đổi camera. Chụp xong sang màn "gửi tới…": ảnh xem trước, ô "thêm tin nhắn", chọn người nhận, nút gửi lớn. Làm cho cảm giác giống thật như vậy, theo màu và chữ của bộ "vở ô ly, mực tím" (đổi màu chanh của YOPE thành màu của mình). Giữ các chức năng đang có (thành viên, giờ địa phương, vuốt lên xem tin nhà, ghi âm, zoom). Bộ lọc chỉ làm nếu chạy chắc trên Safari iPhone, ảnh lưu ra đúng như lúc xem.

## B. Chế độ sáng tối

Bộ màu tối "đêm mực" đi cùng bộ sáng hiện có, mọi màu qua token trên `:root`. Cài đặt có lựa chọn Tự động / Sáng / Tối **(mình chốt)**, mặc định Tự động theo máy, lưu ở máy. `theme-color` đổi theo. Hình vẽ tay, thư airmail, sao giấy, linh vật giữ màu của chúng nhưng nền và chữ phải đọc rõ trên nền tối. Camera và tin nhà vốn tối.
