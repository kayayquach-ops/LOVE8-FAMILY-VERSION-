# Mây mới: dữ liệu và kế hoạch xoá

Mây là cuộc gọi giọng nói AI hằng tuần trong Sweet Home. Bản làm lại nằm ở spec `docs/superpowers/specs/2026-11-20-may-moi-design.md`, kế hoạch từng task ở `.superpowers/sdd/2026-11-20-may-moi/`. Tài liệu này ghi phần dữ liệu (task 1); các task sau thêm logic lên đúng những bảng này.

## Bảng

Mọi câu migration chạy lặp được (`if not exists`), không sửa hay xoá hàng cũ. Cuộc gọi và tập podcast cũ mặc định là đã chia sẻ (`shared = true`).

**`memory_facts`** (`server/memory.ts`, `migrateMemory`): sổ nhớ của Mây, mỗi hàng một điều nghe được.
- `about_id`: điều đó nói về ai (null là chuyện chung cả nhà); `source_id`: ai kể.
- `kind`, `text` (theo thứ tiếng người kể), `text_en`; `details` là json `{ evidence, sensitive, occasion, lang }`.
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

## Sổ nhớ và tín hiệu (task 2)

Mã: `server/memory.ts` (rút sổ nhớ), `server/may.ts` (người nhận, hàng chờ tín hiệu), `server/place.ts` (múi giờ, giờ địa phương). Test: `server/memory.test.ts`, `server/may.test.ts`, `server/place.test.ts`.

**Khi nào rút**
- Sau mỗi cuộc gọi: `afterCall` trong `server/call.ts` chạy `extractCall(id, { signals: true })` sau bước rút ngày vào lịch, trước bước ghép podcast. Lỗi thì ghi log `[memory]`, các bước sau vẫn chạy.
- Câu trả lời tới muộn (sau khi cuộc gọi đã chốt): `extractSoon` gom lại, 30 giây sau rút lại cả cuộc gọi, cùng lúc với dựng lại tập.
- Mỗi cuộc gọi chỉ một lượt rút chạy cùng lúc (bộ `extracting` trong bộ nhớ).

**Đầu vào cho AI** (một lần gọi `askJSON`, hạn 45 giây, tối đa 3000 token, prompt tiếng Anh, chữ `text` theo thứ tiếng của cuộc gọi)
- Câu trả lời có lời chép của cuộc gọi, theo thứ tự câu và lượt. Không bao giờ có câu trả lời lời nhắn khó nói (`topic = 'loi-nhan'`).
- Tên, vai người trong nhà. Không đọc `members.intro`, nên "điều chưa nói" không tới đây.
- Tối đa 60 sự thật đã có, mới nhất trước: điều người kể đã kể, hoặc điều người khác kể về người kể mà cả nhà được biết (`visibility = 'family'`); chưa bị thay; không thuộc chính cuộc gọi này. Điều `self` người khác kể về người kể thì không đưa vào.

**Luật câu gốc (chống bịa)**
- Mỗi sự thật, mỗi tín hiệu phải có `evidence` nằm nguyên trong một câu trả lời của cuộc gọi. So sau khi gấp chữ (`foldText`: NFC, chữ thường, dấu câu thành khoảng trắng, gộp khoảng trắng); câu gốc gấp xong dài 8 tới 300 ký tự. So trọn từ: câu gốc "Mẹ nhớ an" cắt từ "Mẹ nhớ anh Hùng lắm" không được nhận, nên không thành sự thật hay lời nhắc gửi nhầm cho An. Không thấy thì bỏ.
- `text` và `text_en`: một dòng, gạch dài thành dấu phẩy, bỏ ngoặc kép, không rỗng, tối đa 160 ký tự; qua `suspect()` với dữ liệu là câu gốc cộng tên mọi người trong nhà (tên lạ, số lạ thì bỏ).
- `about` là thứ tự trong danh sách người trong nhà, `-1` là cả nhà hoặc người ngoài danh sách; số khác thì bỏ.
- Tối đa 12 sự thật và 4 tín hiệu mỗi cuộc gọi. AI không trả lời hoặc trả sai dạng thì `memory_tries + 1`, không ghi gì. AI trả danh sách rỗng là rút xong, không có gì để nhớ.

**Ai thấy được** (`visibilityOf`): `self` khi loại `health` hoặc `worry`, khi AI đánh dấu riêng tư (sức khoẻ, tiền, mâu thuẫn, lo lắng, điều có thể không muốn người khác nghe), hoặc khi cuộc gọi chưa đồng ý chia sẻ (`calls.shared = false`). Còn lại `family`. Cuộc gọi cũ mặc định đã chia sẻ.

**Gộp và thay**
- `same_as` trỏ tới một sự thật đã có: không thêm hàng mới.
- `replaces` trỏ tới một sự thật đã có: sự thật cũ nhận `replacement_id` là mã sự thật mới, từ đó không đưa vào AI nữa.
- Chỉ nhận mã nằm trong danh sách sự thật đã đưa cho AI.
- Rút lại một cuộc gọi: gỡ `replacement_id` đang trỏ tới sự thật của cuộc gọi đó, xoá sự thật của cuộc gọi đó, rồi ghi lại. Lần rút sau vẫn thấy sự thật cũ mà lần trước đã thay, nên không treo mã đã xoá.
- `details` = `{ evidence, sensitive, occasion, lang }`. `occasion` chỉ là một trong `OCCASION_KEYS`, khác thì null. Trong schema gửi AI, không gắn dịp là `'none'` (không dùng chuỗi rỗng trong enum vì Gemini có thể không nhận), lúc đọc đổi về null.
- Xong thì `calls.memory_at = now()`. Cuộc gọi không có câu trả lời nào có lời chép cũng đánh dấu xong.

**Tín hiệu** (rút cùng lần gọi AI, `checkSignal`)
- Loại: `miss` (nhớ ai), `want_contact` (muốn gọi, gặp, nghe giọng), `good_news` (tin vui), `worry` (lo cho ai), `low` (người kể mệt, buồn, ốm), `upcoming` (người kể sắp có việc quan trọng).
- `target` là đúng chữ người kể dùng cho người kia, phải nằm trong câu gốc (trọn từ). `low`, `good_news`, `upcoming` luôn về chính người kể nên `target` rỗng; có `target` thì bỏ. `upcoming` cần ngày 1 tới 31 và tháng 1 tới 12.
- `worry` chỉ ở sổ nhớ, không thành lời nhắc.
- Chỉ xếp hàng chờ khi `extractCall` chạy với `signals: true` và cuộc gọi xong trong 24 giờ. Rút bù không xếp tín hiệu.
- Hạn (`may_signals.expires_at`): `miss`, `want_contact` 24 giờ; `low`, `good_news` 48 giờ; `due_at` là ngay lúc rút. `upcoming`: sự việc là lần tới của ngày tháng đó tính từ hôm nay theo giờ người nhận; nhắc trong ngày hôm trước, từ 9:00 giờ người nhận (đã qua 9:00 thì ngay), hết hạn lúc hết ngày hôm trước. Hôm trước đã qua hoặc ngày không có thật (31/2) thì bỏ.
- Mỗi (cuộc gọi, người nhận, loại) một hàng: ghi bằng `on conflict (call_id, to_id, kind) do nothing`, nên rút lại không thêm tín hiệu.

**Người nhận** (`resolveTargets`, spec "Chốt thêm" 5)
- `miss`, `want_contact`: tên khớp đúng một người (cả họ tên hoặc tên gọi, chữ cuối, trọn từ: "An" khớp "Nguyễn Văn An", "bé An"; "Anh" không khớp "An"). Khớp nhiều người thì không ai.
- Không khớp tên thì theo vai: bố, ba, cha, dad, 아빠... là mọi người vai `bo`; mẹ, má, mom, 엄마... là mọi người vai `me`; các con, tụi nhỏ, kids, 애들... là mọi người vai `con`; con, con trai, son, 아들... chỉ khi nhà có đúng một con. Chữ lạ thì không ai.
- `low`, `good_news`, `upcoming`: mọi người trong nhà trừ người kể.
- Người kể không bao giờ là người nhận. Công tắc `members.may_nudge` áp hai chiều: người kể tắt thì lời kể của họ không thành tín hiệu; người nhận tắt thì không nhận.

**Múi giờ người nhận** (`tzOfMember` ở `server/place.ts`): vị trí thật nếu đang chia sẻ; không thì `members.city` (múi giờ trong JSON CityPicker lưu, hoặc mã thành phố có sẵn); JSON không có múi giờ thì nơi gần nhất trong `src/places.json`; thiếu hay sai thì `Asia/Ho_Chi_Minh`. `localParts` cho ngày và phút trong ngày ở múi giờ đó, `zonedTime` đổi giờ đồng hồ ở múi giờ đó ra mốc thật (đúng cả ngày đổi giờ mùa hè).

**Rút bù cuộc gọi cũ** (`startMemoryBackfill`, gọi trong `server/index.ts` sau các bước migration)
- Chỉ chạy khi có khoá AI. Bắt đầu 60 giây sau khởi động, mỗi 20 giây một cuộc gọi, cuộc gọi xong cũ nhất trước.
- Lấy cuộc gọi `status = 'done'`, `memory_at` trống, `memory_tries < 3`; thử tối đa 3 lần, quá thì bỏ qua.
- Hết cuộc gọi cần rút thì dừng; cuộc gọi mới do `afterCall` rút. Cuộc gọi lỗi lúc đó được rút bù ở lần khởi động sau.
- AI lỗi (429, hết hạn mức, quá giờ) thì dừng đợt rút bù ngay sau cuộc gọi lỗi đầu tiên, chỉ cuộc gọi đó mất một lượt thử; lần khởi động sau chạy tiếp. Như vậy một lần AI hỏng không đốt hết 3 lượt thử của mọi cuộc gọi cũ. Một cuộc gọi tự nó lỗi mãi thì sau 3 lần khởi động sẽ bị bỏ qua, các cuộc gọi sau tiếp tục.
