const normalizar = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const mesDe = (o) => (o.janela_inicio || o.descoberto_em || '').slice(0, 7) || 'sem-data';
export const domestica = (o) => /^BR$/i.test(o.pais_iso2 || '') || /^brasil$/i.test(o.pais_texto || '');
export const veredito = (o, perfilId) => o.perfis?.[perfilId] ?? 'sem_veredito';

export function motivoInelegivel(o, { perfilId, escopo = 'perfil', precoMax = Infinity, noitesMin = 0, noitesMax = Infinity } = {}) {
  if (o.origem_metro && o.origem_metro !== 'SAO') return `Sai de ${o.origem_metro}, não de São Paulo`;
  if ((o.preco_brl ?? Infinity) > precoMax) return 'Acima do teto escolhido';
  if (o.noites != null && (o.noites < noitesMin || o.noites > noitesMax)) return 'Duração fora do filtro';
  const br = domestica(o); const voto = veredito(o, perfilId);
  if (escopo === 'domestico') return br ? null : 'Não é uma viagem pelo Brasil';
  if (escopo === 'internacional' && br) return 'É uma viagem pelo Brasil';
  if (voto !== 'casa') return `Fora do perfil: ${voto.replaceAll('_', ' ')}`;
  return null;
}

export function passaFiltros(o, filtros = {}) {
  if (filtros.tipo && !(o.tipos ?? []).includes(filtros.tipo)) return false;
  if (filtros.continente && o.continente !== filtros.continente) return false;
  if (filtros.pais && o.pais_iso2 !== filtros.pais) return false;
  if (filtros.direto && o.escalas !== 0) return false;
  if (filtros.semVisto && o.sem_visto !== true) return false;
  if (filtros.match && (o.ranking?.pontos ?? 0) < 58) return false;
  if (filtros.deal && !ehOportunidade(o)) return false;
  return true;
}

export function agruparOfertas(ofertas) {
  const grupos = new Map();
  for (const o of ofertas) {
    const destino = o.destino_metro || o.destino_texto || o.id;
    const chave = `${normalizar(destino)}|${mesDe(o)}`;
    const grupo = grupos.get(chave);
    if (!grupo) grupos.set(chave, { ...o, grupoId: chave, alternativas: [], quantidade: 1, mes: mesDe(o) });
    else {
      grupo.quantidade += 1; grupo.alternativas.push(o);
      if ((o.preco_brl ?? Infinity) < (grupo.preco_brl ?? Infinity)) {
        const { alternativas, quantidade, grupoId, mes } = grupo;
        grupos.set(chave, { ...o, alternativas: [...alternativas, grupo], quantidade, grupoId, mes });
      }
    }
  }
  return [...grupos.values()];
}

export function oportunidade(o) {
  let pontos = 0; const razoes = [];
  const desvio = o.baseline?.desvio_pct ?? o.insight?.desvio_pct;
  if (o.baseline?.raro) { pontos += 35; razoes.push('preço raro'); }
  if (desvio < 0) { pontos += Math.min(35, Math.abs(desvio)); razoes.push(`${Math.abs(Math.round(desvio))}% abaixo da média`); }
  if (o.insight?.nivel === 'low') { pontos += 25; razoes.push('preço baixo no Google'); }
  if (o.escalas === 0) { pontos += 8; razoes.push('voo direto'); }
  if (o.sem_visto === true) { pontos += 5; razoes.push('sem visto'); }
  return { pontos, razoes };
}
export const ehOportunidade = (o) => oportunidade(o).pontos >= 20;

export function explicar(o) {
  const partes = [...(o.ranking?.individuais?.flatMap((x) => x.razoes) ?? []), ...oportunidade(o).razoes];
  if (o.quantidade > 1) partes.push(`${o.quantidade - 1} alternativa${o.quantidade > 2 ? 's' : ''} na mesma janela`);
  return [...new Set(partes)].slice(0, 3).join(' · ') || 'Passou por todos os critérios objetivos do radar.';
}

export function scoreFinal(o) { return (o.ranking?.pontos ?? 50) * .65 + oportunidade(o).pontos * .35 - Math.min(15, (o.preco_brl ?? 0) / 1000); }

export function ordenar(ofertas) { return [...ofertas].sort((a, b) => scoreFinal(b) - scoreFinal(a) || (a.preco_brl ?? Infinity) - (b.preco_brl ?? Infinity)); }

export function curarHome(ofertas, limite = 4) {
  const ordenadas = ordenar(ofertas); const escolhidas = []; const destinos = new Set(); const paises = new Map();
  const adicionar = (candidatos, papel, relaxarPais = false) => {
    const item = candidatos.find((o) => !destinos.has(normalizar(o.destino_metro || o.destino_texto)) && (relaxarPais || (paises.get(o.pais_iso2) ?? 0) < 2));
    if (!item || escolhidas.length >= limite) return;
    const destino = normalizar(item.destino_metro || item.destino_texto); destinos.add(destino); paises.set(item.pais_iso2, (paises.get(item.pais_iso2) ?? 0) + 1);
    escolhidas.push({ ...item, papel });
  };
  adicionar(ordenadas.filter((o) => (o.ranking?.pontos ?? 0) >= 58), 'Melhor combinação');
  adicionar([...ordenadas].sort((a,b)=>oportunidade(b).pontos-oportunidade(a).pontos), 'Melhor oportunidade');
  adicionar(ordenadas.filter((o) => o.escalas === 0 || o.sem_visto === true), 'Mais fácil de realizar');
  adicionar(ordenadas, 'Uma escolha diferente');
  for (const o of ordenadas) adicionar([o], 'Também vale olhar', true);
  return escolhidas.slice(0, limite);
}
