import { AxiosResponse } from "axios";

/**
 * @interface RemoteRequestMethod
 * @description HTTP 요청 메서드들을 정의하는 인터페이스
 */
export interface RemoteRequestMethod {
  /**
   * POST 요청을 보냅니다
   * @param {string} url - 요청 URL
   * @param {unknown} [data] - 요청 본문 데이터
   * @returns {Promise<AxiosResponse>} HTTP 응답
   */
  post(url: string, data?: unknown): Promise<AxiosResponse>;

  /**
   * PUT 요청을 보냅니다
   * @param {string} url - 요청 URL
   * @param {unknown} [data] - 요청 본문 데이터
   * @returns {Promise<AxiosResponse>} HTTP 응답
   */
  put(url: string, data?: unknown): Promise<AxiosResponse>;

  /**
   * GET 요청을 보냅니다
   * @param {string} url - 요청 URL
   * @returns {Promise<AxiosResponse>} HTTP 응답
   */
  get(url: string): Promise<AxiosResponse>;

  /**
   * DELETE 요청을 보냅니다
   * @param {string} url - 요청 URL
   * @returns {Promise<AxiosResponse>} HTTP 응답
   */
  delete(url: string): Promise<AxiosResponse>;

  /**
   * PATCH 요청을 보냅니다
   * @param {string} url - 요청 URL
   * @param {unknown} [data] - 요청 본문 데이터
   * @returns {Promise<AxiosResponse>} HTTP 응답
   */
  patch(url: string, data?: unknown): Promise<AxiosResponse>;

  /**
   * HEAD 요청을 보냅니다
   * @param {string} url - 요청 URL
   * @returns {Promise<AxiosResponse>} HTTP 응답
   */
  head(url: string): Promise<AxiosResponse>;

  /**
   * OPTIONS 요청을 보냅니다
   * @param {string} url - 요청 URL
   * @returns {Promise<AxiosResponse>} HTTP 응답
   */
  options(url: string): Promise<AxiosResponse>;
}
