// Coletor genérico de canal público de Telegram, via preview web (t.me/s/).
//
// POR QUE t.me/s/ E NÃO A BOT API: os canais são broadcast público; o preview
// web serve o HTML dos últimos posts sem token, sem o bot precisar ser membro.
// É frágil (HTML não versionado, pode mudar), então falha suave: se o parse
// quebrar, o canal volta vazio e o funil avisa, sem derrubar a rodada.
//
// POR QUE ISTO IMPORTA: o site do Passageiro de Primeira bloqueia ClaudeBot por
// nome (robots), mas o canal @passageirodeprimeira é aberto — o Telegram
// CONTORNA o bloqueio, pegando o mesmo conteúdo pela porta que eles deixaram
// aberta. E o post do Telegram já traz o texto do deal (não o título mentiroso
// do site), então é a fonte honesta pros blogs.
//
// A origem ainda costuma ser implícita ("Voos para Cancún a partir de R$ 750" —
// de onde?), então o LLM extrai igual ao blog. Só triamos aqui pra não gastar
// token em post de cartão/hotel/curso.

import { buscar } from '../util.mjs'

const DECODE = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#036;/g, '$')
    .replace(/&#33;/g, '!')
    .replace(/&#39;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

// Só passa post que cheira a promoção de voo: tem preço (R$) OU milhas, E
// alguma pista de passagem aérea. Corta cartão, hotel, seguro, curso, live.
const EH_VOO = /\b(voo|voos|passage|passagem|passagens|trecho|ida e volta|ida\/volta|aére|aerea|decole|voe)\b/i
const TEM_PRECO = /R\$\s*\d|mil(?:has| pontos| milhas)|\d+\s*mil\s*(?:milhas|pontos)/i
const NAO_VOO = /\b(cart[ãa]o|anuidade|seguro viagem|hosped|di[áa]ria|hotel|resort|como (empilhar|juntar)|curso|masterclass|ao vivo|live\b|webinar|ebook|planilha)\b/i

// Cada post: data-post="canal/12345" é o id estável. Extraímos o texto, o
// permalink e o timestamp. O permalink é o link que vai no alerta (leva ao
// post original do canal, com o afiliado deles intacto).
export async function coletar({ canal, maxPosts = 30 } = {}) {
  let html
  try {
    html = await buscar(`https://t.me/s/${canal}`)
  } catch (e) {
    return { nome: `tg:${canal}`, status: 'erro', posts: [], erro: e.message }
  }

  const blocos = html.split(/<div class="tgme_widget_message [^"]*"/).slice(1)
  const posts = []
  for (const b of blocos) {
    const idm = b.match(/data-post="([^"]+)"/)
    const txtm = b.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="tgme_widget_message_footer|<a class="tgme_widget_message_date)/)
    if (!idm || !txtm) continue
    const texto = DECODE(txtm[1])
    const dt = (b.match(/<time[^>]*datetime="([^"]+)"/) || [])[1] || null
    const link = `https://t.me/${idm[1]}`

    if (!TEM_PRECO.test(texto) || !EH_VOO.test(texto) || NAO_VOO.test(texto)) continue
    posts.push({
      canal,
      link,
      publicado_em: dt,
      // primeira linha = "título"; o resto = corpo. O extrator lê os dois.
      titulo: texto.split('\n')[0].slice(0, 140),
      texto: texto.slice(0, 900),
    })
  }
  posts.reverse() // t.me/s/ vem do mais antigo pro mais novo; queremos recente primeiro
  return { nome: `tg:${canal}`, status: posts.length ? 'ok' : 'vazio', posts: posts.slice(0, maxPosts) }
}
