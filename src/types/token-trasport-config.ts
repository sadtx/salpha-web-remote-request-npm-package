export enum TokenTransportType {
  WEB_COOKIE,
  STORAGE,
}

export interface TokenTransportConfig {
  tokenTransportType: TokenTransportType;
  fetchAuthTokenMethod?: (() => Promise<string>) | null;
}
