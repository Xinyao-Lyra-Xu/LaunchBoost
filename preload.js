const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  loadData: () => ipcRenderer.invoke("load-data"),
  saveData: (data) => ipcRenderer.invoke("save-data", data),
  splitTask: (taskData) => ipcRenderer.invoke("split-task", taskData),
  logError: (message) => ipcRenderer.invoke("log-error", message),
  getApiKeyStatus: () => ipcRenderer.invoke("get-api-key-status"),
  setApiKey: (key) => ipcRenderer.invoke("set-api-key", key),
});
