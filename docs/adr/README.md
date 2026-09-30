# Decisões de arquitetura (ADR)

Cada arquivo registra uma decisão que molda o código: o contexto, o que foi decidido e o
preço que se paga por ela. Mudou de ideia? Escreva uma ADR nova que substitui a antiga —
não reescreva a história.

| # | Decisão | Situação |
|---|---|---|
| [0001](0001-monorepo-e-contrato-compartilhado.md) | Monorepo com contrato compartilhado (zod + DTOs) | Aceita |
| [0002](0002-sessao-em-cookie-httponly.md) | Sessão em cookie httpOnly, perfil lido do banco | Aceita (JWT substituído pela 0009) |
| [0003](0003-dinheiro-em-centavos-e-kardex.md) | Dinheiro em centavos; estoque com kardex e trava de linha | Aceita |
| [0004](0004-api-serve-a-tela-e-desktop-e-janela.md) | A API serve a tela; o app de desktop é uma janela | Aceita |
| [0005](0005-sem-redis.md) | Sem Redis na 1.0 | Aceita |
| [0006](0006-confirmacao-por-codigo-de-erro.md) | Decisão humana pedida por código de erro | Aceita |
| [0007](0007-banco-como-ultima-linha-de-defesa.md) | O banco como última linha de defesa: usuário sem poder de dono e restrições CHECK | Aceita |
| [0008](0008-negar-por-padrao.md) | Rotas da API fechadas por padrão; freio na senha do Dono | Aceita |
| [0009](0009-sessao-opaca-no-banco.md) | Sessão opaca guardada no banco (sai o JWT) | Aceita |
| [0010](0010-concorrencia-otimista.md) | Concorrência otimista nos formulários (`versao`, 409) | Aceita |
| [0011](0011-idempotencia-dos-post.md) | Idempotência dos POST: repetição não lança duas vezes | Aceita |
