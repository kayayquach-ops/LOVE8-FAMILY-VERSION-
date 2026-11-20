# Mây mới: hỏi sâu, nhớ cả nhà, nối mọi người lại với nhau (thiết kế 20/11/2026)

Bản này ghi điều người dùng (chủ app, du học sinh ở Hàn, đội thi OASIS-6) đã nói trong chat ngày 20/11/2026 và những chỗ Claude tự quyết. Chỗ ghi **(Claude chốt)** là chưa được người dùng duyệt riêng. Cơ chế cuộc gọi hiện có: HANDOFF.md mục "Cuộc gọi AI hằng tuần: cơ chế", `app/docs/cuoc-goi-moi.md`, `app/server/call.ts`, `app/src/Call.tsx`.

## Vì sao làm lại

Mây hiện hỏi 3 câu rời mỗi cuộc gọi. AI soạn từ dữ liệu khảo sát và 8 câu trả lời gần nhất, nên câu hỏi chung chung, có câu hẹp tới mức người kể đáp một câu là hết (ví dụ "mẹ hay nấu canh chua vào bữa nào"). Ghép thành podcast thì ngắn và rời rạc. Mây cũng chưa nhớ gì có hệ thống, chưa biết dịp lễ sắp tới, và chưa làm được việc quan trọng nhất của app: kéo người trong nhà liên lạc trực tiếp với nhau.

Người dùng muốn: mỗi gia đình, mỗi người có bộ câu hỏi riêng theo dữ liệu của họ; dữ liệu lớn dần qua từng cuộc gọi; Mây nhớ hết và hỏi ngày càng sâu; biết bối cảnh bên ngoài (sắp Noel, sắp Tết); và khi nghe được "mẹ đang nhớ con, muốn gọi con lắm" thì báo cho người con, và ngược lại.

## Mục tiêu

1. Mỗi cuộc gọi ra **một chuyện dài, có đầu có đuôi**, đủ để ghép thành một tập "nhà mình kể" nghe hay.
2. **Mây nhớ**: sau mỗi cuộc gọi rút ra sự thật về người kể và cả nhà, lưu lại, lần sau dùng để hỏi sâu hơn.
3. **Cá nhân hoá** từng người theo dữ liệu nền (khảo sát, nơi sống, ai ở đâu, bao lâu chưa gặp) và bối cảnh (dịp lễ, sinh nhật, mùa, thời tiết).
4. **Mây nối người**: tín hiệu nhớ, muốn gọi, lo lắng, tin vui trong lời kể thành một lời nhắc nhẹ cho đúng người, kèm cách liên lạc ngay.
5. **Cuộc gọi thử** sớm sau khi vào nhà, hỏi câu cá nhân hoá cơ bản trước.

## Không làm (lần này)

- Không đổi phần "Nói" (vẫn chỉ giọng Gemini) và phần "Nghe".
- Không làm nói chuyện thời gian thực (Gemini Live), đã hẹn để sau buổi pitch.
- Không làm app native; thông báo vẫn là Web Push.

## Điều cấm (làm xong mà phạm là hỏng)

- Mây bịa: nhắc chuyện, tên, ngày, ảnh không có trong dữ liệu. Lớp chống bịa `suspect()` và luật "chỉ dùng dữ liệu thật" giữ nguyên, mở rộng cho dữ liệu sổ nhớ.
- Lộ chuyện riêng: "điều chưa nói" (khảo sát) và lời nhắn khó nói chỉ đi qua đúng kênh của chúng, không bao giờ vào sổ nhớ dùng chung, không bao giờ thành câu hỏi cho người khác.
- Mây làm phiền: nhắc dồn dập, nhắc lúc nửa đêm theo giờ người nhận, nhắc khi không có tín hiệu thật.
- Câu hỏi hẹp một đáp án.

## Người dùng đã chốt (20/11)

- Câu hỏi cá nhân hoá theo dữ liệu từng người và cả nhà (ví dụ nhà 4 người: bố mẹ ở Hà Nội, An du học Busan, Bình ở TP.HCM).
- Câu mở mời kể (dùng dữ liệu làm cớ, ví dụ "An đi xa rồi mà mẹ vẫn nhớ An mê canh chua. Mẹ kể con nghe về một bữa cơm hồi An còn ở nhà mà mẹ nhớ nhất đi"), rồi **bồi thêm nhiều câu** để vừa có chuyện dài vừa lấy thêm dữ liệu; có ngày thì ghi lịch, không phải cuộc gọi nào cũng cần có ngày.
- Mỗi cuộc gọi đào sâu một chuyện chính (người dùng đồng ý "dạng câu đấy ok").
- Video có thể nhiều kiểu (hiện câu hỏi lên rồi người kể trả lời...), miễn tổng thể là một câu chuyện dài.
- Mây nhớ được mọi thông tin của gia đình, dữ liệu lớn dần, hỏi sâu và cá nhân hoá dần; theo thời gian thực (sắp Noel thì hỏi Noel năm nay, Noel những năm trước, mẹ có kỷ niệm gì về Noel; sắp Tết thì hỏi Tết).
- Gọi thử một lần sớm sau khi vào nhà, hỏi câu cơ bản cá nhân hoá trước (người dùng nói "đăng nhập 50 phút để gọi thử một lần chẳng hạn", xem câu hỏi mở 1).
- Nghe được "mẹ nhớ con, muốn gọi con" thì báo cho người con, và ngược lại.

## Thiết kế

### A. Cấu trúc một cuộc gọi

1. **Chào và hỏi thăm** (một câu, đáp ngắn cũng được): theo bối cảnh thật (Busan đang 5 độ, vừa thi xong...). Không tính là chuyện.
2. **Chuyện chính**: một câu mở mời kể, rồi tối đa **4 câu bồi** **(Claude chốt, thay mức 2 hiện tại)**. Câu bồi đi theo các ý của một câu chuyện: bối cảnh (dịp gì, ở đâu, khi nào), ai có mặt, chuyện gì xảy ra, cảm xúc lúc đó, giờ nghĩ lại muốn nói gì. Ý nào người kể đã nói thì bỏ qua; người kể đã kể đủ hoặc tỏ ý muốn dừng thì thôi hỏi. Nghe được ngày và tháng thì nhắc lại cho chắc và ghi lịch (đã có).
3. **Xin ảnh** cho chuyện nếu là chuyện thật có chi tiết (đã có).
4. **Lời nhắn khó nói** (câu cuối, đã có).

Cuộc gọi đầu (cuộc gọi thử) cũng theo khung này nhưng chuyện chính dễ hơn và tối đa 2 câu bồi **(Claude chốt)**.

### B. Sổ nhớ của Mây

Bảng mới `memory_facts` **(Claude chốt tên và cột)**:
`id, family_id, about_id (người được nói tới, có thể null = cả nhà), source_id (người kể), kind, text, details jsonb, call_id, answer_id, visibility ('family' | 'self'), created_at, used_at, used_count`.

- `kind`: `person` (người thân, bạn bè được nhắc), `place`, `food`, `habit`, `like`, `worry`, `wish`, `milestone` (đi học, đi làm, cưới, chuyển nhà...), `occasion` (cách nhà này đón Tết, Noel...), `health` (chỉ khi chính người đó nói), `relationship`.
- `text` là một câu ngắn chuẩn hoá bằng ngôn ngữ người kể, ví dụ "Mẹ hay nấu canh chua cá lóc mỗi khi An được điểm cao".
- **Rút sổ nhớ sau mỗi cuộc gọi**: một lần gọi Gemini đọc toàn bộ câu trả lời của cuộc gọi (trừ lời nhắn khó nói), trả về danh sách sự thật kèm câu gốc chứng minh. Mỗi sự thật phải có câu gốc chứa nó; không có thì bỏ (cùng tinh thần `suspect()`).
- `visibility = 'self'` cho sự thật chỉ nên dùng khi hỏi chính người kể (sức khoẻ, lo lắng riêng) **(Claude chốt)**; còn lại `family`. Lời nhắn khó nói và "điều chưa nói" không bao giờ vào bảng này.
- `about_id`, `source_id` trỏ tới members: phải thêm vào kế hoạch xoá `PLAN` trong `server/members.ts` (xoá sự thật người đó kể; sự thật người khác kể về người đó thì đặt `about_id` null hay xoá: **(Claude chốt)** xoá luôn, vì người đó đã rời nhà).
- Không lưu toàn văn câu trả lời trong sổ nhớ (đã có ở `call_answers`).

### C. Soạn cuộc gọi từ dữ liệu ngày càng lớn

Đầu vào cho AI soạn (thay cho `scriptFacts` hiện tại, vẫn chỉ dữ liệu thật, mục trống ghi "none yet"):

- Hồ sơ người nghe: tên, vai, tuổi, nơi đang sống (thành phố, nước, giờ địa phương, thời tiết hiện tại nếu có), khảo sát (trừ "điều chưa nói" chỉ để chọn giọng), bao lâu chưa gặp.
- Cả nhà: từng người ở đâu, cách bao xa, giờ chênh.
- **Sổ nhớ**: những sự thật liên quan nhất, tối đa khoảng 30 **(Claude chốt)**, ưu tiên: về chính người nghe; chưa từng dùng hoặc lâu rồi chưa dùng; gắn với dịp sắp tới. Sự thật `self` của người khác không bao giờ đưa vào.
- **Dịp sắp tới** trong 30 ngày **(Claude chốt)**: sinh nhật người trong nhà, ngày cưới, các ngày trong lịch nhà; lễ Việt và Hàn và chung (Tết Nguyên đán, Trung thu, Chuseok, Noel, Tết Dương lịch, 8/3, 20/10, Ngày của Mẹ, Ngày của Bố, Ngày Nhà giáo 20/11...) tính bằng `src/lunar.ts`. Dịp nào đã có sự thật `occasion` thì hỏi sâu hơn ("năm ngoái mẹ kể Tết nhà mình hay gói bánh chưng, năm nay...").
- **Bản đồ chủ đề** đã kể của người này (chủ đề nào kể rồi, kể sâu tới đâu) để chọn chuyện chính chưa kể hoặc kể dở. Danh sách chủ đề gốc: tuổi thơ, quê nhà, bố mẹ của mình, ngày cưới, công việc, ngày con chào đời, ngày con đi xa, món ăn, Tết và các dịp, bạn bè, ước mơ, điều muốn dặn con cháu... **(Claude chốt, người làm có thể chỉnh)**.
- Các câu đã hỏi (không lặp).

Luật soạn: câu mở chuyện chính phải là câu mời kể (kể con nghe về..., hồi đó thế nào...), không phải câu hỏi một sự kiện có một đáp án; dùng một chi tiết thật làm cớ mở lời.

### D. Mây nối người (tín hiệu thành lời nhắc)

Sau mỗi cuộc gọi, cùng lần gọi AI rút sổ nhớ, rút thêm **tín hiệu**:

- `miss`: nhớ một người trong nhà.
- `want_contact`: muốn gọi, muốn gặp, muốn nghe giọng.
- `good_news`: có tin vui muốn khoe (đỗ, được thưởng, khỏi ốm...).
- `worry`: lo cho một người trong nhà.
- `low`: mệt, buồn, ốm (của chính người kể).
- `upcoming`: sắp có việc quan trọng (thi, phỏng vấn, về nước, đi khám).

Mỗi tín hiệu có người được nhắc (từ tên, vai) và câu gốc chứng minh. Biến thành **lời nhắc** gửi cho người kia:

- Lời của Mây, ấm, không trích nguyên văn chuyện riêng, không lộ chi tiết nhạy cảm: "An ơi, mẹ vừa kể với Mây là nhớ An lắm. Gọi cho mẹ một chút nhé." Kèm cách liên lạc ngay: bấm vào mở app vào màn gọi thoại hoặc video với người đó (Web Push trên iPhone không có nút hành động trong thông báo, nên bấm thông báo là vào thẳng màn gọi).
- `low`, `worry` về sức khoẻ: không nói bệnh gì, chỉ "dạo này mẹ hơi mệt, An hỏi thăm mẹ nhé" **(Claude chốt)**.
- `good_news`: "Bình có tin vui muốn khoe với cả nhà đấy, hỏi Bình xem nào" (gửi cả nhà, trừ người kể).
- `upcoming`: nhắc trước ngày đó một hôm cho người thân gửi lời chúc.
- **Giờ gửi**: theo giờ người nhận, 9:00 tới 21:30; ngoài khung thì đợi.
- **Trần**: mỗi người nhận tối đa 1 lời nhắc của Mây mỗi ngày, 3 mỗi tuần **(Claude chốt)**; không có tín hiệu thật thì không gửi gì.
- **Khép vòng**: nếu trong 48 giờ hai người gọi cho nhau (hook `onCallConnected` của `server/facetime.ts`) hoặc nhắn riêng cho nhau, lần gọi sau Mây có thể hỏi "hôm trước An gọi, hai mẹ con nói chuyện gì?". Có số liệu "lời nhắc của Mây dẫn tới cuộc gọi" cho phần pitch (đo đúng thước đo "số lần cả nhà tự liên lạc").
- Cài đặt có công tắc "Mây nhắc mình liên lạc" (mặc định bật) cho người nhận.
- Lời nhắn khó nói vẫn chạy kênh riêng như cũ (bảng `relays`), không đi qua đây.

### E. Cuộc gọi thử sau khi vào nhà

- Sau khi vào nhà (tạo nhà hoặc được duyệt vào), một khoảng ngắn thì trang chủ hiện thẻ "Mây muốn chào bạn" (không tự đổ chuông, như thẻ hiện có). Khoảng thời gian: xem câu hỏi mở 1.
- Câu hỏi lấy từ dữ liệu nền (khảo sát, nơi sống, người trong nhà). Người vào bằng mã chỉ có vai, tên, nơi ở: Mây hỏi dần những điều phần khảo sát bỏ qua (món nhớ nhất, bao lâu chưa gặp...), mỗi cuộc gọi lồng một câu, câu trả lời vào sổ nhớ.
- Sau cuộc gọi thử, lịch gọi hằng tuần chạy như cũ (thẻ mời từ sáng thứ Bảy).

### F. Ghép thành chuyện, nhiều kiểu video

- Mỗi cuộc gọi: chuyện chính (câu mở và các câu bồi) là một tập dài trong "nhà mình kể" (podcast theo câu chuyện đã có ở `server/podcast.ts`, `callvideo.ts`).
- Kiểu **kể liền mạch**: ghép các đoạn người kể thành một mạch, câu hỏi thành tiêu đề nhỏ.
- Kiểu **hỏi đáp**: thẻ chữ câu hỏi rồi người kể trả lời (đang có).
- Kiểu **hai thế hệ**: cùng chủ đề, ghép lời hai người (mẹ kể và An kể về canh chua). Cần dùng chuyện của người này khi hỏi người kia (câu hỏi mở 2). Giai đoạn sau nếu chưa chốt.

## Ràng buộc

- Hạn mức giọng Gemini khoảng 70 câu mới mỗi ngày cho cả app. Câu bồi nhiều hơn thì mỗi cuộc gọi tốn nhiều câu hơn (câu đáp và câu bồi đều phải đọc ra tiếng). Phải có cách tiết kiệm (gộp câu đáp và câu bồi vào một lần đọc; hết hạn mức thì hiện chữ và chuông nhẹ như hiện tại) và ghi con số dự kiến.
- Gemini văn bản hạn mức rộng; thêm 1 lần gọi sau mỗi cuộc gọi để rút sổ nhớ và tín hiệu.
- Chữ trong app và lời Mây: vi, en, ko; tiếng Việt ngắn, ấm, không dấu gạch dài.
- iPhone: chỉ animate transform, opacity.
- Có người dùng thật: thay đổi bảng phải chạy lặp lại được; không đụng dữ liệu cũ.
- Kế hoạch xoá thành viên (`server/members.ts` `PLAN`, `FAMILY_PLAN`) phải phủ mọi bảng mới.

## Để người làm tự quyết

- Prompt cụ thể, schema JSON của các lần gọi AI.
- Cách chấm "liên quan nhất" khi chọn sự thật đưa vào.
- Giao diện thẻ cuộc gọi thử, công tắc cài đặt, cách hiện lời nhắc trong app.
- Có làm kiểu video "kể liền mạch" ngay đợt này hay không.

## Câu hỏi mở cho người dùng

1. Cuộc gọi thử sau khi vào nhà bao lâu thì hiện thẻ? (người dùng nói "50 phút chẳng hạn"; Claude đề xuất 10 phút sau khi vào nhà để người mới kịp xem app).
2. Mây có được dùng chuyện người này kể khi hỏi người khác trong nhà không (cần cho kiểu "hai thế hệ" và câu hỏi như "mẹ kể hồi bé An hay đòi canh chua, An còn nhớ không")? Claude đề xuất: được, chỉ với sự thật `family`, luôn nói rõ ai kể.

## Chốt thêm sau khi soát (Claude chốt, 20/11)

Một agent đọc bản này như người sẽ làm, hỏi 13 điểm. Các điểm dưới đây Claude tự chốt; ba điểm còn lại hỏi người dùng (mục cuối).

1. **Bỏ khung 3 câu rời.** Cuộc gọi mới = câu hỏi thăm (không thành tập) + một chuyện chính (câu mở + tối đa 4 câu bồi, không còn trần riêng cho cả cuộc gọi) + xin ảnh + lời nhắn khó nói. `MAX_STORY_FOLLOW` thành 4. Podcast: chỉ chuyện chính được chấm (`rateStories`), đạt thì thành một tập; bỏ phần "đuôi" ghép chuyện phụ vì không còn chuyện phụ. Tập cũ giữ nguyên.
3. **Múi giờ và thời tiết trên máy chủ.** Múi giờ lấy từ vị trí thật nếu người đó bật chia sẻ vị trí, không thì từ `members.city` tra `places.json`. Thời tiết lấy trên máy chủ từ open-meteo (như máy khách đang dùng), nhớ 1 giờ; không lấy được thì bỏ khỏi dữ liệu, câu chào không nhắc thời tiết.
4. **Hàng chờ tín hiệu.** Bảng `may_signals`: tín hiệu chờ gửi, có hạn: `miss`, `want_contact` 24 giờ; `low`, `good_news` 48 giờ; `upcoming` tới hết ngày trước sự việc. Hết hạn thì bỏ. Ưu tiên khi tranh một lượt trong ngày: `want_contact` > `miss` > `low` > `good_news` > `upcoming`. Trần 1 mỗi ngày, 3 mỗi tuần tính chung mọi loại lời nhắc của Mây.
5. **Người nhận không rõ thì không gửi.** Tên khớp đúng một người thì gửi người đó; nói theo vai ("bố mẹ", "các con", "con" khi nhà chỉ có một con) thì gửi mọi người đúng vai đó; tên lạ hoặc mơ hồ thì bỏ tín hiệu, không dùng người nhận mặc định.
6. **Riêng tư của tín hiệu.** `low` chỉ khi chính người kể nói về mình. Lời kể về sức khoẻ hay nỗi buồn của người khác ("mẹ dạo này mệt") không thành lời nhắc, chỉ lưu sổ nhớ `self` cho người kể. Công tắc "Mây nhắc mình liên lạc" trong Cài đặt áp cho cả hai chiều: tắt thì Mây không gửi lời nhắc cho mình và không gửi lời nhắc từ lời kể của mình.
7. **Dữ liệu cũ.** Chạy rút sổ nhớ một lần cho các cuộc gọi đã có (trừ lời nhắn khó nói), giới hạn tốc độ, để Mây có trí nhớ ngay. Người đã có cuộc gọi thì không hiện thẻ cuộc gọi thử.
8. **Cuộc gọi thử thay `firstScript`.** AI soạn từ dữ liệu nền; AI lỗi hoặc quá giờ thì dùng `firstScript` như cũ. Tính là cuộc gọi đầu (status done) nhưng không chiếm lượt tuần: thẻ mời thứ Bảy vẫn hiện. Luật "người mới dưới 24 giờ không bị nhắc" thay bằng thẻ cuộc gọi thử.
9. **Đo lời nhắc dẫn tới liên lạc (bắt buộc, cho số liệu pitch).** Bảng `may_nudges`: người gửi tín hiệu, người nhận, loại, `sent_at`, `opened_at` (bấm thông báo mở app), `contact_at` (trong 48 giờ hai người gọi được cho nhau qua `onCallConnected`, hoặc nhắn riêng qua `messages.to_id`). Cả hai bảng mới trỏ tới members nên phải vào `PLAN`.
10. **Xoá.** `memory_facts` xoá theo `about_id`, `source_id`, và theo `call_id` khi cuộc gọi bị xoá. Tên người khác nằm trong chữ thì chấp nhận, không quét chữ.
11. **Gộp và sửa.** Khi rút sổ nhớ, AI được xem các sự thật đã có của người đó để gộp trùng hoặc đánh dấu sự thật cũ đã sai (`replaced_by`). Trong Cài đặt có mục "Mây nhớ gì về mình": danh sách sự thật về chính mình, xoá được từng dòng.
13. **Ngôn ngữ.** Lưu `text` theo ngôn ngữ người kể và `text_en` (tiếng Anh) để đưa vào prompt; tên riêng giữ nguyên chữ gốc để `suspect()` so được.

## Người dùng trả lời (20/11)

1. **Giữ giọng Gemini.** Hạn mức khoảng 70 câu mới mỗi ngày giữ nguyên; người làm phải tiết kiệm câu đọc (gộp câu đáp và câu bồi vào một lần đọc, dùng kho giọng cho câu cố định) và hết lượt thì hiện chữ kèm chuông nhẹ như hiện tại. Ghi con số dự kiến số cuộc gọi mỗi ngày.
2. **Thẻ cuộc gọi thử hiện 10 phút sau khi vào nhà** (người dùng: "10 phút đi"). Để thành hằng số dễ đổi.
3. **Hỏi trước khi chia sẻ, và chuyện chưa đồng ý thì giữ riêng** (người dùng sửa lại cách Claude đề xuất, 20/11):
   - Cuối chuyện chính, Mây hỏi: "Mây chia sẻ câu chuyện này cho cả nhà nghe được không?"
   - **Đồng ý**: tập "nhà mình kể" của chuyện này hiện cho cả nhà như hiện tại, kèm thông báo kể chuyện tới người được nhắc trong chuyện hoặc cả nhà (ví dụ "Mẹ vừa kể cho An nghe một chuyện, nghe nhé"); các sự thật rút từ chuyện mang `visibility = 'family'`, Mây được dùng khi hỏi người khác (luôn nói rõ ai kể) và cho kiểu video "hai thế hệ".
   - **Không đồng ý, không trả lời hoặc hết giờ**: tập của chuyện này **chỉ người kể thấy** (giữ trong app của mẹ), có nút "chia sẻ cho cả nhà" để lúc nào muốn thì mở; sự thật mang `visibility = 'self'`. Bấm chia sẻ sau thì đổi cả tập lẫn sự thật sang `family` và gửi thông báo như trường hợp đồng ý.
   - Cần thêm vào bảng `podcasts` (hoặc bảng kế hoạch tập) cột chủ sở hữu và trạng thái chia sẻ; mọi chỗ liệt kê tập (trang chủ, trang "nhà mình kể", phim tuần, video câu chuyện) phải lọc tập riêng của người khác. Tập cũ coi như đã chia sẻ.
   - Trả lời bằng giọng (hiểu "được", "ừ", "không", "thôi" và tương đương en/ko) hoặc hai nút trên màn hình, giống màn xin ảnh (`src/callPhoto.ts`).
4. **Số liệu lời nhắc** (`may_nudges`) vẫn làm để biết Mây nối được bao nhiêu cuộc gọi; người dùng nói buổi pitch dùng bộ ảnh và video, không phải slide, nên không cần màn báo cáo riêng.
5. **Bộ ảnh và video cho pitch để tiếng Việt** (việc riêng, không thuộc bản này).
