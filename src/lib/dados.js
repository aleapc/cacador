import { base } from '$app/paths';

export async function carregar() {
  const url = `${base}/data/ofertas.json`;
  const urlEscapadas = `${base}/data/escapadas.json`;
  const [r, re] = await Promise.all([
    fetch(url, { cache: 'no-cache' }),
    fetch(urlEscapadas, { cache: 'no-cache' }),
  ]);
  if (!r.ok) throw new Error(`não consegui ler ${url} (HTTP ${r.status})`);
  const dados = await r.json();
  if (!re.ok) return { ...dados, escapadas: [], escapadas_meta: { status: 'indisponivel' } };
  const escapadas = await re.json();
  return { ...dados, escapadas: escapadas.escapadas ?? [], escapadas_meta: escapadas };
}

export const brl = (n) =>
  'R$ ' + Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export const quando = (iso) => {
  if (!iso) return '';
  const dias = Math.round((Date.now() - new Date(iso)) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
};

// A janela vem como "2026-08-16 a 2026-08-24". Encurta pro celular.
export const janelaCurta = (j) => {
  if (!j) return '';
  const m = j.match(/(\d{4})-(\d{2})-(\d{2}) a (\d{4})-(\d{2})-(\d{2})/);
  if (!m) return j;
  const [, , m1, d1, , m2, d2] = m;
  const mes = (x) => ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+x];
  return `${+d1}/${mes(m1)} → ${+d2}/${mes(m2)}`;
};

// Estado local do casal: favoritar e descartar.
// Fica no aparelho — sem servidor, sem conta, sem login. O sync entre os dois
// vem depois pelo padrão de código via WhatsApp, igual aos outros PWAs.
const CHAVE = 'VIAGEM_PARA_DOIS_v2';
const CHAVE_ANTIGA = 'CACADOR_v1';

const VAZIO = {
  favoritos: [],
  descartados: [],
  gosto: {},
  escapadasFavoritas: [],
  casal: {
    completo: false,
    cidade: '',
    pessoas: [
      { id: 'p1', nome: '', cor: '#38BDF8' },
      { id: 'p2', nome: '', cor: '#F472B6' },
    ],
  },
};

function normalizar(salvo = {}) {
  const pessoas = salvo.casal?.pessoas?.length === 2
    ? salvo.casal.pessoas
    : VAZIO.casal.pessoas;
  return {
    ...VAZIO,
    ...salvo,
    favoritos: salvo.favoritos ?? [],
    descartados: salvo.descartados ?? [],
    gosto: salvo.gosto ?? {},
    escapadasFavoritas: salvo.escapadasFavoritas ?? [],
    casal: { ...VAZIO.casal, ...(salvo.casal ?? {}), pessoas },
  };
}

export function lerEstado() {
  try {
    const atual = JSON.parse(localStorage.getItem(CHAVE));
    if (atual) return normalizar(atual);
    const antigo = JSON.parse(localStorage.getItem(CHAVE_ANTIGA));
    return normalizar(antigo ?? {});
  } catch {
    return normalizar();
  }
}

export function gravarEstado(e) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(e));
  } catch {
    /* modo privado do Safari: falha em silêncio, o app continua funcionando */
  }
}
