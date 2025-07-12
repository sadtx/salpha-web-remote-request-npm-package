import { AxiosError } from "axios";

/**
 * @interface TokenConfig
 * @description 토큰 관련 설정 인터페이스
 * @property {function} checkTokenExpiredError - 토큰 만료 에러인지 판단하는 함수
 * @property {function} refreshLogic - 토큰 재발급 로직
 * @property {Error} [urlRequestIsEmpty] - 요청 정보가 없을 때 에러
 */
export interface TokenRefreshConfig<T, E> {
  checkTokenExpiredError: (error: AxiosError) => boolean;
  tokenRefreshLogic: () => Promise<T>;
  tokenRefreshErrorHandler: (error: E) => void;
  errorMappers: {
    urlRequestIsEmpty?: E;
  };
}
