# Homeletter (Thư Nhà)

**Stay close, wherever you are.** App kết nối gia đình sống xa nhau: ảnh mỗi ngày kiểu Locket, sổ ký ức bằng giọng kể của bố mẹ, lịch âm Việt Nam, và trợ lý AI "Thư" giúp nói những điều khó nói.

Nhóm người dùng đầu tiên: người Việt sống ở Hàn Quốc (du học sinh, người đi làm) và bố mẹ ở Việt Nam.

## Cấu trúc thư mục

| Thư mục | Nội dung |
|---|---|
| `mobile/` | App điện thoại (Expo / React Native, chạy cả iPhone và Android) |
| `functions/` | Máy chủ (Firebase Cloud Functions): giữ API key, gọi Claude |
| `branding/` | Logo (SVG), bảng nhận diện, script xuất icon |
| `docs/` | Tham khảo đối thủ, ghi chú sản phẩm |
| `founder/` | Phân tích mô hình kinh doanh (nhánh `founder-board-review`) |

## Chạy thử app trên điện thoại (không cần biết lập trình)

1. Cài [Node.js](https://nodejs.org) (bản 22) trên laptop.
2. Cài app **Expo Go** trên điện thoại (App Store hoặc Google Play).
3. Mở Terminal trong thư mục `mobile/` và chạy:
   ```bash
   npm install
   npx expo start
   ```
4. Quét mã QR hiện trên màn hình bằng camera (iPhone) hoặc bằng Expo Go (Android).

App chạy ngay bằng **dữ liệu mẫu** (gia đình chị Lan ở Seoul). Muốn xoá dữ liệu mẫu: vào avatar → *Đặt lại dữ liệu demo*.

Xem trên trình duyệt: `npx expo start --web`.

## Tính năng trong bản này

| Nhóm | Màn hình |
|---|---|
| Bắt đầu | Màn hình chào, giới thiệu 3 bước, đăng nhập số điện thoại + mã OTP, hồ sơ 3 bước (ngày sinh âm/dương), tạo nhà hoặc vào nhà bằng mã mời |
| Mỗi ngày | Trang chủ (dải avatar cả nhà, bộ đếm ngày xa nhà và ngày đến Tết, giờ ở nhà), chụp nhanh với nhãn "Ăn cơm chưa?", ảnh của cả nhà, trả lời bằng chữ hoặc giọng nói, nhắc nhẹ khi lâu chưa gọi về |
| Sổ ký ức | Theo chương, theo dòng đời, tìm kiếm, trang ký ức có giọng kể gốc, "nhớ khác đi" của người thân, hỏi tiếp, quyền riêng tư từng trang, clip câu chuyện, sách in dịp Tết |
| Thư (AI) | Kể chuyện, tâm sự riêng (luôn hỏi trước khi chuyển lời, có "nói khéo giúp"), cuộc gọi AI, câu hỏi người thân gửi, xử lý tình huống khẩn cấp |
| Lịch | Lịch tháng có ngày âm, sinh nhật âm, ngày giỗ, Tết, rằm; thêm ngày mới |
| Khác | Món của mẹ (kèm nguyên liệu thay thế ở Hàn), hộp thời gian, gia đình và cài đặt, chế độ bố mẹ (chữ to), gói Gia đình, xem trước widget, quyền riêng tư |

## Nối dịch vụ thật

| Việc | Cách làm |
|---|---|
| AI (Claude) | Tạo key tại console.anthropic.com → `firebase functions:secrets:set ANTHROPIC_API_KEY` → `cd functions && npm install && npm run deploy` → đặt `EXPO_PUBLIC_API_URL` trong `mobile/.env` (xem `.env.example`) |
| Giọng nói → chữ | Nối Google Cloud Speech-to-Text (vi-VN) hoặc FPT.AI ở đường dẫn `/transcribe` trong `functions/src/index.ts` |
| Đăng nhập, dữ liệu, ảnh | Firebase Auth (số điện thoại), Firestore, Storage. Hiện app lưu trên máy (`src/store/AppContext.tsx`) |
| Widget | Cần bản build riêng (không chạy trong Expo Go): WidgetKit (iOS), App Widget (Android) |
| Đưa lên mạng, cửa hàng | Xem [docs/deploy.md](docs/deploy.md): web demo qua Vercel, APK Android qua EAS, máy chủ AI qua Firebase |

**Không bao giờ đặt API key trong code app hay đẩy lên GitHub.**

## Kiểm tra

```bash
cd mobile
npm run typecheck      # kiểm tra kiểu dữ liệu
npm run test:lunar     # kiểm tra lịch âm (Tết 2024–2027, Tết 1985 lệch múi giờ, tháng nhuận)
```

## Logo

Ngôi nhà có thân là một phong thư, nắp thư khép lại bằng trái tim. Chạy lại: `node branding/build-logo.mjs` (cần Playwright).
