# Nền màn chào Sweet Home: phân tích ảnh mẫu và cách làm lại

Ảnh mẫu là thiết kế của chính người dùng (đã xác nhận), nên được dùng trực tiếp: nền sạch tạo bằng Gemini image edit từ ảnh mẫu, hoa văn chấm tách thẳng từ ảnh mẫu.

Đo bằng script node + sharp (ảnh thu về 360x640, bỏ vùng hoa văn, chữ, bướm; mẫu bỏ lề trắng 18px hai bên).

## 1. Phân tích nền mẫu (1080x1920)

**Bố cục.** Máy nhìn chếch xuống cánh đồng cỏ lông (feather grass), không có trời, không có đường chân trời. Bông cỏ chạy chéo từ dưới trái lên trên phải, nghiêng khoảng 20 đến 25 độ (đo hướng vệt trội: 21 độ, độ kết dính 0.40), cong thành từng lớp. Nửa trên có 3 đến 4 dải bóng xám chéo cùng hướng. Không có vùng trống thật, chỉ có vùng ít chi tiết ở giữa trên. Độ sâu trường ảnh nông: giữa khung hơi nét, trên và dưới mờ. Độ nét (RMS Laplacian) 6.6, rất mềm.

**Bảng màu.**
- Độ sáng trung bình 89.7%; p1 81%, p10 84%, p90 95.4%, p99 97.6%. Điểm tối nhất chỉ khoảng #CFD0CA.
- Histogram: 53.7% điểm ảnh ở dải 80-90%, 46.2% ở dải 90-100%, gần như không có gì dưới 80%. 82.5% điểm ảnh sáng trên 85%: high-key cực mạnh.
- Lưới 3x5 (hàng trên xuống, ô góc bị hoa văn che): sáng nhất #F6F3EE ở giữa trên và giữa; tối nhất #D9D9D3 / #DDDED2 ở góc dưới và mép phải hàng 4 (bóng cỏ).
- Nhiệt độ màu: R-B trung bình +7.9, trung tính hơi ấm; độ bão hoà trung bình 3.6%.
- Tương phản cỏ và nắng: p90-p10 khoảng 11 điểm phần trăm, rất thấp.

**Lấp lánh.** 72 hạt sáng trên 10.000 điểm ảnh; 71% trắng, 28% vàng champagne, vài đốm bokeh xanh lam nhạt 6-10px (nhìn rõ ở giữa và dưới, 0.11% điểm ảnh sáng có ánh lam). Hạt 1-4px, dày hơn ở dải giữa và một phần ba dưới, có vài hạt sao nhỏ.

**Hoa.** Khoảng 20 bông tròn kiểu cỏ ba lá / thrift, hồng phấn (#E8B9C0 đến #D9A3AE), mỗi bông khoảng 2-3% bề ngang, phần lớn ở giữa và nửa dưới, bị sương làm nhạt; 0.9% điểm ảnh có sắc hồng.

**Sương.** Lớp sữa trắng phủ đều, dày nhất ở giữa trên và dưới cùng, mỏng hơn ở các dải bóng chéo.

**Chất ảnh.** Mềm, hơi nhoè, có hạt nhẹ, mơ màng.

**So với nền cũ (bg-meadow.webp ở 500e5c2).** Nền cũ tối và ấm hơn hẳn: sáng trung bình 83%, chỉ 47.8% điểm ảnh trên 85%, bão hoà 12.6%, R-B +26.7 (vàng), 257 hạt/10k gần như toàn vàng, có tia nắng và đường chân trời mờ, vệt cỏ hướng ngược (-36 độ), độ nét 19. Điểm khác biệt tổng so với mẫu: 124.

## 2. Ứng viên

Điểm = khoảng cách màu lưới + histogram/4 + mật độ lấp lánh + chênh tỉ lệ high-key + chênh bão hoà + chênh hướng (thấp là giống).

| Ứng viên | Cách tạo | Điểm | Ghi chú |
|---|---|---|---|
| a1-a6 | Gemini tạo từ mô tả chữ (vòng đầu, trước khi được dùng ảnh mẫu) | 87-142 | Cỏ đẹp nhưng tối và tương phản hơn nhiều, bố cục khác; loại |
| e1 | Gemini edit ảnh mẫu | 20.5 | Còn sót hoa văn góc trên trái và chữ sweet home; loại |
| e2, e4 | Gemini edit ảnh mẫu | 18.2 / 17.8 | Sạch nhưng giữ lề trắng, hướng lệch 7 độ; loại |
| **e3** | Gemini edit ảnh mẫu (gemini-3.1-flash-image) | **4.7** | Sạch, tràn viền, hướng 22 độ; chọn |

Prompt chọn (edit): xoá toàn bộ chữ, khung chấm bốn góc và hai bên, dấu cắt, bướm chấm và lề trắng; tái tạo phần cỏ bị che; giữ nguyên bố cục, màu, sương, hạt.

Nền chọn sau khi lưu (bg-meadow.webp 1080x1920, q78, 39 KB): sáng 89.8%, high-key 80.7%, bão hoà 3.8%, R-B +8.6, 67 hạt/10k, hướng 22 độ, điểm 5.0 (cũ 124).
Bản ngang bg-meadow-wide.webp (1920x1080, q76, 53 KB) là Gemini edit nới ngang từ e3, dặn không có bóng dọc; hai bản đầu có bóng dọc giống người nên loại.

## 3. Hoa văn, bướm, chữ

- Hoa văn tách từ ảnh mẫu bằng khoá độ sáng: nền ước lượng = max cục bộ r7 rồi làm mượt; alpha = (nền - độ sáng) / (nền - lõi chấm), chỉ giữ chỗ có cấu trúc chấm. Ra orn-top.png, orn-bottom.png (dải trên, dưới, gồm cả dấu cắt), orn-side-l/r.png. Tổng 91 KB.
- Bướm: chữ che mất cánh dưới nên cho Gemini edit vùng bướm (xoá chữ, vẽ nối cánh theo đúng lưới chấm), rồi tách alpha như trên; orn-butterfly.png 28 KB.
- Chữ sống trong app: "sweet home" Ms Madi, "chào mừng về nhà" Corinthia (giống nét mảnh nghiêng của mẫu hơn Mea Culpa), "bạn" Noto Serif Display (bản variable, font-stretch 68%, hẹp như mẫu). Vị trí và cỡ chữ đặt theo toạ độ đo trên mẫu trong khung 9:16 (--rw).
- Lớp phủ sữa giảm từ .46-.6 xuống .08-.14 vì nền mới đã có sương sẵn; chữ câu hỏi vẫn tối trên nền sáng 85-95%.

Kết quả chụp màn chào 540x960 so với mẫu: sai khác tuyệt đối trung bình 5.9/255 theo lưới 6x8; ô lớn nhất (15-23) nằm ở khối chữ do khác font.
