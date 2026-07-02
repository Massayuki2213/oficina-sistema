// Erro de regra de negócio com status HTTP. O tratador global (app.ts)
// converte em { message } com o código certo, deixando os services limpos.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
