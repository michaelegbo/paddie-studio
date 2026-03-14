import { app, BrowserWindow, shell, session } from 'electron';
import keytar from 'keytar';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYCHAIN_SERVICE = 'paddie-studio';
const KEYCHAIN_ACCOUNT = 'studio-session';

const studioBaseUrl = (process.env.STUDIO_PUBLIC_BASE_URL || 'https://studio.paddie.io').replace(/\/$/, '');
const studioLoginUrl = `${studioBaseUrl}/login`;
const studioAppUrl = `${studioBaseUrl}/app`;
const apiOrigin = new URL(studioBaseUrl).origin;

let mainWindow: BrowserWindow | null = null;
let securityHooksAttached = false;

function resolveLocalRendererPath(): string {
  const inDist = path.resolve(__dirname, '../../web/dist/index.html');
  const inResources = path.resolve(process.resourcesPath, 'app.asar.unpacked/apps/web/dist/index.html');

  if (fs.existsSync(inDist)) return inDist;
  if (fs.existsSync(inResources)) return inResources;
  return inDist;
}

function resolvePreloadPath(): string {
  return path.resolve(__dirname, 'preload.js');
}

async function setStudioSessionCookie(sessionId: string): Promise<void> {
  await session.defaultSession.cookies.set({
    url: studioBaseUrl,
    name: 'studio_session',
    value: sessionId,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
  });
}

async function clearStudioSessionCookie(): Promise<void> {
  try {
    await session.defaultSession.cookies.remove(studioBaseUrl, 'studio_session');
  } catch (_error) {
    // noop
  }
}

async function storeSession(payload: {
  sessionId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}): Promise<void> {
  await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, JSON.stringify(payload));
}

async function readStoredSession(): Promise<{ sessionId: string } | null> {
  try {
    const raw = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: string };
    if (!parsed?.sessionId) return null;
    return { sessionId: parsed.sessionId };
  } catch (_error) {
    return null;
  }
}

async function clearStoredSession(): Promise<void> {
  try {
    await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  } catch (_error) {
    // noop
  }
}

async function fetchSessionById(sessionId: string): Promise<{
  sessionId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
} | null> {
  try {
    const response = await fetch(`${studioBaseUrl}/api/auth/session/${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as {
      success?: boolean;
      data?: {
        sessionId: string;
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: string;
      };
    };

    if (!payload?.data?.sessionId) {
      return null;
    }

    return payload.data;
  } catch (_error) {
    return null;
  }
}

function extractDeepLinkUrl(argv: string[]): string | null {
  return argv.find((entry) => entry.startsWith('studio://')) || null;
}

async function handleDeepLink(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
      return;
    }

    const sessionId = String(parsed.searchParams.get('session') || '').trim();
    if (!sessionId) {
      return;
    }

    const remoteSession = await fetchSessionById(sessionId);
    if (!remoteSession) {
      return;
    }

    await storeSession(remoteSession);
    await setStudioSessionCookie(remoteSession.sessionId);

    if (mainWindow) {
      await mainWindow.loadURL(studioAppUrl);
      mainWindow.focus();
    }
  } catch (_error) {
    // noop
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: resolvePreloadPath(),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const stored = await readStoredSession();
  if (stored?.sessionId) {
    await setStudioSessionCookie(stored.sessionId);
  }

  const forceRemote = String(process.env.STUDIO_DESKTOP_REMOTE || '').toLowerCase() === 'true';
  const localRendererPath = resolveLocalRendererPath();

  if (!forceRemote && fs.existsSync(localRendererPath)) {
    const localUrl = new URL(`file://${localRendererPath}`);
    localUrl.searchParams.set('apiBase', `${studioBaseUrl}/api`);
    await mainWindow.loadURL(localUrl.toString());
    return;
  }

  await mainWindow.loadURL(stored?.sessionId ? studioAppUrl : studioLoginUrl);
}

function appendSecurityHeaders(
  headers: Record<string, string | string[]>
): Record<string, string | string[]> {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    `connect-src 'self' ${apiOrigin} https://api.paddie.io wss://studio.paddie.io`,
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://studio.paddie.io",
  ].join('; ');

  return {
    ...headers,
    'Content-Security-Policy': [csp],
  };
}

function attachDesktopSecurityHooks(): void {
  if (securityHooksAttached) return;
  securityHooksAttached = true;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isStudioResource =
      details.url.startsWith(studioBaseUrl) || details.url.startsWith('file://');

    if (!isStudioResource) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    callback({
      responseHeaders: appendSecurityHeaders((details.responseHeaders || {}) as Record<string, string | string[]>),
    });
  });

  session.defaultSession.webRequest.onCompleted(
    {
      urls: [`${studioBaseUrl}/api/auth/logout*`],
    },
    async (details) => {
      if (details.statusCode >= 200 && details.statusCode < 400) {
        await clearStoredSession();
        await clearStudioSessionCookie();
        if (mainWindow) {
          await mainWindow.loadURL(studioLoginUrl);
        }
      }
    }
  );
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const deepLink = extractDeepLinkUrl(argv);
    if (deepLink) {
      void handleDeepLink(deepLink);
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAsDefaultProtocolClient('studio');
    attachDesktopSecurityHooks();

    await createWindow();

    const deepLink = extractDeepLinkUrl(process.argv);
    if (deepLink) {
      await handleDeepLink(deepLink);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    void handleDeepLink(url);
  });

  app.on('before-quit', async () => {
    const shouldClear = String(process.env.STUDIO_DESKTOP_CLEAR_SESSION_ON_EXIT || '').toLowerCase() === 'true';
    if (shouldClear) {
      await clearStoredSession();
      await clearStudioSessionCookie();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
