# custom — các tuỳ biến riêng của fork HoangIT-69/airi

Thư mục này chứa phần custom nằm ngoài code lõi, để kéo bản mới từ upstream không bị conflict.

## Card "Thư Ký" (Mai)

Persona thư ký kiêm trợ lý code bằng tiếng Việt. Mặc định dùng VRM `AvatarSample_A` (`preset-vrm-1`). Provider/model để trống, nên card dùng cấu hình chung trong Settings.

Nguồn: `cards/thu-ky/card.json` (Character Card v3) và `cards/thu-ky/manifest.json`.

Đóng gói (PowerShell, chạy trong thư mục `custom/`):

```powershell
Compress-Archive -Path cards/thu-ky/manifest.json,cards/thu-ky/card.json -DestinationPath dist/thu-ky.airi-card.zip -Force
```

Import: Settings → Character card (AIRI Card) → Import → chọn `dist/thu-ky.airi-card.zip` → kích hoạt card.

## Đổi model VRM

- Toàn app: Settings → Models → chọn model, hoặc import file `.vrm` của bạn.
- Theo từng card: mở card → Edit → mục display model.
