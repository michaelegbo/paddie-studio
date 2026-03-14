import { app, BrowserWindow, shell } from "electron";

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const studioUrl = process.env.STUDIO_WEB_URL ?? "https://studio.paddie.io/login";
  void window.loadURL(studioUrl);

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
