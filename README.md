# Bốp Bốp

Web app cho bộ tập phục hồi chức năng tay tại nhà: App người tập, Web theo dõi cho người nhà và chuyên viên, và trang giới thiệu sản phẩm.

Màu đặc trưng: **Cam Bốp `#FF6A1A`**. Chữ trên nền cam luôn là màu mực `#231A14`; chữ cam trên nền sáng dùng `#C2410C`.

## Mở ngay trên mạng

https://long539539.github.io/bopbop/

Bản trên GitHub Pages không có máy chủ, nên App và Web theo dõi chạy hoàn toàn trong trình duyệt (`static/local-api.js`): tài khoản, buổi tập, cảnh báo, đề xuất đều lưu trong trình duyệt đang mở. Mở App và Web theo dõi ở hai tab của cùng một trình duyệt thì thông báo sang nhau ngay. Muốn điện thoại và máy tính dùng chung dữ liệu thì chạy `server.py` như bên dưới.

Mỗi lần đẩy lên nhánh `main`, GitHub Actions tự đăng lại thư mục `static/` (xem `.github/workflows/pages.yml`).

## Chạy

Cần Python 3.8 trở lên, không phải cài thêm gói nào.

```bash
python bopbop/server.py
```

Mở http://localhost:8800

- `/` : trang giới thiệu
- `/app` : App người tập (dùng tốt trên điện thoại)
- `/web` : Web theo dõi

Dùng điện thoại cùng mạng Wi-Fi:

```bash
python bopbop/server.py --lan
```

Máy sẽ in ra địa chỉ dạng `http://192.168.x.x:8800/app` để mở trên điện thoại. Windows có thể hỏi cho phép Python qua tường lửa.

Dữ liệu lưu ở `%LOCALAPPDATA%\BopBop\bopbop.db`, nằm ngoài OneDrive để tránh xung đột đồng bộ. Đổi chỗ lưu bằng `--db duong_dan.db`.

## Dùng thử nhanh

1. Mở `/web`, tạo tài khoản chuyên viên, bấm "+ Thêm người tập", chọn chương trình Đột quỵ hoặc Chấn thương.
2. Mở `/app` bằng cùng tài khoản (hoặc tài khoản khác nhập mã mời), chọn người tập, bấm "Bắt đầu buổi tập".
3. Trong mỗi bài, bấm "Tự chạy mô phỏng" để trình diễn, hoặc tự tập bằng phím, chuột hay chạm.
4. Kết quả, cảnh báo và đề xuất hiện ngay trên Web theo dõi. Duyệt đề xuất thì mức tập bên App đổi ngay.

Chế độ trình diễn đang bật mặc định: mỗi bài 2 hiệp × 3 lần, nghỉ 5 giây. Tắt trong Web → Cài đặt để dùng liều thật: 2 hiệp × 10 lần, nghỉ 30 giây.

## Tài khoản và quyền

- Mỗi tài khoản chỉ thấy người tập của mình. Mọi yêu cầu tới người tập khác đều trả "Không tìm thấy".
- Người tạo hồ sơ chọn vai trò. Mỗi người tập có hai mã mời: mã người nhà và mã chuyên viên.
- Chỉ chuyên viên được duyệt đề xuất, đổi chương trình, mức tập và các khoá an toàn.

## Thao tác thay cho cảm biến (bản thử)

| Kiểu bài | Bàn phím | Chạm / chuột |
| --- | --- | --- |
| Bóp, kẹp, kéo, đẩy, Chim bay, Hái táo, thả lực | giữ phím cách | giữ nút hoặc giữ trên hình |
| Nâng tay, trượt tay, khuỷu, cổ tay, mở bàn tay | ↑ nâng, ↓ hạ | kéo lên xuống trên hình, hoặc nút ▲ ▼ |
| Xoay cẳng tay, Lái xe | ← sấp, → ngửa | kéo ngang, hoặc nút ◀ ▶ |
| Đi chợ | mũi tên di chuyển, phím cách nhặt/thả | kéo món đồ vào giỏ |

Mọi số đo trong bản thử là mô phỏng. Bản thật nhận tín hiệu từ lõi (HX711, ESP32, MPU6050) và camera điện thoại.

## Tệp

- `server.py` : máy chủ (SQLite, mật khẩu băm PBKDF2, phiên đăng nhập bằng cookie HttpOnly, thông báo trực tiếp qua Server-Sent Events)
- `static/bb.js` : 9 bài × 3 mức, 2 chương trình, kiểm tra tuần, mô phỏng tay
- `static/play.js` : bộ chơi canvas cho bài tập, 7 trò chơi và kiểm tra tuần
- `static/app.js`, `static/web.js` : App người tập và Web theo dõi
- `static/local-api.js` : bản chạy trong trình duyệt, cùng địa chỉ `/api/...` và cùng luật với `server.py`, dùng khi không có máy chủ (GitHub Pages)
- `static/index.html`, `static/landing.css`, `static/hero-table.webp` : trang giới thiệu

Bản mẫu thử nghiệm: hỗ trợ tập luyện, không thay thế chỉ định của bác sĩ.
