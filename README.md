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
- Thời khóa biểu theo ngày/tuần, lọc theo lớp. Tạo buổi đơn lẻ hoặc lịch cố định nhiều thứ mỗi tuần đến ngày kết thúc (tối đa 365 ngày sau ngày bắt đầu); bỏ qua ngày nghỉ và xem trước số buổi trước khi lưu.
- Kiểm tra trùng giờ giữa mọi lớp của một giáo viên khi tạo, dời và khôi phục lịch. Lưu cả chuỗi trong một giao dịch; nếu có xung đột thì không tạo/cập nhật dở dang. Buổi liền kề được phép, buổi kết thúc qua ngày hôm sau không được phép.
- Sửa, hủy kèm lý do, khôi phục hoặc xóa một buổi; sửa/hủy/xóa các buổi tiếp theo trong chuỗi. Buổi đã điểm danh được bảo vệ, buổi đã hủy không tính vào tổng số buổi và học phí.
- Điểm danh: có mặt, đi trễ, vắng, vắng có phép. Nhận xét tập trung và BTVN mức 1–5, ghi chú và mẫu câu có thể chỉnh sửa.
- Tổng hợp tháng: số buổi, điểm trung bình, nhận xét, học phí, tiền đã đóng, còn thiếu hoặc dư. Xuất CSV đọc được tiếng Việt trong Excel. Phụ huynh xem tổng kết tháng & mã chuyển khoản VietQR ngay trong cổng học viên.
- Giao/sửa/xóa bài tập, tải tài liệu tối đa 10 MB, tạo câu hỏi trắc nghiệm tự chấm, chấm điểm/trạng thái (`Đã chấm` / `Cần sửa lại`), gửi phản hồi và tự động dọn tệp thừa.
- Cổng học viên dạng **PWA di động** tại `/student` (đăng nhập tài khoản riêng trên mọi thiết bị) và `/student/[token]` (liên kết riêng): làm bài trắc nghiệm, ghi âm giọng nói trực tiếp, đính kèm nhiều ảnh/tệp, xem phản hồi, lịch học và quản lý thiết bị nhận thông báo.
- **PWA & Web Push thông báo trên điện thoại**: cài đặt ra màn hình chính (nút cài trực tiếp trên Android và hướng dẫn chi tiết cho iOS Safari), tự động gửi thông báo khi giao bài, chấm bài, nhắc thủ công hoặc nhắc hạn tự động qua `/api/cron/reminders`.
- Phiên đăng nhập giáo viên và học viên có chữ ký, cookie HttpOnly. Kiểm tra origin khi ghi dữ liệu, kiểm tra quyền khi tải tệp.

## Lịch học cố định

Vào **Thời khóa biểu → Thêm buổi học → Cố định hằng tuần**, chọn lớp, ngày bắt đầu, các thứ trong tuần, giờ/thời lượng và ngày kết thúc. Có nút chọn nhanh 4/8/12/24/52 tuần. Thêm từng ngày nghỉ để loại khỏi lịch; phần xem trước hiển thị số buổi và cảnh báo trùng giờ. Ngày bắt đầu/kết thúc đều được tính nếu trùng thứ đã chọn. Hệ thống tạo sẵn các buổi đến ngày kết thúc, chưa tự gia hạn vô thời hạn.

Chọn **Quản lý** ở một buổi để sửa hoặc nghỉ học. Phạm vi **Buổi này và các buổi tiếp theo trong chuỗi** chỉ áp dụng những buổi từ mốc đã chọn, không trước hôm nay, chưa điểm danh và chưa hủy. Đổi ngày sẽ dời tất cả buổi trong phạm vi cùng số ngày; lớp, giờ, thời lượng và nội dung mới áp dụng cho toàn bộ phạm vi. Hủy lịch lưu lý do để học viên xem; khôi phục kiểm tra trùng giờ lại. Xóa vĩnh viễn có bước xác nhận và không cho xóa buổi đã điểm danh. Các buổi lặp đã tạo bằng phiên bản cũ vẫn giữ nguyên dữ liệu nhưng chưa có mã chuỗi, nên tiếp tục quản lý từng buổi.

Cổng học viên hiển thị 90 ngày sắp tới và 30 ngày gần đây, ưu tiên buổi sắp tới theo thứ tự ngày/giờ; hiển thị rõ buổi đã hủy và lý do. Lịch dùng giờ Việt Nam. Các cột trạng thái và mã chuỗi được bổ sung tự động vào PostgreSQL khi ứng dụng kết nối, không cần xóa dữ liệu cũ.

## Kiểm chứng

`npm test` kiểm tra lịch lặp, năm nhuận, ngày nghỉ, trùng giờ, phạm vi chuỗi và học phí. Để kiểm tra HTTP thực tế sau `FRONTEND_BACKEND=1 npm run build`, đặt `TEST_DATABASE_URL` trỏ đến **PostgreSQL thử nghiệm mới, rỗng**, tên database kết thúc bằng `_test`, rồi chạy `npm run test:integration`. Bộ kiểm tra tạo dữ liệu demo riêng và kiểm tra thêm giao dịch lịch, hai yêu cầu đặt lịch đồng thời, hủy/khôi phục, bảo vệ điểm danh và lịch của học viên. Không dùng database đang lưu dữ liệu thật.

## Dữ liệu và quy tắc

Dữ liệu lớp và học viên nằm trong PostgreSQL. Tệp tải lên nằm trong `DATA_DIR/uploads`; gắn volume bền vững vào `DATA_DIR` khi triển khai trên Coolify. `SESSION_SECRET` phải được đặt cố định trong production để phiên đăng nhập tồn tại qua các lần triển khai. Khóa VAPID cho Web Push có thể cấu hình qua `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` hoặc tự động sinh và lưu bền vững trong PostgreSQL. Sao lưu cả PostgreSQL và thư mục tệp tải lên. Cơ sở dữ liệu tự tạo bảng khi ứng dụng kết nối lần đầu.

Học phí tháng = số buổi có mặt hoặc đi trễ đã điểm danh × đơn giá **hiện tại** của lớp. Buổi vắng/chưa điểm danh không tính tiền. Đây là mô hình thu theo buổi, chưa bao gồm học bù, ưu đãi, hóa đơn, VAT hoặc học phí cố định tháng. Số đã đóng là tổng lũy kế do giáo viên cập nhật, chưa phải sổ giao dịch thanh toán. Điểm trung bình chỉ lấy các buổi có mặt/đi trễ. Hạn nộp để nhắc lịch, vẫn cho nộp trễ. Cập nhật bài nộp sẽ xóa phản hồi cũ để giáo viên chấm lại.

## Phạm vi bản đầu

Dùng cho một giáo viên và tài khoản học viên do giáo viên cấp/quản lý. Chưa có tài khoản nhiều giáo viên, email/SMS hay thanh toán trực tuyến tích hợp (hỗ trợ hiển thị mã VietQR chuyển khoản). Hỗ trợ PDF, DOCX, JPG, PNG, WebP, MP3, WAV, M4A, WEBM, OGG và TXT (ảnh/âm thanh có thể phát/xem inline với `?inline=1` có kiểm tra quyền; tệp còn lại tải ở dạng attachment). Tự động dọn tệp cũ khi cập nhật hoặc xóa bài tập/học viên; chưa tích hợp quét virus.

Trên Coolify, dùng `Dockerfile`, port 3000, URL PostgreSQL nội bộ, và volume `/app/data` cho tệp tải lên. Đặt `FRONTEND_ORIGIN=https://xuan-an-english.vercel.app` để chấp nhận yêu cầu ghi từ giao diện. Coolify cung cấp API và lưu tệp qua HTTPS; giao diện Vercel chuyển tiếp `/api/*` đến API này. URL API trong `vercel.json` cần được cập nhật nếu tên miền backend thay đổi. Giao diện tải font Google khi có internet, có font hệ thống dự phòng.

## Tài khoản và góc học tập học sinh

Học sinh vào `/student` trên tên miền của lớp. Cô mở **Lớp & học viên → Tài khoản**, đặt tên đăng nhập và mật khẩu (ít nhất 6 ký tự), bấm **Lưu tài khoản**, rồi **Sao chép thông tin đăng nhập**. Nút sao chép chỉ dùng thông tin đã lưu thành công; tên đăng nhập được chuẩn hóa về chữ không dấu. Học viên chỉ có tên đăng nhập nhưng chưa được đặt mật khẩu sẽ chưa đăng nhập được. Không có mật khẩu chung cho học viên thật và chưa có chức năng tự đăng ký.

Sau khi đăng nhập, học sinh có thể:

- Xem tiến độ nộp bài, bài đến hạn hôm nay, bài quá hạn/cần sửa và buổi học đang diễn ra hoặc sắp tới (bỏ qua lịch đã hủy).
- Tìm bài theo tên, nội dung, nhận xét; tìm không dấu; lọc bài cần làm/quá hạn/cần sửa/đã nộp/đã nhận xét và sắp xếp theo việc cần làm trước hoặc bài mới nhất.
- Tự lưu câu trả lời và đáp án trắc nghiệm thành bản nháp trên trình duyệt hiện tại. Nháp tách theo học sinh và bài tập, khôi phục khi chuyển mục/tải lại trang, xóa sau khi nộp thành công; bản nháp cũ không ghi đè bài đã nộp mới hơn trên thiết bị khác. Đổi câu hỏi sẽ bỏ các lựa chọn cũ nhưng giữ phần trả lời viết.
- Theo dõi số câu trắc nghiệm đã trả lời; nộp/cập nhật bài viết, ảnh, tệp và ghi âm; xem điểm, lời nhận xét, lịch học, học phí và thông báo như trước.
- Đổi mật khẩu trong **Tài khoản → Đổi mật khẩu tài khoản**, hoặc nhờ cô đặt lại nếu quên. Đổi/đặt lại mật khẩu làm hết hiệu lực các phiên đăng nhập cũ; liên kết riêng `/student/[token]` vẫn là cách truy cập riêng biệt hiện có.

Nháp chỉ lưu câu trả lời và lựa chọn trắc nghiệm trên thiết bị này, chưa gửi cho cô và chưa đồng bộ giữa các thiết bị. Ảnh, tệp và ghi âm mới cần nộp trước khi chuyển mục/rời trang; mỗi bài tối đa 6 tệp, 10 MB/tệp. Nút **Xóa nháp** bỏ phần đang soạn và trở về bài đã nộp (nếu có). Nút cập nhật trên thanh đầu trang tải lại bài tập/nhận xét mới nhất. Trang đăng nhập có mục hướng dẫn lấy tài khoản và quên mật khẩu.

## Đồng bộ giao diện và backend

Khi cập nhật chức năng, triển khai backend Coolify và giao diện Vercel từ cùng mã nguồn, backend trước. Các yêu cầu `/api/*` trên trang Vercel được chuyển tới Coolify nên tính năng mới như `action: "notify"` cần có trong backend đang chạy. Schema cũ chỉ biết các thao tác lớp/học viên/buổi học/bài tập sẽ trả lỗi chung `Dữ liệu chưa hợp lệ` khi nhận yêu cầu gửi thông báo, kể cả khi tiêu đề, nội dung và mã bài tập đều đúng.

API hiện tại trả header `X-XuanAn-API-Version: 2` trên `/api/manage`, kể cả phản hồi 401 khi chưa đăng nhập. Có thể kiểm tra phiên bản bằng GET mà không gửi thông báo cho học viên:

```bash
curl -sS -D - -o /dev/null https://api-xuanan.163.61.72.199.nip.io/api/manage
curl -sS -D - -o /dev/null https://xuan-an-english.vercel.app/api/manage
```

Sau khi cập nhật cả hai môi trường, cả hai địa chỉ cần trả header phiên bản `2`. Lỗi kiểm tra dữ liệu có `code` (`INVALID_INPUT` hoặc `UNSUPPORTED_ACTION`) và `issues` chỉ rõ trường bị từ chối. Với backend cũ còn trả lỗi chung cho một yêu cầu thông báo hợp lệ, giao diện sẽ hướng dẫn đồng bộ phiên bản. Tiêu đề nhắc bài tự động được rút gọn tối đa 120 ký tự; bài đã quá hạn vẫn được nhắc và chỉ học viên của lớp chưa nộp bài nhận thông báo.
