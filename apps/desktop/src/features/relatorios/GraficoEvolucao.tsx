import { useEffect, useRef, useState } from 'react';
import { brl, type MesEvolucaoDTO } from '@hermes/shared';
import { mesCurtoBR } from '../../lib/format';

// ============================================================
// Faturamento × despesas por mês (colunas) e o lucro (linha), num
// eixo só — as três séries são reais, na mesma escala.
//
// Cores: slots 1–3 da paleta categórica de referência, validados
// (scripts/validate_palette.js do guia de dataviz) contra o fundo
// branco: CVD ΔE 9,2 no pior par vizinho. O verde-água fica abaixo
// de 3:1 de contraste, por isso a legenda, o rótulo no fim da linha
// e a tabela ao lado são obrigatórios — a cor nunca carrega a
// informação sozinha.
// ============================================================

export const CORES_SERIES = {
  faturamento: '#2a78d6',
  despesas: '#eb6834',
  lucro: '#1baf7a',
} as const;

const GRADE = '#e6ebef';
const TEXTO_SECUNDARIO = '#5b6670';
const ALTURA = 280;
const MARGEM = { topo: 16, direita: 64, base: 28, esquerda: 64 };

const compacto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

/** Passo "redondo" (1, 2, 2,5, 5 × 10ⁿ) para as linhas de grade. */
function passoRedondo(bruto: number) {
  const exp = Math.floor(Math.log10(bruto || 1));
  const base = bruto / 10 ** exp;
  const nice = base <= 1 ? 1 : base <= 2 ? 2 : base <= 2.5 ? 2.5 : base <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

/** Coluna com a ponta de dado arredondada (4px) e a base reta. */
function coluna(x: number, largura: number, y0: number, y1: number) {
  const altura = Math.abs(y1 - y0);
  if (altura < 0.5) return '';
  const r = Math.min(4, largura / 2, altura);
  if (y1 < y0) {
    // positivo: cresce para cima
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + largura - r} Q${x + largura},${y1} ${x + largura},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + largura - r} Q${x + largura},${y1} ${x + largura},${y1 - r} V${y0} Z`;
}

export function GraficoEvolucao({ dados }: { dados: MesEvolucaoDTO[] }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(720);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(320, e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const valores = dados.flatMap((d) => [d.faturamento, d.despesas, d.lucro]);
  const minimo = Math.min(0, ...valores);
  const maximo = Math.max(1, ...valores);
  const passo = passoRedondo((maximo - minimo) / 4);
  const topo = Math.ceil(maximo / passo) * passo;
  const fundo = Math.floor(minimo / passo) * passo;
  const ticks: number[] = [];
  for (let v = fundo; v <= topo + passo / 2; v += passo) ticks.push(v);

  const areaL = largura - MARGEM.esquerda - MARGEM.direita;
  const areaA = ALTURA - MARGEM.topo - MARGEM.base;
  const y = (v: number) => MARGEM.topo + ((topo - v) / (topo - fundo || 1)) * areaA;
  const banda = areaL / Math.max(1, dados.length);
  const larguraBarra = Math.min(24, Math.max(6, (banda - 14) / 2));
  const centro = (i: number) => MARGEM.esquerda + banda * i + banda / 2;
  const zero = y(0);

  const pontosLucro = dados.map((d, i) => `${centro(i)},${y(d.lucro)}`).join(' ');
  const ultimo = dados.length - 1;
  const d = ativo !== null ? dados[ativo] : null;
  // Mostra um rótulo de mês a cada N, para não encavalar em tela estreita.
  const pularRotulo = banda < 44 ? 2 : 1;

  return (
    <div>
      <div className="flex items-center gap-4 flex-wrap text-xs font-semibold text-grafite/70 mb-2" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: CORES_SERIES.faturamento }} /> Faturamento
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: CORES_SERIES.despesas }} /> Despesas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded" style={{ background: CORES_SERIES.lucro }} /> Lucro
        </span>
      </div>
      <div ref={caixa} className="relative" onPointerLeave={() => setAtivo(null)}>
        <svg
          width={largura}
          height={ALTURA}
          viewBox={`0 0 ${largura} ${ALTURA}`}
          role="img"
          aria-label="Faturamento, despesas e lucro por mês. Os valores estão também na tabela."
          className="block max-w-full"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c9d3db' : GRADE} strokeWidth={1} />
              <text x={MARGEM.esquerda - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TEXTO_SECUNDARIO} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {compacto.format(t)}
              </text>
            </g>
          ))}

          {ativo !== null && <rect x={MARGEM.esquerda + banda * ativo} y={MARGEM.topo} width={banda} height={areaA} fill="#0f3d57" opacity={0.05} />}

          {dados.map((m, i) => {
            const xF = centro(i) - larguraBarra - 1;
            const xD = centro(i) + 1;
            return (
              <g key={m.mes} opacity={ativo === null || ativo === i ? 1 : 0.55}>
                <path d={coluna(xF, larguraBarra, zero, y(m.faturamento))} fill={CORES_SERIES.faturamento} />
                <path d={coluna(xD, larguraBarra, zero, y(m.despesas))} fill={CORES_SERIES.despesas} />
                {i % pularRotulo === 0 && (
                  <text x={centro(i)} y={ALTURA - 8} textAnchor="middle" fontSize={11} fill={TEXTO_SECUNDARIO}>
                    {mesCurtoBR(m.mes)}
                  </text>
                )}
              </g>
            );
          })}

          <polyline points={pontosLucro} fill="none" stroke={CORES_SERIES.lucro} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {dados.map((m, i) => (
            <circle key={m.mes} cx={centro(i)} cy={y(m.lucro)} r={ativo === i || i === ultimo ? 5 : 4} fill={CORES_SERIES.lucro} stroke="#ffffff" strokeWidth={2} />
          ))}
          {ultimo >= 0 && (
            <text x={largura - MARGEM.direita + 8} y={y(dados[ultimo].lucro)} dy="0.32em" fontSize={11} fontWeight={700} fill="#1e2a33">
              {compacto.format(dados[ultimo].lucro)}
            </text>
          )}

          {/* Área de toque: a faixa inteira do mês (bem maior que a coluna). */}
          {dados.map((m, i) => (
            <rect
              key={m.mes}
              x={MARGEM.esquerda + banda * i}
              y={MARGEM.topo}
              width={banda}
              height={areaA}
              fill="transparent"
              tabIndex={0}
              aria-label={`${mesCurtoBR(m.mes)}: faturamento ${brl(m.faturamento)}, despesas ${brl(m.despesas)}, lucro ${brl(m.lucro)}`}
              onPointerMove={() => setAtivo(i)}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
              style={{ outline: 'none' }}
            />
          ))}
        </svg>

        {d && ativo !== null && (
          <div
            className="absolute pointer-events-none bg-white border border-linha rounded-xl shadow-lg px-3 py-2 text-xs min-w-[11rem]"
            style={{
              top: 8,
              left: Math.min(Math.max(0, centro(ativo) + 14), largura - 190),
            }}
          >
            <div className="font-bold text-grafite/60 mb-1">
              {mesCurtoBR(d.mes)} · {d.numOrdens} OS
            </div>
            {(
              [
                ['faturamento', 'Faturamento', d.faturamento],
                ['despesas', 'Despesas', d.despesas],
                ['lucro', 'Lucro', d.lucro],
              ] as const
            ).map(([k, rotulo, v]) => (
              <div key={k} className="flex items-center gap-2 py-0.5">
                <span className="w-3 h-0.5 rounded" style={{ background: CORES_SERIES[k] }} />
                <span className="font-extrabold tabular-nums text-petroleo">{brl(v)}</span>
                <span className="text-grafite/55">{rotulo}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
