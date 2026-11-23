# Ưu đãi của nhãn hàng (22/11/2026)

Mục "Ưu đãi": coupon, mã giảm giá của nhãn hàng liên quan tới chăm sóc gia đình và bố mẹ (ghế massage, sức khoẻ, giao thuốc, thực phẩm chức năng, khám tại nhà). Lấy ý từ trang cá nhân của Olive Young: ô đếm "쿠폰 N", bấm vào ra danh sách, có băng rôn ưu đãi tháng này.

## Ở đâu trong app

- **Lối vào:** màn Cài đặt (nút thanh trượt ở góc Trang chủ), ngay dưới hồ sơ: ô "Ưu đãi" kèm số ưu đãi đang dùng được. Có ưu đãi thì thêm băng rôn vé nhỏ "Ưu đãi cho gia đình tháng này" (đổi từ "cho bố mẹ" ngày 24/11), nêu ưu đãi hết hạn sớm nhất. Chưa có thì ô hiện 0, không có băng rôn.
- **Danh sách:** mở đè lên Cài đặt, đóng là về lại Cài đặt. Mỗi ưu đãi là một thẻ vé xé (lỗ tròn hai bên, nét đứt): nhóm (hình vẽ tay), nhãn hàng, tiêu đề, mức giảm to có nét gạch tím, hạn dùng (còn 3 ngày trở xuống thì đổi màu), "Mở trang" nếu có link, mã và nút "Sao chép mã" (báo "Đã chép mã"). Có từ hai nhóm thì có hàng lọc theo nhóm. Ưu đãi chỉ cho gói gia đình có nhãn "Gói gia đình"; app chưa có thanh toán nên ai cũng xem và dùng được.
- **Chưa có ưu đãi:** một câu chờ "Ưu đãi từ nhãn hàng chăm sóc bố mẹ sẽ có ở đây." và chữ tay "sắp có".
- Code: `src/Coupons.tsx` (+ `coupons.css`), lối vào trong `src/Settings.tsx`, hình vẽ nhóm trong `src/ui.tsx` (`ticket`, `chair`, `pulse`, `pill`, `bottle`, `homecare`), kiểu dữ liệu `Coupon` trong `src/shared.ts`, chữ `coupons.*` trong `src/i18n/*.json`.

## Bảng `brand_coupons`

Máy chủ tạo lúc khởi động (`server/coupons.ts`, `migrateCoupons`). Không trỏ tới nhà hay người nào: mọi người đã đăng nhập thấy cùng một danh sách.

| cột | nghĩa |
|---|---|
| `id` | mã ngắn (script tự sinh 8 ký tự) |
| `brand` | tên nhãn hàng |
| `category` | `massage`, `health`, `pharmacy`, `supplement`, `homecare`, `other` (nhóm lạ app coi là `other`) |
| `title` | tiêu đề ưu đãi |
| `discount` | chữ ngắn hiện to: "-20%", "-100K", "0đ", "Tặng 1 hộp" |
| `code` | mã giảm giá, trống thì thẻ không có phần mã |
| `url` | link, chỉ http/https mới đưa ra app |
| `expires_at` | hạn dùng, trống là không hết hạn |
| `audience` | `all` hoặc `family` (gói gia đình, hiện chỉ gắn nhãn) |
| `lang` | `vi`, `en`, `ko`: chỉ người dùng app bằng thứ tiếng đó thấy; trống là mọi thứ tiếng |
| `active` | bật tắt |
| `created_at` | lúc thêm |

## API

`GET /api/coupons` (sau đăng nhập, chỉ đọc) trả `{ coupons: Coupon[] }`: chỉ ưu đãi đang bật, còn hạn, đúng thứ tiếng người xem (`x-lang`), hết hạn sớm nhất trước, không hạn sau cùng. Không có đường thêm, sửa, xoá. Lọc nằm ở hàm thuần `pickCoupons`, test ở `server/coupons.test.ts`.

## Thêm, tắt ưu đãi

Không có màn quản trị. Dùng `app/scripts/coupons.mjs` (hướng dẫn đầy đủ ở đầu file):

```bash
cd app
node scripts/coupons.mjs list
node scripts/coupons.mjs add --brand "Tên nhãn hàng" --category massage --title "Giảm cho bố mẹ khi mua ghế đầu tiên" \
  --discount "-20%" --code MA20 --url https://... --until 2026-12-31 --family --lang vi
node scripts/coupons.mjs off ID     # tắt (on ID để bật lại, delete ID để xoá hẳn)
```

Trên bản thật: `railway ssh --service homeletter -- node scripts/coupons.mjs list` (và các lệnh trên). `--until` là hết ngày đó theo giờ Việt Nam; app cũng hiện ngày hạn theo giờ Việt Nam. Hoặc SQL thẳng vào bảng `brand_coupons`.

## Quy tắc: không tên thật khi chưa có hợp tác

- Chỉ ghi tên nhãn hàng **thật** khi đã có hợp tác thật với nhãn hàng đó. Ghi tên thật khi chưa hợp tác là sai sự thật.
- Bản thật hiện **chưa có ưu đãi nào** (chưa có đối tác), nên người dùng thấy ô 0 và màn chờ.
- Dữ liệu thử, ảnh chụp chỉ dùng tên tự đặt, không trùng chuỗi cửa hàng có thật ở Việt Nam hay Hàn Quốc, và chỉ nạp vào DB trên máy. Không có dữ liệu mẫu nào trong code hay trên bản thật.

## Ảnh chụp (`docs/uu-dai/`)

Chụp 22/11/2026 trên máy với Postgres local, 393x852 @2x, 6 ưu đãi mẫu tên tự đặt mỗi thứ tiếng (đã xoá khỏi DB sau khi chụp):
- `a-loi-vao.png` lối vào có số (6) và băng rôn; `c-loi-vao-0.png` lối vào khi chưa có (0).
- `b-danh-sach.png` danh sách; `d-danh-sach-ko.png` bản tiếng Hàn.
- `c-trong.png` màn trống.
- `deck-loi-vao.jpg`, `deck-danh-sach.jpg`: 786x1704 có thanh trạng thái iOS, cho deck.
