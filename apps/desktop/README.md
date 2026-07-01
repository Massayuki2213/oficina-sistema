# @hermes/desktop — App Desktop (Electron + React)

Aplicativo instalável no Windows dos PCs da oficina. Conecta na `@hermes/api`,
que por sua vez fala com o PostgreSQL (banco) e o Redis (cache).

## Status
📦 **A migrar do protótipo.** A interface validada está em [`/prototipo/index.html`](../../prototipo/index.html)
(HTML clicável para demonstração). O próximo passo é transformá-la em componentes
React + Electron aqui, reusando a paleta e o layout já aprovados.

## Estrutura prevista
```
apps/desktop/
├── electron/        # processo principal do Electron (janela, menu, updater)
├── src/
│   ├── main.tsx     # entrada do React
│   ├── App.tsx
│   ├── pages/       # Dashboard, Clientes, Orçamento, OS, Estoque, Caixa...
│   ├── components/  # UI (shadcn/ui + Tailwind)
│   ├── lib/api.ts   # cliente HTTP para a @hermes/api
│   └── theme.ts     # cores da seção 8.2 do PLANEJAMENTO.md
└── index.html
```

## Stack
Electron · React · TypeScript · Tailwind CSS · shadcn/ui · Recharts (gráficos) · react-pdf (orçamento/OS)
