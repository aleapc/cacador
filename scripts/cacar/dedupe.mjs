// Deduplicação e ranking.
//
// Depois da extração o problema deixou de ser NLP e virou record linkage:
// já temos campos estruturados, então similaridade semântica é a ferramenta
// errada. Normalização + tolerância numérica resolve, e é auditável.

import { idDe, metro } from './util.mjs'
import { valeOPosicionamento } from './posicionamento.mjs'

// Tolerância relativa, não bucket. round(preco/50)*50 quebra na borda:
// R$1.874 -> 1.850 e R$1.876 -> 1.900 viram buckets diferentes por R$2 de
// diferença. Tolerância relativa não tem borda.
const MESMO_PRECO = (a, b) => Math.abs(a - b) / Math.min(a, b) <= 0.05

// Faixas de sanidade por região. Fora da faixa não descarta — sinaliza.
// R$45 para Tóquio é tarifa errada real (raro) ou extração errada (comum);
// as duas merecem o olho humano, não o silêncio.
const FAIXAS = {
  BR: [100, 4000],
  AR: [400, 6000], CL: [400, 6000], UY: [300, 5000], CO: [500, 7000], PE: [500, 7000],
  US: [1000, 12000], MX: [1000, 10000], CA: [1200, 12000],
  PT: [1500, 12000], ES: [1500, 12000], FR: [1500, 12000], IT: [1500, 12000],
  GB: [1500, 14000], DE: [1500, 12000], NL: [1500, 12000],
  ZA: [1500, 14000], MA: [2000, 15000],
  TH: [2000, 18000], JP: [2500, 20000], CN: [2500, 20000],
}
const FAIXA_PADRAO = [200, 25000]

// Todo descarte deixa rastro, com o motivo e o que foi descartado.
//
// POR QUE ISSO EXISTE (lição cara, do Estado do Silício): lá um gate de LLM
// foi calibrado no escuro e matou a MELHOR matéria do dia (nota 95), deixando
// passar as de 79 e 72 — as edições caíram de 6 para 1 e 2 matérias. O log
// dizia só "9 vetadas", sem dizer de qual etapa, então levou dois dias e um
// diagnóstico dedicado pra achar o culpado.
//
// Aqui é pior, porque falha calado: uma capa vazia se vê, um caçador que não
// alerta é indistinguível de um caçador que não achou nada. Se o filtro comer
// tudo, o log tem que gritar.
export function normalizar(extraido, artigo) {
  const descartes = []

  if (extraido.categoria !== 'promocao_voo') {
    descartes.push({ motivo: 'categoria', detalhe: extraido.categoria, titulo: artigo.titulo })
    return { ofertas: [], descartes }
  }

  const ofertas = (extraido.ofertas || [])
    // Gate de completude: promoção de voo real SEMPRE tem destino e preço.
    // A ausência do campo é sinal mais duro e mais barato que qualquer score
    // de confiança que o modelo se atribua. Mas o descarte é registrado —
    // se o extrator começar a devolver oferta sem preço, quero saber na hora,
    // não daqui a dois meses.
    .filter((o) => {
      if (o.destino_texto && o.preco_brl > 0) return true
      descartes.push({
        motivo: 'incompleta',
        detalhe: `destino="${o.destino_texto || ''}" preco=${o.preco_brl}`,
        titulo: artigo.titulo,
      })
      return false
    })
    .map((o) => {
      const om = metro(o.origem_iata)
      const dm = metro(o.destino_iata)
      const [min, max] = FAIXAS[o.pais_iso2] || FAIXA_PADRAO
      const flags = []
      if (o.preco_brl < min) flags.push('preco_abaixo_da_faixa')
      if (o.preco_brl > max) flags.push('preco_acima_da_faixa')
      if (!o.origem_texto) flags.push('origem_nao_atribuida')
      return {
        id: idDe(om, dm, extraido.tipo, o.preco_brl.toFixed(0), artigo.publicado_em.slice(0, 10)),
        origem_texto: o.origem_texto,
        origem_metro: om,
        destino_texto: o.destino_texto,
        destino_metro: dm,
        pais_iso2: (o.pais_iso2 || '').toUpperCase(),
        preco_brl: o.preco_brl,
        por_pessoa: extraido.por_pessoa,
        ida_e_volta: extraido.ida_e_volta,
        com_taxas: extraido.com_taxas,
        tipo: extraido.tipo,
        bagagem_despachada: o.bagagem_despachada,
        companhia: o.companhia || '',
        validade: extraido.validade || '',
        observacao: o.observacao || '',
        flags,
        fontes: [{ nome: 'melhores-destinos', link: artigo.link, titulo: artigo.titulo }],
        descoberto_em: artigo.publicado_em,
      }
    })

  return { ofertas, descartes }
}

// Merge, não descarte. "3 blogs postaram isso" é sinal de confiança; "1 blog
// postou" pode ser tarifa errada exclusiva — ou extração ruim. Guardar as
// fontes transforma a duplicata em feature.
export function deduplicar(ofertas) {
  const blocos = new Map()
  for (const o of ofertas) {
    const chave = `${o.origem_metro}|${o.destino_metro}|${o.tipo}|${o.descoberto_em.slice(0, 10)}`
    if (!blocos.has(chave)) blocos.set(chave, [])
    blocos.get(chave).push(o)
  }

  const saida = []
  for (const grupo of blocos.values()) {
    const clusters = []
    for (const o of grupo) {
      const casa = clusters.find((c) => MESMO_PRECO(c[0].preco_brl, o.preco_brl))
      if (casa) casa.push(o)
      else clusters.push([o])
    }
    for (const c of clusters) {
      const vencedor = c.reduce((a, b) => (a.preco_brl <= b.preco_brl ? a : b))
      saida.push({ ...vencedor, fontes: c.flatMap((x) => x.fontes) })
    }
  }
  return saida.sort((a, b) => a.preco_brl - b.preco_brl)
}

// Casa a oferta com um perfil. As coordenadas do perfil são filtro — não
// disparam busca nova, porque o job já varreu tudo que o site publicou.
//
// Devolve o MOTIVO da rejeição, não um booleano. Um perfil com teto apertado
// demais come tudo e você conclui "não está tendo promoção boa", quando a
// verdade é "meu filtro está errado". O motivo agregado no log é o que
// distingue as duas coisas — e é o que faltou no Estado do Silício.
export function casaPerfil(oferta, perfil) {
  if (!perfil.ativo) return 'perfil_inativo'
  if (perfil.tipos?.length && !perfil.tipos.includes(oferta.tipo)) return `tipo:${oferta.tipo}`

  // Origem fora de casa NÃO é rejeição automática: se a diferença de preço
  // paga um posicionamento, é justamente a oportunidade que este app existe
  // para achar. Só rejeita se não houver vantagem que justifique.
  if (perfil.origens?.length && oferta.origem_metro && !perfil.origens.includes(oferta.origem_metro)) {
    if (!oferta.posicionamento) return `origem:${oferta.origem_metro}`
    if (perfil.posicionamento?.ativo !== true)
      return `posicionamento_desligado:diferenca_bruta_${oferta.posicionamento.economia_grupo}`
    if (!valeOPosicionamento(oferta, perfil))
      return `posicionamento_magro:${oferta.posicionamento.economia_grupo}`
  }

  // Destino doméstico não é "oportunidade de viagem" pra quem mora em São
  // Paulo e quer 7-14 noites fora. Sai por padrão; é opção do perfil.
  //
  // Checa AS DUAS formas de dizer "Brasil": o Explore devolve pais_texto
  // ("Brasil"), o extrator do blog devolve pais_iso2 ("BR"). Checar só um
  // deixava "Natal saindo de Campinas" passar como oportunidade — e passar
  // marcado como `casa`, porque Campinas normaliza para a área metropolitana
  // de São Paulo. Duas fontes, dois vocabulários: aceitar um só é bug.
  if (perfil.excluir_domestico !== false) {
    const brasil = /^brasil$/i.test(oferta.pais_texto || '') || /^BR$/i.test(oferta.pais_iso2 || '')
    if (brasil) return 'domestico'
  }

  // A janela mais barata que o Google acha pode ser de 6 noites — não serve
  // pra quem quer 7-14. Só filtra quando a oferta DECLARA a janela: matéria de
  // blog raramente declara, e descartar por falta de dado seria pior que
  // deixar passar.
  if (oferta.noites != null && perfil.noites) {
    if (oferta.noites < perfil.noites.min) return `janela_curta:${oferta.noites}n`
    if (oferta.noites > perfil.noites.max) return `janela_longa:${oferta.noites}n`
  }

  if (perfil.paises?.length && !perfil.paises.includes(oferta.pais_iso2)) return `pais:${oferta.pais_iso2}`
  if (perfil.teto_por_pessoa && oferta.preco_brl > perfil.teto_por_pessoa)
    return `acima_do_teto:${oferta.preco_brl}>${perfil.teto_por_pessoa}`
  if (perfil.exigir_bagagem && oferta.bagagem_despachada !== 'inclui') return 'sem_bagagem'

  // Visto: só barra quando o dataset AFIRMA que exige (sem_visto === false).
  // Desconhecido (null) NÃO barra — mas a pegadinha aparece no card. Errar pro
  // lado de "esconder" é melhor que pro lado de "mandar pro balcão sem embarcar".
  if (perfil.exigir_sem_visto && oferta.sem_visto === false) return `exige_visto:${oferta.pais_iso2}`

  // Match do casal: só gateia alerta se você pediu (alertar_apenas_match).
  // Por padrão, o que agrada um só também alerta (marcado de quem) — o match
  // apenas sobe no ranking.
  if (perfil.alertar_apenas_match && !oferta.match) return 'nao_agrada_os_dois'

  return null // null = casa
}
