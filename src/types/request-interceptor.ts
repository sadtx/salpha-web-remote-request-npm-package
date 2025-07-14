import { AxiosResponse, InternalAxiosRequestConfig } from "axios";

export type RequestInterceptor = (
  config: InternalAxiosRequestConfig
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

export type ResponseInterceptor = (
  response: AxiosResponse
) => AxiosResponse | Promise<AxiosResponse>;

export type TokenRefreshLogic = () => Promise<void>;
