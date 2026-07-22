// Enriquece cada oferta com o que os filtros de tipo/lugar/visto precisam.
//
// A tag de tipo (praia/montanha/cultural...) NÃO vem da fonte de voo — ninguém
// diz que Cancún é "praia". Um passo offline (workflow taggear-destinos) etiqueta
// cada destino UMA vez e commita em data/destinos.json. Aqui é só lookup: custo
// zero em runtime, mesmo padrão de todo o resto do projeto.
//
// O visto vem do dataset consular (data/vistos.json, 61 países com fonte+data).
// É o filtro com consequência física — se errar, barra no embarque (lembrar do
// México, que exige visto de brasileiro desde 2022).

import { readFile } from 'node:fs/promises'

let _tax = null
let _vistos = null

const ler = async (p, padrao) => {
  try { return JSON.parse(await readFile(p, 'utf8')) } catch { return padrao }
}

export async function carregarTaxonomia() {
  if (_tax) return _tax
  const d = await ler('data/destinos.json', { destinos: [] })
  // Indexa por key (IATA do Explore) E por nome (cidade do blog): as duas
  // fontes falam vocabulários diferentes e as duas precisam achar a tag.
  _tax = new Map()
  for (const x of d.destinos || []) {
    _tax.set(x.key, x)
    if (x.nome) _tax.set(x.nome, x)
  }
  return _tax
}

export async function carregarVistos() {
  if (_vistos) return _vistos
  const d = await ler('data/vistos.json', { paises: [] })
  _vistos = new Map((d.paises || []).map((p) => [String(p.iso2).toUpperCase(), p]))
  return _vistos
}

// A oferta é etiquetada pela mesma chave que o tagger usou: destino_metro (do
// Explore) ou destino_texto (do blog). Se o destino ainda não foi taggeado,
// tipos fica [] — ele aparece em "Tudo" mas some dos filtros de tipo, com nota.
// Silêncio não: o funil conta quantos ficaram sem tag.
export function enriquecer(oferta, tax, vistos) {
  const t = tax.get(oferta.destino_metro) || tax.get(oferta.destino_texto) || null
  const pais_iso2 = (oferta.pais_iso2 || t?.pais_iso2 || '').toUpperCase() || null
  const v = pais_iso2 ? vistos.get(pais_iso2) : null

  return {
    ...oferta,
    tipos: t?.tipos || [],
    continente: t?.continente || null,
    pais_iso2,
    tem_tag: !!t,
    // sem_visto: true só quando o dataset diz NAO. null = desconhecido (não
    // afirmar "sem visto" sem fonte — é o que barra alguém no portão).
    sem_visto: v ? v.exige_visto === 'NAO' : null,
    visto: v
      ? { exige: v.exige_visto, dias: v.dias_permitidos, pegadinha: v.pegadinha || '', rotulo: v.rotulo }
      : null,
  }
}

// Gosto por pessoa + match do casal. Uma oferta "agrada" alguém se qualquer um
// dos tipos dela está na lista de gostos da pessoa. "match" = agrada TODOS.
// Sem tipos (destino não taggeado), ninguém "gosta" por afirmação — fica neutro.
export function avaliarGosto(oferta, pessoas) {
  const gosto = {}
  for (const p of pessoas || []) {
    gosto[p.id] = oferta.tipos.length > 0 && oferta.tipos.some((t) => (p.gosta || []).includes(t))
  }
  const ids = (pessoas || []).map((p) => p.id)
  const match = ids.length >= 2 && ids.every((id) => gosto[id])
  return { ...oferta, gosto, match }
}
