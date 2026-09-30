# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) · versões: [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] — 2026-09-30

Primeira versão para uso diário na oficina. Do protótipo (0.1) para a 1.0, o sistema foi
revisado de ponta a ponta: contrato único entre servidor e tela, regras de dinheiro e estoque
à prova de concorrência, tela reescrita e empacotamento para produção.

### Adicionado

- **Orçamento rápido** (sem cadastro) que pede cliente e veículo só na aprovação — com cadastro
  na hora, sem sair da tela; duplicar ("refazer com os preços de hoje"); envio por WhatsApp
  (marca como enviado).
- **OS completa numa janela**: itens editáveis no lugar (quantidade, preço combinado), apontamento
  de serviço feito, laudo e queixa, mecânico/assumir, fluxo de status com os passos possíveis,
  impressão, aviso "carro pronto" no WhatsApp, cancelamento com motivo (devolve as peças).
- **Recebimento misto**: parte na hora (dinheiro, PIX, cartão — até 3 formas) e o resto fiado
  ou parcelado, com cálculo de troco e "receber e entregar" num passo; **estorno** do pagamento
  (Dono) sem apagar nada.
- **OS de garantia** (RN-18) a partir da OS original, dentro do prazo, sem cobrar mão de obra.
- **Venda de balcão** com leitor de código de barras, cancelamento com estorno e devolução ao estoque.
- **Estoque**: entrada rápida pelo leitor, inventário com motivo, **kardex** (movimentação com saldo),
  peças fracionadas (3,5 L), exportação para planilha, sugestão de preço pela margem padrão.
- **Compras e distribuidores**: nota com várias peças (inclusive peça nova), a pagar/paga, acerto
  com o distribuidor, alerta de boleto vencendo.
- **Contas a receber**: baixa parcial, cobrança pelo WhatsApp, devedores, lançamento do caderno de fiado.
- **Livro-caixa**: fechamento do dia por forma de pagamento (gaveta, PIX, maquininha), lançamento
  manual com origem (aporte e retirada fora do lucro), planilha.
- **Relatórios**: faturamento, despesas e lucro reais; margem das peças; evolução de 12 meses
  (gráfico + tabela); despesas por categoria; rankings; produtividade e **comissão por mecânico**;
  estoque parado.
- **Painel inicial por perfil**: carros na oficina, prontos, agenda do dia, OS atrasadas, fiado em
  atraso, orçamentos vencendo, revisão vencida (chamar pelo WhatsApp), estoque baixo, boletos.
- **Agenda semanal** com aviso de conflito de horário (RN-19) e lembrete pelo WhatsApp.
- **Configurações**: dados da oficina e logo (saem no orçamento e na OS), regras (margem, desconto
  sem senha, validade, garantia), equipe e comissão, troca de senha, backup com download.
- **Histórico (auditoria)** de todas as ações, com filtros por período, área e pessoa.
- **Busca por placa** em qualquer tela (F2 / Ctrl+K) e **Ajuda** com perguntas frequentes.
- **App de desktop para Windows** (instalador NSIS): janela para o servidor da oficina.
- **Produção**: imagem Docker (API + tela + `pg_dump` 16), `docker-compose.prod.yml`, migrações
  na partida, verificação de saúde, comando de recuperação de senha.
- **Qualidade**: 272 testes automatizados (231 da API contra PostgreSQL real), ESLint 10, CI no
  GitHub Actions com build da imagem.
- Documentação: instalação na oficina, guia de desenvolvimento e decisões de arquitetura (ADR).

### Alterado

- Contrato único (`@hermes/shared`): schemas zod validam a entrada no servidor e na tela; DTOs
  tipam as respostas.
- Sessão em cookie httpOnly, guardada no banco; perfil lido a cada requisição (desativar derruba na hora).
- Listas paginadas e busca no servidor; seleção de cliente, peça e serviço por autocompletar.
- A API serve a tela: um endereço só para todos os aparelhos da rede.
- Datas no fuso da oficina (`TZ`), não no do servidor.

### Corrigido

- Recebimento em dobro por clique duplo (guarda de concorrência) e "pago" antes de receber.
- Baixa de estoque perdida em lançamentos simultâneos (trava de linha + kardex).
- Custo médio errado quando o estoque estava zerado ou negativo.
- Lucro inflado por aporte do dono e reduzido por retirada; estornos agora descontam do faturamento.
- Limite de login que bloqueava a oficina inteira (contava os acertos).
- Data sem hora aparecendo um dia antes no Brasil.
- Autocompletar que escolhia o item da busca anterior ao apertar Enter rápido (leitor de código).
- Build de produção saindo com o React de desenvolvimento.

### Removido

- Redis (ver ADR 0005).

### Segurança

- Cabeçalhos de segurança (CSP em produção, anti-clickjacking, nosniff), CORS fechado por padrão,
  segredo de sessão obrigatório e forte em produção, senhas com bcrypt, auditoria sem dados
  sensíveis. HSTS fica com o proxy HTTPS, quando houver (a rede local é http).
- **Rotas fechadas por padrão**: toda rota da API exige sessão; as públicas (5) se declaram e um
  teste varre todas as outras (ADR 0008).
- **Freio na senha do Dono** que autoriza desconto (RN-08): 5 erros em 15 minutos travam a
  pessoa, e cada erro fica no Histórico.
- **O servidor não é dono do banco**: conecta como `hermes_app` (só lê e grava dados, senha
  sorteada a cada partida); o dono fica para as migrações (ADR 0007).
- **Restrições CHECK** no banco: dinheiro nunca negativo, total que fecha (RN-09), parcela nunca
  paga além do valor, quantidades positivas.
- CI com varredura de segredos no histórico do git (gitleaks) e `npm audit`; Dependabot semanal.
- **Sessão opaca guardada no banco** no lugar do JWT (ADR 0009): logout encerra de verdade,
  "Onde você está conectado" com "Sair" e "Sair dos outros aparelhos", o Dono desconecta alguém
  (celular perdido) sem trocar a senha; o banco guarda só o HMAC do token; inatividade de 12 h
  e limite de 7 dias. Variáveis renomeadas: `SESSAO_SEGREDO`, `SESSAO_DURACAO`.
- **Histórico com o valor anterior**: "Preço de venda: R$ 80,00 → R$ 50,00", para toda
  alteração de registro; dado pessoal de contato aparece só como "(alterado)", e anonimizar um
  cliente (LGPD) limpa o que foi enviado sobre ele no Histórico.
- **Aviso de edição simultânea** (ADR 0010): duas pessoas no mesmo cadastro/OS — a segunda a
  salvar recebe "Ana salvou uma alteração aqui às 14:32" em vez de apagar o trabalho da outra.
- **Sem venda em dobro** (ADR 0011): todo POST leva `Idempotency-Key`; se a rede falhar, a tela
  repete com a mesma chave e o servidor devolve a resposta da primeira.
- **Backup cifrado** opcional (`BACKUP_SENHA`, AES-256-GCM) e comando para abrir a cópia.
- Transações com folga de 15 s (antes 5 s): PC modesto não derruba venda no meio.

## [0.1.0] — 2026-07

Protótipo funcional: fluxo orçamento → OS → estoque → caixa, 17 módulos e 15 telas.
