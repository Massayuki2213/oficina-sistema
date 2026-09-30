// ============================================================
// Freio contra adivinhar senha.
//
// Conta só as tentativas que FALHARAM, numa janela de 15 minutos.
// Acerto zera a conta — a oficina inteira costuma sair pelo mesmo
// IP, e um limitador que contasse os acertos acabaria travando o
// balcão numa manhã movimentada.
//
// Dois lugares recebem senha:
//  - o login (por IP + e-mail, e por IP somando todas as contas);
//  - a senha do Dono que autoriza desconto acima do teto (RN-08),
//    por quem está digitando — é a mesma senha do login do Dono, e
//    sem freio viraria um jeito de adivinhá-la de dentro do sistema.
//
// Fica em memória: a API roda num processo só (servidor da oficina
// ou uma instância na nuvem). Reiniciar a API zera os contadores.
// ============================================================

const JANELA_MS = 15 * 60 * 1000;
/** Falhas seguidas para a mesma conta a partir do mesmo IP. */
const MAX_POR_CONTA = 10;
/** Falhas de um mesmo IP somando todas as contas (quem testa e-mails em série). */
const MAX_POR_IP = 50;
/** Senha do Dono errada, por usuário: quem erra 5 vezes chama o Dono de verdade. */
const MAX_SENHA_DONO = 5;

const falhas = new Map<string, number[]>();

function recentes(chave: string, agora: number) {
  const lista = (falhas.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
  if (lista.length) falhas.set(chave, lista);
  else falhas.delete(chave);
  return lista;
}

/** Segundos até liberar a primeira regra estourada, ou null se nenhuma estourou. */
function bloqueio(regras: [chave: string, maximo: number][], agora: number): number | null {
  for (const [chave, maximo] of regras) {
    const lista = recentes(chave, agora);
    if (lista.length >= maximo) return Math.ceil((lista[0] + JANELA_MS - agora) / 1000);
  }
  return null;
}

function anotar(chaves: string[], agora: number) {
  for (const chave of chaves) falhas.set(chave, [...recentes(chave, agora), agora]);
}

// ---- Login ------------------------------------------------------------------

/** Em quantos segundos libera, ou null se não está bloqueado. */
export function segundosDeBloqueio(ip: string, email: string, agora = Date.now()): number | null {
  return bloqueio(
    [
      [`${ip}|${email}`, MAX_POR_CONTA],
      [ip, MAX_POR_IP],
    ],
    agora,
  );
}

export function registrarFalha(ip: string, email: string, agora = Date.now()) {
  anotar([`${ip}|${email}`, ip], agora);
}

export function limparFalhas(ip: string, email: string) {
  falhas.delete(`${ip}|${email}`);
}

// ---- Senha do Dono (RN-08) ----------------------------------------------------

const chaveSenhaDono = (usuarioId: string) => `senha-dono|${usuarioId}`;

export function segundosDeBloqueioSenhaDono(usuarioId: string, agora = Date.now()): number | null {
  return bloqueio([[chaveSenhaDono(usuarioId), MAX_SENHA_DONO]], agora);
}

export function registrarFalhaSenhaDono(usuarioId: string, agora = Date.now()) {
  anotar([chaveSenhaDono(usuarioId)], agora);
}

export function limparFalhasSenhaDono(usuarioId: string) {
  falhas.delete(chaveSenhaDono(usuarioId));
}

/** "Tente de novo em N minuto(s)" — o mesmo texto para os dois freios. */
export function emMinutos(segundos: number) {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return `${minutos} minuto(s)`;
}
