# Hermes — Sistema de Gestão para Oficina Mecânica
### Documento de Planejamento e Arquitetura — v1.2

> **Nome do sistema:** `Hermes` *(nome da oficina — Hermes, o deus grego da velocidade e do comércio: combina com a proposta de agilidade)*
> **Cliente:** Oficina Hermes
> **Objetivo:** Demonstrar um sistema completo, ágil e flexível que substitua o caderno (hoje é tudo na mão) e organize todo o fluxo da oficina, do orçamento ao lucro.
> **Data:** 01/07/2026 · **Atualizado:** 03/07/2026 (v1.2 — status real do projeto + roadmap até 100% funcional)

---

## 1. Visão Geral

O `Hermes` é um sistema **desktop** instalado nos computadores da oficina, com **banco de dados compartilhado na nuvem** — ou seja, todos os PCs enxergam a mesma informação em tempo real. O foco é **agilidade no balcão** (fazer um orçamento em segundos) e **controle financeiro** (saber quanto entrou, saiu e sobrou).

### O que o sistema resolve (a "dor" da oficina)
| Problema hoje | Como o sistema resolve |
|---|---|
| Orçamento feito no papel, some | Orçamento digital, imprime, vira Ordem de Serviço com 1 clique |
| Não sabe quanto tem de peça no estoque | Estoque baixa automático quando a peça é usada |
| Não sabe se teve lucro no mês | Livro-caixa + relatório de lucro automático |
| Cliente liga e ninguém lembra do histórico | Histórico completo por cliente e por carro |
| Esquece de cobrar serviço/retorno | Agenda de visitas e alertas |

---

## 2. Perfis de Acesso (2 a 5 usuários)

Como você tem entre 2 e 5 pessoas, o sistema controla **quem pode ver e fazer o quê**. Isso protege o financeiro e evita erros.

| Perfil | Pode fazer | NÃO pode |
|---|---|---|
| **Dono / Administrador** | Tudo: financeiro, relatórios, cadastros, usuários, apagar registros | — |
| **Atendente / Recepção** | Cadastrar cliente/carro, fazer orçamento, abrir OS, receber pagamento | Ver lucro total, alterar preço de custo, apagar histórico |
| **Mecânico** | Ver OS atribuídas, apontar serviço executado, dar baixa em peça | Ver financeiro, mexer em preços, cadastrar cliente |

> **Regra:** toda ação importante fica registrada com **quem fez e quando** (log de auditoria). Isso dá segurança e resolve o clássico "quem apagou isso?".

---

## 3. Módulos do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                        HERMES                           │
├───────────────┬───────────────┬──────────────┬──────────────┤
│  CADASTROS    │  OPERAÇÃO      │  ESTOQUE     │  FINANCEIRO  │
│  • Clientes   │  • Orçamento   │  • Peças     │  • Livro     │
│  • Carros     │  • Ordem de    │  • Produtos  │    Caixa     │
│  • Serviços   │    Serviço(OS) │  • Fornec.   │  • Despesas  │
│  • Peças/Prod │  • Agenda/     │  • Entrada/  │  • Contas a  │
│  • Fornecedor │    Visitas     │    Saída     │    receber   │
│  • Usuários   │  • Ajuda/      │  • Inventário│  • Relatório │
│               │    Suporte     │              │    de Lucro  │
└───────────────┴───────────────┴──────────────┴──────────────┘
```

---

## 4. Modelo de Domínio (as "tabelas" do sistema)

Aqui está o coração do sistema — como as informações se conectam.

```
CLIENTE ──(1:N)── CARRO ──(1:N)── ORDEM_DE_SERVIÇO
   │                                     │
   │                                     ├──(N:M)── SERVIÇO   (via OS_SERVIÇO)
   │                                     ├──(N:M)── PEÇA      (via OS_PEÇA → baixa estoque)
   │                                     └──(1:1)── ORÇAMENTO (origem da OS)
   │
   └──(1:N)── VISITA / AGENDAMENTO

PEÇA / PRODUTO ──(N:1)── FORNECEDOR
PEÇA / PRODUTO ──(1:N)── MOVIMENTO_ESTOQUE (entrada/saída)

ORDEM_DE_SERVIÇO ──(1:1)── LANÇAMENTO_CAIXA (quando paga)
DESPESA ──(N:1)── CATEGORIA_DESPESA
LANÇAMENTO_CAIXA (entradas e saídas) → alimenta RELATÓRIO_LUCRO
```

### 4.1 Entidades e campos principais

**CLIENTE**
`id`, `nome`, `tipo (PF/PJ)`, `cpf_cnpj`, `telefone`, `whatsapp`, `email`, `endereço`, `observações`, `data_cadastro`, `ativo`

**CARRO (Veículo)**
`id`, `cliente_id`, `placa`, `marca`, `modelo`, `ano`, `cor`, `km_atual`, `chassi`, `combustível`, `observações`

**SERVIÇO** (catálogo do que a oficina faz)
`id`, `nome` (ex: "Troca de óleo"), `descrição`, `preço_mão_de_obra`, `tempo_estimado`, `categoria` (motor, suspensão, elétrica...), `ativo`

**PEÇA / PRODUTO**
`id`, `nome`, `código/SKU`, `tipo (peça/produto)`, `fornecedor_id`, `preço_custo`, `preço_venda`, `margem_%`, `estoque_atual`, `estoque_mínimo`, `unidade` (un, L, kg), `localização` (prateleira), `ativo`

**FORNECEDOR**
`id`, `nome`, `cnpj`, `contato`, `telefone`, `prazo_entrega`, `observações`

**ORÇAMENTO**
`id`, `cliente_id`, `carro_id`, `data`, `validade`, `status` (rascunho/enviado/aprovado/recusado/expirado), `itens_serviço[]`, `itens_peça[]`, `subtotal`, `desconto`, `total`, `observações`

**ORDEM DE SERVIÇO (OS)**
`id`, `orçamento_id`, `cliente_id`, `carro_id`, `mecânico_id`, `data_abertura`, `data_prevista`, `data_conclusão`, `status` (aberta/em execução/aguardando peça/aguardando aprovação/concluída/entregue/cancelada), `km_entrada`, `itens_serviço[]`, `itens_peça[]`, `total`, `forma_pagamento`, `pago (sim/não)`

**VISITA / AGENDAMENTO**
`id`, `cliente_id`, `carro_id`, `data_hora`, `tipo` (revisão, retorno, orçamento, garantia), `status` (agendada/confirmada/realizada/faltou), `observações`

**LANÇAMENTO_CAIXA (Livro-Caixa)**
`id`, `data`, `tipo` (entrada/saída), `origem` (OS, venda avulsa, despesa, aporte), `descrição`, `valor`, `forma_pagamento`, `categoria`, `os_id` (se vier de uma OS), `usuário_id`

**DESPESA**
`id`, `data`, `categoria` (aluguel, energia, salário, ferramenta, compra de peça...), `descrição`, `valor`, `fornecedor_id`, `recorrente (sim/não)`, `pago`

---

## 5. Regras de Negócio (funcionais e reais)

Estas são as regras que fazem o sistema **evitar erros** e **funcionar como uma oficina de verdade**.

### 5.1 Estoque
- **RN-01** — Ao usar uma peça numa OS, o `estoque_atual` **baixa automaticamente**.
- **RN-02** — Se o estoque chegar no `estoque_mínimo`, o sistema **alerta** ("Comprar filtro de óleo — restam 2").
- **RN-03** — Não é permitido usar peça com estoque zerado sem confirmar "venda sob encomenda" (marca a OS como *aguardando peça*).
- **RN-04** — Toda entrada de peça (compra) gera um `MOVIMENTO_ESTOQUE` e recalcula o **custo médio**.
- **RN-05** — O `preço_venda` sugerido = `preço_custo` + margem % configurada (mas pode editar na hora).

### 5.2 Orçamento → Ordem de Serviço
- **RN-06** — Orçamento tem **validade** (ex: 15 dias). Depois disso, muda para *expirado* sozinho.
- **RN-07** — Orçamento **aprovado** vira OS com 1 clique, copiando todos os itens (não redigita nada). → **Agilidade**
- **RN-08** — Só o Dono/Atendente pode dar **desconto**; desconto acima de X% pede senha do Dono.
- **RN-09** — O total da OS = soma da mão de obra dos serviços + soma das peças − desconto.
- **RN-10** — OS não pode ser marcada como *concluída* sem pelo menos 1 serviço OU 1 peça.

### 5.3 Caixa e Financeiro
- **RN-11** — OS marcada como **paga** gera **automaticamente** uma entrada no livro-caixa.
- **RN-11.1** — Formas de pagamento aceitas: **à vista, PIX, cartão, parcelado e fiado**. No parcelado/fiado, o sistema cria **Contas a Receber** com as parcelas e vencimentos, e cada parcela recebida vira uma entrada no caixa. → *por isso o cadastro de cliente é essencial: fiado é sempre vinculado a um cliente.*
- **RN-11.2** — Cliente com fiado em atraso aparece em **alerta** e (opcional) fica bloqueado para novo fiado até quitar.
- **RN-12** — Toda despesa gera uma **saída** no livro-caixa.
- **RN-13** — **Lucro do período** = (entradas) − (saídas) − (custo das peças vendidas).
- **RN-14** — O sistema separa **faturamento** (o que entrou) de **lucro** (o que sobrou de verdade) — muita gente confunde isso.
- **RN-15** — Fechamento de caixa diário: mostra abertura, entradas, saídas e saldo esperado x contado.

### 5.4 Cliente e Carro
- **RN-16** — Placa é **única** por carro; ao digitar a placa, se já existe, puxa o histórico.
- **RN-17** — Histórico do carro mostra **todos os serviços já feitos**, com data e KM → ótimo para vender revisão.
- **RN-18** — Serviço com **garantia de 15 dias**: se o carro voltar dentro do prazo pelo mesmo problema, abre OS de **garantia** (sem cobrar).

### 5.5 Agenda / Visitas / Ajuda
- **RN-19** — Agendamento avisa conflito de horário.
- **RN-20** — Cliente com revisão vencida (por KM ou data) aparece numa lista de "**oportunidades de retorno**".
- **RN-21** — Módulo de **Ajuda/Suporte**: base de dúvidas frequentes + registro de chamados internos (ex: "impressora não imprime OS").

---

## 6. Fluxo Principal (do carro na porta ao lucro)

```
1. Cliente chega → Atendente busca pela PLACA
        │
        ▼
2. Existe? Puxa histórico.  Não existe? Cadastra cliente + carro (rápido)
        │
        ▼
3. Cria ORÇAMENTO: adiciona serviços (catálogo) + peças (estoque)
        │  → sistema calcula total na hora
        ▼
4. Imprime / manda no WhatsApp → cliente APROVA
        │
        ▼
5. 1 clique: Orçamento vira ORDEM DE SERVIÇO → atribui ao MECÂNICO
        │  → peças baixam do estoque
        ▼
6. Mecânico executa e aponta "concluído"
        │
        ▼
7. Atendente RECEBE o pagamento → entra no LIVRO-CAIXA automático
        │
        ▼
8. Fim do mês: RELATÓRIO mostra faturamento, despesas e LUCRO real
```

Esse fluxo é o que você vai **demonstrar** para a oficina: em menos de 1 minuto, da placa ao orçamento pronto. É aí que se vê a **agilidade e flexibilidade**.

---

## 7. Arquitetura Técnica

### 7.1 Stack recomendada (para Desktop + banco compartilhado)

| Camada | Tecnologia | Por quê |
|---|---|---|
| **App Desktop** | **Electron** + **React** + **TypeScript** | Instala como programa no Windows, mas usa tecnologia web → interface bonita, moderna e rápida de construir. Roda em qualquer PC. |
| **Interface (UI)** | **Tailwind CSS** + **shadcn/ui** | Componentes prontos, visual profissional, telas consistentes. |
| **Banco de dados** | **PostgreSQL** na nuvem (Supabase / Neon / Railway) | Todos os PCs compartilham os mesmos dados em tempo real. Como sua internet é boa, funciona perfeito. |
| **Acesso a dados** | **Prisma ORM** | Escreve/lê o banco com segurança e sem SQL cru repetido. |
| **API / regras** | **Node.js + Fastify** (ou NestJS) | Onde ficam as regras de negócio (RN-01 a RN-21), separadas da tela. |
| **Login/segurança** | **JWT + perfis de acesso** | Controla os 3 perfis (Dono, Atendente, Mecânico). |
| **Impressão/PDF** | **react-pdf / pdfmake** | Gera orçamento e OS em PDF para imprimir ou mandar no WhatsApp. |
| **Relatórios/gráficos** | **Recharts** | Gráficos de faturamento, lucro, despesas. |

> **Alternativa mais leve:** trocar Electron por **Tauri** (app menor e mais rápido). Recomendo começar com Electron pela facilidade e migrar depois, se necessário.

### 7.2 Como os PCs conversam

```
   PC Recepção ─┐
                │
   PC Dono ─────┼──── (internet) ──── API (nuvem) ──── PostgreSQL (nuvem)
                │
   PC Oficina ──┘
```
Cada PC tem o app instalado; todos leem/gravam no mesmo banco. Ninguém trabalha "desatualizado".

### 7.3 Backup e segurança
- **Backup automático diário** do banco (a própria nuvem já faz).
- Senhas **criptografadas**.
- Log de auditoria (quem fez o quê).
- **LGPD:** dados de cliente ficam protegidos; só quem tem acesso vê CPF/telefone.

---

## 8. Design e Identidade Visual

### 8.1 Conceito
Oficina remete a: **confiança, robustez, energia, mecânica**. O design precisa ser **limpo e fácil** (as pessoas não são técnicas em computador), com **botões grandes** e **poucos cliques**.

### 8.2 Paleta de cores proposta

| Cor | Hex | Uso |
|---|---|---|
| 🔵 **Azul Petróleo (primária)** | `#0F3D57` | Cabeçalhos, menu lateral, confiança/profissionalismo |
| 🟠 **Laranja Oficina (destaque)** | `#F26522` | Botões de ação ("Novo Orçamento", "Salvar"), energia/atenção |
| ⚫ **Grafite (texto/estrutura)** | `#1E2A33` | Textos e fundo escuro opcional |
| ⚪ **Cinza Claro (fundo)** | `#F4F6F8` | Fundo das telas, respiro visual |
| 🟢 **Verde (sucesso)** | `#2FB37A` | "Pago", "Concluído", saldo positivo |
| 🔴 **Vermelho (alerta)** | `#E24C4B` | Estoque baixo, atraso, saldo negativo |

> **Por que azul + laranja?** É a combinação clássica do universo automotivo (transmite mecânica, ferramenta, segurança) e tem **alto contraste** — fácil de ler mesmo numa tela suja de oficina, à distância.

### 8.3 Princípios de interface
- **Menu lateral fixo** com os 4 grupos (Cadastros, Operação, Estoque, Financeiro).
- **Busca por placa/nome sempre visível** no topo.
- **Tela inicial (Dashboard):** OS do dia, agenda, alertas de estoque, resumo do caixa.
- **Botões grandes e ícones claros** (recepção usa rápido).
- **Tema claro** por padrão; opção de tema escuro.
- Fonte legível: **Inter** ou **Roboto**.

---

## 9. Telas Principais (rascunho)

```
┌──────────────────────────────────────────────────────────────┐
│  HERMES      🔍 [ Buscar placa / cliente... ]     👤 Dono│
├────────────┬─────────────────────────────────────────────────┤
│ 🏠 Início  │   PAINEL DO DIA                                  │
│ 👥 Clientes│   ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│ 🚗 Carros  │   │ OS Abertas│ │ Caixa Hoje│ │ Estoque  │        │
│ 🔧 Serviços│   │    7      │ │  R$ 1.240 │ │ ⚠️ 3 baixos│       │
│ 📦 Estoque │   └──────────┘ └──────────┘ └──────────┘         │
│ 📄 Orçamento│  AGENDA DE HOJE          OS EM ANDAMENTO         │
│ 🛠️ Ordens   │  • 09h Gol - Revisão     • #142 Onix - João      │
│ 📅 Agenda  │   • 11h HB20 - Freio      • #143 Fiesta - Pedro   │
│ 💰 Caixa   │                                                  │
│ 📉 Despesas│   ALERTAS                                        │
│ 📊 Relatóri│   ⚠️ Filtro de óleo: 2 restantes                  │
│ ⚙️ Config  │   🔔 3 clientes com revisão vencida               │
└────────────┴─────────────────────────────────────────────────┘
```

Telas que vou detalhar na próxima fase: Dashboard, Cadastro de Cliente/Carro, Novo Orçamento, Ordem de Serviço, Estoque, Livro-Caixa e Relatório de Lucro.

---

## 10. Relatórios e Indicadores

- **Faturamento** por período (dia/semana/mês).
- **Lucro real** (entradas − despesas − custo de peça).
- **Serviços mais vendidos** e **peças mais usadas**.
- **Clientes que mais gastam** e **ranking de retorno**.
- **Despesas por categoria** (onde está indo o dinheiro).
- **Produtividade por mecânico** (nº de OS, tempo médio).
- **Estoque parado** (peça que não gira).

---

## 11. Status Atual e Roadmap até 100% Funcional

### 11.1 O que já está pronto ✅ (Fases 1 a 4 concluídas)

**Infraestrutura e back-end**
- Monorepo (npm workspaces) com **API** e **app Desktop** separados.
- **PostgreSQL 16 + Redis 7** em Docker; segredos em `.env`.
- **API Node.js + Fastify + TypeScript**, **Prisma ORM** e cache Redis.
- **Login + JWT** com os 3 perfis (Dono, Atendente, Mecânico) e permissões por ação.
- **13 módulos** de negócio, com as regras RN-01 a RN-21 aplicadas no núcleo.

**App (telas funcionais, ligadas à API de verdade)**
- 🏠 Dashboard · 👥 Clientes · 🚗 Carros · 🔧 Serviços · 📦 Estoque (com **leitor de código de barras**)
- 📄 Orçamentos (montador + **aprovar → OS em 1 clique**, baixando estoque) · 🛠️ Ordens de Serviço (fluxo de status + **receber pagamento**) · 📅 Agenda
- 💰 Livro-Caixa · 📉 Despesas · 🧾 Contas a Receber · 📊 Relatórios (com gráficos)
- **Cenário de demonstração** completo e consistente (seed) + telas que **não quebram** em resoluções menores.

> Traduzindo: **o fluxo de negócio inteiro — do orçamento ao lucro — já funciona.** É a parte mais difícil, e ela está de pé.

### 11.2 Onde estamos (avaliação honesta)

| Régua | % |
|---|---|
| Protótipo funcional / demonstração | ~75% |
| **Uso diário real na oficina (usabilidade)** | **~40%** |
| Produto comercial (vender a outras oficinas) | ~30% |

O que segura a usabilidade **não é funcionalidade** — é o que aparece quando alguém usa **todo dia e comete erros**: corrigir um cadastro, imprimir um comprovante, ver o histórico do cliente e não perder dados se o PC falhar.

### 11.3 Roadmap de conclusão

**✅ Fase 1–4 — Base + fluxo completo** *(concluídas)*
Cadastros, orçamento → OS, estoque com baixa automática, financeiro completo, agenda, login/perfis.

**🎯 Fase 5 — Usabilidade essencial** *(próxima — leva a usabilidade de ~40% para ~70%)*
- **Editar/excluir** registros: cliente, carro, serviço, peça e orçamento em rascunho *(hoje o sistema só cria)*.
- **Ficha do cliente** e **histórico do carro por placa** (RN-16/17): carros, OS passadas e fiado em aberto num clique.
- **Impressão / PDF** do Orçamento e da OS — o comprovante que a oficina entrega ao cliente.
- **Backup automático** diário do banco — para não perder tudo se o computador falhar.
- **Máscaras** (CPF/CNPJ, telefone, placa, dinheiro) e **avisos "toast"** no lugar dos pop-ups do navegador.

**Fase 6 — Produção e administração** *(vira um app "de verdade", instalável e autônomo → ~85%)*
- **Empacotar em Electron** (programa instalável no Windows) + build de produção da API.
- **Tela de Configurações**: dados da oficina, logo no PDF, margem padrão, % de desconto que exige senha.
- **Gestão de usuários** pela interface (criar/editar, trocar senha, ativar/inativar) — elimina a senha padrão `hermes123`.
- **Alertas ativos**: revisão vencida (RN-20), conflito de horário na agenda (RN-19), bloqueio de fiado em atraso (RN-11.2), expiração automática de orçamento (RN-06).
- **Log de auditoria** visível (quem fez o quê).

**Fase 7 — Diferenciais e fiscal** *(quando fizer sentido para o negócio)*
- **OS de garantia** (RN-18) e **venda de balcão** avulsa.
- Envio de Orçamento/OS por **WhatsApp**.
- **Comissão por mecânico** e produtividade.
- **Nota fiscal** (NF-e / NFC-e).
- Módulo de **Ajuda/Suporte** (RN-21).

> Ao concluir a **Fase 5**, o sistema já aguenta o dia a dia da oficina (~70% de usabilidade). Com a **Fase 6**, vira um produto instalável e autônomo (~85%). A **Fase 7** são diferenciais competitivos.

---

## 12. Próximos Passos (a partir daqui)

Documento e projeto estão **alinhados**. Começamos a **Fase 5 — Usabilidade essencial**, nesta ordem de maior impacto:

1. **Editar/corrigir registros** — remove a maior frustração do dia a dia.
2. **Imprimir / PDF do Orçamento e da OS** — o que o cliente leva na mão.
3. **Ficha do cliente + histórico do carro** — consulta rápida no balcão (RN-16/17).
4. **Backup automático do banco** — segurança dos dados.

Concluída a Fase 5, seguimos para a **Fase 6** (Electron + Configurações + gestão de usuários) e, por fim, os diferenciais da **Fase 7**.

---

## 13. Respostas do cliente (definições confirmadas)

| # | Pergunta | Resposta | Impacto no sistema |
|---|---|---|---|
| 1 | Vende peça avulsa? | **Sim, mas não é o foco** | Módulo de **venda balcão** existe, porém secundário. Prioridade é peça dentro da OS. |
| 2 | Trabalha com garantia? | **Sim, ~15 dias** | RN-18 ajustada para 15 dias. OS de garantia não cobra. |
| 3 | Pagamento parcelado/fiado? | **Sim: PIX, parcelado e fiado** | Cria módulo de **Contas a Receber** (RN-11.1/11.2). Cadastro de cliente vira peça-chave. |
| 4 | Emite nota fiscal? | **Sim, mas deixar para depois** | Fica na **Fase 4** (extras). Não entra no MVP. |
| 5 | Funcionário com comissão? | **Talvez — a confirmar** | Deixo o campo previsto no cadastro, mas o cálculo entra só quando confirmar. |
| 6 | Volume de carros | **~5/dia, sendo 3-4 serviços de vários dias** | Volume baixo → sistema **leve**. OS precisa de status *em execução (dias)* e acompanhamento. |
| 7 | Usa sistema/planilha hoje? | **Não, tudo na mão** | Sem migração de dados. Começamos do zero → oportunidade de já nascer organizado. |

### Ajustes que essas respostas geram no projeto
- **Contas a Receber** vira módulo de primeira linha (fiado é comum aqui).
- **Cadastro de cliente** ganha destaque: telefone, histórico e situação de fiado.
- **OS de longa duração**: o painel destaca os 3-4 carros que ficam dias na oficina.
- **Nota fiscal e comissão**: previstos na estrutura, mas implementados só nas fases finais.

---

*Documento gerado para análise. Nada aqui é definitivo — é a base para construirmos juntos.*
