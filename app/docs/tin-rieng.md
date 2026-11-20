# Tin riêng và gọi từ chat (20/11/2026)

Chủ app muốn nhắn tin đa dạng hơn: ngoài chat cả nhà còn nhắn riêng từng người, và gọi được ngay từ chat.

## Dữ liệu

- `messages.to_id text references members(id)`: người nhận tin riêng. `null` là tin cả nhà, mọi tin cũ nằm ở đây.
- `messages.read_at timestamptz`: lúc người nhận mở luồng riêng. Số chưa đọc của luồng riêng đếm tin gửi cho mình mà `read_at` còn trống.
- Luồng cả nhà vẫn dùng `message_reads` như cũ (không đổi khoá chính).
- Chỉ mục `messages_dm (to_id, author_id, created_at desc) where to_id is not null`.
- Xoá người khỏi nhà (`server/members.ts`, `PLAN`): thêm một bước xoá tin có `to_id` là người đó. Tin người đó gửi đã xoá ở bước `author_id`.

## API (`server/chat.ts`, mọi đường nhận `?with=<mã người kia>`, không có là luồng cả nhà)

| Route | Ghi chú |
|---|---|
| `GET /api/chat?with=&after=` | Chỉ tin của luồng đó. Luồng riêng: tin giữa mình và người kia, cả hai chiều. |
| `POST /api/chat?with=` | Người kia phải cùng nhà, không phải mình, không thì 404 `member_not_found`. Gửi xong coi như đã đọc luồng đó. |
| `POST /api/chat/read?with=` | Luồng cả nhà: `message_reads`. Luồng riêng: đặt `read_at` cho tin người kia gửi mình. |
| `GET /api/chat/unread` | `{ n, family, people: { <mã người gửi>: số } }`. `n` là tổng, số trên thanh dưới giờ tính cả tin riêng. |
| `GET /api/chat/threads` | `{ family: { last, unread }, people: { <mã>: { last, unread } } }` cho màn danh sách. |

## Riêng tư

- Kênh tức thời (SSE): tin riêng chỉ ghi vào kênh của người gửi và người nhận (`broadcast(..., audience(m))`).
- Thông báo: `notifyChatTo` trong `server/push.ts` chỉ báo người nhận, chạm vào mở `chat:<mã người gửi>`. Tin cả nhà vẫn đi `notifyChat` như cũ.
- Dịch: `MESSAGE_FOR` trong `server/translate.ts` chỉ cho dịch tin cả nhà hoặc tin riêng mình gửi hay nhận; người thứ ba nhận 404.
- Ảnh, tin thoại trong tin riêng vẫn nằm ở `/media/<uuid>` như ảnh nhà (ai có đường dẫn là mở được, giống trước).

## Máy khách (`src/Chat.tsx`)

- Mở chat là danh sách: Cả nhà đầu, rồi từng người (tin cuối, giờ, chấm mực tím khi có tin chưa đọc), người có tin mới nhất lên trước.
- Luồng riêng: tiêu đề là ảnh và tên, hai nút gọi thoại và gọi video. Luồng cả nhà giữ nút gọi video cả nhà như cũ.
- Gọi thoại đi qua `startVoiceCall` trong `src/App.tsx`, hiện tạm mở cuộc gọi video. Khi FaceTime có chế độ chỉ tiếng thì trỏ hàm này sang đó.

## Kiểm thử

`server/chat.test.ts` (DB giả theo từng câu trong `SQL`, SSE thật qua fetch), thêm ca ở `server/translate.test.ts` và `server/members.test.ts`.
