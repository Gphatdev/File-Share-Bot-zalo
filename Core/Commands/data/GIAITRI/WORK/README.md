# .work — Hệ thống nghề nghiệp

Lệnh: `Core/Commands/work.js` (toàn bộ Canvas + xử lý lệnh). Lõi: `engine.js`, lưu trữ: `store.js`, câu hỏi: `challenges.js`.

## Dữ liệu (thư mục này)
| File | Nội dung |
|---|---|
| `jobs.json` | 50 nghề / 5 nhóm: id, tên, mô tả, độ khó, cấp yêu cầu, ngày công yêu cầu, lương cơ bản/ca, EXP/ca, danh từ công việc |
| `tasks.json` | 250 nhiệm vụ (5 nghề/nhiệm vụ), loại kiểm tra, ngân hàng câu hỏi theo nhóm |
| `config.json` | Số nhiệm vụ/ca, trần lương/ngày, 8 cấp bậc (hệ số lương, EXP nghề, ngày công), điểm danh, cooldown, giới hạn lịch sử, thành tựu |
| `players.json` | Dữ liệu người chơi theo UID (tự tạo/tự sửa) |
| `history.json` | Lịch sử theo UID (giới hạn `history.cap`) |

## Cách hoạt động
- Mỗi ngày (giờ `Asia/Ho_Chi_Minh`) 1 ca. Ca gồm 3–5 nhiệm vụ tùy độ khó; mỗi nhiệm vụ cần 1–3 lượt kiểm tra do bot sinh và chấm.
- Trả lời bằng cách **reply ảnh câu hỏi** (số 1–4 hoặc mã) hoặc `.work tl <đáp án>`. Người chơi không tự nhập số lượng/tiến độ.
- Lương = lương cơ bản × hệ số cấp bậc × (0.6 + 0.4 × độ chính xác), +10% nếu hoàn hảo, bị chặn bởi trần ngày.
- Tiền → `TienGame.addMoney` (referenceId `work:<shiftId>` chống trả trùng). EXP/cấp → `PlayerProfile.applyWorkReward` (idempotent theo shiftId), ghi `profile.work`.
- Nếu bot tắt giữa lúc tính lương, ca ở trạng thái `settling` và được chạy tiếp ở lần dùng lệnh sau (không cộng trùng).

## Lệnh
`.work` · `.work nghenghiep [nhóm] [trang]` · `.work xin viec <tên>` · `.work lam` · `.work tl <đáp án>` · `.work nhiemvu` · `.work trangthai` · `.work luong` · `.work lichsu [trang]` · `.work thangcap` · `.work thongke` · `.work diem danh` · `.work top [tien|ngay|cap]` · `.work huyca` · `.work nghi viec`

Nhóm: `laodong`, `dichvu`, `congnghe`, `sangtao`, `chuyenmon`.

## Cân bằng kinh tế
Chỉnh trong `jobs.json` (`baseWage`, `exp`, `levelRequired`) và `config.json` (`wage.dailyIncomeCap`, `ranks[].wageMultiplier`). Mặc định: lương ca 2.800–30.000$ (nhân hệ số 1,0–3,5), trần 120.000$/ngày, so với `.daily` 10.000$/12h.
