import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { CarroDTO, ClienteResumoDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { buscarClientes } from '../../api/catalogo';
import { formatarTelefone as fmtTel } from '../../lib/format';
import { mascaraPlaca, textoParaNumero } from '../../lib/mascaras';
import { BtnGhost, BtnPrimary, BuscaSelect, Campo, ErroFormulario, Modal, inputCls } from '../../components/ui';
import FormCliente from '../clientes/FormCliente';

const MARCAS = ['Chevrolet', 'Fiat', 'Ford', 'Honda', 'Hyundai', 'Jeep', 'Mitsubishi', 'Nissan', 'Peugeot', 'Renault', 'Toyota', 'Volkswagen', 'BYD', 'Citroën', 'Kia'];
const COMBUSTIVEIS = ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'GNV', 'Híbrido', 'Elétrico'];

type DonoEscolhido = Pick<ClienteResumoDTO, 'id' | 'nome'> & Partial<Pick<ClienteResumoDTO, 'telefone'>>;

/** Cadastro/edição de veículo. Abre também de dentro da OS, do orçamento e da busca por placa. */
export default function FormVeiculo({
  veiculo,
  dono: donoInicial,
  placaInicial = '',
  modeloInicial = '',
  onFechar,
  onSalvo,
}: {
  veiculo: CarroDTO | null;
  dono?: DonoEscolhido | null;
  placaInicial?: string;
  modeloInicial?: string;
  onFechar: () => void;
  onSalvo: (c: CarroDTO) => void;
}) {
  const [dono, setDono] = useState<DonoEscolhido | null>(veiculo ? veiculo.cliente : (donoInicial ?? null));
  const [form, setForm] = useState({
    placa: mascaraPlaca(veiculo?.placa ?? placaInicial),
    marca: veiculo?.marca ?? '',
    modelo: veiculo?.modelo ?? modeloInicial,
    ano: veiculo?.ano != null ? String(veiculo.ano) : '',
    cor: veiculo?.cor ?? '',
    kmAtual: veiculo?.kmAtual != null ? String(veiculo.kmAtual) : '',
    combustivel: veiculo?.combustivel ?? 'Flex',
    chassi: veiculo?.chassi ?? '',
    observacoes: veiculo?.observacoes ?? '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [novoCliente, setNovoCliente] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = useAcao(
    () => {
      const corpo = {
        clienteId: dono?.id ?? '',
        placa: form.placa,
        marca: form.marca,
        modelo: form.modelo,
        ano: textoParaNumero(form.ano),
        cor: form.cor,
        kmAtual: textoParaNumero(form.kmAtual),
        combustivel: form.combustivel,
        chassi: form.chassi,
        observacoes: form.observacoes,
      };
      return veiculo ? http.put<CarroDTO>(`/carros/${veiculo.id}`, { ...corpo, versao: veiculo.versao }) : http.post<CarroDTO>('/carros', corpo);
    },
    {
      invalidar: [['carros'], ['clientes']],
      sucesso: (c) => `Veículo ${mascaraPlaca(c.placa)} ${veiculo ? 'atualizado' : 'cadastrado'}.`,
      erro: 'silencioso',
    },
  );

  function enviar() {
    setErros({});
    salvar.mutate(undefined, {
      onSuccess: onSalvo,
      onError: (e) => setErros(e instanceof ApiError && e.erros ? e.erros : { _: [mensagemDeErro(e)] }),
    });
  }

  return (
    <Modal
      title={veiculo ? 'Editar veículo' : 'Novo veículo'}
      onClose={onFechar}
      onEnviar={enviar}
      size="lg"
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando...' : 'Salvar veículo'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Dono do veículo" erro={erros.clienteId?.[0]}>
        <BuscaSelect<ClienteResumoDTO>
          valor={dono as ClienteResumoDTO | null}
          onChange={setDono}
          chave="clientes"
          buscar={buscarClientes}
          id={(c) => c.id}
          rotulo={(c) => c.nome}
          detalhe={(c) => fmtTel(c.telefone ?? c.whatsapp) || 'sem telefone'}
          placeholder="Nome, CPF ou telefone do cliente"
          rodape={(termo, fechar) => (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                fechar();
                setNovoCliente(termo);
              }}
              className="w-full text-left px-3 py-2 text-sm font-bold text-laranja hover:bg-white inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Cadastrar cliente novo{termo ? ` "${termo}"` : ''}
            </button>
          )}
        />
      </Campo>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Campo label="Placa" erro={erros.placa?.[0]}>
          <input
            value={form.placa}
            onChange={(e) => set('placa', mascaraPlaca(e.target.value))}
            placeholder="ABC1D23"
            className={`${inputCls} font-mono uppercase tracking-wider`}
          />
        </Campo>
        <Campo label="Marca" erro={erros.marca?.[0]}>
          <input value={form.marca} onChange={(e) => set('marca', e.target.value)} className={inputCls} list="marcas-veiculo" />
        </Campo>
        <Campo label="Modelo" erro={erros.modelo?.[0]}>
          <input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Ano" erro={erros.ano?.[0]}>
          <input inputMode="numeric" value={form.ano} onChange={(e) => set('ano', e.target.value.replace(/\D/g, '').slice(0, 4))} className={inputCls} />
        </Campo>
        <Campo label="Cor">
          <input value={form.cor} onChange={(e) => set('cor', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="KM atual" erro={erros.kmAtual?.[0]}>
          <input inputMode="numeric" value={form.kmAtual} onChange={(e) => set('kmAtual', e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </Campo>
        <Campo label="Combustível">
          <input value={form.combustivel} onChange={(e) => set('combustivel', e.target.value)} className={inputCls} list="combustiveis" />
        </Campo>
        <Campo label="Chassi" erro={erros.chassi?.[0]} className="sm:col-span-2">
          <input value={form.chassi} onChange={(e) => set('chassi', e.target.value.toUpperCase())} maxLength={17} className={`${inputCls} font-mono`} />
        </Campo>
      </div>
      <Campo label="Observações">
        <input value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} className={inputCls} />
      </Campo>
      <datalist id="marcas-veiculo">
        {MARCAS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="combustiveis">
        {COMBUSTIVEIS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <ErroFormulario>{erros._?.[0]}</ErroFormulario>

      {novoCliente !== null && (
        <FormCliente
          cliente={null}
          nomeInicial={novoCliente}
          onFechar={() => setNovoCliente(null)}
          onSalvo={(c) => {
            setNovoCliente(null);
            setDono(c);
          }}
        />
      )}
    </Modal>
  );
}
