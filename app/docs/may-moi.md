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

## Bộ câu v2 trên máy chủ (task 3)

Mã: `src/shared.ts` (chủ đề, kiểu bộ câu), `server/call.ts` (soạn câu, hỏi thêm, chia sẻ), `server/podcast.ts` (chỉ chuyện chính thành tập). Test: `server/call.test.ts`, `server/podcast.test.ts`. Màn gọi `src/Call.tsx` đổi theo ở task 4; giữa hai task không deploy.

**Một bộ câu** (`CallScript.v = 2`): `questions = [hỏi thăm, chuyện chính, lời nhắn?]`.
- Hỏi thăm: `topic 'hoi-tham'`, `part 'checkin'`. Không hỏi thêm, không xin ảnh, không bao giờ thành tập. Câu trả lời vẫn vào sổ nhớ và tín hiệu (chỉ lời nhắn khó nói bị loại).
- Chuyện chính: `part 'story'`, `theme` thuộc `STORY_THEMES`, `topic = THEME_TOPIC[theme]`. Hỏi thêm tối đa `script.follow` lượt: `MAX_STORY_FOLLOW = 4`, cuộc gọi thử `TRIAL_FOLLOW = 2`. Không còn trần riêng cho cả cuộc gọi.
- Lời nhắn khó nói: như cũ (`relayQuestion`). Nhà một người hoặc cuộc gọi thử thì không có.
- Lời tạm biệt luôn là câu cố định `call.line.bye.<vai>`, không còn hứa "cả nhà cùng nghe" vì chuyện có thể được giữ riêng.

**Chủ đề theo vai** (`themesFor`): bố mẹ được mọi chủ đề, ngày cưới chỉ khi nhà có đủ bố lẫn mẹ và lịch chưa có ngày cưới. Con không có ngày cưới, ngày con chào đời, dặn con cháu.

**Loại ngày đi đôi với chủ đề** (`eventFor`, áp ở mọi chỗ dựng câu mở): chủ đề `ngay-cuoi` luôn mang `event 'wedding'` (để hỏi và ghi ngày cưới vào lịch), chủ đề khác không bao giờ mang `wedding` (AI ghi `wedding` cho chủ đề khác thì đổi thành `none`).

**Ba cách soạn**
- `firstScript` (cuộc gọi đầu): chào, hỏi thăm `callScript.first.<vai>.q1`, chuyện bữa cơm nhớ nhất (`mon-an`), `trial: true`, 2 lượt hỏi thêm, không hỏi lời nhắn.
- `templateScript`: hỏi thăm `callScript.template.<vai>.checkin`. Chuyện chính từ câu mẫu `callScript.template.<vai>.story.<chủ đề>`: ngày cưới trước nếu được hỏi, không thì các chủ đề chưa hỏi, xoay vòng theo tuần (hỏi hết rồi thì xoay lại từ đầu).
- `aiScript`: AI viết lời chào, câu hỏi thăm, câu mở chuyện chính kèm chủ đề, cờ ảnh, loại ngày; không viết lời tạm biệt. Mỗi câu qua `suspect()`. Câu mở còn phải đúng chủ đề cho vai, chỉ hỏi ngày cưới khi được hỏi, chưa từng hỏi. Câu nào hỏng thì thay bằng câu tương ứng của bộ câu mẫu; AI không trả lời thì `null` và nơi gọi dùng bộ câu mẫu.
- Luật prompt: câu hỏi thăm hỏi người đó lúc này, đáp một từ cũng được; câu mở mời kể dài (kể con nghe về..., hồi đó thế nào...), không hỏi một sự kiện có một đáp án, lấy một chi tiết thật trong dữ liệu làm cớ, không nêu ngày không có trong dữ liệu. Các luật cũ (không bịa, không lặp câu đã hỏi, không đụng "điều chưa nói", luật ngày cưới) giữ nguyên.

**Dùng lại bộ câu trong tuần** (`scriptReusable`): chỉ khi là bản v2, cùng thứ tiếng, cùng tên linh vật, và đúng loại (người chưa gọi lần nào chỉ dùng bộ câu cuộc gọi thử, người đã gọi thì không). Bộ câu kiểu ba câu soạn trước bản này thì soạn lại.

**Hỏi thêm** (`turnAI`)
- Câu hỏi thêm đi theo các ý của một câu chuyện: bối cảnh (dịp gì, ở đâu, khi nào), ai có mặt, chuyện gì xảy ra, cảm xúc lúc đó, giờ nghĩ lại muốn nói gì. Ý nào đã kể thì bỏ qua. Kể đủ hoặc người kể nói thôi, hết rồi, vậy thôi thì không hỏi nữa. Luật hỏi ngày giữ nguyên.
- Lượt hỏi thăm: không hỏi thêm; câu đáp nối luôn câu mở chuyện chính thành một câu nói (`joined: true`) nếu cả câu vừa `TTS_MAX`, đỡ một câu giọng mới. Quá dài thì chỉ câu đáp (`joined: false`). Câu gộp này là câu hỏi chính của cuộc gọi nên máy chủ đọc trước bằng giọng bắt buộc (`optional: false`, như câu có hỏi thêm); chỉ câu đáp đơn mới là câu phụ, bị bỏ khi ngân sách giọng ngày còn dưới 30%.
- Trần lấy từ `script.follow` (bản cũ không có thì 4). Máy chủ không còn đọc `follows` máy khách gửi.

**Chia sẻ**: cuộc gọi mới ghi `calls.shared = false`. `POST /api/call/:id/share` (không có thân, gửi lại được) bật `shared = true` cho cuộc gọi của chính người gọi; không thấy cuộc gọi thì 404 `call_not_found`. Cuộc gọi cũ vẫn là đã chia sẻ.

**Câu cố định mới** (`callLines`, nạp sẵn giọng bằng `warmFixedVoices`): `share`, `shareYes`, `shareNo`, `bye`. Mỗi vai mỗi thứ tiếng nay 15 câu.

**Podcast**: câu hỏi thăm cũng như lời nhắn, không bao giờ vào tập (`NO_EPISODE_TOPICS`, lọc cả trong SQL của `callAnswers`, `buildTopic`, `refreshTopicsOf`). Cuộc gọi v2 chỉ chấm chuyện chính (`episodeIdx`) nên không còn phần đuôi; cuộc gọi cũ chấm như trước.

## Màn gọi v2 và bước xin phép chia sẻ (task 4)

Mã: `src/Call.tsx` (luồng cuộc gọi), `src/callShare.ts` (chặng của bước chia sẻ, hàm thuần). Test: `src/callShare.test.ts`. `MAX_CALL_FOLLOW` đã bỏ khỏi `src/shared.ts`; máy khách không gửi `follows` nữa.

**Luồng** (chỉ bộ câu v2, `/call/start` luôn trả v2)
1. Lời chào + câu hỏi thăm đọc một file (`opening()`), rồi nghe. Im lặng thì "cứ từ từ" và nghe lại; vẫn im thì "chắc đang bận" và kết thúc.
2. Gửi câu trả lời hỏi thăm (câu của hỏi thăm, lượt 0). AI trả `joined` và `say` thì Mây đọc đúng `say` (đã gồm câu mở chuyện chính), xin như câu bắt buộc, không kind `reply`, không thay bằng câu mẫu. Không có thì câu đáp AI (hoặc câu đáp ngắn cố định) rồi câu mở. Lúc người nghe đang đáp hỏi thăm, máy khách không xin trước giọng câu mở riêng.
3. Chuyện chính: như trước, trần câu hỏi thêm là `script.follow` (4, cuộc gọi thử 2). Im lặng ngay sau câu mở thì nhắc một lần, vẫn im thì "chắc đang bận" và kết thúc. Im sau một câu hỏi thêm thì thôi hỏi, Mây chỉ nhận lời ngắn (câu đáp ngắn có sẵn trong kho), không còn nói "mình nói chuyện khác nhé" vì mỗi cuộc gọi chỉ một chuyện.
4. Chuyện chính có ít nhất một lượt kể: xin ảnh như trước nếu là chuyện thật (nói "để sau" hay hết giờ thì Mây cũng chỉ nhận lời ngắn rồi sang bước sau); rồi nếu nhà có từ hai người thì xin phép chia sẻ.
5. Chuyển lời người khác nhắn, hỏi lời nhắn khó nói (nếu có), rồi tạm biệt bằng câu cố định `script.goodbye` (`kind: 'fixed'`).
6. Chuyện chính bắt đầu thì xin sẵn từ kho bốn câu cố định `share`, `shareYes`, `shareNo`, `bye`.

**Bước xin phép chia sẻ** (`askShare`, cùng khuôn với bước xin ảnh)
- Hiện hai nút "Chia sẻ" và "Giữ riêng" (khoá `call.share.yes`, `call.share.no`), Mây hỏi `call.line.share` (câu cố định), rồi nghe tối đa 8 giây (`SHARE_HEAR_MS`).
- Máy không tự chép được lời thì nhờ `POST /api/call/:id/hear` chép (không lưu gì), nút vẫn bấm được trong lúc chờ. Mic tắt lúc chờ nút và lúc chờ máy chủ chép.
- Hiểu câu trả lời (`shareAnswer`, câu tối đa 10 từ): lời từ chối rõ ràng xét trước tiên ("đừng", "giữ riêng", "để sau", "không chia sẻ" trừ khi câu trả lời mở đầu bằng "sao không chia sẻ", nên "không sao, không chia sẻ nhé" vẫn là giữ riêng; tiếng Anh "private", "don't" trừ "don't mind", "keep it"; tiếng Hàn "안 ...도 돼", "하지 마", "말아"), có nó thì là giữ riêng dù câu có "không sao", "no problem". Sau đó câu có chữ phủ định mà vẫn là đồng ý ("không sao", "sao không", "chia sẻ đi", "được thôi", "thôi được"; tiếng Anh "no problem", "why not", "I don't mind"), rồi câu từ chối ("không", "thôi", "đừng", "để sau", "chưa", "khỏi", "giữ riêng"...), rồi câu đồng ý ("được", "ừ", "ok", "vâng", "đồng ý", "có chứ"...). Tiếng Hàn "네" phải đứng riêng, nên đuôi câu như "좋네요" không tính là đồng ý. Không rõ thì chờ bấm nút.
- Hẹn giờ (`SHARE_WAIT`): nghe 12 giây, chờ máy chủ chép 7 giây, chờ nút 12 giây. Hết giờ chờ nút là giữ riêng.
- Đồng ý: `POST /api/call/:id/share` qua hàng chờ (cùng nhóm cuộc gọi, nên luôn tới trước lệnh kết thúc), Mây nói `shareYes`. Từ chối hay hết giờ: Mây nói `shareNo`, cuộc gọi giữ `shared = false`. Cúp máy: dừng, không gửi lời vừa nghe ở bước này (chỉ là câu trả lời có hay không, gửi sẽ đè lên lượt kể cuối).
- Nhà một người thì không hỏi, cuộc gọi giữ `shared = false`.

**Số câu giọng dự kiến** (chi tiết ở `docs/tts-budget.md`): chào + hỏi thăm 1, câu đáp hỏi thăm gộp câu mở 1, mỗi câu hỏi thêm 1 (0 tới 4, câu nhắc ngày đi chung), câu đáp cuối 1 (chỉ khi ngân sách ngày còn trên 30%, không thì câu cố định). Còn lại là câu cố định trong kho. Tổng 2 tới 7 câu, thường khoảng 6; cuộc gọi thử 2 tới 5. 70 câu mỗi ngày đủ khoảng 10 cuộc gọi đủ giọng (11 nếu toàn cuộc gọi 6 câu), sau đó hiện chữ kèm chuông nhẹ. Kiểu cũ tới 11 câu một cuộc gọi. Bốn câu cố định mới tốn 12 câu giọng mỗi thứ tiếng một lần (4 câu x 3 vai), `warmFixedVoices` nạp sẵn.

## Cuộc gọi thử

- Thẻ mời: `GET /api/call/due` trả `{ due, done, trial }`. `dueState` (`server/call.ts`): chưa có cuộc gọi nào xong (`hadDone` false) thì `trial: true` và `due` khi đã quá `TRIAL_AFTER_MIN` = 10 phút kể từ `members.created_at` (tạo nhà hoặc được duyệt vào), mọi ngày kể cả thứ Bảy. Đã gọi xong thì `trial: false`, `due` chỉ khi đang khung cuối tuần và tuần này chưa có cuộc gọi thật xong. Luật 24 giờ cũ đã bỏ.
- Cuộc gọi thử không chiếm lượt tuần: `done` và `doneThisWeek` chỉ đếm cuộc gọi `status = 'done' and not trial`; `weeklyTick` (`server/push.ts`) cũng vậy. Người mới chỉ gọi thử vẫn thấy thẻ ngày thứ Bảy.
- `POST /api/call/start`: người chưa có cuộc gọi xong thì soạn `aiScript(c, week, START_AI_MS, { trial: true })` (đầu vào AI có `trial: true`, prompt dặn một chuyện dễ, ấm, lấy từ câu trả lời giới thiệu hoặc nơi ở; không có câu lời nhắn; `follow = TRIAL_FOLLOW` = 2; `trial: true`). AI lỗi, quá hạn hay hết lượt soạn thì `firstScript`. Dòng `calls` ghi `trial = true`.
- Máy khách: `App.tsx` giữ `callTrial` từ `/api/call/due`, `Home` truyền `trial` cho `CallCard`; thẻ hiện `call.card.trial` và `call.card.trialLen` (khoảng 3 phút).
- Test: `server/call.test.ts` (`dueState`, `aiScript` với `trial`).

## Soạn câu từ dữ liệu lớn dần

Mã: `server/callfacts.ts` (nạp và chọn dữ liệu), `server/place.ts` (nơi ở, giờ chênh, khoảng cách, thời tiết), `server/call.ts` (`context`, `scriptFacts`, `aiScript`, `templateScript`, `/call/start`). Test: `server/callfacts.test.ts`, `server/place.test.ts`, `server/call.test.ts`.

**Nạp** (`loadScriptExtras`, gọi trong `context()` song song các câu cũ; lỗi thì ghi log `[call]` và soạn như cũ, không có các mục mới). Bốn câu SQL (`EXTRAS_SQL`) rồi ngày của nhà:
- Người nghe: tên, vai, ngày sinh, thành phố, vị trí, `intro` (chỉ đọc `food`, `seen` để biết hồ sơ còn trống gì; "điều chưa nói" không bao giờ đọc), nhà đã có ngày cưới trong lịch chưa.
- Cả nhà: tên, vai, thành phố, vị trí.
- Sổ nhớ: tối đa 300 sự thật mới nhất chưa bị thay, `visibility = 'family'` hoặc chính người nghe kể. Điều `self` của người khác không bao giờ lấy, `pickFacts` lọc lần nữa.
- Cuộc gọi đã xong của người nghe (100 gần nhất), kèm số lượt kể có lời chép ngoài câu hỏi thăm và lời nhắn khó nói (`NO_EPISODE_TOPICS`).
- Ngày của nhà trong 30 ngày tới: `upcoming()` ở `server/calendar.ts` (sinh nhật theo ngày sinh, các ngày trong lịch).

**Đưa cho AI** (`scriptFacts`, nhãn tiếng Anh, mục trống ghi `none yet: ...`)
- `person.age`; `person.lives_in`: `place`, `country`, `local_time`, `weather` (không có thời tiết thì không có mục `weather`; không biết ở đâu thì `none yet`); `person.profile_gaps`: `food`, `seen` khi khảo sát bỏ trống (`food` cũng không tính là trống nếu sổ nhớ đã có sự thật loại `food` về người nghe).
- `family_members`: người khác trong nhà, `lives_in`, và chỉ khi biết cả hai nơi mới có `hours_apart` (đồng hồ người đó nhanh hơn người nghe bao nhiêu giờ, làm tròn nửa giờ) và `distance_km`.
- `memory`: `[{ id, about, told_by, told_by_you, kind, fact }]`, `about` là tên người hoặc `whole family`, `fact` là `text_en`.
- `upcoming_occasions`: `[{ name, date, in_days, who }]`. `told_themes`: `[{ theme, times, depth, last }]` (`depth` là `deep` khi lần kể sâu nhất từ 3 lượt, không thì `short`), mới nhất trước. `untold_themes`, `allowed_themes`.
- Không có dữ liệu lớn dần (test, nạp lỗi) thì chỉ các mục cũ. `wedding_question_allowed` và chủ đề hợp lệ giờ cùng một hàm `themesOf`.

**Chọn sự thật** (`pickFacts`, tối đa `MAX_MEMORY` = 30): chỉ điều `family` hoặc người nghe kể. Điểm: về chính người nghe 4, người nghe kể 1, chưa dùng lần nào 3 (đã dùng mà lần cuối quá 30 ngày thì 1), gắn dịp có trong 30 ngày tới 3. Điểm cao trước, bằng điểm thì mới trước. AI trả `used_facts` (bắt buộc trong schema); chỉ nhận mã có trong `memory`, ghi vào `script.used`; `/call/start` đánh dấu `used_at = now(), used_count + 1` (chỉ trong nhà đó), lỗi thì ghi log, không chặn cuộc gọi. Bộ câu dùng lại trong tuần không đánh dấu lần nữa.

**Dịp** (`upcomingOccasions`, trong `OCCASION_DAYS` = 30 ngày, tính theo ngày ở nơi người nghe): Tết Nguyên đán (âm 1/1), Trung thu (âm 15/8), Noel 25/12, Tết Dương lịch 1/1, 8/3, 20/10, 20/11, Ngày của Mẹ (Chủ nhật thứ hai tháng 5), Ngày của Bố (Chủ nhật thứ ba tháng 6), Ngày Cha Mẹ ở Hàn 8/5. Âm lịch qua `nextOccurrence` của `src/lunar.ts`. Tên theo thứ tiếng người nghe (khoá máy chủ `occasion.<mã>`). Ngày của nhà giữ tên trong lịch: loại `birthday` (kèm `who` là tên người khi là sinh nhật theo ngày sinh), `wedding` cho ngày cưới và ngày kỷ niệm, còn lại `event`.

**Bản đồ chủ đề** (`topicMap`): cuộc gọi v2 lấy `theme` của câu chuyện chính; cuộc gọi cũ ba câu rời chỉ tính chủ đề `ngay-cuoi`, `tuoi-tho`, `mon-an` (trùng tên chủ đề chuyện chính), chủ đề khác bỏ qua. Mỗi chủ đề: số cuộc gọi đã kể, lần kể sâu nhất (số lượt), ngày gần nhất.

**Luật prompt thêm** (12 tới 16): giờ và thời tiết chỉ lấy từ `lives_in`, không có thời tiết thì không nhắc; dịp chỉ lấy từ `upcoming_occasions`, dịp có sự thật trong sổ nhớ thì câu mở được hỏi sâu (năm nay, mấy năm trước); chủ đề chọn trong `untold_themes` hoặc chủ đề mới kể `short`, ưu tiên chủ đề hợp dịp (`tet-cac-dip` gần Tết, Noel, Trung thu), không bao giờ là chủ đề của lần kể mới nhất, luật ngày cưới vẫn đứng trước; sự thật người khác kể chỉ dùng kèm ai kể ("mẹ kể là ..."), không nói như Mây tự biết; tên trong sổ nhớ viết đúng như có; `profile_gaps` có thì câu hỏi thăm được lồng một câu (bao lâu chưa gặp cả nhà, món nhớ nhất).
- Lớp lọc: dữ liệu đối chiếu của `suspect()` có thêm tên tháng tiếng Anh của các dịp và giờ kiểu 12 giờ ("8 giờ tối" khi `local_time` là 20:00). Sổ nhớ có điều chính người nghe kể thì được nói "Mẹ từng kể".

**Bộ câu mẫu** (`templateScript`): ngày cưới vẫn trước nếu được hỏi; có bản đồ chủ đề thì lấy chủ đề đầu tiên theo thứ tự ưu tiên chưa kể lần nào và câu chưa hỏi; kể hết rồi mới xoay vòng theo tuần như cũ.

**Thời tiết** (`weatherAt`): open-meteo như máy khách (`current=temperature_2m,weather_code`), toạ độ làm tròn 1 số lẻ (khoảng 11 km) trước khi hỏi, nhớ 1 giờ theo toạ độ đó trong bộ nhớ máy chủ, chờ tối đa 2 giây, lỗi gì cũng bỏ. Chữ "5°C, cloudy" tiếng Anh, cùng nhóm mã như `src/time.ts` (`clear`, `few clouds`, `cloudy`, `fog`, `drizzle`, `rain`, `snow`, `storm`).

**Nơi ở** (`placeOfMember`): vị trí thật nếu đang chia sẻ, không thì `members.city`. Thành phố tự chọn thì gọi đúng tên ấy; vị trí thật thì tên nơi gần nhất trong `src/places.json` khi trong 60 km, xa hơn chỉ biết nước. Tên nơi và tên nước theo thứ tiếng người nghe.
