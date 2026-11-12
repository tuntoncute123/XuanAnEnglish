# Xuân An English

Web quản lý lớp tiếng Anh bằng **Next.js App Router + TypeScript**, backend Route Handlers, PostgreSQL. Yêu cầu Node.js 24 trở lên.

## Chạy dự án

```bash
npm install
cp .env.example .env.local
# Đổi ADMIN_PASSWORD trong .env.local thành mật khẩu riêng ít nhất 10 ký tự.
npm run dev
```

Cấu hình `DATABASE_URL` trỏ đến PostgreSQL riêng. Đặt `SEED_DEMO_DATA=true` nếu muốn tạo dữ liệu minh họa ở môi trường phát triển. Production để trống để bắt đầu với dữ liệu thật.

Mở http://localhost:3000 và đăng nhập bằng mật khẩu đã cấu hình. Không có mật khẩu mặc định. Dữ liệu minh họa (3 lớp, 9 học viên, 7 buổi học và 1 bài tập) chỉ được tạo khi `SEED_DEMO_DATA=true`; không phải dữ liệu học viên thật.

```bash
npm run typecheck
npm test
npm run build
npm start
```

## Chức năng

- Tổng quan lớp, học viên, lịch hôm nay và bài tập.
- Tạo, sửa, xóa lớp; thêm, sửa, chuyển lớp, xóa học viên và quản lý tài khoản đăng nhập riêng.
- Tạo buổi học (đơn lẻ hoặc lặp hàng tuần), sửa/xóa lịch học.
- Điểm danh: có mặt, đi trễ, vắng, vắng có phép. Nhận xét tập trung và BTVN mức 1–5, ghi chú và mẫu câu có thể chỉnh sửa.
- Tổng hợp tháng: số buổi, điểm trung bình, nhận xét, học phí, tiền đã đóng, còn thiếu hoặc dư. Xuất CSV đọc được tiếng Việt trong Excel. Phụ huynh xem tổng kết tháng & mã chuyển khoản VietQR ngay trong cổng học viên.
- Giao/sửa/xóa bài tập, tải tài liệu tối đa 10 MB, tạo câu hỏi trắc nghiệm tự chấm, chấm điểm/trạng thái (`Đã chấm` / `Cần sửa lại`), gửi phản hồi và tự động dọn tệp thừa.
- Cổng học viên dạng **PWA di động** tại `/student` (đăng nhập tài khoản riêng trên mọi thiết bị) và `/student/[token]` (liên kết riêng): làm bài trắc nghiệm, ghi âm giọng nói trực tiếp, đính kèm nhiều ảnh/tệp, xem phản hồi, lịch học và quản lý thiết bị nhận thông báo.
- **PWA & Web Push thông báo trên điện thoại**: cài đặt ra màn hình chính (nút cài trực tiếp trên Android và hướng dẫn chi tiết cho iOS Safari), tự động gửi thông báo khi giao bài, chấm bài, nhắc thủ công hoặc nhắc hạn tự động qua `/api/cron/reminders`.
- Phiên đăng nhập giáo viên và học viên có chữ ký, cookie HttpOnly. Kiểm tra origin khi ghi dữ liệu, kiểm tra quyền khi tải tệp.

## Dữ liệu và quy tắc

Dữ liệu lớp và học viên nằm trong PostgreSQL. Tệp tải lên nằm trong `DATA_DIR/uploads`; gắn volume bền vững vào `DATA_DIR` khi triển khai trên Coolify. `SESSION_SECRET` phải được đặt cố định trong production để phiên đăng nhập tồn tại qua các lần triển khai. Khóa VAPID cho Web Push có thể cấu hình qua `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` hoặc tự động sinh và lưu bền vững trong PostgreSQL. Sao lưu cả PostgreSQL và thư mục tệp tải lên. Cơ sở dữ liệu tự tạo bảng khi ứng dụng kết nối lần đầu.

Học phí tháng = số buổi có mặt hoặc đi trễ đã điểm danh × đơn giá **hiện tại** của lớp. Buổi vắng/chưa điểm danh không tính tiền. Đây là mô hình thu theo buổi, chưa bao gồm học bù, ưu đãi, hóa đơn, VAT hoặc học phí cố định tháng. Số đã đóng là tổng lũy kế do giáo viên cập nhật, chưa phải sổ giao dịch thanh toán. Điểm trung bình chỉ lấy các buổi có mặt/đi trễ. Hạn nộp để nhắc lịch, vẫn cho nộp trễ. Cập nhật bài nộp sẽ xóa phản hồi cũ để giáo viên chấm lại.

## Phạm vi bản đầu

Dùng cho một giáo viên và tài khoản học viên do giáo viên cấp/quản lý. Chưa có tài khoản nhiều giáo viên, email/SMS hay thanh toán trực tuyến tích hợp (hỗ trợ hiển thị mã VietQR chuyển khoản). Hỗ trợ PDF, DOCX, JPG, PNG, WebP, MP3, WAV, M4A, WEBM, OGG và TXT (ảnh/âm thanh có thể phát/xem inline với `?inline=1` có kiểm tra quyền; tệp còn lại tải ở dạng attachment). Tự động dọn tệp cũ khi cập nhật hoặc xóa bài tập/học viên; chưa tích hợp quét virus.

Trên Coolify, dùng `Dockerfile`, port 3000, URL PostgreSQL nội bộ, và volume `/app/data` cho tệp tải lên. Đặt `FRONTEND_ORIGIN=https://xuan-an-english.vercel.app` để chấp nhận yêu cầu ghi từ giao diện. Coolify cung cấp API và lưu tệp qua HTTPS; giao diện Vercel chuyển tiếp `/api/*` đến API này. URL API trong `vercel.json` cần được cập nhật nếu tên miền backend thay đổi. Giao diện tải font Google khi có internet, có font hệ thống dự phòng.
