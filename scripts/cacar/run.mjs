// Orquestrador do caçador. Roda de hora em hora pela Action.
//
// Fluxo: sitemap -> triagem por slug (grátis) -> LLM extrai do corpo ->
// normaliza -> deduplica -> casa com os perfis -> alerta só o que é novo.
//
// O estado (o que já foi visto) vive em static/data/, é commitado pela Action,
// e é o que impede o mesmo alerta de chegar toda hora.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { coletar } from './fontes/melhores-destinos.mjs'
import * as explore from './fontes/google-explore.mjs'
import { extrair } from './extrair.mjs'
import { normalizar, deduplicar, casaPerfil } from './dedupe.mjs'
import { marcarPosicionamento } from './posicionamento.mjs'
import { registrar, marcarBaseline } from './baseline.mjs'
import { alertar } from './alertar.mjs'

const SECO = process.argv.includes('--seco')
// O Explore custa cota (250/mês) e o preço não muda de hora em hora — roda só
// uma vez por dia. O Melhores Destinos roda toda hora porque promoção
// relâmpago é evento de hora.
const COM_EXPLORE = process.argv.includes('--explore')
const DADOS = 'static/data'
const OFERTAS = `${DADOS}/ofertas.json`
const HISTORICO = `${DADOS}/historico.json`

const ler = async (p, padrao) => {
  try { return JSON.parse(await readFile(p, 'utf8')) } catch { return padrao }
}

const contar = (xs) => xs.reduce((acc, x) => ({ ...acc, [x]: (acc[x] || 0) + 1 }), {})

// O caçador falha calado: zero alerta pode ser "não teve promoção boa" ou
// "meu filtro comeu tudo", e do lado de fora as duas são idênticas. Este é o
// sinal que distingue — se o funil coletou e nada chegou ao fim, grita.
function alertarFunilSuspeito(f) {
  const avisos = []
  if (f.materias_lidas > 0 && f.ofertas_extraidas === 0)
    avisos.push('leu matéria e extraiu ZERO oferta — extrator ou prompt quebrado?')
  if (f.ofertas_extraidas > 0 && f.descartadas / (f.ofertas_extraidas + f.descartadas) > 0.5)
    avisos.push(`descartou ${f.descartadas} de ${f.ofertas_extraidas + f.descartadas} — schema ou categoria descalibrados?`)
  for (const [id, p] of Object.entries(f.por_perfil)) {
    const fora = Object.values(p.rejeitados).reduce((a, b) => a + b, 0)
    if (f.ineditas > 0 && p.casaram === 0 && fora > 0)
      avisos.push(`perfil ${id}: ${f.ineditas} ofertas inéditas e NENHUMA casou (${JSON.stringify(p.rejeitados)}) — filtro apertado demais?`)
  }
  return avisos
}

async function main() {
  const perfis = (await ler('data/perfis.json', { perfis: [] })).perfis.filter((p) => p.ativo)
  const estado = await ler(OFERTAS, { ofertas: [], visto_ate: null })
  const jaVistos = new Set(estado.ofertas.map((o) => o.id))

  console.log(`Caçando desde ${estado.visto_ate || '(primeira rodada)'} · ${perfis.length} perfil(is) ativo(s)`)

  const { nome, candidatos, artigos } = await coletar({
    desde: estado.visto_ate,
    maxArtigos: SECO ? 2 : 12,
  })
  console.log(`${nome}: ${candidatos} candidato(s) de voo, ${artigos.length} matéria(s) lida(s)`)

  const novas = []
  const descartes = []
  const erros = []
  let tokens = { entrada: 0, saida: 0 }
  for (const a of artigos) {
    try {
      const e = await extrair(a)
      tokens.entrada += e._uso.entrada
      tokens.saida += e._uso.saida
      const r = normalizar(e, a)
      console.log(`  [${e.categoria}] ${a.titulo.slice(0, 62)} -> ${r.ofertas.length} oferta(s)`)
      for (const d of r.descartes) console.log(`      descartado (${d.motivo}): ${d.detalhe}`)
      novas.push(...r.ofertas)
      descartes.push(...r.descartes)
    } catch (err) {
      console.warn(`  ! extração falhou (${a.link}): ${err.message}`)
      erros.push({ link: a.link, erro: err.message })
    }
  }

  // Google Explore: 1 chamada = ~90 destinos de GRU. Descoberta e baseline no
  // mesmo request.
  let doExplore = { nome: 'google-explore', status: 'nao_rodou', ofertas: [], destinos: 0 }
  if (COM_EXPLORE) {
    try {
      doExplore = await explore.coletar({ origem: 'GRU' })
      const c = await explore.cota()
      console.log(`google-explore: ${doExplore.destinos} destino(s), ${doExplore.ofertas.length} com preço` +
        (c ? ` · cota ${c.usadas}/${c.total} usadas, ${c.restantes} restantes` : ''))
      if (c && c.restantes < 30) console.log(`::warning title=Cota SerpApi baixa::só ${c.restantes} buscas restantes`)
    } catch (e) {
      console.warn(`  ! google-explore falhou: ${e.message}`)
      doExplore.status = 'erro'
    }
  }

  let historico = await ler(HISTORICO, { rotas: {} })
  const todas = deduplicar([...novas, ...doExplore.ofertas, ...estado.ofertas])
  const inéditas = todas.filter((o) => !jaVistos.has(o.id))
  console.log(`\n${inéditas.length} oferta(s) inédita(s) de ${todas.length} conhecidas`)

  // Registra a série ANTES de avaliar: o preço de hoje faz parte da história.
  const hojeStr = new Date().toISOString().slice(0, 10)
  historico = registrar(historico, [...novas, ...doExplore.ofertas], hojeStr)
  // Avalia TODAS, não só as inéditas: baseline e veredito de perfil são
  // computação pura, sem custo de API, e uma oferta sem veredito no JSON vira
  // "passou" no PWA por omissão — silêncio virando aprovação. O alerta é que
  // fica restrito às inéditas.
  const comBaseline = marcarBaseline(todas, historico)
  const comSerie = comBaseline.filter((o) => o.baseline.tem_baseline).length
  console.log(`baseline: ${comSerie} de ${comBaseline.length} têm série suficiente (>=7 dias)`)

  const funil = {
    candidatos_do_slug: candidatos,
    materias_lidas: artigos.length,
    extracoes_falhas: erros.length,
    ofertas_extraidas: novas.length,
    explore_destinos: doExplore.destinos,
    explore_status: doExplore.status,
    descartadas: descartes.length,
    por_motivo_de_descarte: contar(descartes.map((d) => d.motivo)),
    ineditas: inéditas.length,
    rotas_no_historico: Object.keys(historico.rotas || {}).length,
    com_baseline: comSerie,
    por_perfil: {},
  }

  // `enriquecidas` é o array que vai pro JSON e pro PWA: mesmas ofertas,
  // acumulando baseline + posicionamento + veredito de cada perfil.
  let enriquecidas = comBaseline

  for (const perfil of perfis) {
    // Marca posicionamento ANTES de filtrar: o casaPerfil precisa saber se a
    // origem "errada" traz vantagem antes de decidir se rejeita.
    enriquecidas = marcarPosicionamento(enriquecidas, perfil)

    const casam = []
    const casamJaVistas = []
    const rejeitados = []
    for (const o of enriquecidas) {
      const motivo = casaPerfil(o, perfil)
      // O veredito viaja DENTRO da oferta: o PWA precisa dele para não mostrar
      // "Natal saindo de Campinas" a um casal de São Paulo. O motivo vai junto
      // — o app pode mostrar tudo se você pedir, mas sabe dizer por que
      // escondeu. Esconder sem saber o porquê é o pecado desta conversa.
      o.perfis = { ...(o.perfis || {}), [perfil.id]: motivo ?? 'casa' }
      if (motivo) rejeitados.push(motivo)
      else if (jaVistos.has(o.id)) casamJaVistas.push(o) // casa, mas já foi alertada
      else casam.push(o)
    }
    const porMotivo = contar(rejeitados.map((m) => m.split(':')[0]))
    // As três contagens têm que fechar com o total. Se não fecharem, alguma
    // oferta está sumindo por um caminho que ninguém está olhando.
    const soma = casam.length + casamJaVistas.length + rejeitados.length
    if (soma !== enriquecidas.length)
      console.log(`::warning title=Funil não fecha::${soma} contabilizadas de ${enriquecidas.length}`)

    // Teto de alertas por rodada. 33 mensagens de uma vez não é serviço, é
    // enxurrada — e enxurrada vira ruído que você aprende a ignorar, o que
    // mata o app mais rápido que bug nenhum. Ordena por relevância: quem tem
    // baseline e está raro vem primeiro; sem baseline, o mais barato.
    const ranked = casam.sort((a, b) => {
      const pontos = (o) => (o.baseline?.raro ? 1000 : 0) - (o.baseline?.desvio_pct ?? 0)
      return pontos(b) - pontos(a) || a.preco_brl - b.preco_brl
    })
    const teto = perfil.max_alertas_por_rodada ?? 5
    const enviar = ranked.slice(0, teto)
    const cortados = ranked.length - enviar.length

    funil.por_perfil[perfil.id] = {
      total_avaliadas: enriquecidas.length,
      casam_no_perfil: casam.length + casamJaVistas.length,
      dessas_ja_alertadas_antes: casamJaVistas.length,
      novas_para_alertar: casam.length,
      alertados: enviar.length,
      cortadas_pelo_teto: cortados,
      rejeitados: porMotivo,
    }
    console.log(`  ${perfil.nome}: ${casam.length + casamJaVistas.length} casam de ${enriquecidas.length}` +
      ` (${casamJaVistas.length} já alertadas antes, ${casam.length} novas)` +
      ` → alertando ${enviar.length}${cortados ? `, ${cortados} cortadas pelo teto` : ''}` +
      ` · ${rejeitados.length} fora (${JSON.stringify(porMotivo)})`)
    // Corte silencioso é o pecado desta conversa inteira: se o teto engoliu
    // oferta, tem que aparecer.
    if (cortados) console.log(`      ${cortados} oferta(s) ficaram só no ofertas.json, não viraram alerta`)
    const r = await alertar(enviar, perfil, {
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: perfil.telegram_chat_id || process.env.TELEGRAM_CHAT_ID,
      seco: SECO,
    })
    if (r.enviados) console.log(`    -> ${r.enviados} alerta(s) enviado(s)`)
  }

  const usd = (tokens.entrada / 1e6) * 5 + (tokens.saida / 1e6) * 25
  console.log(`\nFunil: ${JSON.stringify(funil, null, 2)}`)
  console.log(`Tokens: ${tokens.entrada} entrada / ${tokens.saida} saída ≈ US$ ${usd.toFixed(4)}`)

  const avisos = alertarFunilSuspeito(funil)
  for (const a of avisos) console.log(`::warning title=Funil suspeito::${a}`)

  if (SECO) { console.log('\n(modo seco: nada gravado, nada enviado)'); return }

  await mkdir(DADOS, { recursive: true })
  await writeFile(HISTORICO, JSON.stringify(historico, null, 0) + '\n')
  await writeFile(
    OFERTAS,
    JSON.stringify(
      {
        gerado_em: new Date().toISOString(),
        visto_ate: artigos[0]?.publicado_em || estado.visto_ate,
        fontes: [
          { nome, candidatos, lidas: artigos.length, status: artigos.length ? 'ok' : 'vazio' },
          { nome: doExplore.nome, destinos: doExplore.destinos, status: doExplore.status },
        ],
        // O funil fica no arquivo, não só no log: log de Action expira em 90
        // dias, e é justamente a série histórica dele que diz se um filtro
        // apertou com o tempo. Sem isso, redescobrir custa um diagnóstico.
        funil,
        avisos,
        perfis: perfis.map((p) => ({ id: p.id, nome: p.nome, viajantes: p.viajantes })),
        // Todas com baseline e veredito. 400 cobre meses e mantém o JSON em
        // poucas centenas de KB, que é o que o celular baixa.
        ofertas: enriquecidas.slice(0, 400),
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`Gravado ${OFERTAS}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
