export interface ServerConfig {
  port: number;
}

export interface MongoConfig {
  uri: string;
  database: string;
}

export interface RedisConfig {
  url: string;
  prefix: string;
}

export interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  deploymentName: string;
  apiVersion: string;
  gpt5MiniDeployment?: string;
}

export interface OIDCConfig {
  issuer: string;
  clientIdWeb: string;
  clientIdDesktop: string;
  redirectUriWeb: string;
  redirectUriDesktop: string;
  scope: string;
}

export interface PaddieConfig {
  apiBaseUrl: string;
}

export interface StudioConfig {
  server: ServerConfig;
  mongoDB: MongoConfig;
  redis: RedisConfig;
  azureOpenAI: AzureOpenAIConfig;
  oidc: OIDCConfig;
  paddie: PaddieConfig;
  jwt: {
    secret: string;
    expiresIn: string;
  };
}

const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:4300';
const paddieApiBase = process.env.PADDIE_API_BASE_URL || 'https://api.paddie.io';

export const config: StudioConfig = {
  server: {
    port: Number(process.env.PORT || 4300),
  },
  mongoDB: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    database: process.env.MONGODB_DATABASE || 'studio_prod',
  },
  redis: {
    url: process.env.REDIS_URL || '',
    prefix: process.env.REDIS_PREFIX || 'studio:',
  },
  azureOpenAI: {
    apiKey: process.env.AZURE_OPENAI_API_KEY || '',
    endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
    deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1',
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
    gpt5MiniDeployment: process.env.AZURE_OPENAI_GPT5_MINI_DEPLOYMENT || '',
  },
  oidc: {
    issuer: process.env.PADDIE_OIDC_ISSUER || paddieApiBase,
    clientIdWeb: process.env.STUDIO_OIDC_CLIENT_ID_WEB || 'studio-web',
    clientIdDesktop: process.env.STUDIO_OIDC_CLIENT_ID_DESKTOP || 'studio-desktop',
    redirectUriWeb: process.env.STUDIO_OIDC_REDIRECT_URI_WEB || `${publicBaseUrl}/auth/callback`,
    redirectUriDesktop:
      process.env.STUDIO_OIDC_REDIRECT_URI_DESKTOP || 'studio://auth/callback',
    scope: process.env.STUDIO_OIDC_SCOPE || 'openid profile email',
  },
  paddie: {
    apiBaseUrl: paddieApiBase,
  },
  jwt: {
    secret: process.env.STUDIO_JWT_SECRET || 'studio-dev-secret-change-me',
    expiresIn: process.env.STUDIO_JWT_EXPIRES || '15m',
  },
};
