const PREFIXO = 'VPD3.';

function bytesParaBase64(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64ParaBytes(s) {
  const normal = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(normal + '='.repeat((4 - normal.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function checksum(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
export function codificar(payload) {
  const json = JSON.stringify(payload); return `${PREFIXO}${checksum(json)}.${bytesParaBase64(new TextEncoder().encode(json))}`;
}
export function decodificar(codigo) {
  const [versao, soma, dados] = codigo.split('.');
  if (`${versao}.` !== PREFIXO || !soma || !dados) throw new Error('Código de vínculo inválido.');
  const json = new TextDecoder().decode(base64ParaBytes(dados));
  if (checksum(json) !== soma) throw new Error('Código incompleto ou alterado.');
  return JSON.parse(json);
}
export function criarPacote(estado, tipo = 'atualizacao') {
  const eu = estado.pessoas[estado.aparelho.pessoaId];
  if (!eu) throw new Error('Complete seu perfil antes de compartilhar.');
  const duplaId = estado.dupla.id || `dupla-${crypto.randomUUID?.() ?? Date.now().toString(36)}`;
  return { v: 3, tipo, duplaId, cidade: estado.dupla.cidade, remetente: { ...eu, gostos: estado.gosto[eu.id] ?? [] },
    eventos: estado.eventos.filter((x) => x.pessoaId === eu.id).map(({ nota: _nota, ...seguro }) => seguro), criadoEm: new Date().toISOString() };
}
export function importarPacote(estado, pacote) {
  if (pacote?.v !== 3 || !pacote.remetente?.id) throw new Error('Este link não pertence à versão atual.');
  if (estado.dupla.id && estado.dupla.id !== pacote.duplaId && estado.dupla.status === 'pareada') throw new Error('Este link pertence a outra dupla. Desvincule primeiro.');
  const conhecidos = new Set(estado.eventos.map((x) => x.id));
  const novos = (pacote.eventos ?? []).filter((x) => !conhecidos.has(x.id));
  return { estado: { ...estado, pessoas: { ...estado.pessoas, [pacote.remetente.id]: { ...pacote.remetente, gostos: undefined } },
    gosto: { ...estado.gosto, [pacote.remetente.id]: pacote.remetente.gostos ?? [] },
    dupla: { ...estado.dupla, id: pacote.duplaId, cidade: estado.dupla.cidade || pacote.cidade, parceiroId: pacote.remetente.id, status: 'pareada' },
    eventos: [...estado.eventos, ...novos] }, novos };
}
export function linkComPacote(url, pacote) {
  const limpa = url.split('#')[0]; return `${limpa}#dupla=${codificar(pacote)}`;
}
export function pacoteDoHash(hash) {
  const m = hash.match(/(?:^#|&)dupla=([^&]+)/); return m ? decodificar(decodeURIComponent(m[1])) : null;
}
