# 0013 — Servidor na nuvem (VPS), com HTTPS e o Dono criado pelo terminal

**Situação:** aceita (v1.0). Substitui a parte da [0012](0012-mini-pc-linux-e-so-navegador.md)
sobre o mini PC; o resto dela (só navegador, imagem por versão, scripts de `ops/`) continua.

## Contexto

O cliente preferiu não ter servidor físico na oficina: a internet dela é estável (centro da
cidade, ao lado do provedor) e a nuvem tira o suporte físico (nobreak, HD externo, máquina
quebrada). Foi contratado um VPS na Hostinger (plano KVM 2, Ubuntu 24.04, datacenter no
Brasil).

Na internet, três coisas que na rede da oficina eram detalhe passam a ser obrigatórias:

- as senhas viajam pela internet: sem HTTPS, qualquer um no caminho lê;
- o primeiro acesso cria o Dono para **quem abrir o endereço primeiro**; e as senhas do
  cenário de demonstração (`hermes123`) estão no repositório público;
- qualquer porta aberta é achada por robôs em minutos.

## Decisão

- **Caddy na frente** (`docker-compose.prod.yml`): pega e renova sozinho o certificado HTTPS do
  domínio em `HERMES_DOMINIO` e manda o http para o https. O sistema e o banco ficam **sem
  porta publicada**; só o Caddy fala com a internet. Com `HERMES_DOMINIO=:80` ele serve http
  simples: o mesmo arquivo continua servindo a rede de uma oficina sem domínio.
- O sistema confia no Caddy (`TRUST_PROXY=true`): o IP de quem acessa chega certo (o freio de
  login conta por pessoa, não pelo proxy) e o cookie de sessão só trafega em HTTPS.
- **Primeiro acesso pelo terminal:** com `PRIMEIRO_ACESSO_WEB=false`, a tela não oferece o
  primeiro acesso e a API o recusa (403). O Dono é criado por `ops/criar-dono.sh`, que pergunta
  a senha sem mostrá-la e a passa pela entrada padrão (nunca por argumento).
- **`ops/instalar.sh --nuvem`:** além do que já fazia, liga o firewall (ufw: só 22, 80 e 443),
  SSH só com chave (se já houver chave cadastrada; senão avisa e não tranca ninguém de fora) e
  o fail2ban; grava o domínio e desliga o primeiro acesso pela tela; sorteia a `BACKUP_SENHA`
  (as cópias vão sair do servidor). Sem HD externo e sem Tailscale.
- Sem log de cada acesso no Caddy: os endereços levariam buscas com nome de cliente e placa.
- Começa no nome que o provedor deu ao servidor (`srv2091560.hstgr.cloud`); o domínio da
  oficina (`.com.br`, no CNPJ dela) entra depois trocando só `HERMES_DOMINIO`.

## Consequências

- Os certificados ficam no volume `caddy_dados`: perder o volume obriga a pedir de novo, e as
  autoridades limitam pedidos por semana.
- Sem internet na oficina, não há sistema. Aceito pelo cliente: a conexão é estável, e o
  celular com dados móveis serve de reserva.
- Backup: as cópias diárias ficam no disco do VPS (14 dias) e vão cifradas para fora dele com
  o `ops/nuvem.sh` (Google Drive da oficina), além do backup semanal da Hostinger.
- O servidor fica exposto à internet: atualizações de segurança automáticas (sem reinício), o
  firewall e o fail2ban passam a ser parte da entrega, não opcionais.
