export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  arkApiKey: process.env.ARK_API_KEY ?? "",
  arkApiBaseUrl: process.env.ARK_API_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
  arkModel: process.env.ARK_MODEL ?? "",
  arkEmbeddingModel: process.env.ARK_EMBEDDING_MODEL ?? "",
  embeddingApiKey: process.env.EMBEDDING_API_KEY ?? process.env.ARK_API_KEY ?? "",
  embeddingApiBaseUrl:
    process.env.EMBEDDING_API_BASE_URL ??
    process.env.ARK_API_BASE_URL ??
    "https://ark.cn-beijing.volces.com/api/v3",
  embeddingModel: process.env.EMBEDDING_MODEL ?? process.env.ARK_EMBEDDING_MODEL ?? "",
  difyApiBaseUrl: process.env.DIFY_API_BASE_URL ?? "",
  difyApiKey: process.env.DIFY_API_KEY ?? "",
  volcSpeechAppId: process.env.VOLC_SPEECH_APP_ID ?? "",
  volcSpeechAccessKey: process.env.VOLC_SPEECH_ACCESS_KEY ?? "",
};
