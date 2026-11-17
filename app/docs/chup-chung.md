# Chụp chung dù ở xa (17/11/2026)

Người dùng xem mockup rồi bảo "làm thật đi". Mockup: https://claude.ai/artifact/ArybBvNGrRCc3SWZu3Ydgk (6 màn). Những chỗ ghi **(mình chốt)** là Claude tự quyết, người dùng chưa nói.

Ý: mỗi người trong nhà tự chụp một tấm selfie ở nơi mình đang sống, AI ghép thành một ảnh cả nhà như đang ngồi cùng nhau theo một dịp (mâm cơm, Tết, Trung thu, sinh nhật, Chuseok, đi chơi, hoặc tự viết). Ảnh ghép luôn có nhãn "ảnh ghép AI" và luôn đi kèm ảnh thật của từng người.

## Nguyên tắc chung

- Có người dùng thật. Không đụng database trên Railway, không deploy, không push, không commit (Claude điều phối commit sau khi rà).
- Chữ trong app: tiếng Việt ngắn, ấm, không dấu gạch dài, không thuyết minh giao diện. Đủ vi, en, ko (`npm run i18n:check` phải in "Sạch.").
- iPhone: chỉ animate `transform` và `opacity`, tôn trọng `prefers-reduced-motion`.
- Màn camera và màn chụp chung luôn tối, dùng bảng màu `--cam-*` trong `src/camera.css`. Nút chính nền trắng chữ tối, chữ viết tay `--cam-hand` (font Patrick Hand, lớp `.hand`).
- Kiểu dữ liệu chung đã có ở cuối `src/shared.ts` (`Shot`, `ShotPart`, `ShotOccasion`, `SHOT_OCCASIONS`, `isShotOccasion`, `ShotError`, `SHOT_CUSTOM_MAX`) và `Post.shotId`, `Post.shotParts`. Không đổi các kiểu này; cần thêm thì ghi vào báo cáo.

## Dữ liệu (máy chủ)

- Bảng `shots`: `id text pk, family_id, by_id, occasion text, custom text null, status text, result text null, error text null, created_at, done_at null, post_id null, nudged_at null`.
- Bảng `shot_parts`: `shot_id, member_id, media text null, at timestamptz null`, khoá chính `(shot_id, member_id)`.
- `posts` thêm cột `shot_id text null` (`alter table ... add column if not exists`).
- Ảnh lưu trong `MEDIA_DIR` như ảnh thường (`/media/<tệp>`), ảnh ghép là JPEG.

## API (mọi route cần đăng nhập như các route khác, chỉ người trong nhà mới thấy lượt chụp của nhà mình)

| Route | Vào | Ra | Ghi chú |
|---|---|---|---|
| `POST /api/shots` | multipart: `file` (ảnh selfie), `occasion`, `custom` (khi `tu-viet`), `with` (id các thành viên, cách nhau bằng dấu phẩy) | `{ shot }` | Người tạo có ảnh ngay. `with` rỗng hoặc có id ngoài nhà thì 400. Gửi thông báo rủ cho từng người trong `with`. |
| `GET /api/shots/open` | | `{ shots: Shot[] }` | Lượt chụp trong 48 giờ qua mà mình có tên, mới nhất trước. App dùng để hiện thẻ "An rủ mẹ chụp chung" và mở lại màn chờ. |
| `GET /api/shots/:id` | | `{ shot }` | Phải là người có tên trong lượt chụp. |
| `POST /api/shots/:id/photo` | multipart `file` | `{ shot }` | Thêm ảnh của mình. Đủ ảnh mọi người thì tự chuyển `developing` và bắt đầu ghép. |
| `POST /api/shots/:id/develop` | | `{ shot }` | Rửa luôn với ảnh đang có, cần ít nhất 2 người đã chụp. Người chưa chụp bị bỏ khỏi ảnh ghép. |
| `POST /api/shots/:id/nudge` | | `{ ok }` | Nhắc người chưa chụp, mỗi lượt tối đa một lần mỗi 10 phút. |
| `POST /api/shots/:id/redo` | json `{ occasion?, custom? }` | `{ shot }` | Chỉ khi `done` hoặc `failed`. Rửa lại (có thể đổi dịp). Tính vào hạn mức. |
| `POST /api/shots/:id/post` | | `{ ok, postId }` | Đăng ảnh ghép vào tin nhà: `posts` kind `photo`, `media` = ảnh ghép, `shot_id` = lượt chụp, chú thích theo dịp và ngày. Gọi lại thì trả bài cũ, không tạo hai lần. Báo cả nhà như đăng ảnh thường. |

- Lỗi theo `errorBody(...)` sẵn có. Ảnh vào phải đúng là ảnh (mimetype `image/*`).
- Tin nhà (`/api/feed` hoặc route đang trả `Post[]`): bài có `shot_id` thì trả thêm `shotId` và `shotParts` (đường dẫn ảnh thật của những người đã chụp, theo thứ tự tham gia).

## Ghép ảnh bằng AI (máy chủ, `server/shot.ts`)

- Mô hình: Nano Banana 2, `gemini-3.1-flash-image` (đổi được bằng `GEMINI_IMAGE_MODEL`). Không dùng bản Lite vì tài liệu Google ghi bản Lite "not optimized for multiple reference inputs"; bản 3.1 Flash Image nhận tối đa 4 ảnh nhân vật. Tài liệu: https://aistudio.google.com/docs/image-generation (endpoint Interactions `POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `Api-Revision`, ảnh vào là `{"type":"image","mime_type","data"}`, ảnh ra ở `output_image.data`, cấu hình `response_format` với `aspect_ratio`, `image_size`). Đọc tài liệu rồi làm đúng định dạng.
- Khoá: `GEMINI_IMAGE_KEY`, không có thì `GEMINI_API_KEY`. Không có khoá nào thì lượt chụp `failed` với `error: 'error'` và ghi log rõ.
- Tối đa 4 người trong một ảnh ghép **(mình chốt)**. Ảnh vào thu về cạnh dài 1024 px bằng sharp, xoay đúng chiều.
- Lời nhắc (tiếng Anh cho mô hình): giữ đúng gương mặt, kiểu tóc, nét mặt, tuổi của từng người trong ảnh tham chiếu; ghép thành một bức ảnh chụp thật, tự nhiên, như mọi người đang ở cùng một chỗ; bối cảnh theo dịp; ánh sáng ấm; không chữ, không logo, không thêm người lạ. Mỗi dịp một mô tả: mâm cơm Việt buổi tối, Tết (áo dài, hoa mai hoa đào, bánh chưng), Trung thu (đèn ông sao, bánh nướng, trăng), sinh nhật (bánh kem có nến), Chuseok (hanbok, songpyeon, trăng rằm), đi chơi (công viên hoặc biển ban ngày), tự viết (mô tả của người dùng, cắt `SHOT_CUSTOM_MAX` ký tự, chỉ dùng làm bối cảnh). Tỉ lệ 4:5, cỡ 1K.
- Hạn mức **(mình chốt)**: `SHOT_DAILY_CAP` lượt ghép mỗi ngày cho cả app (mặc định 40), mỗi nhà 6 lượt mỗi ngày. Quá hạn mức thì `failed` với `error: 'limit'`. Đếm theo ngày giờ Hàn như `ttsgate.ts`.
- Chạy nền, không chặn request. Quá 90 giây thì `failed`. Mô hình từ chối thì `error: 'blocked'`.
- Xong (hoặc lỗi) thì báo cho mọi người trong lượt chụp. Máy chủ khởi động lại giữa chừng: lượt `developing` quá 5 phút thì coi là `failed` khi có người hỏi tới.
- Thông báo (server i18n vi/en/ko): rủ ("{name} rủ chụp chung", "Mâm cơm tối nay, chụp một tấm nhé" theo dịp), nhắc, rửa xong ("Ảnh chung đã rửa xong"). Bấm vào mở `/?shot=<id>`.

## App

- **Camera** (`src/Camera.tsx`): thêm công tắc "ảnh | chụp chung" ở trên khung ngắm (chỗ trống sau khi bỏ hàng cả nhà ngày 17/11). Chế độ chụp chung: hàng chip dịp (dịp đang chọn, một chip "dịp khác" mở bảng dịp), hàng chip người chụp cùng (mặc định mọi người khác trong nhà), lớp vẽ đè lên khung ngắm: khung mặt nét đứt ở giữa, ghế trống nét đứt có tên từng người hai bên, mâm hoặc cảnh theo dịp ở dưới (như mockup màn 1). Không quay video ở chế độ này. Bấm chụp: chụp như cũ (`shoot`) rồi `POST /api/shots`, mở màn chụp chung.
- **Lời rủ**: mở app (hoặc vào bằng `/?shot=<id>`) mà có lượt `waiting` mình chưa chụp thì camera tự sang chụp chung, khoá dịp, hiện thẻ "An rủ mẹ chụp chung · mâm cơm tối nay" có ảnh của người rủ, ghế của người đã chụp hiện ảnh của họ (mockup màn 3). Bấm chụp thì `POST /api/shots/:id/photo`.
- **Màn chụp chung** (`src/GroupShot.tsx` + css riêng), một màn bốn trạng thái, hỏi lại `GET /api/shots/:id` mỗi 3 giây khi đang chờ hoặc đang rửa:
  - Chờ: tiêu đề theo dịp, giờ hai nơi viết tay, mỗi người một ảnh kiểu lấy liền xoay nhẹ (đã chụp thì có ảnh, chưa thì khung nét đứt "đang đợi"), danh sách ai đã chụp. Nút "nhắc …", chữ gạch chân "rửa luôn, không đợi …" khi đã có từ 2 ảnh. Dòng viết tay "đủ cả nhà là ảnh tự rửa".
  - Đang rửa: ảnh tròn từng người, tấm ảnh lấy liền hiện dần (opacity), "đang rửa ảnh cả nhà".
  - Xong: ảnh ghép, nhãn "ảnh ghép AI", dòng viết tay dịp và ngày, hàng "ảnh thật", nút "gửi vào nhà", "rửa lại", "đổi dịp".
  - Lỗi: câu ngắn theo `error` (hết lượt hôm nay thì "mai rửa tiếp nhé"), nút thử lại.
- **Bảng dịp**: lưới 6 dịp có hình vẽ nét tím, ô tự viết. Gợi ý dịp sắp tới theo lịch âm (`src/lunar.ts`): Tết (1/1 âm), Trung thu và Chuseok (15/8 âm), hiện khi còn dưới 90 ngày.
- **Tin nhà** (`src/Feed.tsx`): bài có `shotId` hiện nhãn "ảnh ghép AI" trên ảnh và hàng ảnh thật nhỏ bên dưới.
- `src/api.ts` thêm các hàm gọi route trên.
