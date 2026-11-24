# Trang giới thiệu Sweet Home

Trang tĩnh, không cần build. Mọi thứ đăng lên nằm trong `site/`.

## Sửa chữ

- Chữ nằm hết trong `site/index.html`. Mỗi câu có ba bản đứng cạnh nhau: `class="vi"`, `class="ko"`, `class="en"`. Sửa câu nào thì sửa cả ba.
- Tiêu đề tab, mô tả cho Google và tiêu đề thư hợp tác của từng tiếng nằm ở `TEXT` trong `site/main.js`.
- Email hợp tác chỉ có một chỗ: dòng `var EMAIL = ...` đầu `site/main.js`.
- Sửa hay thêm chữ tiếng Hàn xong thì chạy `python tools/fonts.py` (cần `pip install fonttools brotli`) để font Hàn có đủ chữ mới. Chưa chạy thì chữ thiếu vẫn hiện bằng font của máy.
- Xem thử trên máy: `python -m http.server 8000 --directory site` rồi mở http://localhost:8000 (thêm `?lang=ko` hay `?lang=en`).

## Đăng

Chạy từ thư mục `LOVE8/app` (đã railway link vào project homeletter):

```
railway up ../landing --path-as-root --service web --ci
```

Railway đọc `Dockerfile` (Caddy, cổng `$PORT`). `/pitching` chuyển sang https://pitch.getsweethome.app/ và giữ `?lang=ko`. Ảnh OG khai báo là `https://getsweethome.app/og.jpg`, đổi tên miền thì sửa các thẻ `og:` và `canonical` trong `index.html`.
