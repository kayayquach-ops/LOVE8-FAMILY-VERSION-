# Mây thật hơn: điều tra vì sao cuộc gọi chưa tự nhiên, và thiết kế làm lại theo kiểu Nếp

Ghi 21/11/2026, sau khi người dùng thử bản "Mây mới" (74f1d1e) trên điện thoại. Chỉ đọc code, git và `railway logs`; không sửa code, không đụng DB.

## Mục tiêu (mọi lựa chọn đều chấm theo cái này)

**Lấy được càng nhiều chuyện thật, càng giàu chi tiết, từ bố mẹ và các con.** Mỗi quyết định thiết kế chấm theo bốn câu hỏi:
1. Mây có đào tiếp đủ lâu không (không trần cứng 4 câu, kể hết mới thôi, người kể muốn dừng thì dừng)?
2. Gặp ngập ngừng, hỏi ngược ("kể gì bây giờ?", "gợi ý đi"), đùa, xúc động thì Mây có đáp như người thật không?
3. Kể xong một chuyện, Mây có mở chuyện tiếp theo một cách tự nhiên không?
4. Cúp máy xong người ta có muốn gọi lại tuần sau không?

Chuẩn người dùng đặt: nói chuyện với Mây phải như nói với model Gemini thông minh nhất, như cuộc gọi Nếp trong topik-app ("Nếp rất thông minh, hỏi và nói tự nhiên; Mây quá dở hơi").

---

## 1. Tóm tắt nguyên nhân

| Lời phàn nàn | Nguyên nhân gốc |
|---|---|
| Thời tiết như máy đọc bản tin | Prompt soạn câu chỉ dặn thời tiết lấy từ đâu, không dặn nói thế nào; dữ liệu đưa vào là chuỗi số tiếng Anh "8°C, clear"; luật "dùng một chi tiết thật làm lý do để hỏi" đẩy model đọc số. |
| Câu mở chuyện và câu hỏi thêm cứng | Câu mở mẫu có câu "lý do" rồi hỏi một khoảnh khắc hẹp; prompt từng lượt coi mọi câu trả lời là lời kể, bắt nhại lại chi tiết, cấm thêm gì ngoài lời kể, không có luật cho câu hỏi ngược, xin gợi ý, ngập ngừng. |
| "Gợi ý đi" bị hỏi "mẹ còn nhớ ngày đấy ngày bao nhiêu không?" | Câu chuyện có `event` khác `none` thì mọi câu hỏi thêm bị ép hỏi ngày cho tới khi nghe được ngày, cả bằng prompt lẫn bằng code (code còn thay câu AI bằng câu hỏi ngày soạn sẵn). |
| Giọng đổi qua lại | Cùng một model, một giọng Zephyr, một lời dặn, nhưng mỗi câu là một lần sinh riêng của Gemini TTS bản preview: câu cố định trong kho làm từ 24/10 đến 14/11 phát xen với câu sinh hôm nay; câu rất ngắn ("Dạ, con nghe đây ạ.") lệch tông nhiều nhất. |
| Đáp chậm 3 đến 4 giây, rồi "Dạ con nghe đây ạ", rồi mới câu thật | Chuỗi tuần tự: chờ im 1,9 đến 3,4 s, AI 1 đến 2 s, TTS không stream 3,4 đến 5,2 s. Câu đệm bật khi AI chưa về sau 900 ms, nên gần như lượt nào cũng có, mà không rút ngắn được gì. |

Thêm ba thứ làm mất chuyện mà người dùng chưa nói ra: (a) lời nói trong lúc Mây đang "nghĩ" không được ghi (mic chỉ ghi trong `hear()`); (b) AI quá 2,5 s là câu chuyện kết thúc luôn; (c) mỗi cuộc gọi chỉ một chuyện, tối đa 4 câu hỏi thêm.

---

## A. Giọng đổi qua lại

### Mọi đường ra tiếng trong cuộc gọi

| Đường | Nhà cung cấp, model, giọng | Lời dặn gửi kèm | Khoá kho |
|---|---|---|---|
| Lời chào + câu hỏi thăm (một file), câu đáp gộp câu mở, câu hỏi thêm, câu chuyển lời nhắn | Gemini `gemini-2.5-flash-preview-tts`, `Zephyr` (`server/voice.ts:17`, `:19`) | `STYLE_DEFAULT` đặt trước câu trong cùng một phần chữ (`voice.ts:264`) | `sha1("v2|gemini-2.5-flash-preview-tts|Zephyr|<lời dặn>|<câu>")` 24 ký tự đầu (`voice.ts:141-144`) |
| Câu cố định nạp sẵn lúc khởi động (`warmFixedVoices`, 15 s sau boot, 10 s một câu, `server/call.ts:70-106`) | như trên | như trên | như trên |
| Câu cố định xin lúc cần (`POST /call/tts`, `kind: 'fixed'`): chỉ `share`, `shareYes`, `shareNo`, `bye` được đọc mới; câu khác chỉ lấy kho (`call.ts:1052-1082`, dòng `1074`) | như trên | như trên | như trên |
| Câu đệm `ack` "Dạ, con nghe đây ạ." / "Ừm, mình nghe đây." (`src/i18n/vi.json:183-184`) | như trên, nhưng **không bao giờ được đọc mới**: không nằm trong `fixedLines` (`call.ts:76-85`), `ttsFor` trả `skip` | như trên | như trên |
| Câu đáp mẫu `short1/2`, `long1-3`, `slow`, `busy`, `photo` | như trên, chỉ lấy kho | như trên | như trên |
| Giọng máy `speechSynthesis` | không dùng trong cuộc gọi: `run()` luôn đặt `machine.current = false` (`src/Call.tsx:427-428`), `speak()` chỉ chạy khi `machine` | | |
| OpenAI `gpt-4o-mini-tts` `coral` | tắt (`TTS_PROVIDER` mặc định `gemini`, `voice.ts:45`; log khởi động "OpenAI tắt") | | khoá riêng `oa1|...` |

Lời dặn giọng (`voice.ts:26-28`), gửi nguyên văn trước câu:
> Nói tiếng Việt tự nhiên, rõ ràng, tươi và thân thiện, như người thân đang nói chuyện bình thường qua điện thoại. Âm lượng và cao độ bình thường, tốc độ vừa phải hơi nhanh một chút, nhịp tự nhiên có nhấn nhá. Không thì thầm, không kéo dài chữ, không giọng kể chuyện ru ngủ. Câu cần nói:

Xử lý sau: cắt lặng hai đầu, `loudnorm` hai lượt về I=-18, mono 24 kHz, mp3 48 kbps (`voice.ts:290-301`). Câu nào cũng cùng tốc độ lấy mẫu, cùng chuẩn âm lượng.

### Vậy vì sao vẫn nghe ra hai giọng

1. **Câu trong kho làm ở những ngày khác nhau phát xen nhau.** Khoá kho không đổi từ 24/10 (lời dặn và model chỉ sửa ở `ee8d9f2`, `47b4a3e` ngày 24/10; chữ câu `ack`, `short`, `long` sửa lần cuối `ac995b3` ngày 25/10). Log sau deploy ghi `[call] đã nạp sẵn 18 câu cố định`, độ dài 56, 33, 29, 60, 29, 60, 55, 33, 30, 45 khớp đúng 10 câu tiếng Việt mới (`share`, `shareYes`, `shareNo`, `bye` theo vai), 8 câu còn lại là tiếng Hàn. Nghĩa là 26 câu cố định tiếng Việt khác và câu `ack` **không** được làm lại: chúng có từ 24/10 đến 14/11. Câu `ack` bị bỏ khỏi nạp sẵn từ `cc795e6` (25/10), nên file đang phát là bản khoảng 4 tuần trước. Trong cuộc gọi thử: lời chào 106 chữ, câu gộp 78 chữ, câu hỏi thêm 97, 76, 68 chữ là làm hôm nay (log `[voice] đọc ... trong 3423 đến 5185 ms`), xen với `ack` và câu đáp mẫu cũ.
2. **Gemini TTS bản preview sinh mỗi câu độc lập.** Không có seed, không có mẫu giọng tham chiếu; cùng tên giọng nhưng cao độ, độ sáng, năng lượng dao động giữa các lần gọi, rõ nhất ở câu rất ngắn (19 chữ) so với câu dài. Model preview có thể đã được Google cập nhật ngầm giữa tháng 10 và tháng 11 dưới cùng tên (không kiểm được từ đây).
3. **`loudnorm` với câu dưới khoảng 3 giây không đo chắc**, nên câu đệm ngắn có thể to nhỏ khác câu dài.
4. **Câu thay thế cũng là clip cũ:** câu đáp chưa có tiếng sau 4 s thì phát câu mẫu trong kho thay (`Call.tsx:196`), AI trễ thì câu mẫu (`Call.tsx:486`), im sau câu hỏi thêm thì câu mẫu (`Call.tsx:496`).

Muốn tự nghe để xác nhận (chưa chạy, cần người dùng cho phép vì là lệnh vào máy chủ): `railway ssh --service homeletter -- ls -l --time-style=+%F /data/media/tts | sort -k6`, so ngày của file câu `ack` với file làm hôm nay.

---

## B. Độ trễ: từ lúc ngừng nói tới câu đáp thật

| Bước | Nơi trong code | Thời gian |
|---|---|---|
| Chờ im để chốt lượt: 1,9 s, cộng 0,7 s nếu cả câu nói dưới 2,5 s, cộng 0,6 s nếu đoạn cuối dưới 0,7 s hay tận cùng bằng "ờ, thì, là, mà...", trần 3,4 s | `Call.tsx:33-43`, `:319-325` | 1,9 đến 3,4 s. Câu ngắn kiểu "Thế kể gì bây giờ?": 2,6 đến 3,2 s |
| Dừng ghi, gửi `/call/:id/reply` (Hàn Quốc tới Railway) | `Call.tsx:279-288`, `:353-367` | 0,2 đến 0,4 s (ước tính) |
| Chép lời | máy tự chép bằng Web Speech; log không có dòng `[voice] chép lời` nên cuộc gọi thử đi đường này. Máy không chép được (iPhone PWA): tải tệp, ffmpeg, Gemini STT, trần 8 s, máy khách chỉ chờ 5 s (`Call.tsx:355`, `voice.ts:340-373`) | 0 s (hoặc thêm 1,5 đến 4 s) |
| AI từng lượt `turnAI`: Gemini `gemini-2.5-flash`, `thinkingBudget: 0`, prompt hệ thống khoảng 1.100 token cộng câu chuyện, ra JSON tối đa 400 token | `server/ai.ts:11`, `:20`; `call.ts:634-645`; hạn `TURN_AI_MS = 2500` (`call.ts:529`), máy khách bỏ sau 3 s (`Call.tsx:359`) | 0,8 đến 2 s (ước tính, không có log đo) |
| TTS câu nói (câu đáp + câu hỏi thêm gộp), không stream, rồi ffmpeg đo âm lượng hai lượt | máy chủ bắt đầu đọc ngay khi AI xong (`call.ts:1031-1036`), máy khách xin cùng câu thì nhập chung (`voice.ts:173-174`) | **3,4 đến 5,2 s** cho 68 đến 106 chữ (log); 2,2 đến 3,8 s cho 23 đến 60 chữ |
| Tải mp3, giải mã, phát | `src/speech.ts:92-142` | 0,2 đến 0,5 s |
| **Tổng** | | **khoảng 6,5 đến 11 s, thường khoảng 8 s** |

### Câu đệm "Dạ, con nghe đây ạ" bật khi nào

`reaction()` (`Call.tsx:410-416`): đua lời đáp AI với **900 ms** (không phải 3 s; 3 s là hạn máy khách bỏ AI). AI chưa về sau 900 ms, không phải giọng máy, và máy đã giải mã sẵn clip `ack` (`voiceReady`, nạp lúc đầu cuộc gọi ở `Call.tsx:432`) thì Mây nói câu đệm. Chỉ câu `ack` là câu đệm ở chỗ này. Gemini Flash trả JSON qua mạng gần như không bao giờ dưới 900 ms, nên lượt nào cũng có câu đệm. Nó bắt đầu ở khoảng 3,5 đến 4,3 s sau khi người kể ngừng (đúng "3 đến 4 giây" người dùng thấy), rồi câu thật vẫn phải chờ TTS thêm 2 đến 4 s nữa. Câu đệm không rút ngắn được gì, chỉ thêm một lần đáp nữa và một clip cũ khác tông.

Các câu đệm khác cùng họ: `fallback.short`, `fallback.long` (`Call.tsx:431`) nói khi AI trễ hay không có câu, khi câu đáp chưa có tiếng sau 4 s, khi người kể im.

### Chỗ chồng, bỏ, gộp được (nếu giữ đường ống hiện tại)
- Bỏ câu đệm (`Call.tsx:414`): lợi ngay, không tốn gì.
- Chờ im ngắn hơn (1,9 s xuống khoảng 1,2 s) nhưng người già hay ngừng giữa câu: phải có cách nói tiếp chen vào được.
- TTS stream: topik-app đọc câu bằng `gemini-3.8-flash-tts` qua `streamGenerateContent?alt=sse`, phát PCM ngay khi có (`topik-app/server.js:445`, `:489-512`), không gửi lời dặn (model mới đọc to cả lời dặn). Tiếng đầu tiên tới sớm hơn nhiều so với chờ cả file.
- Gộp chép lời và trả lời: gửi thẳng âm thanh cho Gemini Flash (đa phương thức), một lần gọi ra lời chép lẫn câu đáp; bỏ phụ thuộc Web Speech.
- Bỏ ffmpeg hai lượt cho câu trong cuộc gọi.
- Cách triệt để: một phiên Gemini Live làm cả nghe, nghĩ, nói, stream hai chiều (mục G).

---

## C. Giọng điệu: AI được dặn nói gì

### Thời tiết nghe như bản tin
- Dữ liệu: `weatherAt` trả chuỗi tiếng Anh có số, ví dụ "8°C, clear" (`server/place.ts:126`), đưa vào `person.lives_in.weather` cùng `local_time` "20:05" (`call.ts:380-383`).
- Luật duy nhất về thời tiết (`call.ts:361`): "Local time and weather come only from person.lives_in. If lives_in has no weather, never mention the weather." Chỉ nói nguồn, không nói cách nói.
- Luật câu mở (`call.ts:349`): "Use one real detail from the input as the reason to ask". Câu hỏi thăm (`call.ts:348`): "one short question about how they are right now, answerable in a word". Model lấy thời tiết, giờ làm "chi tiết thật" rồi đọc lại: "hôm nay ở ... trời 8 độ, trời quang". Lớp chống bịa còn chuộng số có trong dữ liệu (`guard.ts:58`), không có gì kéo về phía quan tâm kiểu "chỗ mẹ đang lạnh lắm đấy, mẹ mặc đủ ấm chưa ạ?".

### Câu mở chuyện cứng, khó trả lời
- Câu mẫu trong prompt (`call.ts:322`): "An đi xa rồi mà mẹ vẫn nhớ An mê canh chua. Mẹ kể con nghe về một bữa cơm hồi An còn ở nhà mà mẹ nhớ nhất đi." Một câu nêu lý do rồi một yêu cầu hẹp.
- Câu soạn sẵn hỏi một khoảnh khắc cụ thể: "Hồi nhỏ mẹ hay chơi ở đâu, với ai? Mẹ kể con nghe một buổi chiều ngày ấy nhé." (`server/i18n/vi.json:136`). Người nghe phải tự chọn "buổi chiều nào", nên mới hỏi ngược "kể gì bây giờ?". Người dùng muốn câu rộng, dễ: "Mẹ ơi, mẹ kể con nghe về tuổi thơ của mẹ được không?".
- Câu đáp hỏi thăm bị dán liền câu mở thành một câu nói (`call.ts:666-671`), nghe như đọc kịch bản.

### Câu hỏi thêm không nghe người ta nói gì
- Prompt từng lượt (`call.ts:557-581`) coi mọi câu trả lời là lời kể: "React warmly to the newest answer: when it has a concrete detail ... echo that exact detail in your own words. Do not ask a question in the reaction." (`:566`); câu mẫu "Con cá chép to thế ạ, nghe vui quá." và trần 12 chữ (`call.ts:476-477`) sinh kiểu nhại lại.
- Câu hỏi thêm: "Walk the beats of this one story ... Ask about one missing beat." (`:571`), "pick up a detail they actually said and stay on this one story. Never change topic." (`:573`), "HARD RULES. Never add any fact, name, number, place, photo, memory or event that is not in story." (`:578`).
- Không có luật nào cho: câu hỏi ngược, xin gợi ý, ngập ngừng, đùa, xúc động. Gợi ý cụ thể ("hồi đó sống thế nào, ở với ông bà, có vui không") bị luật cấm thêm điều không có trong lời kể chặn ngay từ prompt.
- Câu "Thế kể gì bây giờ?" vẫn được lưu là một lượt kể (`call.ts:1159-1163`), tính vào trần 4 lượt, và đưa vào `prior` cho lượt sau như thể là chuyện.

### Vì sao "gợi ý đi" bị hỏi ngày
- `need_date = canFollow && q.event !== 'none' && !dated` (`call.ts:639`, `:644`). Prompt luật 5 (`call.ts:574`): "If need_date is true and the story has no day and month yet, follow_up must ask for the day and month of that event."
- AI soạn bộ câu tự đặt `story.event` (wedding, anniversary, birthday, memory) cho chuyện nào nó thấy có thể có ngày (`call.ts:356`); `eventFor` chỉ chặn `wedding` cho chủ đề khác (`call.ts:194-195`). Chuyện tuổi thơ hay bị gắn `memory`.
- Code ép thêm (`call.ts:665`): câu hỏi thêm không khớp `DATE_ASK` thì **thay bằng câu hỏi ngày soạn sẵn**, kể cả khi AI trả rỗng vì người kể muốn dừng. `dated` chỉ thành true khi nghe được ngày (`Call.tsx:477`). Kết quả: mọi câu hỏi thêm của chuyện ấy là câu hỏi ngày, tới khi nghe được ngày hoặc hết 4 lượt. Câu người dùng nghe ("thế mẹ còn nhớ ngày đấy ngày bao nhiêu không?") là AI viết theo luật 5, nối sau câu đáp ("Mẹ kể về ngày gì cũng được") thành một câu tự mâu thuẫn.

### Những chỗ khác làm mất chuyện
- Trần `MAX_STORY_FOLLOW = 4` (`src/shared.ts:123`), một chuyện mỗi cuộc gọi; AI trễ là hết chuyện (`Call.tsx:480`, `:487`); im 9 s sau câu hỏi thêm là hết chuyện, không nhắc (`Call.tsx:496`).
- Câu hỏi thăm không bao giờ hỏi thêm (`call.ts:638`): người ta đáp gì thì Mây vẫn đọc câu mở.
- Lời nói trong lúc Mây đang nghĩ không được ghi: ghi âm dừng khi chốt lượt (`Call.tsx:279-288`), chỉ mở lại ở `hear()` sau khi Mây nói xong. "À mà còn nữa..." nói lúc đó là mất.

---

## D. Nếp TOPIK làm thế nào (đích để học theo)

Đọc ở `C:\Users\YT KOREA\topik-app` (không sửa gì).

| Phần | Cách Nếp làm |
|---|---|
| Model, API | Gemini Live, model `gemini-3.8-live` (`server.js:879`, đổi bằng `GEMINI_LIVE_MODEL`), websocket `BidiGenerateContentConstrained` (`prototype/call.js:49`). |
| Khoá và dựng phiên | Trình duyệt tự nối thẳng tới Google bằng **token dùng một lần** do máy chủ xin (`POST /v1beta/auth_tokens`, `uses: 1`, `expireTime` = số phút còn lại cộng chút dư, `newSessionExpireTime` 60 s). Token khoá sẵn model, giọng (Leda hoặc Charon), lời dặn hệ thống, công cụ, chép lời hai chiều, VAD, cuộn hội thoại (`server.js:1171-1194`). Trang không thấy khoá API, không đổi được lời dặn. |
| Lời dặn và ngữ cảnh | Máy chủ dựng mỗi cuộc gọi (`liveSystem`, `server.js:841-875`): vai, trình độ, mục tiêu, tên, ngày hôm nay, bài đang học, sổ nhớ (`memoryText`: điều đã biết, lỗi hay mắc, số lần đã gọi, dặn "dùng như gia sư nhớ học trò: gọi đúng tên, hỏi tiếp chuyện cũ khi hợp ... không đọc lại danh sách này"), cách nói: "Nói như người thật qua điện thoại: câu ngắn, có cảm xúc, mỗi lượt 1 đến 3 câu ... Không văn AI ..." (`server.js:865`). Khoảng 2.000 đến 2.500 token. |
| Lượt nói, chen ngang | VAD phía Google (`automaticActivityDetection`, im 1,5 s cho nói tự do, 1 s phỏng vấn, 2,8 s đọc thẻ; `server.js:893`, `:1188`). Mic xuống PCM 16 kHz từng 40 ms qua AudioWorklet (`prototype/mic-worklet.js`, `call.js:910-935`), tiếng Nếp 24 kHz phát ngay từng mẩu khi tới (`voicePlayer`, `call.js:247-351`). Google báo `interrupted` thì dừng phát (`call.js:812`). Loa ngoài làm tiếng Nếp lọt vào mic, nên mic không gửi khi Nếp đang nói và 600 ms sau đó (`call.js:921-922`); muốn chen thì chạm vào Nếp (`call.js:1058-1066`). |
| Giữ câu chuyện chạy | Model tự dẫn. Mở đầu bằng một tin chữ "(Cuộc gọi vừa kết nối. Chào người học và mở đầu.)" (`call.js:883-885`). Im 13 s thì trang gửi "(Người học im lặng.)" một lần, model hỏi lại ngắn hay gợi ý (`call.js:46`, `:899-905`; luật ở `server.js:873`). Nút Gợi ý gửi tin chữ. Sổ nhớ ghi trong lúc gọi bằng công cụ `remember` (`server.js:915-921`), gửi lại ở cuộc sau. |
| Kết thúc | Người học cúp máy, hoặc hết phút (đồng hồ trang, `call.js:906`, token cũng hết hạn). Gửi `/api/call/end` kèm số token Google báo để ghi tiền (`call.js:963-965`, `server.js:1369-1383`). |
| Ghi âm người dùng | Không lưu. Chỉ giữ 15 s PCM gần nhất để Azure chấm phát âm (`call.js:932`). Lời chép lấy từ `inputAudioTranscription` (`call.js:824-837`). |
| Tiền mỗi phút | Đo thật 6/11/2026: nói tự do **0,019 đến 0,036 USD/phút**; giá ghi trong `docs/chi-phi.md:13`: âm thanh vào 3, ra 12, chữ vào 0,75, ra 4,5 USD mỗi triệu token. Live tính lại cả lời dặn và lịch sử mỗi lượt (`chi-phi.md:27-30`), nên có cuộn 8.000 xuống 5.000 token. |
| Độ trễ | Repo không có số đo. Theo cấu hình: im 1,5 s rồi tiếng đầu tiên tới dạng stream, ước khoảng 2 đến 2,5 s sau khi người nói ngừng. |

Lưu ý: `GEMINI_API_KEY` của Sweet Home lấy từ `topik-app/.env` (HANDOFF mục Deploy), tức chung project Google, chung trần chi tiêu 700.000đ/tháng (`chi-phi.md:79`) và chung hạn mức với Nếp.

---

## E. Nếu Mây chuyển sang Gemini Live

- **Độ trễ:** khoảng 2 đến 2,5 s sau khi người kể ngừng (im 1,5 đến 1,8 s cộng tiếng đầu tiên stream), so với khoảng 8 s hiện nay. Không còn câu đệm.
- **Tiếng Việt:** bảng ngôn ngữ của model âm thanh gốc trên Live có Vietnamese (vi-VN) ([Google Cloud, Configure language and voice](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/configure-language-voice), tra 21/11/2026); Nếp đã nói tiếng Việt trên Live ở production.
- **Giọng Zephyr:** nằm trong danh sách 30 giọng của Live API (cùng trang trên, [Firebase Live API configuration](https://firebase.google.com/docs/ai-logic/live-api/configuration)). Chưa ai thử Zephyr nói tiếng Việt trên Live: thử ngay ở bước 1. Một phiên Live là một giọng liền mạch cho cả cuộc gọi, hết chuyện câu cũ câu mới lệch tông.
- **Tiền:** ước 0,03 đến 0,045 USD/phút (số đo của Nếp, cộng phần lời dặn dài hơn vì có sổ nhớ và dữ liệu nhà). Cuộc gọi 6 đến 8 phút khoảng 0,2 đến 0,35 USD. Đây là ước tính, đo lại bằng log token như Nếp.
- **Phải làm lại:**
  - Bộ câu soạn trước (v2) thành "mồi chuyện" + sự kiện từ công cụ; `calls.script` ghi dần (v3) để podcast và sổ nhớ vẫn chạy.
  - Bước xin phép chia sẻ: Mây hỏi bằng chính giọng Live, nhưng quyết định chỉ lấy từ hai nút hoặc bộ đọc câu trả lời `callShare.ts` (giữ luật "dạ" lưỡng lự của 74f1d1e), không tin model tự hiểu.
  - `suspect()`: Live nói thẳng, không lọc được trước khi nói. Lọc chuyển sang sau: kiểm lời chép của Mây để ghi log và nhắc model, giữ nguyên lọc cho mọi thứ được lưu (sổ nhớ, lịch, lời nhắn, tên tập).
  - Ghi giọng người kể cho podcast: ghi từng lượt bằng MediaRecorder trên cùng luồng mic (như `hear()` hôm nay), gửi qua hàng chờ `outbox` vào `/call/:id/answer`.
  - Ngân sách giọng 70 câu/ngày không còn ý nghĩa; thay bằng trần phút mỗi cuộc gọi, trần phút cả app mỗi ngày, ghi tiền theo token.

---

## F. Câu hỏi sâu dần theo thời gian

### Đã có
- Dữ liệu khảo sát trong `members.intro`: `kid` (trai, gái), `seen` (bao lâu chưa gặp: tuần trước, vài tháng, hơn một năm, ở cùng mà ít nói), `food` (món con thích, món nhớ nhất), `love` (đã nói thương chưa), `unsaid` (riêng tư); cộng tên, vai, ngày sinh, thành phố (`src/i18n/vi.json:82-147`).
- `loadScriptExtras` (`server/callfacts.ts:154-210`): tuổi, nơi ở, giờ chênh, khoảng cách từng người, sổ nhớ tối đa 30 điều chọn bằng `pickFacts` (về người nghe 4 điểm, chưa dùng 3, gắn dịp 3; `callfacts.ts:100-109`), dịp trong 30 ngày, bản đồ chủ đề `told_themes` (số lần, lượt sâu nhất, `depth` "deep" khi từ 3 lượt; `call.ts:411`), `untold_themes`, `profile_gaps` (food, seen), `recent_contact`.

### Còn thiếu
- Không có "mức độ sâu": cuộc gọi đầu dùng `firstScript` (luôn bữa cơm) hay `templateScript` (thứ tự cố định bắt đầu bằng tuổi thơ, `call.ts:226-229`), không bám dữ liệu khảo sát.
- Không có "sợi chuyện còn bỏ ngỏ": điều được nhắc qua (ví dụ có bà ngoại nuôi) nhưng chưa thành chuyện.
- Không có bản đồ theo người và theo quan hệ: biết bao nhiêu về từng thành viên, về bố với mẹ, mẹ với con. Chủ đề chỉ đếm theo 12 mã, theo cuộc gọi.
- Không có câu hẹn cho tuần sau để mở cuộc gọi kế tiếp.

### Thiết kế mức độ (dùng cho bản Live)
Máy chủ tính `depth` và 3 đến 5 `seeds` (mồi chuyện, xếp hạng) mỗi lần nhấc máy:
- **Mức 0, làm quen** (chưa có cuộc gọi xong, hoặc dưới 5 điều trong sổ nhớ): mồi lấy từ khảo sát và nhà, không mặc định tuổi thơ. Ví dụ: lần cuối cả nhà gặp nhau (`seen`), món con thích hay món nhớ nhất và ai nấu (`food`), cuộc sống ở thành phố đang ở (`city`, giờ chênh, thời tiết đáng kể biến thành quan tâm), bố mẹ nghĩ gì khi con đi xa, con nhớ gì ở nhà (vai), câu "thương" chưa nói thành lời (`love = never`, chỉ để chọn giọng ấm, không nhắc thẳng).
- **Mức 1, gia đình** (1 đến 3 cuộc gọi, 5 đến 20 điều): chuyện về từng người trong `family_members`, những lần cả nhà ở cùng nhau, điều người khác kể làm móc kèm người kể ("An kể là ...").
- **Mức 2, sâu** (từ 4 cuộc gọi, trên 20 điều): sợi chuyện bỏ ngỏ (điều có trong sổ nhớ nhưng chủ đề còn "short"), quan hệ giữa các thành viên (bố mẹ gặp nhau thế nào, mẹ với bà), cùng một chuyện từ hai phía (chỉ dùng điều cả nhà được biết), dịp sắp tới.
- Mỗi cuộc gọi kết thúc bằng một câu hẹn cụ thể (công cụ `end_call({ next_hook })`), lưu lại làm mồi đầu tiên tuần sau.

---

## G. Thiết kế chốt để làm: Mây gọi bằng Gemini Live, theo khuôn Nếp

### Kiến trúc đích

1. **`POST /api/call/live`** (file mới `server/calllive.ts`, gắn vào `callRouter`): kiểm thành viên và lượt gọi như `/call/start`; dựng ngữ cảnh bằng `context()` + `loadScriptExtras()`; tạo hàng `calls` (`shared = false`, `script = { v: 3, questions: [], lang, mascot }`); xin token dùng một lần như `topik-app/server.js:1171-1194` với:
   - model `GEMINI_LIVE_MODEL` (mặc định `gemini-3.8-live`), giọng `GEMINI_VOICE` (`Zephyr`);
   - `systemInstruction` = `liveBrief(c)` (dưới);
   - công cụ: `story_open({ theme, opener })`, `story_close()`, `ask_photo()`, `ask_share()`, `relay_heard({ id })`, `relay_open()`, `end_call({ next_hook })`;
   - `inputAudioTranscription`, `outputAudioTranscription`;
   - `automaticActivityDetection.silenceDurationMs` khoảng 1.600 (env `MAY_LIVE_SILENCE_MS`, người già hay ngừng giữa câu);
   - `contextWindowCompression` khoảng 12.000 xuống 7.000 (chuyện cần nhớ lâu hơn bài học);
   - `expireTime` = trần cuộc gọi (env `MAY_CALL_MAX_SEC`, gợi ý 900) cộng dư.
   Trả `{ id, token, model }`.
2. **`liveBrief(c)`**: viết lại từ `scriptSystem` và `turnSystem`, giữ phần xưng hô `ADDRESS` và luật chống bịa, thêm:
   - Nói như người nhà thật qua điện thoại, mỗi lượt 1 đến 3 câu ngắn, không văn AI, không nhại lại lời người kể.
   - Nghe và đáp đúng điều vừa nói: hỏi ngược "kể gì bây giờ?" thì "Mẹ kể ngày nào cũng được ạ" rồi gợi hai hướng cụ thể lấy từ dữ liệu; "gợi ý đi" thì gợi ý ngay; ngập ngừng thì chờ, "mẹ cứ từ từ"; đùa thì cười theo; xúc động thì chậm lại, không ép.
   - Đào tiếp tới khi chuyện đủ (bối cảnh, ai, chuyện gì, cảm xúc, giờ nghĩ lại) và người kể còn hứng; người kể muốn dừng thì dừng; xong thì gọi `story_close` rồi mở mồi tiếp theo. Không trần số câu.
   - Ngày tháng: chỉ hỏi khi chuyện tự nhiên xoay quanh một ngày cụ thể, hỏi một lần, không bao giờ khi người kể đang xin giúp.
   - Thời tiết: dữ liệu đưa vào đã đổi thành cảm giác (`lạnh`, `nóng`, `mưa`, không có số); chỉ nhắc khi đáng nhắc, dưới dạng quan tâm.
   - Dữ liệu: `depth`, `seeds`, sổ nhớ, dịp, cả nhà ở đâu, lời nhắn chờ chuyển. **Không** đưa `intro.unsaid` vào (hôm nay `scriptFacts` vẫn đưa, `call.ts:389`, chỉ dặn đừng nhắc; Live không lọc được nên phải bỏ hẳn). Điều riêng tư (`private`) chỉ được nhắc nhẹ ở phần hỏi thăm, trước `story_open`.
   - Thứ tự cuộc gọi: chào, hỏi thăm, chuyện (một hay nhiều), xin ảnh nếu có chuyện thật, chuyển lời nhắn, hỏi lời nhắn khó nói, `ask_share`, chào kèm câu hẹn.
3. **Máy khách `src/CallLive.tsx`** (mới) + **`src/livePlayer.ts`** (chép `voicePlayer` của Nếp, bỏ phần câu tiếng Hàn) + **`public/mic-worklet.js`** (chép nguyên): đổ chuông, nối, gửi tin mở đầu, stream mic, phát tiếng, phụ đề từ lời chép, linh vật nhép theo `player.level()`, chặn mic khi Mây nói (600 ms + độ trễ loa như Nếp), chạm linh vật để chen, im 12 s thì gửi "(Người kể im lặng.)" một lần, còn 2 phút thì gửi "(Còn 2 phút, kết chuyện nhẹ nhàng.)", cúp máy.
4. **Ghi giọng cho podcast:** MediaRecorder (`record()` ở `src/media.ts`) bật khi Mây nói xong lượt, tắt khi tiếng Mây lượt sau bắt đầu hoặc cúp máy: mỗi lượt người kể một tệp (lặng đầu cuối đã có `voiceedit.ts` cắt). Gửi qua `outbox` tới `/call/:id/answer` với `idx` (chuyện đang mở), `turn`, `question` (lời chép câu Mây vừa nói), `transcript` (lời chép của Live), `live=1`. Phần hỏi thăm trước `story_open` là `topic 'hoi-tham'`, câu trả lời sau `relay_open` là `topic 'loi-nhan'` (vẫn không bao giờ vào podcast).
5. **Máy chủ nhận lượt:** `/call/:id/answer` với `live=1` thì chỉ lưu hàng, không chép lời, không gọi `turnAI`. `story_open` gửi `POST /call/:id/story` để thêm `{ text: opener, theme, topic: THEME_TOPIC[theme], part: 'story' }` vào `calls.script.questions` (opener qua `suspect()` và kiểm không chứa điều riêng tư trước khi lưu, vì nó thành thẻ trong tập cả nhà xem).
6. **Chia sẻ:** `ask_share` thì trang hiện hai nút như bước hiện nay, Mây hỏi bằng giọng Live; câu trả lời lấy từ nút hoặc `shareNext` của `callShare.ts` trên lời chép; gọi `/call/:id/share` hay `/call/:id/keep` như cũ; trả kết quả cho model để Mây đáp. Một lần xin cho cả cuộc gọi (giữ `calls.shared`).
7. **Sau cuộc gọi:** `/finish` và `afterCall` giữ nguyên (lời nhắn, ngày vào lịch, sổ nhớ, podcast). `episodeIdx` (`server/podcast.ts:402-405`) nhận cả `v: 3`.
8. **Chống bịa:** lúc `/finish` trang gửi kèm lời chép từng câu Mây; máy chủ chạy `suspect()` từng câu, ghi log `[call-live]` và đếm. Trong cuộc gọi, trang kiểm nhanh mẫu câu bịa thường gặp (cuộc gọi trước, ảnh đã gửi) trên lời chép, trúng thì gửi một tin nhắc model. Mọi thứ được lưu vẫn qua `suspect()` như hôm nay.
9. **Tiền và trần:** ghi token mỗi cuộc gọi (chép `addUsage` và `callUsd` của Nếp), dòng log USD; trần phút mỗi ngày cả app (`MAY_LIVE_DAILY_MIN`); công tắc `MAY_LIVE=0` quay về `Call.tsx` hiện nay; xin token lỗi hay socket đóng 1011 thì dùng đường cũ hoặc báo "Mây đang bận".

### Lấy gì từ topik-app
- Nguyên: `prototype/mic-worklet.js`; mẫu xin token `auth_tokens` (`server.js:1171-1194`); `voicePlayer` phần phát PCM, `stop`, `mark`, `level` (`call.js:247-351`); cách chặn mic khi đang nói (`call.js:921-922`); tin mở đầu, tin im lặng, tin đồng hồ (`call.js:883-905`); cộng token ra tiền (`call.js:490-499`, `server.js:1369-1383`); xử lý mã đóng 1011/1008 (`call.js:1150`).
- Sửa cho Mây: lời dặn (gia đình, kể chuyện, chống bịa, riêng tư thay cho dạy tiếng); bỏ `say_korean`, `show_card`, `score_reading`; sổ nhớ lấy từ `memory_facts` phía máy chủ (không giữ ở máy khách như Nếp); thêm ghi âm từng lượt; thêm bước chia sẻ và lời nhắn.

### File đổi trong Sweet Home
- Mới: `server/calllive.ts` (token, `liveBrief`, seeds, depth, `/call/:id/story`, log lời Mây), `server/calllive.test.ts`, `src/CallLive.tsx`, `src/livePlayer.ts`, `public/mic-worklet.js`.
- Sửa: `server/call.ts` (gắn route, `/answer` nhận `live=1`, `scriptFacts` bỏ `unsaid` cho Live), `server/callfacts.ts` (seeds, depth, sợi chuyện bỏ ngỏ, `next_hook`), `server/place.ts` (thời tiết thành cảm giác), `server/podcast.ts` (`episodeIdx` nhận v3), `src/shared.ts` (kiểu `CallScript` v3), nơi mở cuộc gọi (`CallCard.tsx`, `App.tsx`: chọn `CallLive` khi bật), `src/i18n/*.json` (chữ màn gọi mới nếu có), `docs/may-moi.md`, `docs/tts-budget.md`, `HANDOFF.md`.
- Giữ làm đường dự phòng: `src/Call.tsx`, `src/speech.ts`, `server/voice.ts`, `server/ttsgate.ts`.

### Thứ tự làm
1. Thử nhanh (nửa ngày): xin token, nối Live với Zephyr nói tiếng Việt, ghi một lượt, đo độ trễ và tiền trên điện thoại thật. Zephyr không ổn thì chọn giọng khác cùng người dùng.
2. Máy chủ: `liveBrief`, seeds, depth, token, test (không gọi mạng thật trong test).
3. Máy khách: `CallLive`, player, worklet, công cụ, ghi âm từng lượt, hàng chờ.
4. Script v3, podcast và sổ nhớ chạy với v3, bước chia sẻ, lời nhắn.
5. Log chống bịa, log tiền, trần phút, công tắc và đường dự phòng.
6. Người dùng gọi thử nhiều lần, chỉnh thời gian chờ im và lời dặn, rồi mới deploy.

Ước công: 3 đến 5 ngày làm việc tập trung.

### Rủi ro
- Live nói thẳng nên lỡ bịa hay lỡ nhắc chuyện riêng thì không chặn kịp; giảm bằng dữ liệu thật đầy đủ, bỏ hẳn `unsaid`, luật riêng tư rõ, log và nhắc ngay trong cuộc gọi.
- Loa ngoài: phải chặn mic khi Mây nói, nên không chen ngang bằng giọng được (Nếp cũng vậy); Mây đáp nhầm lúc người kể đang nghĩ thì người kể phải chờ hoặc chạm. Giảm bằng lượt ngắn và thời gian chờ im dài hơn Nếp. Thời gian chờ im khoá trong token, không đổi giữa chừng.
- Ghi âm trên iPhone: MediaRecorder `audio/mp4`, AudioContext bị treo sau khi chọn ảnh hay khoá màn hình (cần `resume()` như `Call.tsx:236`).
- Tiền tăng theo phút và theo độ dài ngữ cảnh; giá Gemini có thể đổi (topik ghi Flash và TTS gấp đôi từ 1/1/2027, chưa rõ Live).
- Chung khoá và trần chi tiêu với topik-app: một app tiêu hết thì cả hai tắt (topik đã gặp 402 ngày 6/11). Nên tách project hay ít nhất bật cảnh báo ngân sách.
- Zephyr nói tiếng Việt trên Live chưa ai nghe.
- Cuộn hội thoại có thể làm Mây quên đầu chuyện; giữ ngưỡng cao, `story_open` ghi lại câu mở.
- Nhiều chuyện một cuộc gọi nhưng một lần xin chia sẻ: chấp nhận cho bản đầu.

---

## H. Phương án sửa nhanh trong đường ống cũ (để đối chiếu, không chọn)

Bỏ ép hỏi ngày (`call.ts:639`, `:665`, luật 5 ở `:574`), bỏ câu đệm (`Call.tsx:414`), thêm luật cho câu hỏi ngược, xin gợi ý, ngập ngừng và thời tiết thành quan tâm, đổi model lượt sang `gemini-3.8-flash`, TTS sang `gemini-3.8-flash-tts` stream không lời dặn và làm lại toàn bộ kho một lượt (tăng `CACHE_VER`), chờ im 1,2 s. Độ trễ còn khoảng 3,5 đến 5 s, công khoảng 1 đến 1,5 ngày, tiền gần như hôm nay. Nhưng vẫn là kịch bản soạn trước, mỗi câu vẫn một lần sinh TTS riêng, vẫn trần 70 câu giọng mỗi ngày, vẫn không chen ngang được: không đạt chuẩn "như Nếp".
