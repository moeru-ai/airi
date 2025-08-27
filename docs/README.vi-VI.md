<picture>
  <source
    width="100%"
    srcset="./docs/content/public/banner-dark-1280x640.avif"
    media="(prefers-color-scheme: dark)"
  />
  <source
    width="100%"
    srcset="./docs/content/public/banner-light-1280x640.avif"
    media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
  />
  <img width="250" src="./docs/content/public/banner-light-1280x640.avif" />
</picture>

<h1 align="center">Dự án AIRI</h1>

<p align="center">Lấy ý tưởng từ Neuro-sama và chúng tôi đã tạo ra một AI waifu / nhân vật ảo để mang họ đến với thế giới của chúng ta.</p>

<p align="center">
  [<a href="https://discord.gg/TgQ3Cu2F7A">Tham gia Discord</a>] [<a href="https:///airi.moeru.ai">Dùng thử</a>] [<a href="https://github.com/moeru-ai/airi/blob/main/docs/README.zh-CN.md">简体中文</a>] [<a href="https://github.com/moeru-ai/airi/blob/main/docs/README.ja-JP.md">日本語</a>]
</p>

<p align="center">
  <a href="https://deepwiki.com/moeru-ai/airi"><img src="https://deepwiki.com/badge.svg"></a>
  <a href="https://github.com/moeru-ai/airi/blob/main/LICENSE"><img src="https://img.shields.io/github/license/moeru-ai/airi.svg?style=flat&colorA=080f12&colorB=1fa669"></a>
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20thành viên&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2"></a>
  <a href="https://x.com/proj_airi"><img src="https://img.shields.io/badge/%40proj__airi-black?style=flat&logo=x&labelColor=%23101419&color=%232d2e30"></a>
  <a href="https://t.me/+7M_ZKO3zUHFlOThh"><img src="https://img.shields.io/badge/Telegram-%235AA9E6?logo=telegram&labelColor=FFFFFF"></a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/airi?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-airi" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=993524&theme=neutral&t=1752696535380" alt="AIRI - Một&#0032;bình&#0032;chứa&#0032;linh&#0032;hồn&#0032;số&#0044;&#0032;tái&#0032;tạo&#0032;Neuro-sama | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
  <a href="https://trendshift.io/repositories/14636" target="_blank"><img src="https://trendshift.io/api/badge/repositories/14636" alt="moeru-ai%2Fairi | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
</p>

> Lấy cảm hứng mạnh mẽ từ [Neuro-sama](https://www.youtube.com/@Neurosama)

> [!WARNING]  
> **Chú ý:** Chúng tôi **không** phát hành bất kỳ loại tiền điện tử hay token chính thức nào liên quan đến dự án này. Hãy kiểm tra kỹ thông tin trước khi tham gia.

> [!NOTE]  
> Chúng tôi có cả một tổ chức riêng [@proj-airi](https://github.com/proj-airi) cho các dự án con xuất phát từ AIRI. Hãy xem qua nhé!  
> Bao gồm: RAG, hệ thống bộ nhớ, cơ sở dữ liệu nhúng, icon, tiện ích Live2D, và nhiều hơn nữa.

Bạn đã từng mơ về một thực thể số sống động (cyber-waifu / husbando, thú cưng ảo) hay một bạn đồng hành kỹ thuật số có thể chơi cùng và trò chuyện với bạn chưa?

Với sức mạnh của các mô hình LLM (ngôn ngữ lớn) hiện nay như [ChatGPT](https://chatgpt.com) hay [Claude](https://claude.ai), việc yêu cầu nhân vật ảo nhập vai và trò chuyện với chúng ta đã trở nên rất dễ dàng. Các nền tảng như [Character.ai](https://character.ai), [JanitorAI](https://janitorai.com/) hay bản cài tự host như [SillyTavern](https://github.com/SillyTavern/SillyTavern) đã đủ tốt cho trải nghiệm trò chuyện và nhập vai.  

> Nhưng còn việc **chơi game cùng bạn, xem bạn code, trò chuyện khi chơi game hoặc xem video, và làm được nhiều việc khác** thì sao?

Có lẽ bạn đã biết [Neuro-sama](https://www.youtube.com/@Neurosama). Cô ấy là VTuber ảo xuất sắc nhất hiện nay, có thể vừa chơi game, vừa trò chuyện và tương tác với bạn cũng như khán giả. Một số người còn gọi đây là “con người số” (digital human). **Đáng tiếc, vì không mã nguồn mở, bạn không thể tương tác với cô ấy khi buổi livestream kết thúc.**

Do đó, dự án AIRI mang đến một lựa chọn khác: **cho phép bạn sở hữu thực thể số của riêng mình, dễ dàng, mọi lúc, mọi nơi.**

---
*(phần tiếp theo — DevLogs, tiến trình, tính năng đặc biệt, hướng dẫn phát triển, các dự án con, acknowledgements, star history… cũng sẽ được dịch tương tự, giữ nguyên code, liên kết và biểu đồ)*  
---

**Recommendation:** Tạo một file mới `README.vi-VN.md`.  
**Next step:** Bạn muốn mình dịch toàn bộ phần còn lại (DevLogs → Star History) sang tiếng Việt luôn trong một file hoàn chỉnh, hay chia nhỏ theo từng phần để dễ kiểm tra?
