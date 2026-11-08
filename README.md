# Xuân An English

Web quản lý lớp tiếng Anh bằng **Next.js App Router + TypeScript**, backend Route Handlers, PostgreSQL. Yêu cầu Node.js 24 trở lên.

## Chạy dự án

```bash
npm install
cp .env.example .env.local
# Đổi ADMIN_PASSWORD trong .env.local thành mật khẩu riêng ít nhất 12 ký tự.
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
- Tạo lớp, thêm học viên/phụ huynh, tìm kiếm, lọc lớp.
- Tạo buổi học theo ngày, giờ, thời lượng, nội dung.
- Điểm danh: có mặt, đi trễ, vắng, vắng có phép. Nhận xét tập trung và BTVN mức 1–5, ghi chú và mẫu câu có thể chỉnh sửa.
- Tổng hợp tháng: số buổi, điểm trung bình, nhận xét, học phí, tiền đã đóng, còn thiếu hoặc dư. Xuất CSV đọc được tiếng Việt trong Excel.
- Giao bài, tải tài liệu tối đa 10 MB, xem bài nộp, gửi phản hồi.
- Cổng học viên theo liên kết riêng: xem bài, tải tài liệu, nộp câu trả lời/tệp, xem phản hồi. Lấy liên kết tại Lớp & học viên. Ai có liên kết có thể truy cập dữ liệu bài tập của học viên đó; giữ riêng và chỉ chia sẻ với học viên/phụ huynh tương ứng.
- Phiên đăng nhập giáo viên có chữ ký, cookie HttpOnly, hết hạn sau 24 giờ. Kiểm tra origin khi ghi dữ liệu, kiểm tra quyền khi tải tệp.

## Dữ liệu và quy tắc

Dữ liệu lớp và học viên nằm trong PostgreSQL. Tệp tải lên nằm trong `DATA_DIR/uploads`; gắn volume bền vững vào `DATA_DIR` khi triển khai trên Coolify. `SESSION_SECRET` phải được đặt cố định trong production để phiên đăng nhập tồn tại qua các lần triển khai. Sao lưu cả PostgreSQL và thư mục tệp tải lên. Cơ sở dữ liệu tự tạo bảng khi ứng dụng kết nối lần đầu.

Học phí tháng = số buổi có mặt hoặc đi trễ đã điểm danh × đơn giá **hiện tại** của lớp. Buổi vắng/chưa điểm danh không tính tiền. Đây là mô hình thu theo buổi, chưa bao gồm học bù, ưu đãi, hóa đơn, VAT hoặc học phí cố định tháng. Số đã đóng là tổng lũy kế do giáo viên cập nhật, chưa phải sổ giao dịch thanh toán. Điểm trung bình chỉ lấy các buổi có mặt/đi trễ. Hạn nộp để nhắc lịch, vẫn cho nộp trễ. Cập nhật bài nộp sẽ xóa phản hồi cũ để giáo viên chấm lại.

## Phạm vi bản đầu

Dùng cho một giáo viên. Chưa có tài khoản nhiều giáo viên, đăng nhập riêng cho học viên, sửa/xóa hồ sơ, sửa/xóa lịch, học bù, lịch lặp, email/SMS hay thanh toán trực tuyến. Tệp tải xuống ở dạng attachment; PDF, DOCX, JPG, PNG, WebP, MP3, WAV, TXT được hỗ trợ. Chưa có quét virus hoặc tự dọn tệp chưa gắn vào bài.

Trên Coolify, dùng `Dockerfile`, port 3000, URL PostgreSQL nội bộ, và volume `/app/data` cho tệp tải lên. Đặt `FRONTEND_ORIGIN=https://xuan-an-english.vercel.app` để chấp nhận yêu cầu ghi từ giao diện. Coolify cung cấp API và lưu tệp qua HTTPS; giao diện Vercel chuyển tiếp `/api/*` đến API này. URL API trong `vercel.json` cần được cập nhật nếu tên miền backend thay đổi. Giao diện tải font Google khi có internet, có font hệ thống dự phòng.
