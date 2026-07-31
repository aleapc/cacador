import test from 'node:test'; import assert from 'node:assert/strict';
import { estadoVazio, criarPerfil, registrarEvento } from '../src/lib/dados.js';
import { codificar, decodificar, criarPacote, importarPacote } from '../src/lib/troca.js';
test('código preserva unicode e detecta alteração', () => { const c = codificar({ nome: 'Andréia' }); assert.equal(decodificar(c).nome, 'Andréia'); assert.throws(() => decodificar(c.slice(0, -1) + 'x')); });
test('importação é idempotente e não compartilha nota privada', () => {
  let a = criarPerfil(estadoVazio(), { nome: 'Andréia', cidade: 'São Paulo' }); a = registrarEvento(a, { itemId: 'x', itemTipo: 'viagem', acao: 'gostei', nota: 'privada' });
  const pacote = criarPacote(a, 'convite'); assert.equal('nota' in pacote.eventos[0], false);
  const b = criarPerfil(estadoVazio(), { nome: 'C', cidade: 'São Paulo' }); const uma = importarPacote(b, pacote); const duas = importarPacote(uma.estado, pacote);
  assert.equal(uma.novos.length, 1); assert.equal(duas.novos.length, 0);
});
