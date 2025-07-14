import { RequestInterceptor, ResponseInterceptor } from "./request-interceptor";

/**
 * @interface EncryptionConfig
 * @description 암호화 관련 설정 인터페이스
 * @property {string} encryptUrlStr - 암호화가 필요한 URL 패턴 문자열
 * @property {function} [requestInterceptor] - 요청 인터셉터 함수 (선택적)
 * @property {function} [responseInterceptor] - 응답 인터셉터 함수 (선택적)
 */
export interface EncryptionConfig {
  encryptUrlStr: string;
  requestInterceptor: RequestInterceptor;
  responseInterceptor: ResponseInterceptor;
}
