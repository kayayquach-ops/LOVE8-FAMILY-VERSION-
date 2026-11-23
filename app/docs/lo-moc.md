# Mốc của lọ sao nhà mình (23/11/2026)

Lọ không có trần (từ 22/11), nhưng có mốc để cả nhà có đích nhỏ. Chạm mốc thì có thể nhận một ưu đãi nhỏ của nhãn hàng trong mục Ưu đãi (`uu-dai.md`). Trong app chỉ thể hiện nhẹ: một dòng chữ và một thẻ, không thanh tiến độ, không pop-up.

## Mốc

- 40, 100, 200, 400, 700, 1000 sao: `JAR_MILESTONES` trong `src/shared.ts`, máy chủ và máy khách dùng chung. `scripts/coupons.mjs` giữ một bản sao, test so hai bản.
- Tính trên tổng sao cả nhà, đúng số lọ đang hiện: mỗi bài, mỗi trả lời bài, mỗi nhiệm vụ xong là một sao (`STARS_SQL` trong `server/missions.ts`).
- Qua mốc 1000 sao vẫn tăng, dòng chữ thành "nhà mình đã qua mốc 1000 sao".

## Trong lọ (`src/Jar.tsx`)

- Dưới số sao: "còn 12 sao tới mốc 40". Kho có ưu đãi cho mốc đó thì thêm hộp quà vẽ tay và "có quà nhỏ".
- Lần đầu mở lọ sau khi nhà chạm mốc: thẻ "Nhà mình chạm mốc 40 sao". Có ưu đãi cho mốc đó thì thêm "Có một ưu đãi nhỏ đang chờ trong mục Ưu đãi." và nút "Xem ưu đãi" (mở danh sách ưu đãi đè lên lọ, đóng là về lọ). Nút × ẩn thẻ.
- Mỗi mốc báo một lần cho mỗi người, ghi ở máy: `localStorage['hl-jar-moc:<mã người>']` là mốc cao nhất đã báo (không ghi được thì nhớ trong phiên). Giống sao rơi, tính theo từng máy: mở trên máy thứ hai hay sau khi xoá dữ liệu app thì thấy thẻ mốc cao nhất thêm một lần.
- Qua nhiều mốc một lúc (hay người cũ lần đầu có tính năng này) thì chỉ báo mốc cao nhất; có quà nếu một trong các mốc mới chạm có quà. Thẻ chỉ xét theo số máy chủ vừa trả, không theo bản lưu. Sao giảm (xoá bài, có người rời nhà) rồi tăng lại thì không báo lại mốc cũ.

## Nối với ưu đãi

- Bảng `brand_coupons` có cột `min_stars int not null default 0` (máy chủ tự thêm lúc khởi động bằng `add column if not exists`). 0 là ưu đãi thường; bằng một mốc là quà của mốc đó.
- `GET /api/coupons` chỉ trả ưu đãi có `min_stars` không quá tổng sao của nhà người xem; mỗi ưu đãi có thêm `milestone` (mốc, hoặc null). Ưu đãi mốc có nhãn nhỏ "Quà mốc 40 sao" trong mục Ưu đãi.
- `GET /api/jar` trả thêm `giftMilestones`: các mốc đang có ưu đãi dùng được (đang bật, còn hạn, đúng thứ tiếng người xem), kể cả mốc nhà chưa tới. Lọ chỉ nói tới quà theo danh sách này.
- Thêm quà mốc: `node scripts/coupons.mjs add ... --stars 40` (chỉ nhận một mốc trong danh sách). Tắt hay hết hạn thì lọ thôi nói "có quà nhỏ" cho mốc đó.

## Quy tắc: không hứa quà khi kho chưa có

- App chỉ nói "có quà nhỏ", "ưu đãi đang chờ" khi kho thật sự có ưu đãi dùng được cho đúng mốc đó. Không có thì chỉ nói mốc, thẻ chạm mốc chỉ một dòng.
- Bản thật chưa có đối tác nên chưa có quà mốc nào: người dùng chỉ thấy "còn N sao tới mốc M" và "Nhà mình chạm mốc M sao".
- Chỉ thêm quà mốc khi đã hợp tác thật với nhãn hàng; không ghi tên nhãn hàng thật vào code, dữ liệu mẫu hay bản thật khi chưa hợp tác (`uu-dai.md`).

## Ảnh (`docs/lo-moc/`)

Chụp 23/11/2026 trên máy với Postgres local, 393x793 @2x, nhà thử và ưu đãi tên tự đặt (đã xoá khỏi DB sau khi chụp). Bản `deck-*.jpg` 786x1704 có thanh trạng thái iOS.
- `lo-28.png`, `deck-lo-28.jpg`: lọ 28 sao, "còn 12 sao tới mốc 40 · có quà nhỏ".
- `lo-cham-40.png`, `deck-lo-cham-40.jpg`: vừa chạm 40, thẻ báo mốc có ưu đãi.
- `lo-cham-40-chua-co-qua.png`: chạm 40 khi kho không có quà mốc (như bản thật hiện nay).
- `uu-dai-moc.png`, `deck-uu-dai-moc.jpg`: mục Ưu đãi, ưu đãi có nhãn "Quà mốc 40 sao".

Test: `server/coupons.test.ts` (lọc theo sao, mốc có quà, bản sao mốc trong script), `src/jarMilestones.test.ts` (mốc kế tiếp, thẻ chạm mốc), `server/missions.test.ts` (lọ trả `giftMilestones`).
