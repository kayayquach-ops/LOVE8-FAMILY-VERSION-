# Đăng nhập bằng Google

Mất máy hay cài lại app thì bấm "Tiếp tục với Google" ở màn chào là về đúng nhà. Chưa đặt `GOOGLE_CLIENT_ID` thì nút ẩn, app chạy như cũ (mã nhà, mã máy).

## Việc cần làm một lần: tạo OAuth client

Vào https://console.cloud.google.com bằng tài khoản Google của mình.

1. **Chọn hoặc tạo project**: thanh trên cùng, chọn project (ví dụ tạo mới tên `Sweet Home`).
2. **Màn hình đồng ý OAuth**: menu ☰ → **APIs & Services** → **OAuth consent screen** (giao diện mới gọi là **Google Auth Platform**), bấm **Get started**.
   - App name: `Sweet Home`. User support email: email của mình.
   - Audience: **External**.
   - Contact email: email của mình. Đồng ý điều khoản, **Create**.
   - Mục **Data Access**: không cần thêm gì (app chỉ xin `openid`, `email`, `profile`, là quyền cơ bản).
   - Mục **Audience**: bấm **Publish app** để chuyển sang **In production**. Để ở Testing thì chỉ những email trong danh sách "Test users" mới đăng nhập được.
   - Không tải logo lên thì không phải chờ Google duyệt.
3. **Tạo client**: **Clients** (hoặc **Credentials** → **Create credentials** → **OAuth client ID**).
   - Application type: **Web application**. Name: `Sweet Home web`.
   - **Authorized JavaScript origins**, thêm hai dòng:
     - `https://homeletter-production.up.railway.app`
     - `http://localhost:5180`
   - **Authorized redirect URIs**, thêm hai dòng:
     - `https://homeletter-production.up.railway.app/api/google/callback`
     - `http://localhost:5180/api/google/callback`
   - **Create**. Chép **Client ID** (dạng `1234...-abc.apps.googleusercontent.com`). Không cần Client secret.
4. **Đặt biến môi trường**:
   - Railway: `railway variables --service homeletter --set GOOGLE_CLIENT_ID=<client id>` rồi deploy lại.
   - Máy mình: thêm dòng `GOOGLE_CLIENT_ID=<client id>` vào `app/.env`.
5. **Thử**: mở app ở máy chưa vào nhà, màn chào có nút "Tiếp tục với Google". Người đang dùng vào **Cài đặt** → **Tài khoản Google** → **Liên kết Google**.

Đổi tên miền hoặc chạy dev ở cổng khác thì thêm đúng origin và redirect URI mới vào client (sai một ký tự là Google báo `redirect_uri_mismatch`).

## Cách chạy

- **Đã liên kết**: Tiếp tục với Google → vào thẳng nhà của mình (máy chủ trả lại mã máy của người đó).
- **Chưa liên kết**: đi tiếp phần làm quen như cũ, tên điền sẵn từ Google; tạo nhà hoặc vào nhà xong thì tự liên kết.
- **Người đang dùng**: Cài đặt → Liên kết Google / Bỏ liên kết. Mỗi tài khoản Google chỉ nối với một người.

Máy chủ (`server/google.ts`, `server/googleVerify.ts`):
- Xác minh ID token: chữ ký RS256 theo khoá công khai JWKS của Google (nhớ đệm theo `Cache-Control`, Google xoay khoá thì tải lại), `aud` = `GOOGLE_CLIENT_ID`, `iss` là `accounts.google.com`, `exp`, `iat`, `nonce`. Email chỉ lưu khi `email_verified`. Khoá theo `sub` (cột `members.google_sub`, unique), không theo email.
- Không tin gì máy khách tự gửi: danh tính chỉ lấy từ token đã xác minh, lưu ở bảng `google_auth`; tạo nhà, vào nhà kèm `{google: {state, bind}}` thì máy chủ tự tra.
- Giới hạn theo IP mỗi 10 phút: bắt đầu 20 lần, nhận kết quả 60 lần, callback 30 lần; gửi sai `bind` 5 lần thì xoá phiên.

## Vì sao không dùng popup hay nút của Google (iPhone, app trên Màn hình chính)

App mở từ Màn hình chính iPhone chạy kiểu standalone. Ở chế độ này popup (`window.open`) mở ra một cửa sổ riêng không nói chuyện được với app (mất `window.opener`), nên luồng popup của Google Identity Services hay treo hoặc trắng trang. Chế độ redirect của GIS thì phụ thuộc thêm script của Google, khung nút trong iframe và cookie `g_csrf_token` phải đi kèm lượt POST từ accounts.google.com về (dễ rơi mất vì luật SameSite); và nếu iPhone mở trang Google ở cửa sổ khác thì kết quả về nhầm chỗ.

Nên app dùng OpenID Connect chuẩn của Google, chuyển cả trang, không popup, không cookie, không script ngoài:

1. App gọi `POST /api/google/start`. Máy chủ tạo `state`, `nonce` và `bind` (bí mật của máy, chỉ lưu bản băm), trả link Google. App giữ `state` + `bind` trong localStorage rồi chuyển cả trang sang Google (`response_type=id_token`, `response_mode=form_post`, `prompt=select_account`).
2. Google POST `id_token` + `state` về `/api/google/callback`. Máy chủ xác minh token rồi chuyển về `/?google=1`. Trên URL không có token hay mã gì.
3. App gọi `POST /api/google/finish` với `state` + `bind` để lấy kết quả (mã máy, hoặc "người mới").

Vì kết quả lấy bằng `bind` chỉ máy đã bấm mới có, nên chạy được cả khi iPhone mở trang Google trong trình duyệt nhỏ trong app hay sang hẳn Safari: quay lại app trên Màn hình chính là app tự hỏi máy chủ (khi app hiện lại); cửa sổ kia chỉ hiện câu "Xong rồi, bạn quay lại app Sweet Home nhé". Kẻ xấu ép máy người khác nhận phiên của họ cũng không được (sai `bind`), và đánh cắp `state` từ lịch sử trình duyệt cũng vô dụng.

Chưa thử trên iPhone thật với tài khoản Google thật: cần thử sau khi đặt `GOOGLE_CLIENT_ID` (app trên Màn hình chính và Safari thường).

## Chạy thử trên máy

- Test xác minh token (khoá RSA tự sinh, JWKS giả): `npm run test:google`.
- Trọn luồng với bộ giả, không cần tài khoản Google: `GOOGLE_FAKE=1 PORT=3086 npx tsx server/index.ts` rồi `node scripts/google-flow.mjs http://localhost:3086` (tạo vài nhà thử trên DB máy rồi xoá). Bộ giả (`server/googleFake.ts`) thay trang Google bằng một form, ký token bằng khoá tự sinh; bộ xác minh vẫn là thật. Trên Railway bộ giả luôn tắt.

## Biến môi trường

- `GOOGLE_CLIENT_ID`: bắt buộc để bật.
- `GOOGLE_REDIRECT_URI`: không bắt buộc; mặc định là `<origin của trang>/api/google/callback`.
- `GOOGLE_FAKE=1`: chỉ dùng trên máy để chạy thử.
