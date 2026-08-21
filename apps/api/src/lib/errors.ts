// Erro de regra de negócio com status HTTP. O tratador global (app.ts)
// converte em { message } com o código certo, deixando os services limpos.
//
// `codigo` é opcional e serve para o front reagir a um caso específico sem
// depender do texto da mensagem — texto muda, código não.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public codigo?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Códigos que a interface trata de forma especial. */
export const COD = {
  SENHA_DONO_NECESSARIA: 'SENHA_DONO_NECESSARIA',
  SENHA_DONO_INCORRETA: 'SENHA_DONO_INCORRETA',
} as const;
