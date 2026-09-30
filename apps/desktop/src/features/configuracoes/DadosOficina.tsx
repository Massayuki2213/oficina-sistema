import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Info, Trash2 } from 'lucide-react';
import type { OficinaDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAvisos } from '../../lib/avisos';
import { mascaraCpfCnpj, mascaraTelefone } from '../../lib/mascaras';
import { AreaTexto, BtnGhost, BtnPrimary, Campo, ErroAoCarregar, ErroFormulario, inputCls } from '../../components/ui';

const LOGO_MAX_BYTES = 300 * 1024;

/** Reduz a imagem para caber no documento (e no limite do servidor) sem o dono ter que editar nada. */
async function logoParaDataUri(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('Não consegui abrir essa imagem.'));
      i.src = url;
    });
    const escala = Math.min(1, 400 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    return png.length * 0.75 <= LOGO_MAX_BYTES ? png : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function DadosOficina() {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const consulta = useQuery({ queryKey: ['oficina'], queryFn: () => http.get<OficinaDTO>('/oficina') });
  const [f, setF] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<string | null>(null);
  // A versão dos dados que estão no formulário (ADR 0010).
  const [versao, setVersao] = useState<number | undefined>(undefined);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const o = consulta.data;
    if (!o) return;
    setVersao(o.versao);
    setF({
      nome: o.nome,
      subtitulo: o.subtitulo ?? '',
      cnpj: mascaraCpfCnpj(o.cnpj),
      telefone: mascaraTelefone(o.telefone),
      email: o.email ?? '',
      endereco: o.endereco ?? '',
      observacoesDocumento: o.observacoesDocumento ?? '',
      margemPadrao: String(o.margemPadrao),
      descontoMaxSemSenha: String(o.descontoMaxSemSenha),
      garantiaDias: String(o.garantiaDias),
      validadeOrcamentoDias: String(o.validadeOrcamentoDias),
    });
    setLogo(o.logo);
  }, [consulta.data]);

  if (consulta.error) return <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />;
  if (!consulta.data || !f.nome) return <div className="text-center text-grafite/40 py-10 text-sm">Carregando...</div>;

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const numero = (k: string) => (f[k] === '' ? NaN : Number(f[k].replace(',', '.')));

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      await http.put<OficinaDTO>('/oficina', {
        ...f,
        logo: logo ?? '',
        margemPadrao: numero('margemPadrao'),
        descontoMaxSemSenha: numero('descontoMaxSemSenha'),
        garantiaDias: numero('garantiaDias'),
        validadeOrcamentoDias: numero('validadeOrcamentoDias'),
        versao,
      });
      await Promise.all([['oficina'], ['sessao']].map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso('Dados da oficina salvos.');
    } catch (e) {
      if (e instanceof ApiError && e.erros) setErros(Object.fromEntries(Object.entries(e.erros).map(([k, v]) => [k, v[0]])));
      else setErros({ geral: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  const texto = (k: string, rotulo: string, extra: { max?: number; placeholder?: string; mascara?: (v: string) => string } = {}) => (
    <Campo label={rotulo} erro={erros[k]}>
      <input
        value={f[k] ?? ''}
        onChange={(e) => set(k, extra.mascara ? extra.mascara(e.target.value) : e.target.value)}
        className={inputCls}
        maxLength={extra.max}
        placeholder={extra.placeholder}
      />
    </Campo>
  );
  const numeroCampo = (k: string, rotulo: string, ajuda?: string) => (
    <Campo label={rotulo} erro={erros[k]} ajuda={ajuda}>
      <input inputMode="decimal" value={f[k] ?? ''} onChange={(e) => set(k, e.target.value.replace(/[^\d,]/g, ''))} className={`${inputCls} tabular-nums`} />
    </Campo>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <section className="bg-white rounded-2xl border border-linha shadow-sm p-5 space-y-3.5">
        <h2 className="font-extrabold text-petroleo">Identificação (sai no orçamento e na OS)</h2>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-32 h-32 rounded-xl border border-dashed border-linha grid place-items-center overflow-hidden bg-fundo shrink-0">
            {logo ? <img src={logo} alt="Logo da oficina" className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-grafite/40">sem logo</span>}
          </div>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-1.5 font-bold px-4 py-2.5 rounded-xl border-[1.6px] border-linha text-petroleo hover:bg-fundo cursor-pointer">
              <ImageUp size={16} /> Escolher logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const arq = e.target.files?.[0];
                  e.target.value = '';
                  if (!arq) return;
                  try {
                    setLogo(await logoParaDataUri(arq));
                  } catch (err) {
                    avisos.erro(mensagemDeErro(err));
                  }
                }}
              />
            </label>
            {logo && (
              <BtnGhost icone={Trash2} onClick={() => setLogo(null)} className="!py-2 text-sm">
                Tirar logo
              </BtnGhost>
            )}
            <p className="text-xs text-grafite/45">PNG ou JPG. A imagem é reduzida automaticamente.</p>
            {erros.logo && <p className="text-xs text-vermelho font-semibold">{erros.logo}</p>}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {texto('nome', 'Nome da oficina', { max: 120 })}
          {texto('subtitulo', 'Subtítulo', { max: 120, placeholder: 'Ex.: Mecânica e elétrica em geral' })}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {texto('cnpj', 'CNPJ / CPF', { mascara: mascaraCpfCnpj })}
          {texto('telefone', 'Telefone / WhatsApp', { mascara: mascaraTelefone })}
          {texto('email', 'E-mail', { max: 120 })}
        </div>
        {texto('endereco', 'Endereço', { max: 300 })}
        <Campo label="Texto no rodapé do orçamento e da OS" erro={erros.observacoesDocumento} ajuda="Condições, garantia, formas de pagamento aceitas.">
          <AreaTexto value={f.observacoesDocumento ?? ''} onChange={(e) => set('observacoesDocumento', e.target.value)} rows={3} maxLength={1000} />
        </Campo>
      </section>

      <section className="bg-white rounded-2xl border border-linha shadow-sm p-5 space-y-3.5">
        <h2 className="font-extrabold text-petroleo">Regras da oficina</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {numeroCampo('margemPadrao', 'Margem padrão das peças (%)', 'Sugestão de preço de venda sobre o custo.')}
          {numeroCampo('descontoMaxSemSenha', 'Desconto sem senha do Dono (%)', 'Acima disso, o Dono autoriza com a senha.')}
          {numeroCampo('validadeOrcamentoDias', 'Validade do orçamento (dias)')}
          {numeroCampo('garantiaDias', 'Garantia do serviço (dias)', 'Prazo para abrir OS de garantia sem cobrar a mão de obra.')}
        </div>
        <div className="flex gap-2.5 bg-azul-bg/60 text-azul rounded-xl px-3.5 py-3 text-sm">
          <Info size={17} className="shrink-0 mt-0.5" />
          <p className="leading-snug">
            <strong>Atenção à lei:</strong> o Código de Defesa do Consumidor (art. 26, II) dá ao cliente <strong>90 dias</strong> para reclamar de
            defeito em serviço feito no carro, contados do término do serviço. A garantia da oficina é complementar à legal (art. 50) — não a
            substitui nem a encurta. Na dúvida, fale com o seu contador ou advogado.
          </p>
        </div>
      </section>

      <ErroFormulario>{erros.geral}</ErroFormulario>
      <div className="flex justify-end">
        <BtnPrimary type="submit" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar dados da oficina'}
        </BtnPrimary>
      </div>
    </form>
  );
}
