# 기여 가이드

AIRI 프로젝트에 기여해주셔서 감사합니다! 여러 방법으로 참여할 수 있습니다.

## 기여 방법

### 🐛 버그 리포트
- [GitHub Issues](https://github.com/moeru-ai/airi/issues)에서 버그 신고
- 재현 가능한 단계 포함
- 스크린샷이나 로그 첨부

### 💡 기능 제안
- [GitHub Discussions](https://github.com/moeru-ai/airi/discussions)에서 아이디어 공유
- 구체적인 사용 사례 설명
- 커뮤니티 피드백 수집

### 🔧 코드 기여
- Fork 후 Pull Request 생성
- 코딩 스타일 가이드 준수
- 테스트 코드 작성

### 📚 문서화
- 문서 개선 및 번역
- 튜토리얼 작성
- API 문서 업데이트

### 🎨 디자인 & 아트
- UI/UX 개선
- Live2D/VRM 모델 제작
- 아이콘 및 그래픽 디자인

## 개발 환경 설정

### 필수 요구사항
```bash
# Node.js 18+ 및 pnpm 설치
npm install -g pnpm

# 저장소 클론
git clone https://github.com/moeru-ai/airi.git
cd airi

# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm dev
```

### 데스크톱 앱 개발
```bash
# Rust 설치 (Tauri용)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 데스크톱 앱 개발 서버
pnpm dev:tamagotchi
```

## 코딩 스타일

### TypeScript/Vue
- ESLint 설정 준수
- Vue 3 Composition API 사용
- TypeScript strict 모드

### 커밋 메시지
```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 업데이트
style: 코드 포맷팅
refactor: 리팩토링
test: 테스트 추가
chore: 빌드 관련 수정
```

## 테스팅

```bash
# 모든 테스트 실행
pnpm test

# 린트 검사
pnpm lint

# 타입 체크
pnpm typecheck
```

## 커뮤니티

### Discord 서버
- [Discord 참여](https://discord.gg/TgQ3Cu2F7A)
- 개발자 채널에서 실시간 소통
- 베타 테스트 참여

### GitHub 토론
- [Discussions](https://github.com/moeru-ai/airi/discussions)에서 아이디어 공유
- Q&A 및 기술 논의
- 로드맵 계획 참여

## 기여자 인정

모든 기여자들은 다음과 같이 인정받습니다:
- README의 기여자 목록 추가
- Discord의 특별 역할 부여
- 주요 기여자는 코어 팀 초대

함께 AI 동반자의 미래를 만들어갑시다! 🚀
