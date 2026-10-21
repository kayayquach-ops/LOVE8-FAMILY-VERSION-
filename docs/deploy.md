# Đưa Homeletter lên mạng

Có 3 phần, làm độc lập với nhau.

## 1. Bản web demo: có link mở được trên điện thoại

### Cách A: GitHub Pages (đang dùng)

Link: **https://kayayquach-ops.github.io/LOVE8-FAMILY-VERSION-/**

- Lần đầu: vào repo trên GitHub → **Settings → Pages** → *Source*: **Deploy from a branch** → nhánh **`gh-pages`**, thư mục **`/ (root)`** → **Save**. Khoảng 1–2 phút sau link chạy.
- Cập nhật bản mới: `EXPO_BASE_URL=/LOVE8-FAMILY-VERSION- bash scripts/deploy-pages.sh`.
- Gói GitHub miễn phí chỉ cho Pages khi repo để **Public**. Muốn để Private thì dùng cách B.

### Cách B: Vercel (khoảng 5 phút, chạy được cả khi repo để Private)

1. Vào https://vercel.com, đăng nhập bằng tài khoản GitHub.
2. Bấm **Add New… → Project**, chọn repo `LOVE8-FAMILY-VERSION-`.
3. Ở **Root Directory**, chọn thư mục `mobile`. Các lệnh build đã có sẵn trong `mobile/vercel.json`, không cần sửa.
4. Ở **Branch**, chọn `app-mvp` (hoặc gộp nhánh này vào `main` trước).
5. Bấm **Deploy**. Xong sẽ có link dạng `homeletter-xxx.vercel.app`.

Mỗi lần đẩy code mới lên nhánh đó, Vercel tự cập nhật.

Lưu ý bản web: camera dùng ảnh minh hoạ, dữ liệu lưu riêng trên từng máy, chưa có widget.

## 2. App cài trên điện thoại

**Android (file APK, miễn phí):**
```bash
cd mobile
npx eas-cli login                                   # đăng nhập tài khoản Expo (miễn phí)
npx eas-cli build:configure                         # lần đầu: gắn app với tài khoản
npx eas-cli build --platform android --profile preview
```
Khoảng 15 phút sau sẽ có link tải APK, gửi cho cả nhà cài thử.

**iPhone:** cần tài khoản Apple Developer ($99/năm), rồi:
```bash
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios                   # đưa lên TestFlight để mời người thử
```
Chưa có tài khoản Apple thì dùng app **Expo Go** để chạy thử (xem README).

## 3. Máy chủ AI (để Thư trả lời bằng Claude thay vì kịch bản mẫu)

1. Tạo dự án Firebase tại https://console.firebase.google.com, bật gói **Blaze** (trả theo mức dùng, cần thẻ).
2. Tạo API key tại https://console.anthropic.com.
3. Trên laptop:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add                                # chọn dự án vừa tạo
   firebase functions:secrets:set ANTHROPIC_API_KEY  # dán key khi được hỏi, không dán vào chat hay code
   cd functions && npm install && npm run deploy
   ```
4. Lấy địa chỉ hàm `api` sau khi deploy (dạng `https://api-xxxx-du.a.run.app`), đặt vào:
   - `mobile/.env` → `EXPO_PUBLIC_API_URL=...` khi chạy trên máy;
   - Vercel → **Settings → Environment Variables** cho bản web;
   - EAS → `npx eas-cli env:create` cho bản cài trên điện thoại.
