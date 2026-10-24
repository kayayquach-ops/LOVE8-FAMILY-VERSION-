# Rà soát trải nghiệm Sweet Home (25/10/2026)

Chạy thử local (cổng 3021, Postgres simshop-pg) trong khung 375x812, 375x667 (iPhone SE) và 360x740. Camera và mic bị chặn trong khung thử nên phần chụp ảnh thử bằng nút chọn ảnh, gọi video thử bằng hình giả có sẵn.

Mức: A hỏng luồng chính hoặc mất dữ liệu · B giật, lag, nhảy bố cục · C thiếu trạng thái trống, tải, lỗi · D bố cục, chữ · E truy cập, PWA.

Trạng thái: **đã sửa** · **cần thử trên iPhone thật** · **để sau**.

## A. Hỏng luồng, mất dữ liệu

| Màn | Vấn đề | Cách thấy | Cách sửa | Trạng thái |
|---|---|---|---|---|
| Mở app | Hỏi `/api/me` lỗi bất kỳ (mất mạng, máy chủ đang deploy trả 502) là xoá luôn mã của máy, người dùng bị đẩy về màn chào, phải vào nhà lại | Tắt máy chủ trong lúc app đang mở: lần hỏi 30 giây sau xoá mã, mở lại ra màn chào | Chỉ xoá mã khi máy chủ trả 401. Mất mạng lúc mở app thì hiện "Chưa nối được về nhà" và nút Thử lại | đã sửa |
| Mời người thân (màn tạo nhà, Gia đình) | Nút "Gửi lời mời" không làm gì khi máy không có bảng chia sẻ và không cho chép clipboard; lỗi promise không bắt | Bấm trong khung thử: không có gì xảy ra, console báo NotAllowedError | Chia sẻ lỗi thì chép lời mời (có cách chép dự phòng), vẫn không được thì hiện mã nhà. Chạm vào mã để chép | đã sửa |
| Giữ để nói (Tin nhà, câu hỏi tuần, Camera, Chat) | Thả tay trước khi micro kịp mở (lần đầu máy hỏi quyền) thì máy vẫn ghi mãi; Tin nhà không tắt micro sau khi ghi (chấm cam iPhone sáng mãi); thả tay rồi trượt ra ngoài gọi dừng hai lần, ném lỗi | Đọc mã: `voiceDown` chờ `getUserMedia` rồi mới đặt trạng thái; luồng mic không `stop()` | Gom vào một hook `useHoldMic`: đánh dấu đang giữ, mic mở xong mà đã thả thì tắt ngay; luôn tắt mic khi thả và khi rời màn; dừng hai lần không lỗi | đã sửa, cần thử trên iPhone thật |
| Camera | Camera chạy cả khi mở Tin nhà, Chat, gọi video, gọi tuần và khi app ẩn. iPhone chỉ cho một nơi dùng camera: gọi video xong quay lại thì khung chụp đen; mở lại app từ nền cũng hay đen | Đọc mã: luồng chỉ tắt khi rời hẳn màn Camera | Camera chỉ bật khi đang nhìn thấy màn chụp; ẩn app thì tắt, mở lại thì bật lại; xem lại ảnh vừa chụp cũng tắt cho đỡ pin | đã sửa, cần thử trên iPhone thật |
| Camera | Nút chụp không bắt `pointercancel`: máy huỷ cú chạm khi đang giữ thì video quay tiếp tới 15 giây | Đọc mã | Huỷ cú chạm thì dừng quay và giữ đoạn đã quay | đã sửa |
| Ôm mỗi ngày | Vòng tròn giữ để ôm không bắt `pointercancel`: máy huỷ cú chạm thì vẫn tính đang giữ, tự ôm xong | Đọc mã | Thêm `onPointerCancel` | đã sửa |
| Gia đình | Lưu thông tin lỗi vẫn báo "Đã lưu" và đóng ô sửa, mất chữ vừa gõ | Đọc mã | Lỗi thì báo lỗi, giữ ô sửa; nút Lưu khoá khi đang lưu; ảnh đại diện thu nhỏ trước khi gửi | đã sửa |
| Lọ thương | Bấm "Xong" nhiệm vụ lỗi vẫn báo "+1 hạt vào lọ" | Đọc mã | Chỉ báo khi máy chủ nhận; khoá nút khi đang gửi | đã sửa |
| Tin nhà | Enter hai lần gửi hai lời trả lời; lỗi gửi trả lời, thả cảm xúc, gửi giọng không báo | Thử: Enter hai lần ra hai lời "Đẹp quá" | Khoá bằng ref; bắt lỗi và báo; thả cảm xúc hiện ngay rồi mới hỏi máy chủ | đã sửa |
| Chat | Bấm gửi hai lần thật nhanh gửi hai tin | Đọc mã | Bỏ qua tin trùng trong 0,8 giây | đã sửa |
| Hỏi đầu | Bấm quay lại trong lúc đang chờ tự sang câu sau thì vẫn bị đẩy tới câu khác | Đọc mã: `setTimeout(next)` không huỷ | Hẹn giờ huỷ được, quay lại là huỷ | đã sửa |
| Hỏi đầu | Tạo nhà xong mà lấy mã lỗi thì vẫn ở màn tạo nhà, bấm lần nữa thành hai nhà | Đọc mã | Lỗi thì vào nhà luôn (mã có trong Gia đình) | đã sửa |
| Hỏi đầu, nhập mã | Dán cả câu mời ("Mã nhà: 123456") bị `maxLength` cắt mất số | Đọc mã | Lấy 6 số liền trong chữ dán vào | đã sửa |
| Lịch | Bấm Lưu hai lần thêm hai ngày; xoá ngày không hỏi lại | Đọc mã | Khoá nút khi đang lưu; hỏi trước khi xoá | đã sửa |
| Phim tuần | Bấm làm phim hai lần gửi hai lệnh dựng | Đọc mã | Khoá nút khi đang gửi | đã sửa |

## B. Giật, lag, nhảy bố cục

| Màn | Vấn đề | Cách thấy | Cách sửa | Trạng thái |
|---|---|---|---|---|
| Cả app | Máy chủ không nén: JS 408 kB, CSS 70 kB gửi nguyên; file có mã băm chỉ giữ 1 giờ | `curl` với gzip: 408 359 byte | Thêm `compression` (bỏ qua kênh SSE), `/assets` giữ 1 năm | đã sửa: JS 103 kB, CSS 11 kB trên mạng |
| Cả app | Một gói JS chứa cả màn gọi video, chụp chung, gọi tuần, podcast, phim tuần | Build: index 408 kB | Tách 4 màn đó tải sau; rảnh thì tải sẵn gọi tuần, podcast, phim tuần. Không tải sẵn gọi video vì CSS chụp chung kéo theo khoảng 30 phông chữ (580 kB) | đã sửa: index 336 kB (105 kB gzip) |
| Mở app | Màn trống tới khi `/api/me` trả lời (trên 4G có thể 1 đến 2 giây) | Khung 375x667: màn trống trước khi hiện camera | Lưu bản `me` lần trước, mở là hiện ngay rồi mới thay bản mới | đã sửa (nội dung hiện ở 60 ms, trước cả khi `/api/me` về) |
| Thanh dưới, camera, thẻ tin, gọi video | `backdrop-filter: blur` trên thanh dưới (18 px), dòng chữ trên khung camera đang chạy, chú thích ảnh, tên trong gọi video: Safari làm mờ lại mỗi khung hình | Đọc CSS | Bỏ blur, dùng nền gần đặc, nhìn gần như cũ | đã sửa, cần thử trên iPhone thật |
| Gọi tuần | Linh vật 3D vẽ mọi khung hình (60 lần mỗi giây), cộng chữ chạy và mic, nóng máy | Đọc mã | Vẽ khoảng 30 hình mỗi giây, hệ số trượt nhân đôi để nhịp không chậm | đã sửa, cần thử trên iPhone thật |
| Podcast | Vòng rAF đặt state 60 lần mỗi giây, dựng lại cả màn | Đọc mã | Chỉ cập nhật thanh tua 4 lần mỗi giây | đã sửa |
| Tin nhà | Thanh trả lời hiện ra khi lướt tới tin làm khung co lại, mọi trang đổi chiều cao, trang đang xem bị lệch | Đo: chiều cao khung đổi khi thanh hiện | Thanh nằm đè lên đáy, các trang chừa sẵn chỗ | đã sửa (khung giữ 752 px khi có và không có thanh) |
| Trang chủ | Phần Sắp tới, Ảnh tuần này hiện sau khi tải xong, đẩy Podcast và Lọ thương xuống | Thử: mở Trang chủ thấy phần dưới nhảy | Phần dưới chỉ hiện khi đã có dữ liệu, hiện cùng lúc bằng độ mờ | đã sửa |
| Ôm mỗi ngày | Vòng tròn và dòng gợi ý hiện sau câu chữ, đẩy câu chữ lên | Đọc mã | Giữ chỗ sẵn (ẩn), chỉ hiện dần | đã sửa |
| Cả app | Hỏi máy chủ cả khi app ẩn: 3 lệnh mỗi 30 giây ở App, Trang chủ 30 giây, Tin nhà 20 giây, Chat 8 giây | Đọc mã | Ẩn app thì thôi hỏi, mở lại hỏi ngay một lần | đã sửa |
| Âm thanh | Mỗi cú chạm đầu tải lại 11 file tiếng khi lượt trước chưa giải mã xong | Network: mỗi file tải 2 lần | Ghi nhớ file đang tải | đã sửa |
| Phông chữ | Phông Light (tiêu đề lớn) là TTF 104 kB, không tải trước, chữ đổi phông khi hiện | Network | Đổi sang WOFF 41 kB và tải trước | đã sửa |
| Toast | Toast lệch sang phải, chữ dài tràn khỏi màn (hiệu ứng `fade` ghi đè `translateX(-50%)`) | Đo: toast từ x=187 tới x=697 trên màn 375 | Canh giữa bằng left/right, chữ xuống dòng | đã sửa |

## C. Trạng thái trống, tải, lỗi

| Màn | Vấn đề | Cách thấy | Cách sửa | Trạng thái |
|---|---|---|---|---|
| Trang chủ | Nhà mới chỉ có mình, không có gì gợi ý mời người thân | Tạo nhà mới, vào Trang chủ | Ô "Mời bố mẹ vào nhà" (hoặc "Mời con vào nhà") cuối hàng Cả nhà lúc này; nhà đông người thì là "Mời thêm người" kèm mã | đã sửa |
| Trang chủ | Tải lỗi thì phần dưới trống trơn | Đọc mã | Dòng "Chưa tải được tin nhà. Chạm để thử lại" | đã sửa |
| Trang chủ → Tin nhà | Bấm một ảnh ở "Ảnh tuần này" mở Tin nhà ở trang đầu, không phải ảnh vừa bấm | Thử | Mở thẳng tới ảnh đó | đã sửa |
| Tin nhà, Chat | Người mới vào nhà hiện "?" hoặc "Ai đó" tới 30 giây | Thử: người thứ hai vào nhà rồi đăng ảnh | Mở Tin nhà, Chat, Gia đình là lấy lại danh sách cả nhà | đã sửa |
| Camera | Gửi video lớn không có tiến độ, chỉ "..." | Đọc mã | Hiện phần trăm trong nút gửi; lỗi thì giữ ảnh và dòng chữ để gửi lại | đã sửa |
| Camera, Chat, Gia đình | Ảnh chọn từ máy gửi nguyên bản (ảnh iPhone 3 đến 5 MB) | Thử ảnh 3024x4032: 803 kB | Thu cạnh dài về 2048 px (ảnh đại diện 800 px) | đã sửa (803 kB còn 249 kB) |
| Chat | Gửi ảnh, giọng nói không thấy gì tới khi xong | Thử | Dòng "Đang gửi..." cuối khung | đã sửa |
| Chat | Bấm ảnh mở tab mới: app thêm vào màn hình chính bị văng sang Safari | Đọc mã: `target="_blank"` | Xem ảnh ngay trong app, chụm hai ngón để phóng to | đã sửa, cần thử trên iPhone thật |
| Camera | Không cho camera thì chỉ có nút "Bật camera" | Thử trong khung | Thêm "Hoặc chọn ảnh có sẵn ở nút bên dưới" | đã sửa |

## D. Bố cục, chữ

| Màn | Vấn đề | Cách thấy | Cách sửa | Trạng thái |
|---|---|---|---|---|
| Lịch, thêm ngày | Chữ gợi ý bị cắt ("Năm âm (không bắt buộc)" trong ô 95 px), ô tên lệch so với các ô khác | Ảnh chụp 375x812 | Chữ gợi ý ngắn (Ngày, Tháng, Năm), thêm một dòng giải thích dưới; ô tên đủ rộng; ô sinh nhật gợi ý "Sinh nhật ai?" | đã sửa |
| Trang chủ | Khoảng chừa dưới không tính thanh home của iPhone, mục cuối nằm sát thanh dưới | Đọc CSS | Cộng `safe-area-inset-bottom` | đã sửa |
| Camera, máy nhỏ | 360x740 và 375x667: nút "Tin nhà" chạm vào nút camera tròn của thanh dưới | Đo: nút Tin nhà đáy 648, nút tròn đỉnh 642 | Chừa thêm chỗ dưới; khung chụp tự nhỏ lại trên máy thấp | đã sửa |
| Tin nhà | Nút "Xoá" cao 31 px | Đo | Tối thiểu 44x44 | đã sửa |
| Tạo nhà xong | "Mã nhà Nhà Thử UX" đọc lặp | Ảnh chụp | "Mã của Nhà ..." và "Chạm vào mã để chép" | đã sửa |
| Phim tuần | Nút "Làm recap tuần này" dùng chữ tiếng Anh | Ảnh chụp | "Làm phim tuần này" | đã sửa |
| Chat | Chữ dưới hình dán 11 px | Ảnh chụp | 12 px | đã sửa |
| Camera | Nút "Xem" trong dải nhắc là thẻ `a` không có href (không vào được bằng bàn phím, vùng chạm nhỏ) | Đọc mã | Đổi sang nút, cao 44 px | đã sửa |

## E. Truy cập, PWA

| Màn | Vấn đề | Cách thấy | Cách sửa | Trạng thái |
|---|---|---|---|---|
| Cả app | Chạm nhanh hai lần có thể phóng to trang | Đọc CSS | `touch-action: manipulation` cho cả trang, riêng màn xem ảnh cho chụm phóng to | đã sửa |
| Các sheet | Cuộn tới cuối trong sheet kéo theo trang phía sau bật nảy | Đọc CSS | `overscroll-behavior: contain` cho vùng cuộn | đã sửa |
| Thanh dưới | Không báo mục đang mở cho trình đọc màn hình; số tin chat chưa đọc không đọc được | Đọc mã | `aria-current`, nhãn "Chat, n tin mới" | đã sửa |
| Giảm chuyển động | Sheet và chat vẫn trượt từ dưới lên | Đọc CSS | Bật Giảm chuyển động thì chỉ hiện dần bằng độ mờ | đã sửa |

## Để sau (cần quyết định hoặc việc lớn)

- **Vào nhà bằng link mời vẫn đi đủ khoảng 17 màn hỏi đầu** (vai trò, ngày sinh, nơi ở, 5 trang kể chuyện...). Bố mẹ bấm link mời nên có đường ngắn hơn (ví dụ chỉ hỏi bạn là ai, tên, rồi vào nhà; phần còn lại hỏi sau). Cần người dùng quyết vì đụng nhịp chậm đã chốt.
- **Lịch mặc định loại "Sinh nhật"**: thêm ngày giỗ mà quên đổi loại thì hiện nút "Gửi lời chúc". Nên để mặc định "Khác" hoặc bắt chọn loại trước; cần quyết.
- **`user-scalable=no` trong viewport**: iPhone bỏ qua, Android thì chặn cả chụm phóng to ảnh. Đã thêm `touch-action` nên có thể bỏ thuộc tính này; để người dùng quyết sau khi thử.
- **Nhạc nền hỏi đầu 2,9 MB** tải ngay khi chạm màn chào. Nén về 96 kbps còn khoảng 1,2 MB nhưng cần người dùng nghe lại.
- **Ảnh nền thẻ "Gửi cả nhà một tấm ảnh" dùng `filter: blur(18px)`**: ảnh đứng yên nên chưa thấy giật, nếu iPhone vẫn giật khi cuộn Trang chủ thì đổi sang ảnh làm mờ sẵn từ máy chủ.
- **AI hỏi sai** trong cuộc gọi tuần: không đụng logic cuộc gọi theo dặn, có kế hoạch riêng.
- **Màu thanh trạng thái** (`theme-color #F6EEE2`) hơi khác nền sương mờ; không đổi vì đụng phần nền đã chốt.

## Danh sách thử trên iPhone thật

1. **Deploy xong vẫn còn trong nhà**: mở app, để đó lúc deploy, quay lại. Lỗi nếu bị đẩy về màn chào.
2. **Camera sau gọi video**: Chat → gọi video → gác máy → về Camera. Lỗi nếu khung chụp đen hoặc đứng hình.
3. **Camera sau khi ra màn hình chính**: vuốt về màn hình chính 10 giây rồi mở lại. Lỗi nếu khung chụp đen; chấm xanh camera phải tắt khi app ẩn.
4. **Giữ để nói lần đầu**: cài lại quyền mic (Cài đặt → Safari → Micro → Hỏi), giữ nút nói, máy hỏi quyền, cho phép. Lỗi nếu sau đó máy tự ghi mãi hoặc chấm cam không tắt.
5. **Chấm cam sau khi trả lời bằng giọng ở Tin nhà**: giữ nút mic trả lời một tin, thả. Lỗi nếu chấm cam micro còn sáng.
6. **Thanh dưới và Trang chủ khi cuộn**: cuộn nhanh Trang chủ. Lỗi nếu giật, hoặc thanh dưới trông khác hẳn trước (giờ là nền trắng gần đặc, không mờ kính).
7. **Gọi tuần**: nghe máy, nói chuyện 1 phút. Lỗi nếu linh vật giật cục, miệng không theo kịp tiếng, hoặc máy nóng nhanh hơn trước.
8. **Mời người thân**: Trang chủ nhà mới → "Mời bố mẹ vào nhà". Lỗi nếu không hiện bảng chia sẻ; chạm vào mã ở Gia đình phải báo "Đã chép mã".
9. **Xem ảnh trong Chat** (app thêm vào màn hình chính): bấm một ảnh. Lỗi nếu văng ra Safari; chụm hai ngón phải phóng to được, chạm để đóng.
10. **Gửi video 15 giây qua 4G**: nút gửi phải chạy phần trăm. Lỗi nếu đứng ở 0% hoặc mất video khi mạng rớt.
11. **Tin nhà**: lướt qua nhiều tin. Lỗi nếu trang bị lệch, nửa trên nửa dưới khi thanh trả lời hiện ra.
12. **iPhone SE hoặc máy nhỏ**: màn Camera. Lỗi nếu nút "Tin nhà" bị thanh dưới che.
