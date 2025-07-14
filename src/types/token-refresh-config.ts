import { AxiosError } from "axios";

/**
 * @interface TokenRefreshConfig
 * @description 토큰 갱신(재발급) 관련 설정 인터페이스
 * @property {(error: AxiosError) => boolean} checkTokenExpiredError - 주어진 에러가 토큰 만료 에러인지 판별하는 함수
 * @property {string} tokenReissueUrl - 토큰 재발급을 위한 API URL
 * @property {{ urlRequestIsEmpty?: Error }} errorMappers - 에러 매핑 객체 (요청 정보가 없을 때의 에러 등)
 */
export interface TokenRefreshConfig {
  checkTokenExpiredError: (error: AxiosError) => boolean;
  tokenReissueUrl: string;
  errorMappers: {
    urlRequestIsEmpty?: Error;
  };
}
