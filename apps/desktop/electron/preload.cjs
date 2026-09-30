// Ponte mínima entre a tela de configuração e o processo principal.
// A página do servidor também recebe este preload, mas o processo principal
// só atende quem é a configurar.html local (ver daPaginaDeConfiguracao).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hermesDesktop', {
  atual: () => ipcRenderer.invoke('hermes:atual'),
  testar: (endereco) => ipcRenderer.invoke('hermes:testar', endereco),
  conectar: (endereco) => ipcRenderer.invoke('hermes:conectar', endereco),
});
