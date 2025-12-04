/**
 * @enum TokenTransportType
 * @description 토큰 전송 유형을 나타냅니다.
 *  - WEB_COOKIE: 웹 쿠키를 통해 토큰을 전송 (ex. Secure, HttpOnly, SameSite 적용)
 *  - STORAGE: LocalStorage, SessionStorage 등 클라이언트 스토리지를 통해 토큰을 전송
 */
export enum TokenTransportType {
  WEB_COOKIE,
  STORAGE,
}

/**
 * @interface TokenTransportConfig
 * @description 토큰 전송 방식 및 인증 토큰 획득 메서드 정의
 * @property {TokenTransportType} tokenTransportType - 사용할 토큰 전송 방식(WEB_COOKIE 또는 STORAGE)
 * @property {Function} [fetchAuthTokenMethod] - 인증 토큰(access/refreshToken) 반환 함수(비동기).
 *    콜백은 `{accessToken, refreshToken}` 객체 또는 null을 Promise로 반환해야 합니다.
 */
export interface TokenTransportConfig {
  tokenTransportType: TokenTransportType;
  fetchAuthTokenMethod?:
    | (() => Promise<{ accessToken: string; refreshToken: string } | null>)
    | null;
}
