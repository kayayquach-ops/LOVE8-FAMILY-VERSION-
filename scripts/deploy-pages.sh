#!/usr/bin/env bash
# Đưa bản web demo lên GitHub Pages: build app trong mobile/ rồi đẩy kết quả lên nhánh gh-pages.
# Chạy từ bất kỳ đâu trong repo:  bash scripts/deploy-pages.sh
# Link sau khi xong: https://<chủ repo>.github.io/<tên repo>/
# Tên repo lấy từ địa chỉ origin; nếu sai hoa thường thì đặt EXPO_BASE_URL=/Ten-Repo trước lệnh.
# Các tham số thêm (nếu có) được chuyển cho git commit, ví dụ: -m "ghi chú".
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
remote="$(git -C "$root" remote get-url origin)"
base="${EXPO_BASE_URL:-/$(basename -s .git "$remote")}"
owner="$(sed -E 's#.*[:/]([^/]+)/[^/]+$#\1#' <<<"$remote" | tr '[:upper:]' '[:lower:]')"
source_rev="$(git -C "$root" rev-parse --short HEAD)"
site="$(mktemp -d)/site"

cd "$root/mobile"
EXPO_BASE_URL="$base" npx expo export --platform web --output-dir "$site"

# Tải trước font và mã của màn hình đầu, để điện thoại không phải tải nối đuôi nhau.
node "$root/scripts/preload-web.mjs" "$site"

# GitHub Pages trả 404.html cho đường dẫn không có file (như /home); app tự mở đúng màn hình từ đó.
cp "$site/index.html" "$site/404.html"
# Không cho GitHub chạy Jekyll, nếu không thư mục _expo sẽ bị bỏ qua.
touch "$site/.nojekyll"

cd "$site"
git init -q -b gh-pages
git remote add origin "$remote"
git add -A
git commit -q -m "Deploy web demo from $source_rev" "$@"
git push -f -u origin gh-pages

echo "Đã đẩy lên gh-pages. Link: https://${owner}.github.io${base}/"
