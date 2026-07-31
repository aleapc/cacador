import test from 'node:test'; import assert from 'node:assert/strict';
import { motivoInelegivel, agruparOfertas, curarHome, passaFiltros } from '../src/lib/selecao.js';

const oferta=(id,destino,extra={})=>({id,destino_texto:destino,destino_metro:destino,origem_metro:'SAO',pais_iso2:'US',preco_brl:2000,noites:8,janela_inicio:'2026-10-01',perfis:{casal:'casa'},ranking:{pontos:60,individuais:[]},...extra});
test('elegibilidade barra origem errada e veredito rejeitado',()=>{
  assert.match(motivoInelegivel(oferta('a','Paris',{origem_metro:'VIX'}),{perfilId:'casal'}),/VIX/);
  assert.match(motivoInelegivel(oferta('b','Paris',{perfis:{casal:'janela_curta'}}),{perfilId:'casal'}),/janela curta/);
  assert.equal(motivoInelegivel(oferta('c','Paris'),{perfilId:'casal',precoMax:4000,noitesMin:7,noitesMax:14}),null);
});
test('modo Brasil permite doméstica compatível sem misturar na seleção rigorosa',()=>{
  const br=oferta('r','Rio',{pais_iso2:'BR',perfis:{casal:'domestico'}});
  assert.ok(motivoInelegivel(br,{perfilId:'casal',escopo:'perfil'}));
  assert.equal(motivoInelegivel(br,{perfilId:'casal',escopo:'domestico'}),null);
});
test('agrupa destino e mês mantendo menor preço e alternativas',()=>{
  const grupos=agruparOfertas([oferta('a','Miami',{preco_brl:2200}),oferta('b','Miami',{preco_brl:1800}),oferta('c','Miami',{janela_inicio:'2026-11-01'})]);
  assert.equal(grupos.length,2); const outubro=grupos.find((g)=>g.mes==='2026-10'); assert.equal(outubro.preco_brl,1800); assert.equal(outubro.quantidade,2);
});
test('home tem destinos diversos mesmo quando um destino possui muitas ofertas',()=>{
  const grupos=agruparOfertas([oferta('r1','Rio'),oferta('r2','Rio',{janela_inicio:'2026-11-01'}),oferta('r3','Rio',{janela_inicio:'2026-12-01'}),oferta('m','Miami',{baseline:{raro:true}}),oferta('p','Paris',{escalas:0}),oferta('b','Buenos Aires')]);
  const home=curarHome(grupos,4); assert.equal(new Set(home.map((o)=>o.destino_texto)).size,4);
});
test('filtros objetivos funcionam depois da elegibilidade',()=>{
  const o=oferta('x','Paris',{tipos:['cultural'],continente:'europa',escalas:0,sem_visto:true});
  assert.equal(passaFiltros(o,{tipo:'cultural',continente:'europa',direto:true,semVisto:true}),true);
  assert.equal(passaFiltros(o,{tipo:'praia'}),false);
});
