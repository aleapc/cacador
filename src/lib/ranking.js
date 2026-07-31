const PESOS = { gostei: 2, salvei: 3, nao_gostei: -3, descartei: -2 };

export function passaQualidade(item, qualidade) {
  if (item.itemTipo === 'escapada' || item.avaliacao != null) {
    if (!qualidade.aceitarSemClassificacao && !item.estrelas) return false;
    if (item.estrelas && item.estrelas < qualidade.hotelEstrelas) return false;
    if ((item.avaliacao ?? 0) < qualidade.avaliacaoMinima) return false;
    if ((item.avaliacoes ?? 0) < qualidade.minimoAvaliacoes) return false;
  }
  if (item.escalas != null && item.escalas > qualidade.escalasMaximas) return false;
  return true;
}

export function pontuarPessoa(item, pessoa, gostos = [], eventos = []) {
  let pontos = 50;
  const razoes = [];
  const comuns = (item.tags ?? item.tipos ?? []).filter((t) => gostos.includes(t));
  if (comuns.length) { pontos += 8 * comuns.length; razoes.push(`combina com ${comuns.length} preferência${comuns.length > 1 ? 's' : ''}`); }
  for (const e of eventos.filter((x) => x.pessoaId === pessoa.id)) {
    const similares = (e.motivos ?? []).filter((m) => (item.tags ?? item.tipos ?? []).includes(m)).length;
    pontos += (PESOS[e.acao] ?? 0) * (e.itemId === item.id ? 4 : Math.max(1, similares));
  }
  if (item.avaliacao >= pessoa.qualidade.avaliacaoMinima) { pontos += 5; razoes.push(`avaliação ${item.avaliacao}`); }
  return { pontos: Math.max(0, Math.min(100, pontos)), razoes };
}

export function pontuarDupla(item, pessoas, gosto, eventos) {
  const individuais = pessoas.map((p) => pontuarPessoa(item, p, gosto[p.id] ?? [], eventos));
  if (!individuais.length) return { pontos: 50, individuais, explicacao: 'Ainda aprendendo suas preferências.' };
  const valores = individuais.map((x) => x.pontos); const minimo = Math.min(...valores); const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  return { pontos: Math.round(minimo * .7 + media * .3), individuais,
    explicacao: individuais.flatMap((x) => x.razoes).slice(0, 2).join(' · ') || 'Sugestão nova para vocês avaliarem.' };
}
