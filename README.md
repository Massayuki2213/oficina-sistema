# Hermes

**Sistema de gestão para oficinas mecânicas.** Do carro que chega na porta ao lucro do fim do mês — em um só lugar.

> A oficina não perde dinheiro porque trabalha pouco. Perde porque o orçamento sumiu, a peça saiu do estoque e ninguém anotou, o fiado ficou no papel e, no fim do mês, ninguém sabe dizer se sobrou alguma coisa.
>
> O Hermes existe para acabar com isso.

---

## Para quem é

Oficinas mecânicas independentes, centros automotivos, auto elétricas e funilarias — de **2 a 10 pessoas**, que hoje trabalham no caderno, no bloco de orçamento ou numa planilha que só uma pessoa entende.

| Quem usa | O que ganha |
|---|---|
| **Dono** | Enxerga faturamento, despesa e **lucro real** sem depender de ninguém. Sabe quem fez o quê. |
| **Recepção / Atendente** | Faz um orçamento completo em menos de um minuto, com preço certo e sem calculadora. |
| **Mecânico** | Vê só as ordens dele, aponta o que executou e dá baixa na peça. Sem acesso ao financeiro. |

Não é um sistema para revenda de peças nem para concessionária. É feito para a oficina que vive de **serviço**, com carro parado por dias e cliente que volta.

---

## O problema que ele resolve

| Como é hoje | Com o Hermes |
|---|---|
| Orçamento no papel, que some ou vira desconto na conversa | Orçamento digital, com validade, impresso ou em PDF — e vira Ordem de Serviço em **1 clique** |
| Ninguém sabe quanto tem de peça na prateleira | Estoque baixa sozinho quando a peça entra na OS, e avisa antes de acabar |
| "Acho que esse mês foi bom" | Relatório de **lucro real**: entradas − despesas − custo das peças |
| Fiado anotado num caderno atrás do balcão | Contas a Receber com parcelas, vencimento e alerta de atraso |
| Cliente liga e ninguém lembra do carro dele | Digitou a placa, apareceu todo o histórico: serviços, datas e KM |
| Compra do distribuidor misturada com o caixa do dia | Compras e contas a pagar separadas, com saldo por distribuidor |

---

## O que está dentro

**Atendimento e operação**
Cadastro de clientes e veículos com busca por placa · catálogo de serviços com preço de mão de obra · orçamento com validade · conversão de orçamento em Ordem de Serviço · acompanhamento de OS por status (aberta, em execução, aguardando peça, concluída, entregue) · agenda de visitas e retornos · **impressão e PDF** do orçamento e da OS para entregar ao cliente.

**Estoque**
Peças e produtos com custo, venda e margem · entrada e saída com histórico de movimento · **leitura por código de barras** · estoque mínimo com alerta · localização na prateleira.

**Financeiro**
Livro-caixa alimentado automaticamente quando a OS é paga · despesas por categoria · **Contas a Receber** para parcelado e fiado · **Compras e Contas a Pagar** com saldo por distribuidor e acerto de dívida · relatórios com gráficos de faturamento, lucro, serviços mais vendidos e para onde o dinheiro está indo.

**Administração**
Três perfis de acesso (Dono, Atendente, Mecânico) com permissão por ação · gestão de usuários pela própria tela · **backup automático diário** do banco de dados, inclusive ao ligar o computador.

---

## O dia a dia, em 8 passos

```
Placa digitada  →  histórico do carro na tela  →  orçamento montado (serviços + peças)
      →  cliente aprova  →  1 clique: vira Ordem de Serviço  →  estoque baixa sozinho
            →  mecânico executa e aponta  →  pagamento entra no caixa
                  →  fim do mês: relatório mostra o lucro real
```

Nenhuma informação é digitada duas vezes. É esse encadeamento — e não a quantidade de telas — que faz a diferença no balcão.

---

## Por que o Hermes

- **Rápido onde precisa ser rápido.** O balcão não pode esperar. Busca por placa, botões grandes, poucos cliques.
- **Feito para quem não é de computador.** Máscaras de CPF, telefone, placa e dinheiro. Avisos claros no lugar de mensagem de erro técnica.
- **Mostra lucro, não só faturamento.** A maioria dos sistemas mostra quanto entrou. O Hermes desconta despesa e custo de peça e diz quanto **sobrou**.
- **Dados compartilhados.** Recepção, oficina e escritório enxergam a mesma informação, na hora.
- **Cada um vê o que deve ver.** O mecânico não abre o financeiro. O atendente não altera preço de custo.
- **Backup sem ninguém lembrar de fazer.** Cópia diária automática, com retenção configurável.

---

## Tecnologia

Construído com tecnologia atual e de mercado — não é planilha com botão.

| Camada | Tecnologia |
|---|---|
| Aplicação | React + TypeScript (empacotamento Electron para Windows em andamento) |
| Servidor / regras de negócio | Node.js + Fastify + TypeScript |
| Banco de dados | PostgreSQL |
| Cache | Redis |
| Acesso a dados | Prisma ORM |
| Segurança | Login com JWT, senhas criptografadas, permissão por perfil |

As regras de negócio (baixa de estoque, cálculo de lucro, geração de contas a receber) ficam no servidor, não na tela — o que garante que o número é o mesmo para todo mundo.

---

## Status do produto

O fluxo de negócio completo — **do orçamento ao lucro** — está funcionando: 17 módulos no servidor e 15 telas de trabalho ligadas a ele de verdade (não é maquete).

**Em desenvolvimento (Fase 6 — produção):**
instalador para Windows · dados da oficina e logo no PDF · alertas ativos (revisão vencida, conflito de agenda, fiado em atraso) · log de auditoria visível.

**No roadmap (Fase 7 — diferenciais):**
envio de orçamento e OS por WhatsApp · ordem de serviço em garantia · comissão por mecânico · nota fiscal (NF-e / NFC-e).

Planejamento completo, regras de negócio e arquitetura: [PLANEJAMENTO.md](PLANEJAMENTO.md).

---

## Ver funcionando

O sistema tem um cenário de demonstração completo — clientes, veículos, orçamentos, ordens e movimento de caixa — para conhecer o fluxo inteiro sem precisar cadastrar nada.

**Quer uma demonstração na sua oficina?** Entre em contato.

---

<sub>Documentação técnica e ambiente de desenvolvimento: [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md)</sub>
