# Viết lại chữ trang giới thiệu (25/11/2026)

Sửa theo skill humanizer và luật giọng của chủ app. Chỉ đổi chữ: bố cục, class, link, ảnh, CSS giữ nguyên. Font Hàn đã làm lại bằng `tools/fonts.py` vì có 9 chữ Hàn mới (font Montserrat giữ bản cũ). Chưa đăng, chưa commit. Bản cũ để đối chiếu nằm ở scratchpad của phiên, không nằm trong repo.

## Hero và tiêu đề các mục (cả ba tiếng)

Câu dẫn hero

| | Trước | Sau |
|---|---|---|
| VI | Một app cho cả nhà đang sống xa nhau. Con ở một thành phố, bố mẹ ở một thành phố khác, vẫn như ở chung một nhà. | Một app cho cả nhà sống xa nhau. Con đi học, đi làm xa, bố mẹ ở nhà, mà vẫn biết hôm nay mỗi người ăn gì, làm gì. |
| KO | 떨어져 사는 가족이 함께 쓰는 앱이에요. 자녀는 한 도시에, 부모님은 다른 도시에 있어도 한집에 사는 것처럼요. | 떨어져 사는 가족이 함께 쓰는 앱이에요. 자녀가 멀리서 공부하거나 일해도 오늘 서로 뭘 먹고 뭘 했는지 알 수 있어요. |
| EN | One app for a family that lives apart. Kids in one city, parents in another, and it still feels like one home. | An app for families who live apart. Kids are away for school or work, but you still hear about each other's day. |

Nút phụ hero: VI "Xem cách hoạt động" thành "Xem cách dùng". KO, EN giữ.

Tiêu đề mục Tính năng

| | Trước | Sau |
|---|---|---|
| VI | Những thứ nhỏ, cho cả nhà. | Mấy thứ nhỏ cho cả nhà. |
| KO | 온 가족을 위한 작은 기능들 | (giữ) |
| EN | Small things, for the whole family. | Small things for the whole family. |

Tiêu đề mục Đội ngũ

| | Trước | Sau |
|---|---|---|
| VI | Do chính những du học sinh xa bố mẹ làm ra. | Nhóm mình cũng là du học sinh xa nhà. |
| KO | 부모님과 떨어져 사는 유학생들이 직접 만들었어요 | 저희도 부모님과 떨어져 사는 유학생이에요 |
| EN | Built by students who live far from their own parents. | We're students who live far from our parents, too. |

Tiêu đề mục Hỏi đáp: chỉ đổi KO, "궁금한 점이 있다면" (câu bỏ lửng) thành "많이 받는 질문들". VI, EN giữ.

Các tiêu đề mục khác giữ nguyên, kể cả "Ở xa mà gần." và "멀리 있어도 가까운 가족".

## Các chỗ khác (tiếng Việt)

| Trước | Sau |
|---|---|
| Bỏ qua, tới nội dung | Tới nội dung chính |
| Sweet Home cho cả nhà những chuyện nhỏ để bắt đầu. | Sweet Home cho cả nhà thêm vài chuyện nhỏ để hỏi nhau. |
| Giọng thật của mẹ, thành một tập nghe nhẹ nhàng cho cả nhà. Người kể muốn giữ riêng thì chạm một cái. | Cả nhà nghe chuyện bằng giọng thật của mẹ, nhẹ nhàng như nghe đài. Người kể muốn giữ riêng thì chạm một cái. |
| Câu trả lời giúp Mây biết nhà bạn. | Trả lời xong là Mây biết nhà bạn hơn. |
| Lịch âm có sẵn. Ngày giỗ, sinh nhật âm lịch được nhắc trước. | Lịch âm có sẵn. App nhắc trước ngày giỗ, sinh nhật âm lịch. |
| Ưu đãi cho thứ bố mẹ cần: khám tại nhà, giao thuốc, ghế massage. | Có ưu đãi cho bố mẹ. Khám tại nhà, giao thuốc, ghế massage. |
| Người cuối cùng rời thì nhà cũng được xoá. | Người cuối cùng rời đi thì nhà cũng xoá luôn. |
| Hoặc viết về: | Hoặc gửi mail: |
| Thông báo cuộc gọi tuần, mỗi người tự bật, tắt trong Cài đặt, mục Thông báo. | Mỗi người tự bật hay tắt thông báo cuộc gọi hằng tuần trong Cài đặt, mục Thông báo. |
| Mô tả Google: ...lịch âm, và Mây hỏi chuyện từng người mỗi tuần. | ...lịch âm và Mây gọi hỏi chuyện từng người mỗi tuần. |

## Chỉ đổi tiếng Hàn hoặc tiếng Anh

- KO: bước 3 ("매주 한 사람씩" đọc thành mỗi tuần gọi một người, sửa thành "매주 식구마다"), thẻ lịch, lọ sao, "처음 몇 가지 질문", lời hứa 2, chú thích ảnh nhãn hàng chuyển sang 해요, mô tả Google.
- EN: thẻ ảnh AI, photo booth, lọ sao, nhãn ưu đãi cho bố mẹ, lời hứa 1, câu hỏi ngôn ngữ, mô tả Google.

## Cố ý giữ

- Chữ đậm đầu mỗi dòng ở mục Cho bố mẹ: là thẻ `<b>` của thiết kế nên giữ, chỉ bỏ kiểu nhãn có dấu hai chấm.
- "Mỗi lần thương nhau là một ngôi sao." giữ vì nghe như người thật nói.

---

# Lần 2 (25/11/2026): sửa theo góp ý chủ app

Chưa đăng, chưa commit. Bản trước lần sửa này để ở scratchpad (`orig-v2/`). Font Hàn làm lại (292 chữ), ba file Montserrat giữ nguyên bản cũ.

## 1. Mục Cho bố mẹ

Bỏ hẳn ý "Giữ nút để nói". Mỗi ý giờ có 1 đến 2 câu đời thường.

| Ý | VI mới |
|---|---|
| Mây gọi | **Mây gọi tới như một cuộc điện thoại.** Bố mẹ nghe máy rồi cứ thế kể. Mây xưng con, hỏi han như con cháu trong nhà. |
| Giọng nói | **Trả lời bằng giọng nói.** Không cần gõ chữ. Con gửi ảnh lên, bố mẹ nói một câu là con nghe được. |
| Lịch âm | **Lịch âm có sẵn.** Ngày giỗ, sinh nhật âm lịch tự đổi ra ngày dương. Gần tới ngày, app báo cho cả nhà. |
| Ưu đãi | **Ưu đãi cho cả nhà.** Khám sức khoẻ, dịch vụ y tế, thuốc hằng tháng, thực phẩm bổ sung, ghế massage... Ai trong nhà cũng dùng được. |

KO và EN viết theo cùng ý. Tiếng Hàn dùng 해요체, có -시- khi chủ ngữ là bố mẹ (하시면 돼요, 드시는 약). "Mây xưng con" lấy từ lời thoại của Mây trong app (`call.line.*.parent`). Ảnh điện thoại trước của mục này đổi sang `app-may-hoi-chia-se` (Mây hỏi mẹ có cho cả nhà nghe không, mẹ đáp "Ừ, cho cả nhà nghe với").

## 2. Ưu đãi cho cả gia đình

- Mục Cho bố mẹ: như bảng trên.
- Mục Cho nhãn hàng, tiêu đề: "Gửi ưu đãi tới những gia đình đang lo cho bố mẹ." thành "Gửi ưu đãi tới cả gia đình, ngay trong app." (KO 온 가족에게 혜택을 앱 안에서 전하세요, EN Put your offer in front of the whole family.)
- Mục Cho nhãn hàng, câu dẫn: "sức khoẻ, nhà thuốc, thực phẩm, vé về quê" thành "khám sức khoẻ, dịch vụ y tế, thuốc hằng tháng, thực phẩm bổ sung hay ghế massage", thêm "Ai trong nhà cũng dùng được."
- Bước 3: "Chạm mốc 40, 100, 200 sao" thành "Đủ 40, 100, 200 sao".

## 3. Hỏi đáp

Bỏ câu "Bản beta là gì?". Còn 6 câu, viết gọn lại:

| Câu | VI mới |
|---|---|
| Có mất tiền không? | Không. Đang beta nên miễn phí, app chưa thu tiền gì cả. |
| Dùng trên máy nào? | iPhone hay Android đều được. Mở bằng Safari hoặc Chrome rồi thêm vào Màn hình chính. Riêng iPhone phải thêm vào Màn hình chính mới nhận được thông báo. |
| Cả nhà vào bằng cách nào? | (giữ ý) Một người dựng nhà rồi gửi mã nhà qua Zalo hay tin nhắn. Người nhận nhập mã, người lập nhà đồng ý là vào. |
| Mây gọi có cần mình đồng ý không? | Có. Bạn nghe máy thì Mây mới nói chuyện, chưa tiện thì để sau. Lần đầu, điện thoại sẽ hỏi bạn có cho dùng micro không. Thông báo cuộc gọi tuần thì mỗi người tự bật, tắt trong Cài đặt. |
| Có những ngôn ngữ nào? | Tiếng Việt, tiếng Hàn và tiếng Anh. Mỗi người chọn tiếng của mình, tin nhắn tự dịch cho người kia. |
| Muốn xoá dữ liệu thì sao? | Vào Cài đặt, chọn Rời nhà. Ảnh, tin nhắn, cuộc gọi của bạn bị xoá hẳn, không lấy lại được. Chi tiết ở trang quyền riêng tư. (bỏ câu "người trong nhà cũng xoá được một người") |

Câu hỏi Mây bằng tiếng Anh đổi thành "Do I have to take Mây's calls?" để khớp với câu tiếng Hàn (꼭 받아야 하나요?), nên tiếng Anh và tiếng Hàn trả lời "No", tiếng Việt trả lời "Có" (cùng một ý: phải nghe máy thì Mây mới nói).

## 4. Hero có màn Mây gọi

- Điện thoại bên trái đổi từ `tin-nha` (ảnh bữa cơm) sang `app-may-hoi-them`: màn cuộc gọi của Mây, có linh vật Mây, câu "Mưa thế, bố có bị ướt không mẹ?" và lời mẹ đáp. Điện thoại bên phải giữ màn chính (có thẻ "Mây muốn chào bạn, nghe máy").
- Câu dẫn hero giới thiệu Mây (xem ý 7).
- Nhãn "Bản beta, đang miễn phí" thành "Đang beta, miễn phí".

## 5. Lưới tính năng thấy trọn điện thoại

Khung điện thoại thu nhỏ (112 px trên điện thoại, 140 đến 150 px trên máy tính) và nằm trọn trong ô, không còn bị cắt. "Chụp chung bằng AI" chuyển từ ô cao sang ô ngang để lưới đều 3 hàng. Thứ tự ô: Ảnh mỗi ngày, Thư tay, Photo booth, Chụp chung bằng AI, Nhắn tin, Lịch, Lọ sao, Cả nhà lúc này, Câu hỏi lúc đầu.

## 6. Nhà mình kể

Bước 4, câu mới: "“Nhà mình kể” là những tập podcast ngắn, dựng từ chuyện bố mẹ kể với Mây, bằng chính giọng thật của bố mẹ. Con ở xa mở ra là nghe. Người kể muốn giữ riêng cũng được." Tiêu đề: "Chuyện của mẹ thành..." thành "Chuyện mẹ kể thành một tập “Nhà mình kể”."

## 7. Giới thiệu Mây ngay lần nhắc đầu

- Hero (lần đầu Mây xuất hiện trên trang): "Một app cho cả nhà sống xa nhau. Trong app có Mây, AI của Sweet Home. Mỗi tuần Mây gọi cho từng người trong nhà, hỏi một chuyện để tâm sự."
- Bước 3: "Mây, AI của app, gọi cho mẹ và hỏi một chuyện để mẹ kể, như hai mẹ con ngồi tâm sự. Mẹ kể tới đâu, Mây hỏi thêm tới đó."
- Mô tả Google (`main.js` và thẻ meta), mô tả khi chia sẻ link (`og:description`): thêm "Mây, AI của app".

## 8. Rà lại toàn bộ chữ (humanizer, file mode)

Đã đọc hết `index.html` (mọi câu ba thứ tiếng, alt, aria, meta) và `TEXT` trong `main.js`. Ngoài các câu ở ý 1 đến 7, sửa thêm:

| Chỗ | Trước | Sau |
|---|---|---|
| Bước 2 (VI) | Viết ngay trên điện thoại, chọn giấy, chọn nét chữ. An chạm vào dấu sáp là mở. | Mẹ viết ngay trên điện thoại, chọn giấy và kiểu chữ mình thích. An mở ra đọc như thư tay. (bỏ thuyết minh cách bấm) |
| Thẻ Thư tay (VI) | Hộp thư riêng của nhà, chạm dấu sáp để mở. | Hộp thư riêng của nhà. Viết trên điện thoại mà đọc như thư tay. |
| Thẻ Nhắn tin (VI) | Chat, gọi video. Tin nhắn tự dịch Việt, Hàn, Anh. | Chat và gọi video với cả nhà. Tin nhắn tự dịch qua lại Việt, Hàn, Anh. |
| Thẻ Chụp chung AI (VI) | Mỗi người một nơi, AI ghép thành ảnh cả nhà. Luôn ghi “ảnh ghép AI”. | Mỗi người tự chụp ở nơi mình sống, AI ghép thành một ảnh cả nhà. Ảnh luôn ghi “ảnh ghép AI”. |
| Hero (KO) | ...오늘 서로 뭘 먹고 뭘 했는지 알 수 있어요. | Sweet Home의 AI인 Mây가 매주 식구마다 전화를 걸어 이야기 하나를 물어보고 들어 줘요. |
| Bước 3 (KO) | (câu cụt "편하게요." đứng riêng) | gộp thành một câu: ...마주 앉아 이야기하듯 이야기 하나를 여쭤봐요. |
| Thẻ Thư tay, Nhắn tin, Cả nhà lúc này (KO) | câu cụt không có đuôi | thành câu trọn: 편지함이에요, 영상통화도 해요, 날씨가 어떤지 보여요 |
| Thẻ Thư tay, Lịch, Cả nhà lúc này (EN) | Written on a phone, read like a real letter. / ...converted to regular dates. / What time it is where they are... | You write on your phone, and it reads like a real letter. / ...show up as regular dates too. / See what time it is where they are... |
| Alt ảnh màn chính (KO, EN) | Mây의 통화 요청 / Mây's call invite | Mây의 전화 / a call from Mây |

Đã kiểm: không có gạch ngang dài, không câu "không phải X mà là Y", không câu chốt một dòng, không thêm tính năng, con số hay lời hứa mới.
