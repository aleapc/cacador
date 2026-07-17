// Coletor do Melhores Destinos.
//
// SOBRE A ESCOLHA DE CAMINHO (não mexer sem reler o robots.txt deles):
// o robots.txt tem "Disallow: /feed/" e "Disallow: */feed/" para User-agent: *,
// e ao mesmo tempo anuncia "Sitemap: .../sitemap.xml". As páginas /promocao/
// não estão restritas. Então descobrimos pelo sitemap (que o site convida a
// buscar) e lemos as matérias (que não estão vedadas) — e nunca tocamos no
// feed RSS, que seria o caminho óbvio mas é o caminho proibido.
// Não há bloqueio nominal a ClaudeBot nem Content-Signal neste domínio
// (contraste com passageirodeprimeira.com, que proíbe ClaudeBot por nome —
// por isso aquele site está fora do projeto).
//
// SOBRE O TÍTULO: ele MENTE. "Portugal ... a partir de R$ 3.061, saindo de
// São Paulo" — mas o corpo diz que os R$ 3.061 são de RECIFE e que São Paulo
// sai por R$ 3.307. O título junta o menor preço da matéria com uma cidade
// que não é a dele. Serve para TRIAR, nunca para extrair preço.

import { buscar, locs, sitemapsDoIndice, textoLimpo } from '../util.mjs'

const BASE = 'https://www.melhoresdestinos.com.br'

// O slug é um triador confiável e de graça: matéria de voo tem
// "passagens-aereas" ou "passagens-<destino>" na URL. Cupom, seguro, hotel e
// pacote (voo+hotel, que não é o que caçamos) ficam de fora.
const EH_VOO = /\/promocao\/(passagens-aereas|passagens-|voos-|.*-passagens-)/i
const NAO_EH_VOO = /(seguro-viagem|cupom|hoteis|hotel|resort|pacote|cruzeiro|ingresso|aluguel-de-carro)/i

// Isola o texto editorial. A página tem ~76KB de HTML; depois de limpar sobram
// ~1.800 caracteres, dos quais só ~400 são a matéria — o resto é menu, widget
// de busca e rodapé. Cortar aqui não é só economia de token: o menu contém
// "Passagens Aéreas", "Hotéis", "Seguro Viagem", que são exatamente as
// palavras que o extrator usa para classificar a matéria. Deixar isso no
// prompt é convidar o modelo a se confundir.
//
// Âncoras: o editorial começa depois do H1 (2ª ocorrência do título) e termina
// no widget de busca. Se qualquer âncora falhar, cai no texto inteiro — pior
// prompt, mas nunca prompt vazio.
function soEditorial(inteiro, titulo) {
  let t = inteiro
  const marca = titulo.slice(0, 40)
  const ultimo = marca ? t.lastIndexOf(marca) : -1
  if (ultimo > 0) t = t.slice(ultimo + marca.length)

  // A MAIS ANTIGA das âncoras, não a primeira da lista: o widget de busca vem
  // antes do disclaimer no documento, então cortar na primeira que casar deixa
  // o widget passar.
  const fins = [
    /Pesquisar passagens aéreas/,
    /Viaje com Desconto/,
    /A lista de preços está em constante atualização/,
    /Confira abaixo todas as opções encontradas/,
  ]
  const corte = fins
    .map((f) => t.search(f))
    .filter((i) => i > 200)
    .sort((a, b) => a - b)[0]
  if (corte) t = t.slice(0, corte)
  const limpo = t.replace(/\n\s*\n\s*\n+/g, '\n\n').trim()
  // Guarda-chuva: se o recorte comeu demais, prefere ruído a silêncio.
  return limpo.length > 150 ? limpo.slice(0, 3000) : inteiro.slice(0, 3000)
}

async function ultimoSitemapDePromocao() {
  const indice = await buscar(`${BASE}/sitemap.xml`, { tipo: 'xml' })
  const promo = sitemapsDoIndice(indice).filter((s) => /promocao-sitemap/.test(s))
  if (!promo.length) throw new Error('nenhum promocao-sitemap no índice')
  // promocao-sitemap.xml, promocao-sitemap2.xml, ... o maior tem os posts de hoje
  return promo
    .map((s) => ({ s, n: parseInt((s.match(/promocao-sitemap(\d*)/) || [])[1] || '1', 10) }))
    .sort((a, b) => b.n - a.n)[0].s
}

export async function coletar({ desde, maxArtigos = 12 }) {
  const sitemap = await ultimoSitemapDePromocao()
  const xml = await buscar(sitemap, { tipo: 'xml' })

  const candidatos = locs(xml)
    .filter((u) => u.loc && u.lastmod)
    .filter((u) => EH_VOO.test(u.loc) && !NAO_EH_VOO.test(u.loc))
    .filter((u) => !desde || u.lastmod > desde)
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod))
    .slice(0, maxArtigos)

  const artigos = []
  for (const c of candidatos) {
    try {
      const html = await buscar(c.loc)
      const titulo = ((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '')
        .replace(/\s*[|–-]\s*Melhores Destinos\s*$/, '')
        .trim()
      artigos.push({
        link: c.loc,
        publicado_em: c.lastmod,
        titulo,
        texto: soEditorial(textoLimpo(html), titulo),
      })
    } catch (e) {
      console.warn(`  ! falhou ${c.loc}: ${e.message}`)
    }
  }

  return { nome: 'melhores-destinos', candidatos: candidatos.length, artigos }
}
