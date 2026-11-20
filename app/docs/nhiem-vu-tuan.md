# Nhiệm vụ tuần tự đánh dấu (lọ sao)

Chủ app: "Nhiệm vụ tuần phải tự tích khi làm thật, tự tích tay thì không thật." Từ 20/11/2026 không còn ô tích tay.

## Chạy thế nào

- Mã ở `server/missions.ts`. Danh sách 5 nhiệm vụ cố định (không đổi theo tuần): call, video, love, meal, memory. Điểm tuần giữ như cũ (2, 2, 3, 1, 2).
- Tuần: từ 0 giờ thứ Hai, giờ Việt Nam (`weekKey`), giống lọ sao và câu hỏi tuần.
- Mỗi lần mở lọ (`GET /api/jar`), tuần (`GET /api/week`) hoặc trang chủ (`GET /api/home`), máy chủ chạy `syncMissions(familyId)`: đọc việc cả nhà từ đầu tuần trước tới giờ, nhận ra nhiệm vụ, ghi dòng mới vào `missions_done` với giờ ghi là giờ làm thật. Quét cả tuần trước để việc làm tối Chủ nhật vẫn được tính dù chưa ai mở app trước thứ Hai.
- Khoá chính `missions_done (member_id, mission, week)` giữ mỗi người mỗi tuần mỗi nhiệm vụ một dòng, nên một sao. Dòng tích tay cũ vẫn giữ và vẫn tính.
- `POST /api/missions/:key` (tích tay) giờ trả 410 `mission_auto`.

## Luật nhận ra

| Nhiệm vụ | Tính khi người đó, trong tuần |
|---|---|
| video | đăng một bài video |
| meal | đăng một ảnh có bật "bữa cơm" ở màn gửi (`SendTo.tsx`, cột `posts.meal`) |
| love | bấm "ôm cả nhà" (bài `hug`); hoặc tin nhắn, trả lời bài, thư, lời kèm bài có chữ thương; hoặc nhãn dán ôm, thương con, tim, nhớ nhà (trong chat hoặc trong thư) |
| memory | tin nhắn, trả lời bài, thư, lời kèm bài là câu hỏi (có `?`) nhắc chuyện cũ. Gửi riêng một người (thư, tin nhắn riêng có `to_id`) thì phải khác thế hệ: bố/mẹ hỏi con hoặc con hỏi bố/mẹ. Gửi cả nhà thì tính luôn |
| call | cuộc gọi video trong app nối được: `facetime.ts` gọi `markCall(familyId, memberIds)` (móc `onCallConnected`) |

Từ khoá nằm một chỗ, `LOVE` và `MEMORY` trong `server/missions.ts`, có kiểm thử ở `server/missions.test.ts`:

- Thương: thương, yêu, nhớ, love, luv, miss, 사랑, 보고 싶, 그리워, 그립. Bỏ qua: yêu cầu, bị thương, tổn thương, thương mại, thương lượng, ghi nhớ.
- Chuyện cũ: nhớ, kỷ niệm, ngày xưa, ngày trước, hồi xưa/trước/nhỏ/bé/đó/ấy, remember, memory, back then, 기억, 옛날, 추억, 어릴 때.
- Gõ không dấu (thuong, yeu) không tính vì dễ lẫn (bình thường, yếu).

Không làm:
- Bấm số điện thoại (`tel:`) ở danh sách cả nhà: chỉ mở trình gọi, app không biết có gọi thật không, mà mở route cho máy khách báo thì lại thành tích tay.
- Đoán bữa cơm theo giờ chụp: app không đoán ở đâu cả, đã có nút "bữa cơm".
- Trả lời câu hỏi của Mây (call_answers): đó là mình kể, không phải mình hỏi bố mẹ hay con.

## Màn lọ

- Ô vuông chỉ là dấu. Dòng mình làm rồi không bấm được, có chữ ai đã làm ("Lan, Mẹ đã làm").
- Bấm dòng chưa làm: video, bữa cơm mở camera; thương, kỷ niệm mở trò chuyện; gọi điện mở cả nhà (có nút gọi video từng người).

## Giấy gấp sao

Cũng từ 20/11/2026: không bán lẻ giấy nữa, mọi giấy ai cũng dùng được. Sau này gói gia đình trả theo tháng/kỳ lo hết; chỗ kiểm gói để sẵn chú thích ở `PUT /api/jar/seed` (`server/jar.ts`), chưa làm. Bảng `owned_seeds` giữ nguyên, không đọc nữa.
