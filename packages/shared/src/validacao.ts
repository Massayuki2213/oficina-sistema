// ============================================================
// Validação e normalização de documentos e identificadores.
//
// Vale igual no servidor (que é quem decide) e na tela (que avisa
// antes de enviar). Tudo é guardado "limpo" — só dígitos, placa sem
// traço — e formatado só na hora de mostrar. Assim a busca acha
// "12345678909" e "123.456.789-09" do mesmo jeito.
// ============================================================

export const soDigitos = (v: string) => v.replace(/\D/g, '');

/**
 * CPF: só dígitos. CNPJ: letras e dígitos, em maiúsculas.
 *
 * Desde julho de 2026 a Receita emite CNPJ alfanumérico (as 12 primeiras
 * posições podem ter letras; os 2 dígitos verificadores seguem numéricos).
 * Por isso a normalização não pode simplesmente jogar fora as letras.
 */
export function normalizarDocumento(v: string): string {
  return v.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(cpf.slice(0, 9), 10);
  const d2 = dv(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/**
 * CNPJ numérico ou alfanumérico (IN RFB nº 2.229/2024).
 * Cada caractere vale o seu código ASCII − 48: '0'..'9' → 0..9, 'A' → 17...
 * Os pesos e o módulo 11 são os mesmos do CNPJ de sempre.
 */
function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const valor = (c: string) => c.charCodeAt(0) - 48;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += valor(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(cnpj.slice(0, 12));
  const d2 = dv(cnpj.slice(0, 13));
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** Recebe o documento já normalizado. 11 caracteres = CPF, 14 = CNPJ. */
export function documentoValido(doc: string): boolean {
  if (doc.length === 11) return cpfValido(doc);
  if (doc.length === 14) return cnpjValido(doc);
  return false;
}

export const tipoDoDocumento = (doc: string): 'PF' | 'PJ' | null =>
  doc.length === 11 ? 'PF' : doc.length === 14 ? 'PJ' : null;

/** Telefone guardado só com dígitos: DDD + número (10 fixo, 11 celular). */
export const normalizarTelefone = (v: string) => soDigitos(v);
export const telefoneValido = (tel: string) => /^\d{10,11}$/.test(tel);

/** Placa sem traço e em maiúsculas: "abc-1234" → "ABC1234". */
export const normalizarPlaca = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Modelo antigo (ABC1234) ou Mercosul (ABC1D23). */
export const placaValida = (placa: string) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa);
