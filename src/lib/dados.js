import { base } from '$app/paths';

export async function carregar() {
  const url = `${base}/data/ofertas.json`;
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`não consegui ler ${url} (HTTP ${r.status})`);
  return r.json();
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
const CHAVE = 'CACADOR_v1';

const VAZIO = { favoritos: [], descartados: [], gosto: {} };

export function lerEstado() {
  try {
    return { ...VAZIO, ...(JSON.parse(localStorage.getItem(CHAVE)) ?? {}) };
  } catch {
    return { ...VAZIO };
  }
}

export function gravarEstado(e) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(e));
  } catch {
    /* modo privado do Safari: falha em silêncio, o app continua funcionando */
  }
}
