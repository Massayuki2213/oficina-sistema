# 0010 — Concorrência otimista nos formulários

**Situação:** aceita (v1.0)

## Contexto

Dinheiro e estoque já eram protegidos por trava de linha (`SELECT ... FOR UPDATE`, ADR
0003). Mas a edição de cadastro e dos dados da OS era "o último a salvar ganha": a atendente
abre o cliente, o Dono abre o mesmo cliente, os dois salvam — e o que a primeira fez some
sem ninguém perceber. Na OS é pior: o mecânico escreve o laudo enquanto o balcão corrige a
queixa.

Trava pessimista para formulário (bloquear o registro enquanto alguém está com a tela aberta)
seria pior: quem sai para almoçar com a tela aberta trava o cadastro.

## Decisão

- Coluna **`versao`** nos registros editados por formulário: cliente, veículo, serviço, peça,
  distribuidor, orçamento, OS, despesa, agendamento, usuário e a configuração da oficina.
- O DTO devolve a `versao`; o formulário manda de volta a que **carregou**.
- A gravação é **um** `UPDATE ... WHERE id = ? AND versao = ?` com `versao = versao + 1`
  (`lib/versao.ts`). Atômico no banco: se alguém salvou no meio, nada é gravado.
- Recusa: **409 `CONFLITO_EDICAO`**, dizendo quem salvou e quando (tirado do Histórico):
  "Ana salvou uma alteração aqui às 14:32, depois que você abriu a tela...". A tela recarrega
  o cache (evento `hermes:dados-desatualizados`), e quem reabre já vê a versão atual.
- **Só formulário conta**. Itens, status, recebimento, estoque não mexem na versão: são ações
  pequenas, já travadas por linha, que não sobrescrevem o trabalho de ninguém — e contá-las
  geraria conflito falso a cada clique na OS.
- Sem `versao` no corpo (integração antiga), grava direto — compatível.

## Consequências

- Formulário novo que grava o registro inteiro: mande `versao` e use `naVersao`/
  `proximaVersao`/`falhaDeVersao` no service. **Nunca** repasse o corpo cru com `versao`
  para o Prisma: gravaria o número que veio da tela.
- O desconto da OS não manda versão (é um número recalculado dos itens, nada a perder).
- Custo: uma coluna inteira por tabela e nenhuma consulta a mais no caminho feliz.
