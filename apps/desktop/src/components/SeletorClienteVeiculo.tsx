import { useEffect, useState } from 'react';
import { Plus, Car, Check } from 'lucide-react';
import type { CarroDTO, ClienteResumoDTO } from '@hermes/shared';
import { buscarClientes, useCarrosDoCliente } from '../api/catalogo';
import { formatarTelefone } from '../lib/format';
import { BuscaSelect, Campo, Placa } from './ui';
import FormCliente from '../features/clientes/FormCliente';
import FormVeiculo from '../features/veiculos/FormVeiculo';

export type ClienteEscolhido = Pick<ClienteResumoDTO, 'id' | 'nome'> & Partial<ClienteResumoDTO>;

// ============================================================
// Escolher o cliente e o veículo — com cadastro na hora.
//
// Mandar o atendente para outra tela cadastrar e depois voltar era
// recriar, no meio do atendimento, a burocracia que o sistema existe
// para tirar. Aqui o "+ cadastrar" abre por cima e já volta escolhido.
// ============================================================

export function SeletorClienteVeiculo({
  cliente,
  onCliente,
  veiculoId,
  onVeiculo,
  veiculoOpcional,
  erroCliente,
  erroVeiculo,
  sugestao,
  clienteFixo,
}: {
  cliente: ClienteEscolhido | null;
  onCliente: (c: ClienteEscolhido | null) => void;
  veiculoId: string | null;
  onVeiculo: (id: string | null) => void;
  veiculoOpcional?: boolean;
  erroCliente?: string;
  erroVeiculo?: string;
  /** Dados soltos já digitados (orçamento rápido) viram a semente do cadastro. */
  sugestao?: { nome?: string | null; telefone?: string | null; veiculo?: string | null };
  /** O cliente já está decidido (ex.: orçamento dele): só falta o veículo. */
  clienteFixo?: boolean;
}) {
  const carros = useCarrosDoCliente(cliente?.id);
  const [novoCliente, setNovoCliente] = useState<string | null>(null);
  const [novoVeiculo, setNovoVeiculo] = useState(false);
  const lista = carros.data ?? [];

  // Cliente com um carro só: já escolhe.
  useEffect(() => {
    const doCliente = carros.data ?? [];
    if (!veiculoId && !veiculoOpcional && doCliente.length === 1) onVeiculo(doCliente[0].id);
  }, [carros.data, veiculoId, veiculoOpcional, onVeiculo]);

  return (
    <div className="space-y-3">
      <Campo label="Cliente" erro={erroCliente}>
        <BuscaSelect<ClienteResumoDTO>
          valor={cliente as ClienteResumoDTO | null}
          disabled={clienteFixo}
          onChange={(c) => {
            onCliente(c);
            onVeiculo(null);
          }}
          chave="clientes"
          buscar={buscarClientes}
          id={(c) => c.id}
          rotulo={(c) => c.nome}
          detalhe={(c) => [formatarTelefone(c.telefone ?? c.whatsapp), c.qtdVeiculos ? `${c.qtdVeiculos} veículo(s)` : null].filter(Boolean).join(' · ') || 'sem telefone'}
          placeholder="Nome, CPF, telefone ou placa do cliente"
          rodape={(termo, fechar) => (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                fechar();
                setNovoCliente(termo || sugestao?.nome || '');
              }}
              className="w-full text-left px-3 py-2 text-sm font-bold text-laranja hover:bg-white inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Cadastrar cliente novo{termo ? ` "${termo}"` : ''}
            </button>
          )}
        />
      </Campo>

      {cliente && (
        <Campo label={veiculoOpcional ? 'Veículo (opcional)' : 'Veículo'} erro={erroVeiculo}>
          <div className="grid sm:grid-cols-2 gap-2">
            {lista.map((v: CarroDTO) => {
              const escolhido = v.id === veiculoId;
              return (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => onVeiculo(escolhido && veiculoOpcional ? null : v.id)}
                  className={`text-left border-[1.6px] rounded-lg px-3 py-2 flex items-center gap-2 transition ${
                    escolhido ? 'border-laranja bg-laranja/5' : 'border-linha hover:bg-fundo'
                  }`}
                >
                  {escolhido ? <Check size={16} className="text-laranja shrink-0" /> : <Car size={16} className="text-grafite/40 shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Placa placa={v.placa} />
                      <span className="font-bold text-sm truncate">{v.modelo}</span>
                    </div>
                    <div className="text-xs text-grafite/50">{[v.marca, v.ano, v.cor].filter(Boolean).join(' · ')}</div>
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setNovoVeiculo(true)}
              className="border-[1.6px] border-dashed border-linha rounded-lg px-3 py-2 text-sm font-bold text-laranja hover:bg-fundo inline-flex items-center justify-center gap-1.5"
            >
              <Plus size={15} /> Novo veículo
            </button>
          </div>
          {carros.isFetched && lista.length === 0 && (
            <span className="block text-xs text-grafite/50 mt-1">Este cliente ainda não tem veículo cadastrado.</span>
          )}
        </Campo>
      )}

      {novoCliente !== null && (
        <FormCliente
          cliente={null}
          nomeInicial={novoCliente}
          telefoneInicial={sugestao?.telefone ?? ''}
          onFechar={() => setNovoCliente(null)}
          onSalvo={(c) => {
            setNovoCliente(null);
            onCliente(c);
            onVeiculo(null);
            // Cliente novo não tem carro: já abre o cadastro do veículo.
            if (!veiculoOpcional) setNovoVeiculo(true);
          }}
        />
      )}
      {novoVeiculo && cliente && (
        <FormVeiculo
          veiculo={null}
          dono={cliente}
          modeloInicial={sugestao?.veiculo ?? ''}
          onFechar={() => setNovoVeiculo(false)}
          onSalvo={(v) => {
            setNovoVeiculo(false);
            onVeiculo(v.id);
          }}
        />
      )}
    </div>
  );
}
