# Mây mới: dữ liệu và kế hoạch xoá

Mây là cuộc gọi giọng nói AI hằng tuần trong Sweet Home. Bản làm lại nằm ở spec `docs/superpowers/specs/2026-11-20-may-moi-design.md`, kế hoạch từng task ở `.superpowers/sdd/2026-11-20-may-moi/`. Tài liệu này ghi phần dữ liệu (task 1); các task sau thêm logic lên đúng những bảng này.

## Bảng

Mọi câu migration chạy lặp được (`if not exists`), không sửa hay xoá hàng cũ. Cuộc gọi và tập podcast cũ mặc định là đã chia sẻ (`shared = true`).

**`memory_facts`** (`server/memory.ts`, `migrateMemory`): sổ nhớ của Mây, mỗi hàng một điều nghe được.
- `about_id`: điều đó nói về ai (null là chuyện chung cả nhà); `source_id`: ai kể.
- `kind`, `text` (tiếng Việt), `text_en`; `details` là json `{ evidence, sensitive, occasion, lang }`.
- `call_id` (xoá cuộc gọi thì xoá điều rút từ nó), `answer_id` là câu trả lời gốc.
- `visibility` mặc định `family`; `replacement_id` là điều mới hơn sửa lại điều này.
- `used_at`, `used_count`: lần cuối Mây nhắc lại và số lần.

**`may_signals`** (`server/may.ts`, `migrateMay`): hàng chờ tín hiệu, "A nhớ B" thành lời nhắc cho B.
- `from_id` gây ra, `to_id` nhận; `kind`; `evidence`; `call_id`; `ref` là mã tập khi tín hiệu là tin chuyện mới.
- `due_at` tới hạn mới gửi, `expires_at` quá hạn thì bỏ; `sent_at` đã gửi; `dropped` là lý do bỏ (`expired`, `off`).
- Mỗi (cuộc gọi, người nhận, loại) chỉ một tín hiệu (`may_signals_once`).

**`may_nudges`**: nhật ký lời nhắc đã gửi (`signal_id` không khoá ngoại vì tín hiệu có thể bị dọn). `opened_at` khi người nhận mở, `contact_at` khi họ thật sự liên lạc lại.

**Cột thêm**
- `calls.shared` (mặc định true): cuộc gọi có đưa vào chuyện chung không. `calls.trial` (mặc định false): cuộc gọi thử sau khi vào nhà.
- `calls.memory_at`, `calls.memory_tries`: lúc rút sổ nhớ xong và số lần đã thử.
- `podcasts.shared` (mặc định true): tập có hiện cho cả nhà không.
- `members.may_nudge` (mặc định true): người này có nhận lời nhắc từ Mây không.

## Xoá người, xoá nhà

Cả ba bảng mới nằm trong `PLAN` và `FAMILY_PLAN` của `server/members.ts`, ngay sau bước `relays` (trước `calls`).
- `may_nudges`: xoá hàng mà người này là `from_id` hoặc `to_id`.
- `may_signals`: xoá theo `from_id`, `to_id` và `call_id` thuộc cuộc gọi của người này.
- `memory_facts`: xoá theo `about_id`, `source_id` và `call_id`. Điều người khác kể về người này cũng xoá luôn (spec B, "xoá luôn").
- Người cuối rời nhà: `FAMILY_PLAN` xoá cả ba bảng theo `family_id` trước `calls`.

`server/members.test.ts` đọc các câu `create table`, `add column` và báo thiếu nếu có bảng hay cột trỏ tới thành viên, nhà, cuộc gọi mà chưa nằm trong kế hoạch. Quy ước tên: không đặt cột kết thúc `_by`, và chỉ dùng chữ `member` trong tên cột khi nó thật sự trỏ tới thành viên.
