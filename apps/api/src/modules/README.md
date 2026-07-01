# Módulos da API

Cada módulo agrupa as **regras de negócio** (RN-01 a RN-21 do PLANEJAMENTO.md) de um domínio.
Padrão sugerido por módulo:

```
modules/<nome>/
├── <nome>.routes.ts     # endpoints HTTP (Fastify)
├── <nome>.service.ts    # regras de negócio (onde vivem as RNs)
├── <nome>.schema.ts     # validação de entrada/saída (Zod)
```

Módulos planejados:

| Módulo        | Regras principais                                              |
|---------------|---------------------------------------------------------------|
| `auth`        | Login JWT + perfis (Dono/Atendente/Mecânico)                  |
| `clientes`    | Cadastro, histórico, situação de fiado                        |
| `carros`      | Placa única, busca puxa histórico (RN-16, RN-17)             |
| `servicos`    | Catálogo de mão de obra                                       |
| `estoque`     | Baixa automática, alerta de mínimo, custo médio (RN-01 a 05) |
| `orcamentos`  | Validade, aprovar → OS em 1 clique (RN-06 a 08)              |
| `ordens`      | Fluxo da OS, total, conclusão (RN-09, RN-10)                 |
| `caixa`       | Lançamento automático ao pagar, fechamento (RN-11 a 15)     |
| `contas`      | Contas a receber de parcelado/fiado (RN-11.1, RN-11.2)      |
| `agenda`      | Visitas, conflito de horário, retornos (RN-19, RN-20)       |
| `relatorios`  | Faturamento, lucro real, indicadores (seção 10)             |
```
