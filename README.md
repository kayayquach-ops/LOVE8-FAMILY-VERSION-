# Homeletter

**Giúp gia đình hiểu nhau, rồi kéo mọi người lại gần nhau**, dù ở xa, khác thế hệ hay khác ngôn ngữ. Ảnh mỗi ngày kiểu Locket, chat chung của cả nhà, và trợ lý AI Homeletter gọi điện hỏi chuyện từng người để con hiểu bố mẹ hơn, bố mẹ hiểu con hơn.

**Bản demo trên web:** https://kayayquach-ops.github.io/LOVE8-FAMILY-VERSION-/ (mở bằng điện thoại cho giống app thật).

App làm cho mọi gia đình, nhiều ngôn ngữ (ra mắt với tiếng Việt, Hàn, Anh). Thị trường thử đầu tiên: Hàn Quốc, nơi có đủ gia đình đa văn hoá, du học sinh và người lao động nước ngoài, gia đình "bố ngỗng", người già sống một mình.

## Cấu trúc thư mục

| Thư mục | Nội dung |
|---|---|
| `mobile/` | App điện thoại (Expo / React Native, chạy cả iPhone và Android) |
| `functions/` | Máy chủ (Firebase Cloud Functions): giữ API key, gọi Claude |
| `branding/` | Logo (SVG), bảng nhận diện, script xuất icon |
| `docs/` | Tham khảo đối thủ, thiết kế ([docs/design.md](docs/design.md)), hướng dẫn đưa lên mạng |
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

App chạy ngay bằng **dữ liệu mẫu** (gia đình chị Lan ở Seoul). Mở app sẽ hỏi "Bạn là ai trong nhà?": chọn Mẹ, Bố, Con gái hoặc Con trai để xem app theo từng vai. Đổi vai hoặc xoá dữ liệu mẫu: bấm avatar → *Đổi vai* / *Đặt lại dữ liệu demo*.

Xem trên trình duyệt: `npx expo start --web`.

## Tính năng trong bản này

| Tab | Có gì |
|---|---|
| Bắt đầu | Một câu hỏi duy nhất: bạn là bố/mẹ hay con. App đổi lời theo vai ("Hiểu con mình hơn" / "Hiểu bố mẹ mình hơn"), bố mẹ được chữ to |
| Nhà | Mâm cơm chung (mỗi tối ai cũng chụp bữa cơm, ghép thành một mâm, đếm chuỗi ngày), "Hẹn nhau tuần này" (một việc nhỏ cho hai người), nhắc gửi ảnh xưa theo dịp, ảnh của cả nhà, widget |
| Chat | Chat chung, trả lời ảnh, tin thoại có chữ chép lại. **Lời chào buổi sáng**: ghi âm, hẹn 7:00 sáng mai theo giờ người nhận; đến giờ, người nhận mở app là tự phát. Thư tuần và video của Homeletter cũng gửi vào đây |
| Hiểu nhau | Mỗi người khác thế hệ một trang: lịch cuộc gọi của Homeletter, **lời gửi gắm** (nói rõ tên) và **câu hỏi giấu kín** (hỏi khéo, không nói ai hỏi), xem trước Homeletter sẽ hỏi gì và vì sao, điều đã hiểu về người đó (thích, lo, tự hào, mong, kỷ niệm), đố vui "Bạn hiểu mẹ đến đâu?" |
| Lịch | Lịch tháng có ngày âm, ngày lễ trong năm (mỗi ngày kèm một việc gắn kết), sinh nhật từng người, ngày cưới bố mẹ, cột mốc (vào học, đi du học, tốt nghiệp), dòng đời nhà mình |
| Cuộc gọi | Homeletter (luôn nói rõ là AI) gọi qua app: mở đầu bằng giọng thật của người nhà, hỏi dựa trên ảnh vừa gửi, lời gửi gắm, câu hỏi giấu kín, chuyện còn dở, chủ đề chưa ai hỏi. Cuối cuộc gọi người kể duyệt chia sẻ, rồi Homeletter nối máy cho người nhà nói chuyện trực tiếp |
| Kho nhà mình | Homeletter tuần này (đoạn giọng thật hay nhất, tóm tắt, điều mới hiểu, gợi ý việc nên làm, trả lời bằng giọng nói), video ghép từ ảnh xưa và giọng thật có phụ đề Việt, Hàn, Anh, xem cùng cả nhà qua gọi video |

Quy tắc: con dưới 18 tuổi không nhận câu hỏi giấu kín; hồ sơ "hiểu về" chỉ mở cho người khác thế hệ; video chỉ ghép từ ảnh thật và giọng thật, không tạo giọng giả. Xem thêm [docs/product.md](docs/product.md).

## Nối dịch vụ thật

| Việc | Cách làm |
|---|---|
| AI (Claude) | Tạo key tại console.anthropic.com → `firebase functions:secrets:set ANTHROPIC_API_KEY` → `cd functions && npm install && npm run deploy` → đặt `EXPO_PUBLIC_API_URL` trong `mobile/.env` (xem `.env.example`) |
| Giọng nói → chữ | Nối Google Cloud Speech-to-Text (vi-VN) hoặc FPT.AI ở đường dẫn `/transcribe` trong `functions/src/index.ts` |
| Đăng nhập, dữ liệu, ảnh | Firebase Auth (số điện thoại), Firestore, Storage. Hiện app lưu trên máy (`src/store/AppContext.tsx`) |
| Widget | Cần bản build riêng (không chạy trong Expo Go): WidgetKit (iOS), App Widget (Android) |
| Đưa lên mạng, cửa hàng | Xem [docs/deploy.md](docs/deploy.md): web demo qua GitHub Pages hoặc Vercel, APK Android qua EAS, máy chủ AI qua Firebase |

**Không bao giờ đặt API key trong code app hay đẩy lên GitHub.**

## Kiểm tra

```bash
cd mobile
npm run typecheck      # kiểm tra kiểu dữ liệu
npm run test:lunar     # kiểm tra lịch âm (Tết 2024–2027, Tết 1985 lệch múi giờ, tháng nhuận)
```

## Font và icon

Font chữ và icon đã được cắt gọn để bản web mở nhanh (chỉ giữ chữ Latin, tiếng Việt và những icon đang dùng). Dùng thêm icon Ionicons mới thì chạy `npm run fonts` trong `mobile/` (cần `pip install fonttools brotli`); nếu quên, `npm run typecheck` sẽ báo tên icon không hợp lệ.

## Logo

Ngôi nhà có thân là một phong thư, nắp thư khép lại bằng trái tim. Chạy lại: `node branding/build-logo.mjs` (cần Playwright).
