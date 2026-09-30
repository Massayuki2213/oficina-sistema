// ============================================================
// Hermes — app de desktop (Windows).
//
// É uma JANELA para o servidor da oficina, não uma segunda cópia do
// sistema: o banco, as regras e a tela moram no servidor (a API
// serve a tela). Assim todos os PCs veem os mesmos dados, e atualizar
// o servidor atualiza todo mundo de uma vez.
//
// O que este arquivo faz:
//  - guarda o endereço do servidor (userData/config.json);
//  - abre a tela de configuração quando não há servidor ou ele não responde;
//  - segurança: sem Node na página, isolamento de contexto, sandbox;
//    só navega dentro do servidor escolhido; link externo (WhatsApp)
//    abre no navegador padrão.
// ============================================================

const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ARQUIVO_CONFIG = () => path.join(app.getPath('userData'), 'config.json');
const PAGINA_CONFIG = path.join(__dirname, 'configurar.html');

/** @type {BrowserWindow | null} */
let janela = null;

function lerConfig() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO_CONFIG(), 'utf8'));
  } catch {
    return {};
  }
}

function salvarConfig(dados) {
  fs.mkdirSync(path.dirname(ARQUIVO_CONFIG()), { recursive: true });
  fs.writeFileSync(ARQUIVO_CONFIG(), JSON.stringify({ ...lerConfig(), ...dados }, null, 2));
}

/** "192.168.0.10:3333" → "http://192.168.0.10:3333". Devolve null se não for um endereço. */
function normalizarEndereco(texto) {
  let t = String(texto ?? '').trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) t = `http://${t}`;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** O servidor responde e é mesmo o Hermes? */
async function testarServidor(origem) {
  const controle = new AbortController();
  const tempo = setTimeout(() => controle.abort(), 5000);
  try {
    const r = await fetch(`${origem}/api/health`, { signal: controle.signal });
    const dados = await r.json().catch(() => null);
    if (!r.ok || !dados || typeof dados.versao !== 'string') return { ok: false, erro: 'Esse endereço respondeu, mas não é o servidor do Hermes.' };
    return { ok: true, versao: dados.versao, banco: dados.banco };
  } catch (e) {
    const motivo = e && e.name === 'AbortError' ? 'O servidor não respondeu em 5 segundos' : 'Não foi possível conectar ao servidor';
    return { ok: false, erro: `${motivo}. Confira o endereço e se o computador do servidor está ligado.` };
  } finally {
    clearTimeout(tempo);
  }
}

function abrirConfiguracao(motivo) {
  if (!janela) return;
  const query = motivo ? { motivo } : {};
  void janela.loadFile(PAGINA_CONFIG, { query });
}

async function abrirSistema() {
  const { servidor } = lerConfig();
  const origem = normalizarEndereco(servidor);
  if (!origem) return abrirConfiguracao();
  const teste = await testarServidor(origem);
  if (!teste.ok) return abrirConfiguracao(teste.erro);
  void janela.loadURL(origem);
}

/** A página só pode ir para o servidor escolhido (ou para a tela de configuração). */
function navegacaoPermitida(url) {
  if (url.startsWith('file://')) return new URL(url).pathname.endsWith('/configurar.html');
  const origem = normalizarEndereco(lerConfig().servidor);
  try {
    return !!origem && new URL(url).origin === origem;
  } catch {
    return false;
  }
}

function abrirFora(url) {
  // Só http(s) e wa.me vão para fora — nunca file:, javascript: etc.
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Hermes',
    backgroundColor: '#EEF2F5',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  janela.maximize();
  janela.once('ready-to-show', () => janela.show());

  // Links com target=_blank (WhatsApp, documentação): navegador padrão.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    abrirFora(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!navegacaoPermitida(url)) {
      evento.preventDefault();
      abrirFora(url);
    }
  });
  // Servidor caiu no meio do dia: mostra a configuração com o motivo, em vez de uma tela branca.
  janela.webContents.on('did-fail-load', (_e, codigo, descricao, url, principal) => {
    if (principal && !String(url).startsWith('file://') && codigo !== -3) {
      abrirConfiguracao(`Sem conexão com o servidor (${descricao}).`);
    }
  });

  void abrirSistema();
}

function montarMenu() {
  const modelo = [
    {
      label: 'Hermes',
      submenu: [
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => void abrirSistema() },
        { label: 'Trocar servidor...', click: () => abrirConfiguracao() },
        { type: 'separator' },
        { label: 'Imprimir', accelerator: 'CmdOrCtrl+P', click: () => janela?.webContents.print() },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'zoomIn', label: 'Aumentar' },
        { role: 'zoomOut', label: 'Diminuir' },
        { role: 'resetZoom', label: 'Tamanho normal' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }]),
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o Hermes',
          click: () =>
            void dialog.showMessageBox(janela, {
              type: 'info',
              title: 'Sobre o Hermes',
              message: `Hermes ${app.getVersion()}`,
              detail: `Gestão de oficina mecânica.\nServidor: ${lerConfig().servidor ?? 'não configurado'}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo));
}

// ---- Tela de configuração (só ela fala com o processo principal) ----

function daPaginaDeConfiguracao(evento) {
  const url = evento.senderFrame?.url ?? '';
  return url.startsWith('file://') && new URL(url).pathname.endsWith('/configurar.html');
}

ipcMain.handle('hermes:atual', (evento) => (daPaginaDeConfiguracao(evento) ? lerConfig().servidor ?? '' : ''));

ipcMain.handle('hermes:testar', async (evento, texto) => {
  if (!daPaginaDeConfiguracao(evento)) return { ok: false, erro: 'Não permitido.' };
  const origem = normalizarEndereco(texto);
  if (!origem) return { ok: false, erro: 'Endereço inválido. Exemplo: 192.168.0.10:3333' };
  return { ...(await testarServidor(origem)), origem };
});

ipcMain.handle('hermes:conectar', async (evento, texto) => {
  if (!daPaginaDeConfiguracao(evento)) return { ok: false, erro: 'Não permitido.' };
  const origem = normalizarEndereco(texto);
  if (!origem) return { ok: false, erro: 'Endereço inválido. Exemplo: 192.168.0.10:3333' };
  const teste = await testarServidor(origem);
  if (!teste.ok) return teste;
  salvarConfig({ servidor: origem });
  void janela?.loadURL(origem);
  return { ok: true };
});

// ---- Ciclo de vida ----

// Um Hermes aberto por PC: clicar no atalho de novo traz a janela para frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });
  app.whenReady().then(() => {
    montarMenu();
    criarJanela();
  });
  app.on('window-all-closed', () => app.quit());
}
