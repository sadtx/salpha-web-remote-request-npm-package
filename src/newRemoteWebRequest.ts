import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

import { RemoteWebRequestMethod as RemoteRequestMethod } from "./remoteWebRequestMehtodType";
import { EncryptionConfig } from "./types/encryption-config";
import { TokenRefreshConfig } from "./types/token-refresh-config";

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export class RemoteRequest implements RemoteRequestMethod {
  private _axiosInstance: AxiosInstance;
  private isRefreshingToken: boolean = false;
  /**
   * 토큰 재발급 중 대기열
   * - 토큰 재발급 중에 발생한 에러를 대기열에 추가
   * - 토큰 재발급 성공 시 대기열의 모든 요청을 재시도
   */
  private failedQueue: Array<{
    resolve: (value: AxiosResponse) => void;
    reject: (error?: unknown) => void;
    originalRequest: CustomAxiosRequestConfig;
  }> = [];

  /**
   * NewRemoteWebRequest 생성자
   *
   * @param baseURL - API 서버의 기본 URL (예: 'https://api.example.com')
   * @param isUseCookie - 쿠키 사용 여부 (인증 토큰 등을 쿠키로 관리할지 결정)
   * @param tokenConfig - 토큰 관련 설정
   * @param encryptionConfig - 암호화 관련 설정
   * @param errorMessages - 에러 메시지 커스터마이징 (선택적)
   */
  // MARK: - Constructor
  constructor(
    baseURL: string,
    isUseCookie: boolean,
    private readonly tokenConfig: TokenRefreshConfig,
    private readonly encryptionConfig?: EncryptionConfig
  ) {
    // Axios 인스턴스 생성
    this._axiosInstance = axios.create({
      baseURL: baseURL,
      withCredentials: isUseCookie, // 쿠키 포함 여부 설정
    });

    /**
     * 요청 인터셉터 설정
     * - 모든 HTTP 요청이 전송되기 전에 실행됨
     * - encryptUrlStr이 요청 URL에 포함된 경우에만 암호화 처리 수행
     */
    // MARK: - Request Interceptor
    this._axiosInstance.interceptors.request.use(async (config) => {
      // encryptUrlStr이 요청 URL에 포함된 경우에만 암호화 인터셉터 실행
      if (
        (config.method === "post" || config.method === "put") &&
        this.encryptionConfig &&
        this.checkUserIsIncludeEncryptUrl(config.url)
      ) {
        try {
          return this.encryptionConfig?.requestInterceptor(config);
        } catch (error) {
          console.error(error);
          return Promise.reject(error);
        }
      }
      // 암호화가 필요하지 않은 경우 원본 설정 그대로 반환
      return config;
    });

    /**
     * 응답 인터셉터 설정
     * - 성공적인 응답과 에러 응답을 모두 처리
     * - 데이터 수신 시 암호화 처리 및 토큰 재발급 수행
     * - url에 encryptUrlStr이 포함된 경우에만 복호화 처리 수행
     */
    // MARK: - Response Interceptor
    this._axiosInstance.interceptors.response.use(
      async (response: AxiosResponse<unknown>) => {
        if (
          response.config.method === "get" &&
          this.encryptionConfig &&
          this.checkUserIsIncludeEncryptUrl(response.config.url)
        ) {
          try {
            return this.encryptionConfig.responseInterceptor(response);
          } catch (error) {
            console.error(error);
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

  //MARK: - Handler
  private checkUserIsIncludeEncryptUrl(
    url: string | null | undefined
  ): boolean {
    if (!url) {
      console.error(
        "[NewRemoteRequestImpl] checkUserIsIncludeEncryptUrl :: url 확인 필요 | ",
        url
      );
      return false;
    }
    const isIncludeEncryptUrl = url.includes(
      this.encryptionConfig?.encryptUrlStr ?? ""
    );
    console.log(
      `[NewRemoteRequestImpl] checkUserIsIncludeEncryptUrl :: url 확인 완료 | url: ${url} | ${
        isIncludeEncryptUrl ? "암호화 문자열 포함" : "암호화 문자열 미포함"
      }`
    );
    return isIncludeEncryptUrl;
  }

  /**
   * 토큰 재발급 처리 로직
   * - 토큰 만료 에러 발생 시 토큰 재발급을 시도
   * - 재발급 중인 경우 대기열에 요청을 추가
   * - 재발급 성공 시 대기열의 모든 요청을 재시도
   */
  // MARK: - Token Refresh Handler
  private async handleTokenRefresh(error: AxiosError): Promise<AxiosResponse> {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    // 요청 정보가 없는 경우 에러 발생
    if (!originalRequest) {
      return Promise.reject(
        this.tokenConfig.urlRequestIsEmpty ??
          new Error(
            "[NewRemoteRequestImpl] handleTokenRefresh :: 요청 정보가 없습니다. 관리자에게 문의해주세요."
          )
      );
    }

    // 토큰 만료 에러인지 확인 (에러 메시지나 타입으로 판단)
    const isTokenExpiredError = this.tokenConfig.checkTokenExpiredError(error);

    console.log("[NewRemoteRequestImpl] handleTokenRefresh Debug");
    console.log(`error.response?.status: ${error.response?.status}`);
    console.log(
      `isTokenExpiredError: ${isTokenExpiredError}, ${
        isTokenExpiredError ? "토큰 만료 에러" : "토큰 만료 에러 아님"
      }`
    );
    console.log(`this.isRefreshingToken: ${this.isRefreshingToken}`);
    console.log(`originalRequest._retry: ${originalRequest._retry}`);

    // 토큰 만료 에러이고 아직 재시도하지 않은 요청인 경우
    if (isTokenExpiredError && !originalRequest._retry) {
      originalRequest._retry = true;

      // 이미 토큰 재발급 중인 경우 대기열에 추가`
      if (this.isRefreshingToken) {
        console.log(
          "[NewRemoteRequestImpl] 토큰 재발급 중 - 요청을 대기열에 추가"
        );
        // 재발급 중이면, 요청을 큐에 저장하고 대기
        return new Promise((resolve, reject) => {
          this.failedQueue.push({ resolve, reject, originalRequest });
        });
      }

      // 토큰 재발급 시작
      console.log("[NewRemoteRequestImpl] 토큰 재발급 시작");
      this.isRefreshingToken = true;

      try {
        // 외부에서 주입받은 토큰 재발급 로직 실행
        await this.tokenConfig.refreshLogic();

        // 현재 요청 먼저 재시도
        console.log("[NewRemoteRequestImpl] 현재 요청 재시도");
        const currentResponse = await this._axiosInstance(originalRequest);

        // 대기열의 모든 요청 재시도
        console.log("[NewRemoteRequestImpl] 대기열 요청들 처리 시작");
        await this.processQueue(null);

        // 현재 요청 결과 반환
        return currentResponse;
      } catch (refreshError) {
        // 토큰 재발급 중 에러 발생 시 대기열의 모든 요청 실패 처리
        console.log(
          "[NewRemoteRequestImpl] 토큰 재발급 실패 - 대기열 요청들 실패 처리"
        );
        await this.processQueue(refreshError);
        return Promise.reject(refreshError);
      } finally {
        this.isRefreshingToken = false;
        console.log("[NewRemoteRequestImpl] 토큰 재발급 완료");
      }
    }

    // 토큰 만료 에러가 아니거나 이미 재시도한 요청인 경우 원본 에러 반환
    return Promise.reject(error);
  }

  /**
   * 대기열 처리 로직
   * - 토큰 재발급 성공 시: 대기열의 모든 요청을 성공 처리
   * - 토큰 재발급 실패 시: 대기열의 모든 요청을 실패 처리
   */
  // MARK: - Process Queue Handler
  private async processQueue(error: Error | unknown) {
    // Promise.all을 사용하여 병렬 처리
    await Promise.all(
      this.failedQueue.map(async ({ resolve, reject, originalRequest }) => {
        try {
          if (error) {
            // 토큰 재발급 실패 시 즉시 reject
            reject(error);
            return;
          }

          // 토큰 재발급 성공 시 요청 재시도
          const resp = await this._axiosInstance.request(originalRequest);
          resolve(resp);
        } catch (e) {
          reject(e);
        }
      })
    );
    this.failedQueue = [];
  }

  //MARK: - RemoteWebRequestMethod 구현
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
}
