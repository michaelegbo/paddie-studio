import { contextBridge } from 'electron';

const studioBaseUrl = (process.env.STUDIO_PUBLIC_BASE_URL || 'https://studio.paddie.io').replace(/\/$/, '');

contextBridge.exposeInMainWorld('STUDIO_DESKTOP', {
  apiBaseUrl: `${studioBaseUrl}/api`,
  publicBaseUrl: studioBaseUrl,
  isDesktop: true,
});
