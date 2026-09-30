# 0009 — Sessão opaca guardada no banco (sai o JWT)

**Situação:** aceita (v1.0) — substitui o JWT da [ADR 0002](0002-sessao-em-cookie-httponly.md);
o resto dela (cookie httpOnly, perfil lido do banco) continua valendo.

## Contexto

A 0002 guardava um JWT no cookie e, para poder derrubar sessões, conferia uma
`sessaoVersao` no banco a cada requisição. Ficou o pior dos dois mundos: pagávamos a
consulta ao banco de uma sessão guardada no servidor e não tínhamos o que ela dá —

- **logout não encerrava nada**: só apagava o cookie; um token copiado valia até vencer (12h);
- não dava para derrubar **um** aparelho (celular perdido), só todos, trocando a senha;
- ninguém via onde estava logado.

JWT compensa quando vários serviços validam o token sem consultar um estado central. O
Hermes é um servidor só, com um banco só.

## Decisão

- **Token opaco**: 32 bytes aleatórios no cookie (httpOnly, SameSite=Strict, como antes).
  O banco (`sessoes`) guarda só o **HMAC-SHA256** do token com `SESSAO_SEGREDO`: quem lê o
  banco — ou uma cópia de backup — não consegue entrar.
- **Validar = achar a linha. Encerrar = apagar a linha.** Vale na hora: logout, troca ou
  redefinição de senha, usuário inativado, "sair dos outros aparelhos" e o Dono
  desconectando alguém.
- **Duas validades** (OWASP): inatividade (`SESSAO_DURACAO`, 12h — usar renova, gravando no
  máximo a cada 5 min) e limite absoluto de 7 dias desde o login.
- **Troca da própria senha gira o token**: todas as sessões caem e esta ganha uma nova.
- **Telas**: *Minha conta* lista os aparelhos (navegador, IP, último uso) com "Sair" e "Sair
  dos outros aparelhos"; *Equipe* mostra quantos aparelhos cada um tem e deixa o Dono
  desconectar alguém sem trocar a senha.
- `Authorization: Bearer <token>` continua aceito, para integrações.
- Variáveis renomeadas para o que são: `SESSAO_SEGREDO` e `SESSAO_DURACAO`. Os nomes antigos
  (`JWT_SECRET`, `JWT_EXPIRES_IN`) ainda são lidos.

## Consequências

- Uma consulta por requisição (já existia) e uma escrita a cada 5 minutos de uso por pessoa.
- Sai a dependência `@fastify/jwt`; sai a coluna `usuarios.sessao_versao`.
- Na atualização para esta versão, quem estava logado entra de novo uma vez.
- Sessões vencidas são apagadas a cada login (faxina sem agendador).
