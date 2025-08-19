# Git Commit Message Convention

이 프로젝트는 [Conventional Commits](https://www.conventionalcommits.org/) 표준을 따릅니다.

## 커밋 메시지 형식

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## 타입 (Type)

- **feat**: 새로운 기능 추가
- **fix**: 버그 수정
- **docs**: 문서 수정
- **style**: 코드 포맷팅, 세미콜론 누락 등 (코드 변경 없음)
- **refactor**: 코드 리팩토링
- **perf**: 성능 개선
- **test**: 테스트 추가 또는 수정
- **build**: 빌드 시스템 또는 외부 종속성 변경
- **ci**: CI 설정 파일 및 스크립트 변경
- **chore**: 기타 변경사항 (빌드 프로세스 또는 보조 도구 변경)

## 예시

### 새로운 기능 추가

```
feat: add encryption support for requests
```

### 버그 수정

```
fix: resolve token refresh infinite loop issue
```

### 문서 업데이트

```
docs: update README with usage examples
```

### 성능 개선

```
perf: optimize request interceptor performance
```

### 테스트 추가

```
test: add unit tests for RemoteRequest class
```

## 스코프 (Scope)

선택적으로 변경사항의 범위를 지정할 수 있습니다:

```
feat(auth): add JWT token validation
fix(encryption): resolve AES key generation issue
```

## 브레이킹 체인지

API 변경으로 인한 호환성 문제가 있는 경우:

```
feat!: change encryption algorithm from AES-128 to AES-256

BREAKING CHANGE: This change requires updating the encryption configuration
```

## 자동 CHANGELOG 생성

이 컨벤션을 따르면 `npm run changelog` 명령어로 자동으로 CHANGELOG.md가 업데이트됩니다.
