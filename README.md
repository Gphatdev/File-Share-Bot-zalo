# Zalo Bot — HNNP STUDIO

Bot Zalo chạy bằng Node.js, đăng nhập qua QR, nhận lệnh trong nhóm hoặc tin nhắn riêng, có hệ thống thuê bot, quản lý nhóm, chống spam, trò chơi, hồ sơ người chơi, ngân hàng ảo và các tiện ích media.

> README này mô tả các module lệnh nằm trong `Core/Commands`. Tên lệnh, bí danh, cú pháp và quyền cần thiết có thể thay đổi theo phiên bản; dùng `help` hoặc `menu` trong Zalo để xem hướng dẫn do bot đang chạy cung cấp.

## Mục lục

- [Tổng quan chức năng](#tổng-quan-chức-năng)
- [Yêu cầu](#yêu-cầu)
- [Cài đặt và khởi động](#cài-đặt-và-khởi-động)
- [Cấu hình](#cấu-hình)
- [Quyền và cách gọi lệnh](#quyền-và-cách-gọi-lệnh)
- [Danh mục lệnh hiện có](#danh-mục-lệnh-hiện-có)
- [Chi tiết hệ thống thuê bot RENT](#chi-tiết-hệ-thống-thuê-bot-rent)
- [Dữ liệu và cấu trúc dự án](#dữ-liệu-và-cấu-trúc-dự-án)
- [Kiểm tra và xử lý sự cố](#kiểm-tra-và-xử-lý-sự-cố)
- [Bảo mật và sao lưu](#bảo-mật-và-sao-lưu)

## Tổng quan chức năng

- **Đăng nhập Zalo:** lần đầu hiển thị QR đăng nhập trực tiếp trong terminal; sau khi đăng nhập, bot lưu session để sử dụng lại.
- **Kết nối liên tục:** tự thử kết nối lại khi mạng hoặc listener gặp sự cố; có giao diện console và thông báo trạng thái.
- **Nhiều cấp quyền:** owner, admin bot, quản trị viên nhóm và thành viên được kiểm tra quyền theo từng lệnh.
- **Quản lý thuê bot:** kiểm tra hạn thuê, kích hoạt bằng KEY, báo cáo các box, trừ ngày, nhắc hạn, gửi email và tự rời box hết hạn theo cấu hình.
- **Quản lý nhóm và kiểm duyệt:** thông tin nhóm, chào/tạm biệt thành viên, kick/cảnh cáo, chống spam và giới hạn lệnh.
- **Giải trí và RPG:** hồ sơ người chơi, EXP, tu tiên, Pokémon, nông trại, câu cá, kho đồ, shop và nhiều trò chơi.
- **Tiện ích:** tải media, tìm nhạc, tạo QR, gửi danh thiếp, AI trò chuyện, ngân hàng ảo và các công cụ quản trị.
- **Dashboard cục bộ:** cung cấp trạng thái, thống kê và danh sách lệnh; mặc định chỉ lắng nghe trên máy chạy bot.
- **Lưu dữ liệu:** dùng cơ sở dữ liệu cho thông tin nhóm/người chơi/cấu hình; một số tính năng tạo thêm tệp dữ liệu riêng.

## Yêu cầu

- Node.js **20 trở lên**
- npm
- Kết nối Internet ổn định
- Tài khoản Zalo để đăng nhập và một máy có thể chạy bot liên tục
- Bot cần được cấp quyền quản trị nhóm nếu muốn dùng các chức năng như kick thành viên hoặc kiểm duyệt

Một số lệnh tích hợp bên ngoài (AI, tải media, tìm nhạc, QR ngân hàng...) phụ thuộc API, thư viện, tài khoản hoặc dịch vụ tương ứng; chúng có thể bị giới hạn khi dịch vụ bên ngoài thay đổi.

## Cài đặt và khởi động

Mở PowerShell tại thư mục dự án:

```powershell
npm install
Copy-Item env.example .env
```

Mở `.env`, điền UID Zalo owner và các thông tin cần dùng. Sau đó khởi chạy:

```powershell
npm start
```

Lần đầu, quét QR hiển thị trong terminal bằng ứng dụng Zalo. Không chụp/chia sẻ QR hoặc session đăng nhập. Sau khi xác thực, session được lưu để lần chạy sau bot có thể đăng nhập lại mà không cần quét QR, trừ khi phiên đăng nhập hết hạn hoặc bị thu hồi.

Lệnh phát triển có tự khởi động lại khi mã nguồn thay đổi:

```powershell
npm run dev
```

Kiểm tra cú pháp entry point:

```powershell
npm run check
```

## Cấu hình

Bot đọc cấu hình từ `.env` và `config.yml`. Hãy chỉnh file cấu hình trong thư mục gốc của dự án, sau đó khởi động lại bot để áp dụng.

### `.env`

Tạo `.env` từ `env.example`. Một số biến thường dùng:

| Biến | Ý nghĩa |
|---|---|
| `BOT_NAME` | Tên hiển thị của bot. Nếu vẫn để mặc định `HNNP STUDIO`, bot lấy `name_bot` trong YAML. |
| `BOT_PREFIX` | Prefix lệnh. Nếu vẫn là `!`, bot có thể lấy `prefix` trong YAML. |
| `OWNER_ZALO_ID` | UID owner bot. Lấy UID bằng lệnh `id`; nếu bỏ trống, bot sẽ báo UID sau khi đăng nhập. |
| `SESSION_PATH` | Đường dẫn lưu session; mặc định `./App/Session.json`. |
| `SESSION_SECRET` | Khóa tùy chọn để mã hóa session; nếu không khai báo, hệ thống dùng khóa cục bộ được tạo riêng. |
| `DB_PATH` | Đường dẫn database chính; mặc định `./Data/nknp-v3.db`. |
| `PORT` | Cổng dashboard cục bộ; mặc định `3000`. |
| `LOG_LEVEL` | Mức ghi log: `debug`, `info`, `warn` hoặc `error`. |
| `ANTI_LINK_ALLOWLIST` | Danh sách domain được phép, phân cách bằng dấu phẩy. |
| `GROQ_API_KEY` | Khóa API Groq cho tính năng AI; chỉ lưu trong `.env`, không ghi trực tiếp vào mã nguồn. |
| `RENT_GMAIL_USER` | Tài khoản Gmail dùng để gửi thông báo RENT. |
| `RENT_GMAIL_APP_PASSWORD` | App Password của Gmail gửi; không dùng mật khẩu đăng nhập Gmail thông thường. |
| `RENT_REPORT_THREAD_ID` | ID box nhận báo cáo thuê bot hằng ngày; nếu được đặt, ưu tiên hơn cấu hình YAML và nơi nhận lưu trong database. |
| `RENT_AUTO_LEAVE_MINUTES` | Số phút sau khi hết hạn mà bot tự rời box; `0` để tắt. Giá trị mặc định là `60`. |

Hai biến Gmail RENT cần được thêm vào `.env` nếu muốn gửi email:

```dotenv
RENT_GMAIL_USER=diachi@gmail.com
RENT_GMAIL_APP_PASSWORD=mat_khau_ung_dung_gmail
```

Để tạo App Password, tài khoản Google cần bật xác minh hai bước và đáp ứng điều kiện của Google. Không đăng App Password lên nhóm chat, ảnh chụp, Git hoặc nơi công khai.

`env.example` có thêm các tùy chọn của lệnh `scl` để chọn nguồn dữ liệu nhạc YouTube, yt-dlp và độ dài audio. Chỉ cần điền các biến này nếu bạn muốn thay đổi nguồn mặc định hoặc bật tính năng tùy chọn.

### `config.yml`

Các thiết lập chính:

| Khóa | Ý nghĩa |
|---|---|
| `name_bot` | Tên bot dùng cho nội dung hiển thị và hình ảnh có thương hiệu. |
| `prefix` | Prefix mặc định lấy từ YAML nếu `BOT_PREFIX` còn giá trị mặc định. |
| `admin_bot` | Danh sách UID admin bot. |
| `support_bot` | Danh sách UID hỗ trợ. |
| `allow_private_command` | Cho phép xử lý lệnh trong tin nhắn riêng đối với các lệnh hỗ trợ inbox. |
| `rentalReportThreadId` | ID box nhận báo cáo RENT hằng ngày. |
| `rentalAutoLeaveMinutes` | Thời gian chờ trước khi bot tự rời box hết hạn. |
| `default_money` | Số dư mặc định cho dữ liệu người dùng mới trong hệ thống tương thích. |
| `social` | Thông tin Facebook, Zalo OA, website hiển thị nếu tính năng tương ứng sử dụng. |

Ví dụ khai báo danh sách UID:

```yaml
name_bot: "Tên bot của bạn"
prefix: "."

admin_bot:
  - "UID_ADMIN_1"
  - "UID_ADMIN_2"

support_bot:
  - "UID_HO_TRO"
```

Nếu `BOT_NAME` hoặc `BOT_PREFIX` trong `.env` được đổi khỏi giá trị mặc định, biến đó được ưu tiên hơn `name_bot` hoặc `prefix` trong YAML. Tên mới được áp dụng cho tin nhắn/caption và các ảnh có phần thương hiệu được thiết kế động; nội dung raster hoặc hình ảnh không có vùng thương hiệu tương ứng không thể tự đổi chữ.

## Quyền và cách gọi lệnh

- Thành viên thông thường cần gõ lệnh với prefix đã cấu hình, ví dụ `.help` hoặc `!help`.
- Owner và admin bot có thể dùng lệnh không kèm prefix ở những lệnh cho phép cách gọi này.
- Quyền của từng lệnh vẫn được kiểm tra riêng; bỏ prefix không làm thành viên thường có thêm quyền.
- Một số lệnh chỉ dùng được trong nhóm, một số lệnh (đặc biệt quản lý email RENT) chỉ dùng trong tin nhắn riêng.
- Quản trị viên Zalo của nhóm và admin bot là hai loại quyền khác nhau.

Hãy dùng `help` hoặc `menu` để xem lệnh, bí danh, mô tả và hướng dẫn hiện tại. Các ví dụ trong tài liệu dùng prefix `.` theo `config.yml`; thay bằng prefix của bạn nếu đã cấu hình khác.

## Danh mục lệnh hiện có

Danh sách dưới đây bao gồm các module lệnh nằm trong `Core/Commands`. Một số lệnh có bí danh hoặc tên hiển thị khác với tên tệp; menu trợ giúp trong bot là nguồn chuẩn để tra cứu cú pháp chính xác.

### Hệ thống, quản trị và bảo vệ

| Tệp lệnh | Chức năng |
|---|---|
| `help.js` | Menu trợ giúp, danh sách lệnh, quyền và thông tin sử dụng. |
| `id.js` | Xem UID người gửi và ID box/cuộc trò chuyện. |
| `ping.js` | Kiểm tra bot có phản hồi và xem độ trễ. |
| `upt.js` | Bảng giám sát trạng thái hệ thống dạng Canvas. |
| `admin.js` | Quản lý danh sách admin/support theo quyền cho phép. |
| `cmd.js` | Quản lý và kiểm soát plugin lệnh. |
| `load.js` | Nạp lại command mà không cần khởi động lại toàn bộ bot. |
| `reloadconfig.js` | Nạp lại cấu hình được hỗ trợ. |
| `restart.js`, `rst.js` | Khởi động lại bot theo chức năng của từng module. |
| `setprefix.js` | Thiết lập prefix riêng cho box. |
| `limit.js` | Khóa lệnh theo nhóm chức năng hoặc chặn lệnh cụ thể trong từng box. |
| `anti.js` | Trung tâm chống spam: link, QR, tag, nội dung lặp, ký tự bất thường, tệp/media và theo dõi hoạt động quản trị. |
| `badword.js` | Lọc từ/cụm từ cấm do quản trị viên thiết lập. |
| `eventlog.js` | Ghi nhận các hoạt động quan trọng trong nhóm. |
| `setting.js` | Owner/admin điều khiển tài khoản Zalo của bot: đăng nhật ký bằng video, đăng bài bằng ảnh/caption, đăng video, đổi logo và đổi tên tài khoản. |

### Quản lý nhóm và thành viên

| Tệp lệnh | Chức năng |
|---|---|
| `adduser.js` | Thêm thành viên bằng UID hoặc số điện thoại. |
| `boxinfo.js` | Tạo ảnh thông tin chi tiết của nhóm. |
| `groupinfo.js` | Xem thông tin nhóm hiện tại. |
| `kick.js` | Mời thành viên ra khỏi nhóm theo cách lệnh hỗ trợ. |
| `kickall.js` | Công cụ kick hàng loạt; cần cân nhắc kỹ trước khi sử dụng. |
| `qtv.js` | Bật/tắt chế độ giới hạn lệnh cho trưởng nhóm và phó nhóm. |
| `warn.js` | Cảnh cáo thành viên. |
| `welcome.js` | Chào thành viên mới bằng tin nhắn/hình ảnh. |
| `goodbye.js` | Thông báo khi thành viên rời nhóm. |
| `out.js` | Cho bot rời nhóm hiện tại. |
| `autosend.js` | Lên lịch gửi tin nhắn và tự xóa theo cấu hình của lệnh. |

### Thuê bot

| Tệp lệnh | Chức năng |
|---|---|
| `thuebot.js` (`rent`) | Kiểm tra hạn, kích hoạt/gia hạn bằng KEY, quản lý thời hạn, báo cáo box và thông báo email. |

Xem [chi tiết hệ thống thuê bot](#chi-tiết-hệ-thống-thuê-bot-rent) để biết các thao tác thường dùng.

### Hồ sơ, trò chơi, RPG và kinh tế

| Tệp lệnh | Chức năng |
|---|---|
| `hoso.js` | Hồ sơ người chơi dạng Canvas; hiển thị dữ liệu người chơi và EXP liên kết với trò chơi. |
| `tutien.js` | Tu Tiên RPG: cảnh giới, tu vi, đột phá, Thiên Kiếp và xếp hạng. |
| `pokemon.js` | Pokémon RPG: pet, nhiệm vụ, vật phẩm, trứng, bản đồ, gym, chiến đấu và xếp hạng. |
| `nongtrai.js` | Nông trại: trồng, thu hoạch, mua đất và bán nông sản. |
| `cauca.js` | Câu cá: bản đồ, cần câu, mồi, EXP và kết quả Canvas. |
| `balo.js` | Kho đồ: mở và vứt vật phẩm. |
| `shop.js` | Cửa hàng vật phẩm, trang bị, thuốc và Pokémon. |
| `work.js` | Nghề nghiệp, ca làm, lương và thăng cấp. |
| `baicao.js` | Bài Cào nhiều người chơi, chia bài và EXP. |
| `bcua.js` | Bầu Cua: chọn linh vật, tung xúc xắc và nhận EXP. |
| `taixiu.js`, `tx.js` | Các biến thể trò chơi Tài Xỉu. |
| `xd.js` | Xì Dách nhiều người chơi. |
| `ott.js` | Oẳn Tù Tì và bảng xếp hạng. |
| `napthe.js` | Quản lý tiền game, tiết kiệm và thao tác cộng tiền theo quyền. |
| `bank2.js`, `vbank.js` | Chức năng ngân hàng/QR, ví, chuyển tiền và lịch sử theo từng hệ thống. |
| `stk.js` | Hiển thị và quản lý thông tin tài khoản ngân hàng/QR theo quyền. |
| `tt.js` | Bảng xếp hạng tương tác trong nhóm theo thời gian hỗ trợ. |
| `tile.js` | Xem tỉ lệ hợp đôi giữa thành viên. |

### Media, QR và tiện ích

| Tệp lệnh | Chức năng |
|---|---|
| `autodown.js` | Tải media từ nhiều nền tảng phổ biến; khả năng tải phụ thuộc nguồn. |
| `scl.js` | Tìm và đề xuất nhạc YouTube; có thể cấu hình các nguồn và tùy chọn audio. |
| `vdgirl.js` | Gửi video ngẫu nhiên từ nguồn dữ liệu của tính năng. |
| `fbin4.js` | Tra cứu thông tin Facebook theo link hoặc UID. |
| `sendcard.js` | Gửi danh thiếp người được tag. |
| `qrheart.js` | Tạo QR trái tim từ nội dung đầu vào. |
| `qrin.js` | Tạo QR VietQR theo mẫu hình ảnh của lệnh. |
| `qrnew.js` | Tự phản hồi QR khi phát hiện từ khóa thanh toán được cấu hình. |
| `adc.js` | Áp dụng code hoặc tải code lên theo luồng của lệnh. |
| `ghepdoi.js` | Ghép đôi người gọi lệnh với thành viên khác. |
| `hon.js` | Tương tác vui bằng cách hôn người được tag. |

### AI

| Tệp lệnh | Chức năng |
|---|---|
| `ai.js` | Chat AI Groq: gọi bot trong nhóm hoặc trả lời tin AI, bật/tắt theo nhóm, chế độ code, học phong cách và trí nhớ hội thoại. Cần đặt `GROQ_API_KEY` trong `.env`. |
| `gpt.js` | Gửi câu hỏi tới dịch vụ ChatGPT bên ngoài; tính khả dụng phụ thuộc API của nhà cung cấp. |

## Chi tiết hệ thống thuê bot RENT

Prefix ví dụ trong phần này là `.`. Hãy thay bằng prefix thực tế của bot.

### Dành cho box thuê bot

| Lệnh | Tác dụng |
|---|---|
| `.rent menu` | Mở menu RENT. |
| `.rent check` | Xem trạng thái, thời gian còn lại và hạn thuê của box hiện tại. |
| `.rent key <KEY>` | Kích hoạt hoặc gia hạn thời gian bằng KEY chưa sử dụng. |
| `.rent tb on` | Bật thông báo số ngày thuê còn lại trong box sau 00:00 mỗi ngày. Chỉ bật được khi box còn hạn. |
| `.rent tb off` | Tắt thông báo thuê hằng ngày cho box. |

### Dành cho owner bot

Các thao tác quản trị thời hạn thực hiện trong box cần quản lý:

| Lệnh | Tác dụng |
|---|---|
| `.rent add <ngày>` | Cộng thêm số ngày vào thời hạn thuê hiện tại. |
| `.rent set <ngày>` | Đặt lại thời hạn thuê thành số ngày chỉ định. |
| `.rent off` | Tắt thời hạn thuê của box. |
| `.rent list [trang]` | Xem danh sách các box thuê bot. |
| `.rent genkey <ngày> [số lượng 1-10] [hạn dùng KEY (ngày)]` | Tạo KEY thuê bot; KEY được gửi riêng nếu có thể. |
| `.rent keys` | Xem/gửi KEY chưa sử dụng theo luồng riêng tư của lệnh. |
| `.rent delkey <KEY>` | Xóa KEY. |

### Dành cho admin bot

| Lệnh | Tác dụng |
|---|---|
| `.rent del <ngày>` | Trừ số ngày khỏi thời hạn thuê của box hiện tại. Có thể trừ nhiều ngày; nhập số nguyên dương. |
| `.rent admin set` | Đặt box hiện tại làm nơi nhận báo cáo RENT hằng ngày. Chạy trong box muốn nhận báo cáo. |
| `.rent admin off` | Tắt nơi nhận báo cáo đã lưu trong database. Cấu hình `RENT_REPORT_THREAD_ID`/`rentalReportThreadId` nếu có vẫn được ưu tiên. |
| `.rent admin test` | Gửi thử báo cáo tới box đã cấu hình. |
| `.rent admin` | Xem trạng thái cấu hình nơi nhận báo cáo. |

Báo cáo admin chứa tình trạng thời gian thuê của các box và được gửi tự động hằng ngày sau 00:00 giờ Việt Nam nếu đã cấu hình nơi nhận.

### Thông báo RENT qua email

1. Điền `RENT_GMAIL_USER` và `RENT_GMAIL_APP_PASSWORD` trong `.env`, sau đó khởi động lại bot.
2. Nhắn riêng cho bot từ tài khoản được quyền admin và gửi `.rent gmail`.
3. Khi bot yêu cầu, gửi email nhận thông báo. Bot gửi email thử trước và chỉ lưu địa chỉ khi kiểm tra gửi thành công.
4. Quản lý danh sách bằng các lệnh sau trong tin nhắn riêng:

| Lệnh | Tác dụng |
|---|---|
| `.rent gmail` | Bắt đầu thêm email nhận thông báo. |
| `.rent gmail list` | Xem các email đã đăng ký. |
| `.rent gmail del <email>` | Xóa một email khỏi danh sách. |
| `.rent gmail cancel` | Hủy thao tác nhập email đang chờ. |

Danh sách email nhận được lưu tại `Data/admin_gmail.json` với dạng:

```json
{
  "emails": [
    "admin@example.com"
  ]
}
```

Tệp này được tạo sau khi thêm email thành công; nó không nhất thiết xuất hiện ngay khi cài hoặc khởi động bot. Có thể lưu nhiều địa chỉ. Bot gửi thông báo RENT qua email cho các sự kiện như kích hoạt/gia hạn, hết hạn, bot bị mời khỏi nhóm hoặc bot tự rời box hết hạn. Email người nhận không phải là tài khoản Gmail gửi; thông tin tài khoản gửi nằm trong `.env`.

## Dữ liệu và cấu trúc dự án

```text
.
├── App/                 # Cấu hình, database chính, session, adapter Zalo, khởi động bot
├── Core/
│   ├── Commands/        # Các lệnh bot và module dữ liệu/hình ảnh của lệnh
│   └── Services/        # Dịch vụ dùng chung, ví dụ shop
├── Handlers/            # Router lệnh, message, reaction, sự kiện nhóm và rental guard
├── Utils/               # Log, phân quyền, tiện ích, hiển thị console và branding
├── Data/                # Database và dữ liệu được tạo trong quá trình chạy
├── assets/              # Tài nguyên và dữ liệu đi kèm
├── public/              # Giao diện dashboard
├── tests/               # Bộ kiểm thử Node.js
├── config.yml           # Cấu hình YAML
├── env.example          # Mẫu biến môi trường
├── server.js            # Dashboard chỉ đọc
├── zalo.js              # Điểm khởi chạy bot
└── package.json         # Dependencies và scripts npm
```

Các dữ liệu quan trọng có thể bao gồm:

- `App/Session.json` và khóa session tương ứng: thông tin đăng nhập bot.
- `Data/nknp-v3.db`: database chính theo cấu hình mặc định.
- `Data/legacy/nknp-legacy.db`: dữ liệu tương thích cho các module cần Users/Threads kiểu cũ.
- `Data/admin_gmail.json`: danh sách email nhận thông báo RENT, tạo khi thêm email.
- Các thư mục cache/temp: tệp tạm hoặc dữ liệu cache do một số lệnh tạo.

Không xóa database hoặc session khi chưa sao lưu và hiểu rõ hậu quả; xóa chúng có thể làm mất dữ liệu trò chơi/cấu hình hoặc buộc đăng nhập lại.

## Kiểm tra và xử lý sự cố

### Không thấy `Data/admin_gmail.json`

Đây là bình thường nếu chưa thêm địa chỉ email thành công. Cấu hình Gmail gửi trong `.env`, nhắn riêng `.rent gmail`, nhập email và chờ bot báo gửi thử thành công. Sau đó kiểm tra `Data/admin_gmail.json` trong thư mục dự án mà bot đang chạy.

### Bot yêu cầu quét QR lại

Kiểm tra `SESSION_PATH`, bảo đảm session và khóa mã hóa tương ứng chưa bị xóa/đổi, và xác minh rằng tài khoản Zalo chưa thu hồi phiên đăng nhập đó.

### Lệnh không chạy

- Xác nhận đã dùng đúng prefix; xem prefix tại `config.yml` hoặc cấu hình môi trường.
- Dùng `help` để kiểm tra tên lệnh/bí danh và cú pháp.
- Kiểm tra quyền owner/admin hoặc quyền quản trị nhóm của tài khoản gọi lệnh.
- Một số lệnh chỉ hoạt động trong nhóm hoặc chỉ hoạt động qua tin nhắn riêng.
- Xem log trong terminal để tìm lỗi từ API/dịch vụ bên ngoài.

### Dashboard không mở được

Dashboard mặc định chỉ truy cập trên máy chạy bot, thường tại `http://127.0.0.1:3000`. Nếu cổng mặc định đang bận, ứng dụng có thể thử cổng kế tiếp; kiểm tra log lúc khởi động để biết URL thực tế.

### Chạy kiểm thử

```powershell
npm run check
node --test
```

Kiểm thử kết nối thật tới Zalo/API bên ngoài có thể cần tài khoản, quyền truy cập mạng và cấu hình phù hợp.

## Bảo mật và sao lưu

- Không chia sẻ hoặc commit `.env`, session, khóa session, database có dữ liệu riêng tư, hay `Data/admin_gmail.json`.
- Dùng **Gmail App Password** riêng cho bot; nếu lộ, thu hồi App Password đó và tạo khóa mới.
- Không đăng QR đăng nhập hoặc file session lên Internet.
- Dashboard hiện là giao diện chỉ đọc và mặc định bind localhost. Không mở dashboard ra Internet nếu chưa có xác thực và cấu hình mạng an toàn.
- Sao lưu database và các dữ liệu quan trọng định kỳ; lưu bản sao ở nơi riêng tư, kiểm soát quyền truy cập.