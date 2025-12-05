import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

import { RemoteRequestMethod } from "./remoteRequestMehtodType";
import { EncryptionConfig } from "./types/encryption-config";
import { TokenRefreshConfig } from "./types/token-refresh-config";
import {
  TokenTransportConfig,
  TokenTransportType,
} from "./types/token-trasport-config";

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export class RemoteRequest implements RemoteRequestMethod {
  private _axiosInstance: AxiosInstance;
  private isUseCookie: boolean;
  private isRefreshingToken: boolean = false;

  /**
   * 토큰 재발급 대기 큐
   * - 토큰 재발급 중 발생한 요청을 큐에 저장
   * - 토큰 재발급 성공 시 큐에 쌓인 모든 요청을 재시도
   * - 토큰 재발급 실패 시 큐에 쌓인 모든 요청을 실패 처리
   */
  private failedQueue: Array<{
    resolve: (value: AxiosResponse) => void;
    reject: (error?: unknown) => void;
    originalRequest: CustomAxiosRequestConfig;
  }> = [];

  /**
   * RemoteRequest 클래스 생성자
   *
   * @param isUseCookie - 쿠키 사용 여부 (인증 토큰 등 쿠키로 관리할지 여부)
   * @param tokenConfig - 토큰 갱신 관련 설정 객체
   * @param encryptionConfig - 암호화 관련 설정 객체 (선택)
   */
  // MARK: - Constructor
  constructor(
    private readonly tokenTransportConfig: TokenTransportConfig,
    private readonly removeConsole: boolean = true,
    private readonly tokenConfig: TokenRefreshConfig,
    private readonly encryptionConfig?: EncryptionConfig,
    private readonly reissueTokenSuccessCallback?: (
      accessToken: string,
      refreshToken: string
    ) => Promise<void>,
    private readonly reissueTokenFailureCallback?: () => Promise<void>
  ) {
    this.checkTokenRefreshConfigParams(this.tokenConfig);
    if (this.encryptionConfig)
      this.checkEncryptionConfigParams(this.encryptionConfig);
    if (this.tokenTransportConfig)
      this.checkTokenTransportConfigParams(this.tokenTransportConfig);

    // 쿠키 사용 여부 설정
    this.isUseCookie =
      this.tokenTransportConfig.tokenTransportType ===
      TokenTransportType.WEB_COOKIE
        ? true
        : false;

    const isExistLogic =
      this.reissueTokenSuccessCallback !== undefined &&
      this.reissueTokenSuccessCallback !== null;
    // 토큰 기반 인증 시 토큰 성공 콜백 추가 여부 확인
    // 콜백을 통해서 저장해야함
    if (!this.isUseCookie && !isExistLogic) {
      throw new Error(
        "[RemoteRequestImpl] reissueTokenSuccessCallback is required In Token Mode"
      );
    }

    // Axios 인스턴스 생성 (쿠키 사용 여부 설정)
    this._axiosInstance = axios.create({
      withCredentials: this.isUseCookie,
    });

    /**
     * 요청 인터셉터
     * - POST, PUT 요청이면서 암호화 URL이 포함된 경우 암호화 인터셉터 실행
     * - 그 외에는 원본 config 반환
     */
    // MARK: - Request Interceptor
    this._axiosInstance.interceptors.request.use(async (config) => {
      // 일반 토큰을 사용하는 경우(쿠키 사용이 아닌 경우) 암호화 경로(/s/)와 관계없이 토큰을 무조건 넣어줌
      if (!this.isUseCookie) {
        const token = await this.tokenTransportConfig.fetchAuthTokenMethod?.();
        if (token && token.accessToken !== "") {
          config.headers.Authorization = `Bearer ${token.accessToken}`;
        }
      }

      if (
        (config.method === "post" || config.method === "put") &&
        this.encryptionConfig &&
        this.checkUserIsIncludeEncryptUrl(config.url)
      ) {
        try {
          return this.encryptionConfig.requestInterceptor(config);
        } catch (error) {
          this._error(error);
          return Promise.reject(error);
        }
      }
      // 암호화 필요 없는 경우 원본 config 반환
      return config;
    });

    /**
     * 응답 인터셉터
     * - GET 요청이면서 암호화 URL이 포함된 경우 복호화 인터셉터 실행
     * - 그 외에는 원본 response 반환
     * - 에러 발생 시 토큰 재발급 핸들러로 위임
     */
    // MARK: - Response Interceptor
    this._axiosInstance.interceptors.response.use(
      async (response: AxiosResponse<unknown>) => {
        if (
          this.encryptionConfig &&
          this.checkUserIsIncludeEncryptUrl(response.config.url)
        ) {
          try {
            return this.encryptionConfig.responseInterceptor(response);
          } catch (error) {
            this._error(error);
            return Promise.reject(error);
          }
        }
        return response;
      },

      async (error: AxiosError) => {
        return this.handleTokenRefresh(error);
      }
    );
  }

  /**
   * 내부 로깅 함수 (removeConsole 값에 따라 콘솔 출력 제어)
   */
  private _log(...args: unknown[]) {
    if (!this.removeConsole) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  }
  private _error(...args: unknown[]) {
    if (!this.removeConsole) {
      // eslint-disable-next-line no-console
      console.error(...args);
    }
  }
  private _warn(...args: unknown[]) {
    if (!this.removeConsole) {
      // eslint-disable-next-line no-console
      console.warn(...args);
    }
  }

  // MARK: - 암호화 URL 포함 여부 확인
  /**
   * 암호화가 필요한 URL인지 확인
   * @param url - 요청 URL
   * @returns 암호화 대상 여부
   */
  private checkUserIsIncludeEncryptUrl(
    url: string | null | undefined
  ): boolean {
    if (!url) {
      this._error(
        "[RemoteRequestImpl] checkUserIsIncludeEncryptUrl :: url 확인 필요 | ",
        url
      );
      return false;
    }
    const isIncludeEncryptUrl = url.includes(
      this.encryptionConfig?.encryptUrlStr ?? ""
    );
    this._log(
      `[RemoteRequestImpl] checkUserIsIncludeEncryptUrl :: url 확인 완료 | url: ${url} | ${
        isIncludeEncryptUrl ? "암호화 문자열 포함" : "암호화 문자열 미포함"
      }`
    );
    return isIncludeEncryptUrl;
  }

  /**
   * 토큰 재발급 처리 (업데이트 버전)
   * - 토큰 만료 에러 감지 시 토큰 재발급 로직 실행
   * - 재발급 진행 중에는 들어온 요청들을 대기열에 쌓음
   * - 재발급 성공 시 대기열의 요청들 일괄 재시도
   * - 재발급 실패 시 대기열의 요청들 모두 에러 처리
   */
  // MARK: - Token Refresh Handler
  private async handleTokenRefresh(error: AxiosError): Promise<AxiosResponse> {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    // 요청 정보가 없으면 에러 반환
    if (!originalRequest) {
      return Promise.reject(
        this.tokenConfig.errorMappers.urlRequestIsEmpty ??
          new Error(
            "[RemoteRequestImpl] handleTokenRefresh :: 요청 정보가 없습니다. 관리자에게 문의해주세요."
          )
      );
    }

    // 토큰 만료 에러 여부 확인
    const isTokenExpiredError = this.tokenConfig.checkTokenExpiredError(error);

    this._log("[RemoteRequestImpl] handleTokenRefresh Debug");
    this._log(`error.response?.status: ${error.response?.status}`);
    this._log(
      `isTokenExpiredError: ${isTokenExpiredError}, ${
        isTokenExpiredError ? "토큰 만료 에러" : "토큰 만료 에러 아님"
      }`
    );
    this._log(`this.isRefreshingToken: ${this.isRefreshingToken}`);
    this._log(`originalRequest._retry: ${originalRequest._retry}`);

    // 토큰 만료 에러이고 아직 재시도하지 않은 요청인 경우
    if (isTokenExpiredError && !originalRequest._retry) {
      originalRequest._retry = true;

      // 이미 토큰 재발급 중이면 큐에 추가 후 대기, 단) 토큰 재발급은 제외
      if (
        this.isRefreshingToken &&
        !originalRequest.url?.includes(this.tokenConfig.tokenReissueUrl)
      ) {
        this._log(
          "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 중 - 요청을 대기열에 추가"
        );
        return new Promise((resolve, reject) => {
          this.failedQueue.push({ resolve, reject, originalRequest });
        });
      }

      // 토큰 재발급 시작
      this._log("[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 시작");
      this.isRefreshingToken = true;

      try {
        // 외부에서 주입받은 토큰 재발급 API 호출 로직 실행
        this._log(
          "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 API 호출"
        );
        if (this.isUseCookie) {
          // CASE 1: 쿠키 인증 방식 토큰 재발급 API 호출
          this._log(
            "[RemoteRequestImpl] handleTokenRefresh :: 쿠키 인증 방식 토큰 재발급 API 호출"
          );
          await this.tokenReissueWhenUseCookie(
            this.tokenConfig.tokenReissueUrl
          );
        } else {
          // CASE 2: 스토리지 인증 방식 토큰 재발급 API 호출
          this._log(
            "[RemoteRequestImpl] handleTokenRefresh :: 스토리지 인증 방식 토큰 재발급 API 호출"
          );
          const result =
            await this.tokenTransportConfig.fetchAuthTokenMethod?.();
          await this.tokenReissueWhenUseStorage(
            this.tokenConfig.tokenReissueUrl,
            result?.accessToken ?? "",
            result?.refreshToken ?? ""
          );
          // 신규 발급된 토큰을 저장하는 콜백 실행
          if (this.reissueTokenSuccessCallback) {
            this._log(
              "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 성공 콜백 호출"
            );
            await this.reissueTokenSuccessCallback(
              result?.accessToken ?? "",
              result?.refreshToken ?? ""
            );
            this._log(
              "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 성공 콜백 호출 완료"
            );
          }
        }
        this._log("[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 성공");

        // 현재 요청 재시도
        this._log("[RemoteRequestImpl] handleTokenRefresh :: 현재 요청 재시도");
        const currentResponse = await this._axiosInstance(originalRequest);

        // 큐에 쌓인 모든 요청 재시도
        this._log(
          "[RemoteRequestImpl] handleTokenRefresh :: 대기열 요청들 처리 시작"
        );
        await this.processQueue(null);

        // 현재 요청 결과 반환
        this._log(
          "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 성공, 현재 요청 결과 재반환"
        );

        return currentResponse;
      } catch (refreshError: unknown) {
        // 토큰 재발급 실패 시 큐에 쌓인 모든 요청 실패 처리
        this._error(
          "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 실패",
          refreshError
        );

        const rejectPromise = Promise.reject(refreshError);

        await this.processQueue(refreshError);
        this._log(
          "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 실패 - 대기열 요청들 실패 처리"
        );

        if (this.reissueTokenFailureCallback) {
          this._log(
            "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 실패 콜백 호출"
          );
          await this.reissueTokenFailureCallback();
          this._log(
            "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 실패 콜백 호출 완료"
          );
        }

        this._log(
          "[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 최종 실패"
        );
        return rejectPromise;
      } finally {
        this.isRefreshingToken = false;
        this._log("[RemoteRequestImpl] handleTokenRefresh :: 토큰 재발급 완료");
      }
    }

    // 토큰 만료 에러가 아니거나 이미 재시도한 요청이면 원본 에러 반환
    return Promise.reject(error);
  }

  /**
   * 토큰 재발급 대기 큐 처리
   * - 토큰 재발급 성공 시: 큐에 쌓인 모든 요청을 재시도(resolve)
   * - 토큰 재발급 실패 시: 큐에 쌓인 모든 요청을 실패 처리(reject)
   */
  // MARK: - Process Queue Handler
  private async processQueue(error: unknown) {
    // Promise.all로 큐 병렬 처리
    await Promise.all(
      this.failedQueue.map(async ({ resolve, reject, originalRequest }) => {
        if (error) {
          // 토큰 재발급 실패 시 즉시 reject
          reject(error);
          return;
        }

        // 토큰 재발급 성공 시 요청 재시도
        // originalRequest의 url이 토큰 재발급 URL이면 무시(재요청하지 않음)
        if (originalRequest.url === this.tokenConfig.tokenReissueUrl) {
          // 토큰 재발급 요청은 큐에서 무시
          return;
        }
        const resp = await this._axiosInstance.request(originalRequest);
        resolve(resp);
      })
    );
    this.failedQueue = [];
  }

  // MARK: - RemoteRequestMethod 구현부
  patch(url: string, data?: unknown): Promise<AxiosResponse<unknown>> {
    return this._axiosInstance.patch(url, data);
  }
  options(url: string): Promise<AxiosResponse<unknown>> {
    return this._axiosInstance.options(url);
  }
  get(url: string): Promise<AxiosResponse<unknown>> {
    return this._axiosInstance.get(url);
  }
  post(url: string, data: unknown): Promise<AxiosResponse<unknown>> {
    return this._axiosInstance.post(url, data);
  }
  put(url: string, data: unknown): Promise<AxiosResponse<unknown>> {
    return this._axiosInstance.put(url, data);
  }
  delete(url: string): Promise<AxiosResponse<unknown>> {
    return this._axiosInstance.delete(url);
  }
  head(url: string): Promise<AxiosResponse<unknown>> {
    return this._axiosInstance.head(url);
  }

  // MARK: - 토큰 재발급 API 호출
  /**
   * [쿠키 인증 방식] 토큰 재발급 API 호출
   * - 서버에서 쿠키 기반 세션 인증을 사용하는 경우 토큰 재발급 엔드포인트로 POST 요청을 보냄
   * @param tokenReissueUrl - 토큰 재발급 엔드포인트 URL
   * @returns void
   */
  private async tokenReissueWhenUseCookie(
    tokenReissueUrl: string
  ): Promise<void> {
    try {
      await this.post(tokenReissueUrl, {});
      this._log("[RemoteRequestImpl] tokenReissue :: 토큰 재발급 성공");
    } catch (error) {
      this._error(
        "[RemoteRequestImpl] tokenReissue :: 토큰 재발급 실패",
        error
      );
      throw error;
    }
  }

  /**
   * [스토리지 인증 방식] 토큰 재발급 API 호출
   * - accessToken/refreshToken을 request body에 담아 토큰 재발급 엔드포인트로 POST 요청을 보냄
   * @param tokenReissueUrl - 토큰 재발급 엔드포인트 URL
   * @param accessToken - 현재 accessToken (옵션)
   * @param refreshToken - 현재 refreshToken (옵션)
   * @returns 재발급된 accessToken과 refreshToken이 담긴 객체
   */
  private async tokenReissueWhenUseStorage(
    tokenReissueUrl: string,
    accessToken: string,
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const response = await this.post(tokenReissueUrl, {
        accessToken: accessToken,
        refreshToken: refreshToken,
      });

      this._log("[RemoteRequestImpl] tokenReissue :: 토큰 재발급 성공");
      return response.data as { accessToken: string; refreshToken: string };
    } catch (error) {
      this._error(
        "[RemoteRequestImpl] tokenReissue :: 토큰 재발급 실패",
        error
      );
      throw error;
    }
  }

  // MARK: - 파라미터 유효성 검사 함수
  /**
   * 토큰 갱신 설정 파라미터 유효성 검사
   * @param tokenConfig - 토큰 갱신 설정 객체
   */
  private checkTokenRefreshConfigParams(tokenConfig: TokenRefreshConfig) {
    if (!tokenConfig.checkTokenExpiredError) {
      throw new Error("checkTokenExpiredError is required");
    }

    if (
      !tokenConfig.tokenReissueUrl ||
      tokenConfig.tokenReissueUrl === "" ||
      !tokenConfig.tokenReissueUrl.includes("https")
    ) {
      throw new Error(
        "tokenReissueUrl은 빈 값이거나 없으면 안 되고, https가 포함되어야 합니다."
      );
    }
  }

  /**
   * 암호화 설정 파라미터 유효성 검사
   * @param encryptionConfig - 암호화 설정 객체
   */
  private checkEncryptionConfigParams(encryptionConfig: EncryptionConfig) {
    if (
      !encryptionConfig.encryptUrlStr &&
      encryptionConfig.encryptUrlStr.includes("/")
    ) {
      throw new Error(
        "[RemoteRequestImpl] encryptUrlStr is required and must not contain '/'"
      );
    }
    if (!encryptionConfig.requestInterceptor) {
      throw new Error("[RemoteRequestImpl] requestInterceptor is required");
    }

    if (!encryptionConfig.responseInterceptor) {
      throw new Error("[RemoteRequestImpl] responseInterceptor is required");
    }
  }

  private checkTokenTransportConfigParams(config: TokenTransportConfig) {
    if (config.tokenTransportType === TokenTransportType.WEB_COOKIE) {
      if (config.fetchAuthTokenMethod) {
        throw new Error(
          "[RemoteRequestImpl] fetchAuthTokenMethod is not Required In Web Cookie Mode"
        );
      }
    }
    if (config.tokenTransportType === TokenTransportType.STORAGE) {
      if (!config.fetchAuthTokenMethod) {
        throw new Error(
          "[RemoteRequestImpl] fetchAuthTokenMethod is required In Storage Mode"
        );
      }
    }
  }
}
