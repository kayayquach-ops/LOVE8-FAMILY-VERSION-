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
