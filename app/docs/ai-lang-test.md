# Kiểm thử AI đa ngôn ngữ (en, ko): soạn câu hỏi, câu đáp, rút ngày, giọng OpenAI

Ngày kiểm: 2026-10-25. Gemini văn bản `gemini-2.5-flash` (không gọi Gemini TTS). Khoá nạp tạm vào biến môi trường của tiến trình, không ghi ra file.

## Cách chạy

```bash
cd app
# GEMINI_API_KEY có sẵn trong biến môi trường
node --import tsx scripts/ai-lang-test.ts 3 > ket-qua.json
# OPENAI_API_KEY (và GEMINI_API_KEY để chép lại) có sẵn; 4 yêu cầu OpenAI TTS
node --import tsx scripts/ai-lang-test-tts.ts ../../tts-samples/openai-lang
```

`ai-lang-test.ts` gọi đúng `aiScript()` (prompt + lọc `suspect()` + bù câu mẫu), `quickReply()` và `datesSystem()` của `server/call.ts`. Mọi TTS bị tắt trong lúc chạy. Câu bị lọc ghi ở dòng "Bị lọc".

Ba tình huống, mỗi tình huống chạy 3 lần cho en và ko (18 bộ câu):
- **S1 người mới**: chưa có cuộc gọi, câu trả lời, ảnh hay sự kiện. Thật ra người mới nhận `firstScript` (không gọi AI); ở đây vẫn cho AI soạn để thử luật cấm bịa khi dữ liệu trống.
- **S2**: đã có 1 cuộc gọi (12/10) và 2 câu trả lời thật.
- **S3**: có 3 ảnh (2 chú thích), 2 sự kiện lịch (sinh nhật Mai 12/3, ngày cưới 20/11/1998), 2 cuộc gọi trước nhưng chưa có câu trả lời chép được.

Nhà: Lan (con), Hùng (bố), Mai (mẹ). en: S1, S2 hỏi Lan (con), S3 hỏi Hùng (bố). ko: S1, S2 hỏi Mai (mẹ), S3 hỏi Hùng (bố).

## Kết luận

**Không có câu bịa nào lọt qua ở lần chạy cuối.** Mọi câu nhắc chuyện cũ đều có thật trong dữ liệu (phở nấu với bạn cùng phòng, thịt kho mẹ nấu, trồng ớt ngoài sân, canh tương mẹ nấu, ảnh "The garden in spring", sinh nhật Mai 12/3). Ở S1 không câu nào nhắc "last time", "지난번", ảnh đã gửi hay người lạ.

Ba lượt chạy trước lượt cuối đã lộ ra mấy lỗi, đã sửa:
1. en S3: "Hi Bo!" (lấy mã vai `bo` làm tên). Sửa: prompt cấm viết mã vai; dữ liệu đối chiếu của `suspect()` bỏ các `"role":"bo|me|con"` nên "Bo" giờ bị chặn.
2. ko: Mây viết thành "메이", hay dùng giọng 합니다. Sửa: prompt bắt viết đúng "Mây" bằng chữ Latin, câu kết bằng đuôi 요. Lượt cuối hết "메이"; còn sót vài câu "Mây입니다", "감사합니다" (lịch sự, không sai nghĩa).
3. ko S2: "따님 Lan님" (đoán Lan là con gái, dữ liệu không nói). Sửa: `suspect()` chặn con trai/con gái (daughter, son, 딸, 따님, 아들, 아드님, con gái, con trai) khi đáp án "kid" không có; lượt chạy thứ ba đã chặn đúng một câu như vậy.
4. ko S1: "가장 좋아하시는 한국 음식" (đoán là người Hàn). Sửa: chặn tên nước, thành phố viết bằng chữ Hàn không có trong dữ liệu (chữ Latin như Korea, Vietnam vốn đã bị chặn vì viết hoa).
5. en: "Thank you for calling" (Mây mới là người gọi). Sửa: prompt nói rõ, lời tạm biệt có "for calling / for the call" thì dùng câu mẫu.
6. en S2: "How was your cooking last week?" (gắn mốc thời gian cho câu trả lời cũ). Sửa: prompt cấm gắn mốc thời gian (last week, 지난주).
7. Rút ngày ko: tên ngày "저희 결혼식" (xưng "chúng tôi" trên lịch chung). Sửa: prompt bắt viết theo góc nhìn cả nhà; lượt cuối ra "엄마 아빠 결혼식 날".

Còn lại, không phải bịa nhưng nên biết:
- ko S1 luôn hỏi ngày cưới ở câu 1 vì `wedding_question_allowed` đúng (nhà có cả bố lẫn mẹ, lịch chưa có ngày cưới). Đúng luật 8.
- Câu hỏi en đôi khi chung chung ("How are things with you?"). Chấp nhận được.
- Câu đáp ko cho con (vai con) có lúc vẫn dùng kính ngữ ("드셨군요"); lượt cuối đã đúng ("먹었군요").
- Bộ câu cố định tiếng Hàn của máy khách (`call.line.*.child` trong `src/i18n/ko.json`) đang dùng 반말 ("응, 듣고 있어", "내가"), trong khi câu hỏi soạn sẵn và câu AI cho con dùng 해요체 ("고마워요, {name}님"). Trong một cuộc gọi sẽ lẫn hai giọng; nên sửa ở `src/i18n/ko.json` (ngoài phạm vi việc này).

## Kiểm đơn vị `suspect()` và `parseDate()`

`server/guard.test.ts` (chạy cùng `npm run test:tts`): 21 câu hợp lệ không bị chặn (gồm "Do you remember when you first learned to cook?", "결혼하기 전에...", "요즘 날씨는 어때요?", "시간이 아까워요", "딸기", Christmas, Lunar New Year, tên tháng có trong lịch) và 27 câu bịa bị chặn (vi, en, ko). Đọc ngày: "ngày 12 tháng 3 năm 1995", "12/3/1995", "March 12, 1995", "12 March 1995", "the 12th of March", "Sept 3rd 2001", "1995년 3월 12일", "3월 12일"; "3/4/1990" tiếng Anh bỏ vì không rõ ngày hay tháng.

## Giọng OpenAI (4 yêu cầu, giọng coral, lời dặn mới)

| Câu | Thứ tiếng | Thời gian gọi | Dung lượng | Độ dài | Gemini chép lại |
|---|---|---|---|---|---|
| Hi Dad, it's Mây. Just a few small questions... (108 chữ) | en | 2,7 s | 130 KB | 8,3 s | đúng nguyên câu, "Mây" nghe thành "May" |
| Grilled fish and morning glory from the garden sounds so fresh, Mom. | en | 2,3 s | 94 KB | 6,0 s | đúng nguyên câu |
| 안녕하세요, 어머님. Mây예요. 잘 지내셨어요? 오늘은 뭐 드셨어요? | ko | 2,3 s | 113 KB | 7,2 s | đúng, "Mây" nghe thành "메이" |
| 지난번에 마당에 고추를 심으셨다고 하셨는데, 잘 자라고 있나요? | ko | 2,6 s | 89 KB | 5,7 s | đúng ("마다네" là cách đọc nối âm của 마당에) |

Cả 4 gọi thành công, đúng thứ tiếng, tốc độ vừa (en khoảng 13 chữ/giây, ko khoảng 4 đến 5 âm tiết/giây, chậm và đằm hơn trước). **Chưa có người nghe thật**: file ở `C:\Users\YT KOREA\homeletter\tts-samples\openai-lang\tts\` (ngoài repo), người dùng nên tự nghe.

## Toàn bộ câu ở lượt chạy cuối

### en.S1: người mới: chưa có cuộc gọi, câu trả lời, ảnh hay sự kiện nào (vai con, tên Lan)

Lần 1 (ai, 1858 ms)

- Chào: Hi Lan, it's Mây. How are you today?
- Câu 1: What is something that made you happy recently? [cuoc-song]
- Câu 2: Do you have a favorite memory from your childhood you would like to tell me about? [tuoi-tho, photo, memory]
- Câu 3: What is a dish you enjoy making or eating these days? [mon-an]
- Câu 4: Is there a message you would like me to share with Hùng and Mai? [loi-nhan]
- Tạm biệt: Thank you for sharing, Lan.

Lần 2 (ai, 1622 ms)

- Chào: Hi Lan, it's Mây. It's so good to talk to you.
- Câu 1: How are things with you? [cuoc-song]
- Câu 2: Do you have any special memories from your childhood you would like to tell me about? [tuoi-tho, memory]
- Câu 3: Is there a photo you would like to tell me about? [ky-niem, photo]
- Câu 4: Would you like to send a message to Mai and Hùng? [loi-nhan]
- Tạm biệt: Thanks, Lan. I'll keep this so the whole family can listen.

Lần 3 (ai, 1876 ms)

- Chào: Hi Lan, it's Mây. I'm calling to say hello.
- Câu 1: What is something that made you happy today? [cuoc-song]
- Câu 2: Is there a food you have been enjoying lately? [mon-an]
- Câu 3: What is a favorite memory you have from when you were little? [tuoi-tho, memory]
- Câu 4: Do you want to send a message to Mai or Hùng? [loi-nhan]
- Tạm biệt: Thanks for talking with me, Lan. Goodbye for now!

### en.S2: đã có 1 cuộc gọi và 2 câu trả lời thật (vai con, tên Lan)

Lần 1 (ai, 1920 ms)

- Chào: Hello Lan. Mây here. How are you doing today?
- Câu 1: Last time, you said you cooked pho. How was it? [cuoc-song]
- Câu 2: You also mentioned missing Mom's fish sauce caramel pork. What is it about that dish that you like so much? [mon-an]
- Câu 3: Do you have any new memories you would like to tell me about? [ky-niem, photo, memory]
- Câu 4: Would you like to share a message for Dad and Mom? [loi-nhan]
- Tạm biệt: Thanks, Lan. I'll keep this so the whole family can listen.

Lần 2 (ai, 1838 ms)

- Chào: Hi Lan, it's Mây. I'm calling to see how you are.
- Câu 1: Last time you told me about cooking pho with your roommate. How was your cooking this week? [mon-an]
- Câu 2: You also mentioned you miss Mom's fish sauce caramel pork. What is another food you remember from your childhood? [mon-an, memory]
- Câu 3: What is something new or interesting you have seen recently? [cuoc-song, photo]
- Câu 4: Do you want to send a message to Mom and Dad? [loi-nhan]
- Tạm biệt: Thanks for talking with me, Lan!

Lần 3 (ai, 1857 ms)

- Chào: Hi Lan, it's Mây. How are you doing today?
- Câu 1: Last time you told me you cooked pho. How was it cooking with your roommate? [cuoc-song]
- Câu 2: You also mentioned that you miss Mom's fish sauce caramel pork. Is there another dish that you remember from home? [mon-an]
- Câu 3: Is there a photo you would like to tell me about? [ky-niem, photo]
- Câu 4: Do you have any message for Dad and Mom? [loi-nhan]
- Tạm biệt: Thanks for talking with me, Lan!

### en.S3: có 3 ảnh (2 chú thích) và 2 sự kiện lịch, chưa có câu trả lời chép được (vai bo, tên Hùng)

Lần 1 (ai, 1684 ms)

- Chào: Hi Dad, it's Mây. How are you doing today?
- Câu 1: Is there anything special happening in your life these days? [cuoc-song]
- Câu 2: What kind of food are you enjoying these days? [mon-an]
- Câu 3: Is there a memory from your childhood that makes you smile? [tuoi-tho, memory]
- Câu 4: Would you like to share a message for Mai and Lan? [loi-nhan]
- Tạm biệt: Thanks for chatting, Dad!

Lần 2 (ai, 1665 ms)

- Chào: Hi Dad, it's Mây. How are you?
- Câu 1: Is there anything special happening in your life right now? [cuoc-song]
- Câu 2: What foods remind you of your childhood, Dad? [tuoi-tho]
- Câu 3: Is there a photo you would like to tell me about? [ky-niem, photo]
- Câu 4: Do you want to send a message to Lan? [loi-nhan]
- Tạm biệt: Thanks for talking with me, Dad. Goodbye!

Lần 3 (ai, 1597 ms)

- Chào: Hi Dad. It's Mây calling.
- Câu 1: Is there a photo you would like to tell me about? [ky-niem, photo]
- Câu 2: What foods remind you of your childhood, Dad? [mon-an, memory]
- Câu 3: How is everything going for you, Dad? [cuoc-song]
- Câu 4: Would you like to send a message to Mai and Lan? [loi-nhan]
- Tạm biệt: Thank you, Dad. I'll keep this so the whole family can listen.

### ko.S1: người mới: chưa có cuộc gọi, câu trả lời, ảnh hay sự kiện nào (vai me, tên Mai)

Lần 1 (ai, 2157 ms)

- Chào: 안녕하세요, 어머님. Mây입니다. 잘 지내셨어요?
- Câu 1: 어머님께서는 언제 결혼하셨는지 궁금해요. 그때 그날에 대한 이야기를 들려주실 수 있으세요? [ngay-cuoi, photo, wedding]
- Câu 2: 혹시 어머님의 어린 시절 이야기나 추억이 있으시면 들려주세요. [tuoi-tho, memory]
- Câu 3: 가장 좋아하시는 음식이나 특별한 추억이 담긴 음식이 있으시면 말씀해 주세요. [mon-an]
- Câu 4: Lan님이나 Hùng님에게 전하고 싶으신 메시지가 있으실까요? [loi-nhan]
- Tạm biệt: 오늘 이야기 정말 감사합니다.

Lần 2 (ai, 2227 ms)

- Chào: 안녕하세요, Mây예요. Mai 어머님, 잘 지내고 계셨어요?
- Câu 1: 어머님 결혼식 날은 언제였는지, 그리고 그때 어떠셨는지 이야기해 주시겠어요? 혹시 그날의 사진도 있으세요? [ngay-cuoi, photo, wedding]
- Câu 2: 어머님이 가장 좋아하시는 어릴 적 추억은 무엇인가요? [tuoi-tho, memory]
- Câu 3: Mai 어머님은 평소에 어떤 음식을 가장 즐겨 드세요? [mon-an]
- Câu 4: Lan 님과 Hùng 아버님께 전하고 싶은 메시지가 있으실까요? [loi-nhan]
- Tạm biệt: 이야기 나눠주셔서 정말 감사해요!

Lần 3 (ai, 2161 ms)

- Chào: 안녕하세요, 어머님. Mây예요. 잘 지내셨어요?
- Câu 1: 어머님께서는 어떤 음식 가장 좋아하세요? 이야기해 주시겠어요? [mon-an]
- Câu 2: 어머님과 아버님께서는 언제 결혼하셨어요? 결혼식 날은 어떠셨는지 사진과 함께 이야기해 주실 수 있으세요? [ngay-cuoi, photo, wedding]
- Câu 3: Mai 님, 어린 시절 가장 기억에 남는 추억은 무엇인가요? [tuoi-tho, memory]
- Câu 4: Lan 님이나 Hùng 님에게 남기고 싶은 메시지가 있으세요? [loi-nhan]
- Tạm biệt: 오늘도 통화해 주셔서 정말 감사해요.

### ko.S2: đã có 1 cuộc gọi và 2 câu trả lời thật (vai me, tên Mai)

Lần 1 (ai, 2089 ms)

- Chào: 안녕하세요, 어머님. Mây예요. 잘 지내셨어요?
- Câu 1: 지난번에 남편분이랑 마당에 고추 심으셨다고 하셨는데, 잘 자라고 있나요? [cuoc-song]
- Câu 2: 어머님 결혼식 날에 대한 특별한 기억이 있으세요? 그때 이야기도 들려주시고, 혹시 사진도 있으실까요? [ngay-cuoi, photo, wedding]
- Câu 3: Lan님한테 해주고 싶은 이야기가 있으시면 저 Mây에게 들려주세요. [loi-nhan]
- Tạm biệt: 오늘도 통화해 주셔서 고맙습니다.

Lần 2 (ai, 2216 ms)

- Chào: 안녕하세요, 어머님. Mây예요. 잘 지내셨어요?
- Câu 1: 지난 통화에서 마당에 고추를 심으셨다고 하셨는데, 지금은 어떻게 자라고 있어요? [cuoc-song]
- Câu 2: 혹시 결혼하신 날은 언제인지, 그리고 그때 어떤 기억들이 있으신지 이야기해 주실 수 있으세요? [ngay-cuoi, photo, wedding]
- Câu 3: Lan님에게 어떤 어린 시절 이야기를 들려주고 싶으세요? [tuoi-tho, memory]
- Câu 4: 가족들에게 남기고 싶은 말씀이 있으세요? [loi-nhan]
- Tạm biệt: 오늘도 통화해 주셔서 고마워요.

Lần 3 (ai, 2084 ms)

- Chào: 안녕하세요, 어머님. Mây입니다. 잘 지내셨어요?
- Câu 1: 지난번에 마당에 고추를 심으셨다고 하셨는데, 잘 자라고 있나요? [cuoc-song]
- Câu 2: 결혼하신 날에 대한 추억이 있으신가요? 그때의 이야기를 들려주세요. 혹시 간직하고 계신 사진이 있으시면 Mây에게도 보여주세요. [ngay-cuoi, photo, wedding]
- Câu 3: 어릴 때 어머니가 해주신 된장찌개가 기억난다고 하셨는데, 혹시 다른 추억의 음식도 있으세요? [mon-an, memory]
- Câu 4: 혹시 Lan님과 Hùng님께 전하고 싶은 이야기가 있으세요? [loi-nhan]
- Tạm biệt: 이야기 나누어주셔서 정말 감사해요.

### ko.S3: có 3 ảnh (2 chú thích) và 2 sự kiện lịch, chưa có câu trả lời chép được (vai bo, tên Hùng)

Lần 1 (ai, 2237 ms)

- Chào: 안녕하세요, 아버님. Mây예요. 잘 지내셨어요?
- Câu 1: 아버님은 어렸을 때 어떤 아이였는지 궁금해요. 이야기해 주시겠어요? [tuoi-tho, memory]
- Câu 2: 가장 좋아하셨던 음식은 무엇이었는지 들려주세요. [mon-an]
- Câu 3: 아버님께서 추억하고 싶은 순간이 있으실까요? 그 순간에 대한 사진이 있다면 Mây에게도 보여주세요. [ky-niem, photo, memory]
- Câu 4: 혹시 가족들에게 전하고 싶은 메시지가 있으실까요? [loi-nhan]
- Tạm biệt: 오늘도 통화해 주셔서 고마워요.

Lần 2 (ai, 2080 ms)

- Chào: 안녕하세요, 아버님! Mây가 전화드렸어요.
- Câu 1: 아버님은 어렸을 때 어떤 꿈을 가지고 계셨어요? [tuoi-tho, memory]
- Câu 2: 요즘 제일 즐거웠던 일은 어떤 것이 있으세요? 이야기해 주실 수 있으세요? [cuoc-song]
- Câu 3: 가장 좋아하시는 음식이나 요즘 즐겨 드시는 음식이 있으시면 알려주세요. [mon-an]
- Câu 4: Lan님과 Mai님께 혹시 전하고 싶은 메시지가 있으세요? [loi-nhan]
- Tạm biệt: 오늘도 Mây와 이야기 나눠주셔서 정말 감사합니다!

Lần 3 (ai, 2069 ms)

- Chào: 안녕하세요, Hùng님! Mây가 전화드렸어요. 잘 지내셨어요?
- Câu 1: 음식에 대한 추억 중에 특별히 기억에 남는 것이 있으실까요? [mon-an, memory]
- Câu 2: 어머님께서는 어떤 음식 가장 좋아하셨어요? [mon-an]
- Câu 3: Lan님에게 사진과 함께 이야기해 주고 싶은 어린 시절 추억이 있으신가요? [tuoi-tho, photo, memory]
- Câu 4: 혹시 가족들에게 전하고 싶은 메시지가 있으실까요? [loi-nhan]
- Tạm biệt: 오늘 말씀해주셔서 정말 감사해요.

### Câu đáp ngắn (quickReply)

| Thứ tiếng | Vai | Người nói | Mây đáp |
|---|---|---|---|
| en | con | I made instant noodles with an egg because I was too tired to cook. | Instant noodles with an egg, that sounds like a good meal. |
| en | me | I had rice with grilled fish and some morning glory from the garden. | Morning glory from the garden sounds so fresh, Mom. |
| ko | me | 오늘은 남편이랑 칼국수 먹었어요. 비가 와서 따뜻한 게 먹고 싶었어요. | 남편이랑 칼국수 드셨군요, 따뜻한 칼국수 좋네요. |
| ko | con | 학교 식당에서 김치볶음밥 먹었어요. | 김치볶음밥을 먹었군요, 맛있었겠어요. |

### Rút ngày (datesSystem, nhà cùng thứ tiếng người kể)

- en: "We got married on March 12, 1995, in my hometown. And my mother, she was born on 3 June 1950."
  - wedding: Mai and husband's wedding day, 12/3/1995. Ghi chú: Mai and husband got married in Mai's hometown.
  - birthday: Mai's mother's birthday, 3/6/1950. Ghi chú: Mai's mother was born.
- ko: "저희는 1995년 3월 12일에 결혼했어요. 그리고 우리 딸 생일은 7월 8일이에요."
  - wedding: 엄마 아빠 결혼식 날, 12/3/1995. Ghi chú: 엄마 아빠 결혼식 날이에요.
  - birthday: 딸 생일, 8/7. Ghi chú: 딸 생일이에요.
