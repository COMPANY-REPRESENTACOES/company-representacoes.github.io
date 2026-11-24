/* Company Vendas — app de pedidos (offline) · teste Grupo Dylan + Grupo Equipo */
(function(){
'use strict';
var CFG = window.CV_CONFIG;
var $app = document.getElementById('app');

var STATUS = [
  ['recebido','Recebido'],['espelho_enviado','Espelho enviado'],
  ['enviado_fabrica','Enviado à fábrica'],['faturado','Faturado'],['cancelado','Cancelado']
];
var STATUS_ANTIGOS = [['em_revisao','Em revisão'],['aprovado','Aprovado']]; /* não usados mais; só para pedidos antigos */
var STATUS_NOME = {}; STATUS.concat(STATUS_ANTIGOS).forEach(function(s){ STATUS_NOME[s[0]] = s[1]; });
/* regras comerciais por representada (pedido mínimo, à vista, prazos com valor mínimo por duplicata) */
var REGRAS = {
  vector: { minimo: 1000, minDup: 500, avistas: [ { nome: 'À vista PIX (5% de desconto)', desc: 5 }, { nome: 'À vista 15 dd (5% de desconto)', desc: 5 } ],
    prazos: [ { p: '30 dd' }, { p: '30/60' }, { p: '30/45/60' }, { p: '30/60/90' }, { p: '30/45/60/75/90' },
      { p: '30/60/90/120', acima: 5000 }, { p: '30/45/60/75/90/105', acima: 5000 }, { p: '30/45/60/75/90/105/120', acima: 5000 } ] }
};
/* Solez: desconto pelo valor do pedido (bruto em tabela) + desconto pelo prazo de pagamento (igual ao Pedido Express Solez) */
REGRAS.solez = { solez: true,
  faixas: [[0, 40], [4600, 44], [8999, 48]],
  prazosDesc: [['À vista', 17], ['30 DD', 18], ['30/45/60/75 DD', 15], ['40/45/60/90 DD', 10], ['30/60/90/120 DD', 10]],
  bf: { pct: 7, codes: ['SLAPB10','SLAPB11','SLAPB12','SLPAB13','SLATB09','SLATB10','SLATB11','SLATB12','GFP3','GFP4'] } };
function solezTab(it, cheia){ var a = acharItem('solez', it.cod), o = a && a.it.o && a.it.o.tab; if (!o) return null; var bf = REGRAS.solez.bf.codes.indexOf(it.cod) > -1; return cheia || !bf ? r2(o) : r2(o * (1 - REGRAS.solez.bf.pct/100)); }
function solezBF(cod){ return REGRAS.solez.bf.codes.indexOf(cod) > -1; }
function solezNums(p){
  var r = REGRAS.solez, bruto = r2(p.itens.reduce(function(s2, it){ var t = solezTab(it); return s2 + (t != null ? t * it.qty : 0); }, 0));
  var base = r.faixas[0][1]; r.faixas.forEach(function(f){ if (bruto > f[0]) base = f[1]; });
  var pz = r.prazosDesc.find(function(x){ return x[0] === p.prazo; }), term = pz ? pz[1] : 0;
  var prox = r.faixas.find(function(f){ return bruto <= f[0]; });
  return { bruto: bruto, base: base, term: term, prox: prox, falta: prox ? r2(prox[0] - bruto + 0.01) : 0 };
}
/* recalcula o preço de cada item Solez conforme o valor do pedido e o prazo */
function aplicarSolez(p){
  if (p.grupo !== 'solez') return false;
  var n = solezNums(p);
  p.itens.forEach(function(it){ var t = solezTab(it); if (t != null) it.unit = r2(t * (1 - n.base/100) * (1 - n.term/100)); });
  p.desc_solez = { base: n.base, term: n.term };
  return true;
}
/* Ronsani: desconto progressivo (igual ao Pedido Express Ronsani) + regras de prazo */
REGRAS.ronsani = { progressivo: [[3000, 4], [6000, 6], [9000, 8]], minimo: 1000, minDup: 700,
  avistas: [ { nome: 'À vista antecipado PIX (3% de desconto)', desc: 3 } ],
  prazos: [ { p: '30 dd' }, { p: '30/45' }, { p: '30/60' }, { p: '30/45/60' }, { p: '30/60/90' }, { p: '30/45/60/75/90' },
    { p: '30/60/90/120', acima: 7000, aut: true }, { p: '30/45/60/75/90/105/120', acima: 7000, aut: true } ],
  taxa: { abaixo: 3500, valor: 130, cod: 'REDESPACHO', desc: 'Taxa de redespacho até SP capital (pedido líquido abaixo de R$ 3.500,00)' },
  texto: 'pedido mínimo R$ 1.000 · pedido líquido abaixo de R$ 3.500: redespacho R$ 130 até SP capital · boleto mínimo R$ 700 · prazo máximo 90 dias · à vista antecipado PIX 3% · acima de R$ 7 mil 30/60/90/120 ou 30/45/60/75/90/105/120 mediante autorização · desconto progressivo acima de R$ 3.000 4%, R$ 6.000 6%, R$ 9.000 8% (itens em promoção não entram)' };
function catTab(gid, it){ var a = acharItem(gid, it.cod); return a && a.it.p ? { tab: a.it.p.tab, promo: !!(a.it.tag && /promo/i.test(a.it.tag)) } : null; }
function progNums(p){
  var r = REGRAS[p.grupo], g = 0, sem = 0;
  p.itens.forEach(function(it){ if (it.taxa) return; var c = catTab(p.grupo, it); var t = c && c.tab != null ? c.tab : (it.base != null ? it.base : it.unit); g += t * it.qty; });
  g = r2(g); var pct = 0; r.progressivo.forEach(function(f){ if (g > f[0]) pct = f[1]; });
  p.itens.forEach(function(it){ if (it.taxa) return; var c = catTab(p.grupo, it); var t = c && c.tab != null ? c.tab : (it.base != null ? it.base : it.unit); sem += r2(t * (c && c.promo ? 1 : (1 - pct/100))) * it.qty; });
  var prox = r.progressivo.find(function(f){ return g <= f[0]; });
  return { bruto: g, pct: pct, final: r2(sem), prox: prox, falta: prox ? r2(prox[0] - g + 0.01) : 0 };
}
/* recalcula os preços com o desconto progressivo e o à vista (Ronsani) */
function aplicarProg(p){
  var r = REGRAS[p.grupo]; if (!r || !r.progressivo) return false;
  var n = progNums(p), a = avistaDe(p), av = a ? a.desc : 0;
  p.itens.forEach(function(it){ var c = catTab(p.grupo, it); if (!c || c.tab == null) return; var u = c.promo ? c.tab : c.tab * (1 - n.pct/100); it.unit = r2(r2(u) * (1 - av/100)); delete it.base; });
  p.desc_prog = { pct: n.pct, av: av }; delete p.desc_avista;
  aplicarTaxa(p);
  return true;
}
/* taxa de redespacho: entra como linha do pedido quando o líquido fica abaixo do valor (Ronsani) */
function aplicarTaxa(p){
  var r = REGRAS[p.grupo], tx = r && r.taxa; if (!tx) return;
  var merc = p.itens.filter(function(it){ return !it.taxa; }), liq = r2(merc.reduce(function(s2, it){ return s2 + r2(it.qty * it.unit); }, 0));
  var temTaxa = p.itens.some(function(it){ return it.taxa; });
  if (merc.length && liq < tx.abaixo){ if (!temTaxa) p.itens.push({ cod: tx.cod, desc: tx.desc, qty: 1, unit: tx.valor, label: '', marca: '', taxa: true }); }
  else if (temTaxa) p.itens = p.itens.filter(function(it){ return !it.taxa; });
}
function aplicarPreco(p){ return aplicarSolez(p) || aplicarProg(p); }
function regraDe(gid){ return REGRAS[gid] || null; }
function nParcelas(pz){ return String(pz).split('/').length; }
/* devolve '' se o prazo vale para esse total, ou o motivo se não vale */
function prazoMotivo(r, op, tot, totDup){
  if (op.acima && tot <= op.acima) return 'só acima de ' + fmt(op.acima);
  var n = nParcelas(op.p), td = totDup != null ? totDup : tot; if (r.minDup && td / n < r.minDup) return (r.progressivo ? 'boleto' : 'duplicata') + ' abaixo de ' + fmt(r.minDup);
  return '';
}
function avistaDe(p){ var r = regraDe(p.grupo); return (r && r.avistas || []).find(function(a){ return a.nome === p.prazo; }) || null; }
function eAvista(p){ return !!avistaDe(p); }
/* total sem o desconto à vista (base para pedido mínimo e duplicata) */
function totBruto(p){ return r2(p.itens.reduce(function(s, i){ return s + r2(i.qty * (i.base != null ? i.base : i.unit)); }, 0)); }
/* aplica ou tira o desconto à vista no preço de cada item (guarda o preço sem desconto em it.base) */
function aplicarAvista(p){
  var rr = regraDe(p.grupo); if (rr && rr.progressivo) return;
  var a = avistaDe(p), d = a ? a.desc : 0;
  p.itens.forEach(function(it){
    if (d){ if (it.base == null) it.base = it.unit; it.unit = r2(it.base * (1 - d/100)); }
    else if (it.base != null){ it.unit = it.base; delete it.base; }
  });
  if (d) p.desc_avista = d; else delete p.desc_avista;
}
/* avisos das regras: [] quando está tudo certo */
function avisosRegra(p){
  var r = regraDe(p.grupo); if (!r) return [];
  if (r.solez) return p.prazo && r.prazosDesc.some(function(x){ return x[0] === p.prazo; }) ? [] : ['Escolha o prazo de pagamento para aplicar o desconto de prazo.'];
  var pn = r.progressivo ? progNums(p) : null, tot = pn ? pn.bruto : totBruto(p), totD = pn ? pn.final : tot, av = [];
  if (r.minimo && tot < r.minimo) av.push('Pedido mínimo ' + fmt(r.minimo) + ' (faltam ' + fmt(r2(r.minimo - tot)) + ').');
  if (!p.prazo) av.push('Escolha o prazo de pagamento.');
  else if (!eAvista(p)){ var op = r.prazos.find(function(x){ return x.p === p.prazo; }); var mo = op ? prazoMotivo(r, op, tot, totD) : 'prazo fora da política'; if (mo) av.push('Prazo ' + p.prazo + ' não vale para ' + fmt(totD) + ': ' + mo + '.'); else if (op.aut) av.push('Prazo ' + p.prazo + ' só mediante autorização da Ronsani.'); }
  return av;
}
function confereRegra(p, acao){ var av = avisosRegra(p); return !av.length || confirm(av.join('\n') + '\n\n' + acao + ' mesmo assim?'); }
function prazoCampo(p, travado){
  var r = regraDe(p.grupo);
  if (!r) return '<input class="in" id="ePrazo" list="prazosL" value="' + esc(p.prazo) + '"><datalist id="prazosL">' + PRAZOS.map(function(x){ return '<option value="' + x + '">'; }).join('') + '</datalist>';
  if (r.solez){
    var os = '<option value="">Selecione o prazo (aplica o desconto de prazo)</option>', achou = false;
    r.prazosDesc.forEach(function(x){ if (p.prazo === x[0]) achou = true; os += '<option value="' + esc(x[0]) + '"' + (p.prazo === x[0] ? ' selected' : '') + '>' + esc(x[0]) + ' — desconto de prazo ' + x[1] + '%</option>'; });
    if (p.prazo && !achou) os = '<option value="' + esc(p.prazo) + '" selected>' + esc(p.prazo) + ' (enviado pelo cliente)</option>' + os;
    return '<select class="in" id="ePrazo"' + (travado ? ' disabled' : '') + '>' + os + '</select>';
  }
  var pn = r.progressivo ? progNums(p) : null, tot = pn ? pn.bruto : totBruto(p), totD = pn ? pn.final : tot, conhecidos = (r.avistas || []).map(function(a){ return a.nome; }).concat(r.prazos.map(function(x){ return x.p; }));
  var o = '<option value="">Selecione</option>';
  if (p.prazo && conhecidos.indexOf(p.prazo) < 0) o += '<option value="' + esc(p.prazo) + '" selected>' + esc(p.prazo) + ' (enviado pelo cliente)</option>';
  (r.avistas || []).forEach(function(a){ o += '<option value="' + esc(a.nome) + '"' + (p.prazo === a.nome ? ' selected' : '') + '>' + esc(a.nome) + '</option>'; });
  r.prazos.forEach(function(x){ var mo = prazoMotivo(r, x, tot, totD); o += '<option value="' + esc(x.p) + '"' + (p.prazo === x.p ? ' selected' : '') + (mo && p.prazo !== x.p ? ' disabled' : '') + '>' + esc(x.p) + (mo ? ' — ' + mo : x.aut ? ' — mediante autorização' : '') + '</option>'; });
  return '<select class="in" id="ePrazo"' + (travado ? ' disabled' : '') + '>' + o + '</select>';
}
function regraBox(p){
  var r = regraDe(p.grupo); if (!r) return '';
  if (r.solez){
    var n = solezNums(p), av2 = avisosRegra(p);
    return '<div class="regra"><div class="rl"><span>Desc. valor de pedido ' + n.base + '%' + (n.term ? ' + desc. prazo ' + n.term + '%' : '') + '</span><span>bruto em tabela ' + fmt(n.bruto) + '</span></div>' +
      (n.prox ? '<div class="ri" style="color:#b42318;font-weight:700">Faltam ' + fmt(n.falta) + ' (em tabela) para o desconto de ' + n.prox[1] + '%</div>' : '') +
      av2.map(function(a){ return '<div class="rw">⚠ ' + esc(a) + '</div>'; }).join('') +
      '<div class="ri">Política Solez: 40% sobre a tabela; pedido bruto acima de ' + fmt(4600) + ': 44%; acima de ' + fmt(8999) + ': 48%; depois o desconto do prazo (À vista 17%, 30 DD 18%, 30/45/60/75 DD 15%, 40/45/60/90 e 30/60/90/120 DD 10%). Itens Black Friday com 7% antes.</div></div>';
  }
  if (r.progressivo){
    var n = progNums(p), avr = avisosRegra(p), ap = avistaDe(p);
    return '<div class="regra"><div class="rl"><span>' + (n.pct ? '✓ Desconto progressivo ' + n.pct + '% aplicado (exceto promoções)' : 'Sem desconto progressivo ainda') + (ap ? ' + à vista ' + ap.desc + '%' : '') + '</span><span>pedido em tabela ' + fmt(n.bruto) + '</span></div>' +
      (n.prox ? '<div class="ri" style="color:#b42318;font-weight:700">Faltam ' + fmt(n.falta) + ' (em tabela) para ' + n.prox[1] + '% de desconto</div>' : '') +
      avr.map(function(x){ return '<div class="rw">⚠ ' + esc(x) + '</div>'; }).join('') +
      '<div class="ri">Política ' + esc(grupo(p.grupo) ? grupo(p.grupo).nome : '') + ': ' + esc(r.texto) + '.</div></div>';
  }
  var a = avistaDe(p), eco = a ? r2(totBruto(p) - totalItens(p.itens)) : 0, av = avisosRegra(p);
  return '<div class="regra">' + (a ? '<div class="rl"><span>✓ Desconto à vista ' + a.desc + '% já aplicado nos itens (sem ele: ' + fmt(totBruto(p)) + ')</span><span>− ' + fmt(eco) + '</span></div>' : '') +
    (av.length ? av.map(function(a){ return '<div class="rw">⚠ ' + esc(a) + '</div>'; }).join('') : '') +
    '<div class="ri">Política ' + esc(grupo(p.grupo) ? grupo(p.grupo).nome : '') + ': pedido mínimo ' + fmt(r.minimo) + (r.avistas ? ' · à vista (PIX ou 15 dd) ' + r.avistas[0].desc + '% de desconto' : '') + ' · duplicata mínima ' + fmt(r.minDup) + ' · prazos até 105/120 dias só acima de ' + fmt(5000) + '</div></div>';
}
/* parcelas do prazo escolhido (ex.: 30/60/90 → 3 parcelas iguais; centavos na última) */
function parcelasDe(p){
  if (!p.prazo || eAvista(p) || !/^\s*\d+(\s*\/\s*\d+)*\s*(dd|d|dias?)?\s*$/i.test(p.prazo)) return [];
  var dias = p.prazo.match(/\d+/g).map(Number), tot = totalItens(p.itens), n = dias.length;
  if (!tot) return [];
  var v = Math.floor(tot / n * 100) / 100, ult = r2(tot - v * (n - 1));
  return dias.map(function(d, i){ return { n: i + 1, dias: d, valor: i === n - 1 ? ult : v }; });
}
function parcelasBox(p){
  var ps = parcelasDe(p); if (!ps.length) return '';
  return '<div class="parc"><div class="pt">Parcelas — ' + esc(p.prazo) + '</div><div class="pg">' + ps.map(function(x){ return '<div><span>' + x.n + 'ª parcela · ' + x.dias + ' dias</span><b>' + fmt(x.valor) + '</b></div>'; }).join('') + '</div></div>';
}
function atualizaRegra(){
  if (!ED) return; var el = document.getElementById('eRegra'); if (el) el.innerHTML = regraBox(ED.p);
  var ep = document.getElementById('eParc'); if (ep) ep.innerHTML = parcelasBox(ED.p);
  var pz = document.getElementById('ePrazo'); if (pz && pz.tagName === 'SELECT'){ var tmp = document.createElement('div'); tmp.innerHTML = prazoCampo(ED.p, pz.disabled); pz.innerHTML = tmp.firstChild.innerHTML; }
}
var PRAZOS = ['À vista','28 dias','30/60','30/60/90','28/56/84','30/45/60','30/45/60/75','15/30/45/60/75','30/45/60/75/90','15/30/45/60/75/90'];

function fmt(v){ return 'R$ ' + (Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function r2(v){ return Math.round((Number(v)||0)*100)/100; }
function uuid(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16); crypto.getRandomValues(b); b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128;
  var h = Array.from(b, function(x){ return ('0'+x.toString(16)).slice(-2); }).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
function p2(n){ return String(n).padStart(2,'0'); }
function dataBR(iso){ if(!iso) return ''; var d = new Date(iso); return p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(2)+' '+p2(d.getHours())+':'+p2(d.getMinutes()); }
function soNum(s){ return String(s||'').replace(/\D/g,''); }
function toast(msg, ms){
  var t = document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, ms||2600);
}
function lsGet(k, d){ try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

/* ---------- IndexedDB (dados offline) ---------- */
var dbp = null;
function db(){
  if (!dbp) dbp = new Promise(function(res, rej){
    var r = indexedDB.open('company-vendas', 1);
    r.onupgradeneeded = function(){ r.result.createObjectStore('kv'); };
    r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); };
  });
  return dbp;
}
function kvGet(k){ return db().then(function(d){ return new Promise(function(res){ var q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess=function(){ res(q.result); }; q.onerror=function(){ res(undefined); }; }); }).catch(function(){ return undefined; }); }
function kvSet(k, v){ return db().then(function(d){ return new Promise(function(res){ var t = d.transaction('kv','readwrite'); t.objectStore('kv').put(v, k); t.oncomplete=function(){ res(); }; t.onerror=function(){ res(); }; }); }).catch(function(){}); }

/* ---------- estado ---------- */
var S = {
  sess: lsGet('cv_sess', null), perfil: lsGet('cv_perfil', null),
  pedidos: {}, clientes: [], fila: [], cfila: [], cat: null, catGerado: '', online: navigator.onLine,
  syncing: false, lastSync: lsGet('cv_lastsync', null), syncErr: '', filtro: { st:'', org:'', vend:'', q:'' }
};
function salvarLocal(){ return Promise.all([kvSet('pedidos', S.pedidos), kvSet('clientes', S.clientes), kvSet('fila', S.fila), kvSet('cfila', S.cfila)]); }
function pendentes(id){ return S.fila.some(function(op){ return op.id === id; }); }

/* ---------- API Supabase ---------- */
function headers(auth){
  var h = { 'apikey': CFG.key, 'Content-Type': 'application/json' };
  if (auth && S.sess) h['Authorization'] = 'Bearer ' + S.sess.access_token;
  return h;
}
function guardarSessao(j){
  S.sess = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in||3600)*1000 - 60000, user: { id: j.user.id, email: j.user.email } };
  lsSet('cv_sess', S.sess);
}
function login(email, senha){
  return fetch(CFG.url + '/auth/v1/token?grant_type=password', { method:'POST', headers: headers(false), body: JSON.stringify({ email: email, password: senha }) })
    .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw new Error(j.error_description || j.msg || 'Falha no login'); guardarSessao(j); }); });
}
function renovar(){
  if (!S.sess) return Promise.reject(new Error('sem sessão'));
  return fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token', { method:'POST', headers: headers(false), body: JSON.stringify({ refresh_token: S.sess.refresh_token }) })
    .then(function(r){ return r.json().then(function(j){ if (!r.ok) { var e = new Error('Sessão expirada, entre de novo'); e.auth = true; throw e; } guardarSessao(j); }); });
}
function api(path, opt){
  opt = opt || {};
  var go = function(){
    var h = headers(true); if (opt.prefer) h['Prefer'] = opt.prefer;
    return fetch(CFG.url + '/rest/v1/' + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined });
  };
  var pre = (S.sess && Date.now() > S.sess.expires_at) ? renovar() : Promise.resolve();
  return pre.then(go).then(function(r){
    if (r.status === 401) return renovar().then(go);
    return r;
  }).then(function(r){
    if (!r.ok) return r.text().then(function(t){ var e = new Error(t || ('Erro ' + r.status)); e.status = r.status; throw e; });
    if (r.status === 204 || String(opt.prefer||'').indexOf('return=minimal') > -1) return null;
    return r.json();
  });
}

/* ---------- catálogo ---------- */
function carregarCatalogo(){
  return fetch('catalogo.json', { cache: 'no-cache' }).then(function(r){ return r.json(); }).then(function(c){ S.cat = c; kvSet('catalogo', c); })
    .catch(function(){ return kvGet('catalogo').then(function(c){ if (c) S.cat = c; }); });
}
function grupo(gid){ return S.cat && S.cat.grupos.find(function(g){ return g.id === gid; }); }
function politicaNome(gid, pid){ var g = grupo(gid); var p = g && g.politicas.find(function(x){ return x.id === pid || x.nome === pid; }); return p ? p.nome : pid; }
function politicaId(gid, nome){ var g = grupo(gid); var p = g && g.politicas.find(function(x){ return x.id === nome || x.nome === nome; }); return p ? p.id : null; }
function acharItem(gid, cod){
  var g = grupo(gid); if (!g) return null;
  for (var i=0;i<g.marcas.length;i++){ var it = g.marcas[i].itens.find(function(x){ return x.cod === cod; }); if (it) return { it: it, marca: g.marcas[i] }; }
  return null;
}
/* preço de tabela + desconto aplicado (ex.: 12+10+10%) */
var CADEIAS = { dylan: [[12,10,10],[12,10,15],[12,10,20],[12,10],[12]], avs: [[10,5]] };
function numBR(x){ return String(Math.round(x*10)/10).replace('.', ','); }
function precoInfo(p, it){
  if (it.base != null && p.desc_avista){
    var pb = precoInfo(p, { cod: it.cod, unit: it.base, label: it.label }), extra = p.desc_avista + '% à vista';
    if (!pb.tab) return { tab: r2(it.base), desc: extra };
    return { tab: pb.tab, desc: pb.desc === 'sem desconto' ? extra : pb.desc + ' + ' + extra };
  }
  if (p.grupo === 'solez' && p.desc_solez && solezTab(it, true) != null){
    var tcheia = solezTab(it, true), tbf = solezTab(it), ds = p.desc_solez, esp = r2(tbf * (1 - ds.base/100) * (1 - ds.term/100));
    if (Math.abs(esp - r2(it.unit)) < 0.011) return { tab: tcheia, desc: (solezBF(it.cod) ? '7% BF + ' : '') + ds.base + '%' + (ds.term ? ' + ' + ds.term + '%' : '') };
  }
  if (p.desc_prog && regraDe(p.grupo) && regraDe(p.grupo).progressivo){
    var cp = catTab(p.grupo, it);
    if (cp && cp.tab != null){ var dpp = p.desc_prog, esp2 = r2(r2(cp.promo ? cp.tab : cp.tab * (1 - dpp.pct/100)) * (1 - dpp.av/100));
      if (Math.abs(esp2 - r2(it.unit)) < 0.011){ var parts = []; if (cp.promo) parts.push('Promoção'); else if (dpp.pct) parts.push(dpp.pct + '%'); if (dpp.av) parts.push(dpp.av + '% à vista'); return { tab: r2(cp.tab), desc: parts.length ? parts.join(' + ') : 'sem desconto' }; } }
  }
  var a = acharItem(p.grupo, it.cod), pid = politicaId(p.grupo, p.politica), unit = r2(it.unit), tab = null, d = 0;
  if (a && pid){
    var o = a.it.o && a.it.o[pid], cp = a.it.p[pid];
    if (p.grupo === 'equipo'){ d = /^18/.test(pid) ? 18 : 15; var base = o || cp; if (base != null) tab = base / (1 - d/100); }
    else if (o) tab = o;
  }
  if (!tab || !(unit >= 0)) return { tab: null, desc: '' };
  tab = r2(tab);
  var ratio = unit / tab, desc = '';
  if (Math.abs(ratio - 1) < 0.0006) desc = 'sem desconto';
  else if (p.grupo === 'equipo'){
    var extra = (1 - ratio / (1 - d/100)) * 100;
    desc = Math.abs(extra) < 0.3 ? d + '%' : extra > 0 ? d + '+' + numBR(extra) + '%' : numBR((1 - ratio)*100) + '%';
  } else {
    var ch = (CADEIAS[p.grupo] || []).find(function(c){ return Math.abs(c.reduce(function(m, x){ return m * (1 - x/100); }, 1) - ratio) < 0.0015; });
    desc = ch ? ch.join('+') + '%' : numBR((1 - ratio)*100) + '%';
  }
  if (a && a.it.tag === 'Oferta' && desc.indexOf('+') < 0) desc = 'Oferta ' + desc;
  return { tab: tab, desc: desc };
}
/* preço de tabela (cheio) de um item do catálogo na política escolhida */
var FATOR_TAB = { michael: 0.645 }; // 14% + 25%
function tabelaDe(gid, pid, it){
  var pr = it.p && it.p[pid], o = it.o && it.o[pid];
  if (gid === 'equipo'){ var d = /^18/.test(pid) ? 18 : 15, b = o || pr; return b != null ? r2(b / (1 - d/100)) : null; }
  if (o) return r2(o);
  if (pr != null && FATOR_TAB[gid] && !(it.tag && /promo|oferta/i.test(it.tag))) return r2(pr / FATOR_TAB[gid]);
  return pr != null ? r2(pr) : null;
}
function precoComTabela(gid, pid, it){
  var pr = it.p && it.p[pid], tab = tabelaDe(gid, pid, it);
  if (pr == null) return '<span class="muted">Sob consulta</span>';
  var d = tab && tab > pr + 0.004 ? Math.round((1 - pr/tab) * 1000)/10 : 0;
  return fmt(pr) + (d > 0 ? ' <s title="Preço de tabela">' + fmt(tab) + '</s> <em>−' + String(d).replace('.', ',') + '%</em>' : ' <small class="pt-tab">preço de tabela</small>');
}
function imgDe(gid, cod){ var a = acharItem(gid, cod); return a && a.it.img ? a.it.img : 'company.png'; }

/* ---------- sincronização ---------- */
function sincronizar(manual){
  if (S.syncing || !S.sess) return Promise.resolve();
  if (!navigator.onLine){ if (manual) toast('Sem internet. Os pedidos ficam guardados e sobem quando a conexão voltar.'); return Promise.resolve(); }
  S.syncing = true; S.syncErr = ''; topo();
  var chain = Promise.resolve();
  S.cfila.slice().forEach(function(cid){
    chain = chain.then(function(){ return enviarCliente(cid); }).then(function(){
      S.cfila = S.cfila.filter(function(x){ return x !== cid; }); return kvSet('cfila', S.cfila);
    }, function(e){
      if (e && e.auth) throw e;
      var c = S.clientes.find(function(x){ return x.id === cid; }); if (c) c._erro = traduzErroCli(e);
      S.syncErr = 'Um cliente não subiu: ' + traduzErroCli(e);
    });
  });
  S.fila.slice().forEach(function(op){
    chain = chain.then(function(){ return enviarOp(op); }).then(function(){
      S.fila = S.fila.filter(function(o){ return o !== op; }); return kvSet('fila', S.fila);
    }, function(e){
      if (e && e.auth) throw e;
      op.erro = String(e && e.message || e).slice(0, 300); S.syncErr = 'Um pedido não subiu: ' + op.erro;
    });
  });
  return chain.then(function(){
    return Promise.all([
      api('pedidos?select=*&order=criado_em.desc&limit=1000'),
      api('clientes?select=*&order=nome.asc&limit=5000'),
      S.perfil ? null : carregarPerfil(),
      api('emails_enviados?select=*&order=enviado_em.desc&limit=2000').then(function(r){ S.emailsErr = ''; S.emails = r || []; kvSet('emails', S.emails); }, function(e){ if (e && e.auth) throw e; S.emailsErr = /42P01|PGRST205|does not exist/.test(String(e.message)) ? 'tabela' : String(e.message).slice(0,160); }),
      api('transportadoras?select=*&order=nome.asc&limit=5000').then(function(r){ S.trErr = ''; S.transps = r || []; kvSet('transportadoras', S.transps); }, function(e){ if (e && e.auth) throw e; S.trErr = /42P01|PGRST205|does not exist/.test(String(e.message)) ? 'tabela' : String(e.message).slice(0,160); }),
      api('representadas?select=*&order=nome.asc').then(function(r){ S.repErr = ''; return r; }, function(e){ if (e && e.auth) throw e; S.repErr = /42P01|PGRST205|does not exist/.test(String(e.message)) ? 'O banco ainda não tem a tabela de representadas (falta rodar a atualização do banco).' : ''; return null; })
    ]);
  }).then(function(res){
    var novos = {};
    (res[0]||[]).forEach(function(p){ novos[p.id] = pendentes(p.id) && S.pedidos[p.id] ? S.pedidos[p.id] : p; });
    S.fila.forEach(function(op){ if (S.pedidos[op.id]) novos[op.id] = S.pedidos[op.id]; });
    S.pedidos = novos;
    var cl = res[1] || [];
    S.cfila.forEach(function(cid){ var loc = S.clientes.find(function(x){ return x.id === cid; }); if (loc){ cl = cl.filter(function(x){ return x.id !== cid; }); cl.push(loc); } });
    S.clientes = cl;
    if (res[5]){ S.reps = res[5]; kvSet('representadas', S.reps); }
    S.lastSync = new Date().toISOString(); lsSet('cv_lastsync', S.lastSync);
    return salvarLocal();
  }).catch(function(e){
    S.syncErr = (e && e.auth) ? e.message : 'Não foi possível sincronizar agora (' + String(e && e.message || e).slice(0,120) + ')';
    if (e && e.auth){ S.sess = null; lsSet('cv_sess', null); }
  }).then(function(){ S.syncing = false; if (emFormulario()) topo(); else render(); });
}
/* telas de cadastro abertas (representada em edição, cliente): a sincronização não redesenha, para não perder o que foi digitado/anexado */
function emFormulario(){
  if (!S.sess || !S.perfil || S.recup) return false;
  var r = rota();
  return r.nome === 'cliente' || (r.nome === 'representada' && /\/editar$/.test(r.arg)) || (r.nome === 'transportadoras' && !!r.arg);
}
function enviarOp(op){
  var p = S.pedidos[op.id]; if (!p) return Promise.resolve();
  var campos = { itens: p.itens, total: p.total, prazo: p.prazo || null, obs: p.obs || null, status: p.status, cliente: p.cliente, politica: p.politica, marca: p.marca };
  if (op.tipo === 'inserir'){
    var row = Object.assign({ id: p.id, numero: p.numero, origem: 'app', grupo: p.grupo, link: null, vendedor_codigo: p.vendedor_codigo }, campos);
    return api('pedidos', { method:'POST', body: row, prefer:'return=minimal' }).catch(function(e){
      if (e.status === 409) return api('pedidos?id=eq.' + p.id, { method:'PATCH', body: campos, prefer:'return=minimal' });
      throw e;
    });
  }
  return api('pedidos?id=eq.' + p.id, { method:'PATCH', body: campos, prefer:'return=minimal' });
}
var CLI_CAMPOS = ['nome','fantasia','doc','ie','codigo','matriz_id','suframa','endereco','bairro','numero','cep','cidade','uf','telefone','fax','telefone2','site','email','obs','status','transportadora'];
function enviarCliente(cid){
  var c = S.clientes.find(function(x){ return x.id === cid; }); if (!c) return Promise.resolve();
  var row = { id: c.id, confirmado: true };
  CLI_CAMPOS.forEach(function(k){ row[k] = (c[k] === '' || c[k] == null) ? null : c[k]; });
  if (c._novo) row.vendedor_codigo = c.vendedor_codigo || (S.perfil && S.perfil.codigo) || null;
  return api('clientes', { method:'POST', body: row, prefer:'resolution=merge-duplicates,return=minimal' }).then(function(){ delete c._erro; delete c._novo; });
}
function traduzErroCli(e){
  var m = String(e && e.message || e);
  if (/duplicate key|23505/.test(m)) return 'já existe um cliente com este CNPJ ou código.';
  if (/column|PGRST204|42703/.test(m)) return 'o banco ainda não tem os campos novos do cadastro de clientes (falta rodar a atualização do banco).';
  if (/row-level security|42501/.test(m)) return 'o banco ainda não permite cadastrar clientes pelo app (falta rodar a atualização do banco).';
  return m.slice(0, 200);
}
function enfileirar(id, tipo){
  var ex = S.fila.find(function(o){ return o.id === id; });
  if (ex){ delete ex.erro; } else S.fila.push({ id: id, tipo: tipo, em: Date.now() });
  return salvarLocal().then(function(){ sincronizar(); });
}
function carregarPerfil(){
  return api('perfis?select=*&id=eq.' + S.sess.user.id).then(function(r){
    if (!r || !r.length) throw new Error('Seu login ainda não tem perfil no sistema (Guirra/Clara). Fale com o administrador.');
    S.perfil = r[0]; lsSet('cv_perfil', S.perfil);
  });
}
function souAdmin(){ return S.perfil && S.perfil.papel === 'admin'; }

/* ---------- topo / navegação ---------- */
function rota(){ var h = location.hash.replace(/^#\/?/, ''); var p = h.split('/'); return { nome: p[0] || 'pedidos', arg: p.slice(1).join('/') }; }
function topo(){
  var el = document.getElementById('syncPill'); if (!el) return;
  var n = S.fila.length + S.cfila.length, on = navigator.onLine;
  el.className = 'sync' + (!on ? ' off' : n ? ' pend' : '');
  el.innerHTML = '<span class="dot"></span>' + (S.syncing ? 'Sincronizando…' : !on ? 'Offline' + (n ? ' · ' + n + ' pendente' + (n>1?'s':'') : '') : n ? n + ' para enviar' : 'Online');
  el.title = S.lastSync ? 'Última sincronização: ' + dataBR(S.lastSync) : '';
}
function casca(conteudo, acoes){
  var r = rota().nome;
  var nAl = emailsAlerta().length;
  var tabs = [['pedidos','Pedidos'],['novo','Novo pedido'],['clientes','Clientes'],['produtos','Produtos'],['representadas','Representadas'],['transportadoras','Transportadoras'],['desempenho','Desempenho'],['emails','E-mails' + (nAl ? ' <span class="tab-al" title="E-mails sem leitura há mais de 2 dias">' + nAl + '</span>' : '')],['mais','Mais']];
  $app.innerHTML =
    '<header class="top"><div class="wrap"><div class="top-row"><img src="company.png" alt="Company">' +
      '<div class="top-title">Company Vendas<small>' + esc(S.perfil ? S.perfil.nome : '') + (souAdmin() ? ' · administrador' : '') + '</small></div>' +
      '<button class="sync" id="syncPill" type="button"></button></div>' +
      '<nav class="tabs">' + tabs.map(function(t){ return '<a href="#' + t[0] + '" class="' + (r === t[0] || (r==='pedido' && t[0]==='pedidos') || (r==='cliente' && t[0]==='clientes') || (r==='representada' && t[0]==='representadas') ? 'on' : '') + '">' + t[1] + '</a>'; }).join('') + '</nav>' +
    '</div></header><main><div class="wrap">' +
    (S.syncErr ? '<div class="note bad">' + esc(S.syncErr) + '</div>' : '') +
    conteudo + '</div></main>' + (acoes ? '<div class="actions"><div class="wrap">' + acoes + '</div></div>' : '');
  document.getElementById('syncPill').onclick = function(){ sincronizar(true); };
  topo();
}

/* ---------- telas ---------- */
function telaLogin(msg){
  $app.innerHTML = '<div class="wrap"><div class="login card pad"><img src="company.png" alt="Company Representações">' +
    '<h1 style="text-align:center">Company Vendas</h1>' +
    (msg ? '<div class="note bad">' + esc(msg) + '</div>' : '') +
    '<form id="fLogin"><label class="lb">E-mail</label><input class="in" type="email" id="lEmail" autocomplete="username" required>' +
    '<label class="lb">Senha</label><span class="pwd"><input class="in" type="password" id="lSenha" autocomplete="current-password" required><button type="button" class="olho" tabindex="-1" aria-label="Segure para ver a senha" title="Segure para ver a senha"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></span>' +
    '<button class="btn pri" style="width:100%;margin-top:14px" id="lBtn">Entrar</button></form>' +
    '<div style="text-align:center;margin-top:12px"><a href="#" id="lEsqueci" style="color:#b07a12;font-weight:700;font-size:14px">Esqueci minha senha</a></div>' +
    '<p class="muted" style="font-size:12.5px;text-align:center;margin-top:14px">O primeiro acesso precisa de internet. Depois o app funciona offline.</p></div></div>';
  document.getElementById('lEsqueci').onclick = function(ev){ ev.preventDefault(); telaEsqueci(document.getElementById('lEmail').value.trim()); };
  document.getElementById('fLogin').onsubmit = function(ev){
    ev.preventDefault();
    var b = document.getElementById('lBtn'); b.disabled = true; b.textContent = 'Entrando…';
    login(document.getElementById('lEmail').value.trim(), document.getElementById('lSenha').value)
      .then(carregarPerfil).then(function(){ location.hash = '#pedidos'; return sincronizar(); })
      .catch(function(e){ S.sess = null; lsSet('cv_sess', null); telaLogin(e.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : e.message); });
  };
}

/* ---------- recuperação de senha (Supabase: e-mail com link → nova senha) ---------- */
var URL_APP = location.origin + location.pathname;
function cartaoLogin(inner){ $app.innerHTML = '<div class="wrap"><div class="login card pad"><img src="company.png" alt="Company Representações">' + inner + '</div></div>'; }
function telaEsqueci(email, msg, ok){
  cartaoLogin('<h1 style="text-align:center">Recuperar senha</h1>' +
    (msg ? '<div class="note ' + (ok ? 'ok' : 'bad') + '"' + (ok ? ' style="background:#e8f6ec;border-color:#2e9e5b;color:#1d6b3c"' : '') + '>' + esc(msg) + '</div>' : '') +
    (ok ? '' : '<p class="muted" style="font-size:13.5px">Digite o e-mail do seu login. Vamos enviar um link para você criar uma senha nova.</p>' +
      '<form id="fEsq"><label class="lb">E-mail</label><input class="in" type="email" id="eEmail" autocomplete="username" required value="' + esc(email || '') + '">' +
      '<button class="btn pri" style="width:100%;margin-top:14px" id="eBtn">Enviar link de recuperação</button></form>') +
    '<div style="text-align:center;margin-top:14px"><a href="#" id="eVolta" style="color:#b07a12;font-weight:700;font-size:14px">← Voltar para o login</a></div>');
  document.getElementById('eVolta').onclick = function(ev){ ev.preventDefault(); telaLogin(); };
  var f = document.getElementById('fEsq'); if (!f) return;
  f.onsubmit = function(ev){
    ev.preventDefault();
    var em = document.getElementById('eEmail').value.trim(), b = document.getElementById('eBtn');
    if (!navigator.onLine){ telaEsqueci(em, 'Sem internet. Conecte-se para recuperar a senha.'); return; }
    b.disabled = true; b.textContent = 'Enviando…';
    fetch(CFG.url + '/auth/v1/recover?redirect_to=' + encodeURIComponent(URL_APP), { method:'POST', headers: headers(false), body: JSON.stringify({ email: em }) })
      .then(function(r){ if (r.ok) return; return r.json().catch(function(){ return {}; }).then(function(j){ throw new Error(j.msg || j.error_description || j.message || ('Erro ' + r.status)); }); })
      .then(function(){ telaEsqueci(em, 'Pronto! Se este e-mail tiver login no sistema, você vai receber em instantes um e-mail com o link "Reset Password". Abra o e-mail neste aparelho, toque no link e crie a senha nova. Confira também a caixa de spam.', true); },
        function(e){ var m = String(e.message || e);
          telaEsqueci(em, /rate|limit|seconds|429/i.test(m) ? 'Muitos pedidos de recuperação seguidos. Aguarde alguns minutos e tente de novo.' : 'Não foi possível enviar: ' + m.slice(0, 150)); });
  };
}
function telaNovaSenha(msg){
  cartaoLogin('<h1 style="text-align:center">Criar senha nova</h1>' +
    (msg ? '<div class="note bad">' + esc(msg) + '</div>' : '') +
    (S.recup.email ? '<p class="muted" style="text-align:center;font-size:13.5px">' + esc(S.recup.email) + '</p>' : '') +
    '<form id="fNova"><label class="lb">Nova senha</label><span class="pwd"><input class="in" type="password" id="nS1" autocomplete="new-password" minlength="6" required><button type="button" class="olho" tabindex="-1" aria-label="Segure para ver a senha" title="Segure para ver a senha"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></span>' +
    '<label class="lb">Repita a nova senha</label><span class="pwd"><input class="in" type="password" id="nS2" autocomplete="new-password" minlength="6" required><button type="button" class="olho" tabindex="-1" aria-label="Segure para ver a senha" title="Segure para ver a senha"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></span>' +
    '<p class="muted" style="font-size:12.5px">Mínimo de 6 caracteres.</p>' +
    '<button class="btn pri" style="width:100%;margin-top:8px" id="nBtn">Salvar senha nova e entrar</button></form>' +
    '<div style="text-align:center;margin-top:14px"><a href="#" id="nVolta" style="color:#b07a12;font-weight:700;font-size:14px">Cancelar</a></div>');
  document.getElementById('nVolta').onclick = function(ev){ ev.preventDefault(); S.recup = null; telaLogin(); };
  document.getElementById('fNova').onsubmit = function(ev){
    ev.preventDefault();
    var s1 = document.getElementById('nS1').value, s2 = document.getElementById('nS2').value, b = document.getElementById('nBtn');
    if (s1.length < 6){ telaNovaSenha('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (s1 !== s2){ telaNovaSenha('As duas senhas não são iguais. Digite de novo.'); return; }
    b.disabled = true; b.textContent = 'Salvando…';
    var rc = S.recup;
    fetch(CFG.url + '/auth/v1/user', { method:'PUT', headers: { 'apikey': CFG.key, 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + rc.access_token }, body: JSON.stringify({ password: s1 }) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok) throw new Error(j.msg || j.error_description || j.message || ('Erro ' + r.status)); return j; }); })
      .then(function(u){
        S.recup = null;
        guardarSessao({ access_token: rc.access_token, refresh_token: rc.refresh_token, expires_in: rc.expires_in, user: { id: u.id, email: u.email } });
        S.perfil = null; toast('Senha alterada com sucesso!', 4000);
        return carregarPerfil().then(function(){ location.hash = '#pedidos'; render(); return sincronizar(); });
      })
      .catch(function(e){ var m = String(e.message || e);
        if (/expired|invalid|jwt|401|403/i.test(m)){ S.recup = null; telaEsqueci('', 'O link de recuperação expirou. Peça um novo link abaixo.'); return; }
        if (/same|different from the old/i.test(m)){ telaNovaSenha('A senha nova precisa ser diferente da senha antiga.'); return; }
        if (/weak|short|characters/i.test(m)){ telaNovaSenha('Senha fraca: use pelo menos 6 caracteres, misturando letras e números.'); return; }
        telaNovaSenha('Não foi possível salvar: ' + m.slice(0, 150)); });
  };
}
/* volta do link do e-mail: #access_token=…&type=recovery (ou #error=…) */
(function(){
  var h = location.hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error)=/.test(h)) return;
  var q = {}; h.split('&').forEach(function(kv){ var i = kv.indexOf('='); if (i > 0) q[decodeURIComponent(kv.slice(0,i))] = decodeURIComponent(kv.slice(i+1).replace(/\+/g,' ')); });
  history.replaceState(null, '', location.pathname + location.search);
  if (q.type === 'recovery' && q.access_token){
    var em = ''; try { em = JSON.parse(atob(q.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).email || ''; } catch(e){}
    S.recup = { access_token: q.access_token, refresh_token: q.refresh_token, expires_in: +q.expires_in || 3600, email: em };
  } else if (q.error){
    S.recupErr = /expired|otp/i.test((q.error_code||'') + (q.error_description||'')) ? 'O link de recuperação expirou ou já foi usado. Peça um novo link abaixo.' : 'Link de recuperação inválido: ' + (q.error_description || q.error);
  }
})();

function listaPedidos(){
  var arr = Object.keys(S.pedidos).map(function(k){ return S.pedidos[k]; });
  arr.sort(function(a,b){ return String(b.criado_em).localeCompare(String(a.criado_em)); });
  return arr;
}
function telaPedidos(){
  var f = S.filtro, todos = listaPedidos();
  if (f.st && !STATUS.some(function(x){ return x[0] === f.st; })) f.st = '';
  var q = f.q.toLowerCase();
  var lista = todos.filter(function(p){
    if (f.st && p.status !== f.st) return false;
    if (f.org && p.origem !== f.org) return false;
    if (f.vend && p.vendedor_codigo !== f.vend) return false;
    if (q){ var t = [p.numero, p.cliente && p.cliente.name, p.cliente && p.cliente.doc, p.cliente && p.cliente.city, p.marca].join(' ').toLowerCase(); if (t.indexOf(q) < 0) return false; }
    return true;
  });
  function cnt(fn){ return todos.filter(fn).length; }
  var chipsSt = [['','Todos']].concat(STATUS).map(function(s){
    return '<button class="chip" data-st="' + s[0] + '" aria-pressed="' + (f.st === s[0]) + '">' + s[1] + '</button>';
  }).join('');
  var chipsOrg = [['','Todas as origens'],['express','Pedido Express'],['app','Lançados no app']].map(function(s){
    return '<button class="chip" data-org="' + s[0] + '" aria-pressed="' + (f.org === s[0]) + '">' + s[1] + '</button>';
  }).join('') + (souAdmin() ? '</div><div class="chips">' + [['','Todos vendedores']].concat(Object.keys(CFG.vendedores).map(function(k){ return [k, CFG.vendedores[k]]; })).map(function(s){
    return '<button class="chip" data-vend="' + s[0] + '" aria-pressed="' + (f.vend === s[0]) + '">' + s[1] + '</button>';
  }).join('') : '');
  var html = '<div class="row"><h1 class="grow">Pedidos</h1><a class="btn pri" href="#novo">+ Novo pedido</a></div>' +
    '<input class="in" id="qBusca" placeholder="Buscar por cliente, CNPJ, cidade ou nº do pedido" value="' + esc(f.q) + '">' +
    '<div class="chips" style="margin-top:10px">' + chipsSt + '</div><div class="chips-row"><div class="chips">' + chipsOrg + '</div></div>' +
    '<div class="list">' + (lista.length ? lista.map(cardPedido).join('') : '<div class="card empty">' + (todos.length ? 'Nenhum pedido com esse filtro.' : (S.lastSync ? 'Nenhum pedido ainda.' : 'Sincronizando os pedidos…')) + '</div>') + '</div>';
  casca(html);
  document.getElementById('qBusca').oninput = function(){ S.filtro.q = this.value; var pos = this.selectionStart; telaPedidos(); var e = document.getElementById('qBusca'); e.focus(); e.setSelectionRange(pos,pos); };
  $app.querySelectorAll('[data-st]').forEach(function(b){ b.onclick = function(){ S.filtro.st = b.dataset.st; telaPedidos(); }; });
  $app.querySelectorAll('[data-org]').forEach(function(b){ b.onclick = function(){ S.filtro.org = b.dataset.org; telaPedidos(); }; });
  $app.querySelectorAll('[data-vend]').forEach(function(b){ b.onclick = function(){ S.filtro.vend = b.dataset.vend; telaPedidos(); }; });
}
function cardPedido(p){
  var c = p.cliente || {};
  return '<a class="card ped" href="#pedido/' + p.id + '">' +
    '<div><b>' + esc(c.name || 'Cliente sem nome') + '</b></div><div class="tot">' + fmt(p.total) + '</div>' +
    '<div class="meta">' + esc(p.numero) + ' · ' + esc(p.marca) + ' · ' + esc(politicaNome(p.grupo, p.politica)) + (c.city ? ' · ' + esc(c.city) : '') + '</div>' +
    '<div class="meta" style="text-align:right">' + dataBR(p.criado_em) + '</div>' +
    '<div class="row" style="gap:6px">' + '<span class="badge st-' + p.status + '">' + esc(STATUS_NOME[p.status] || p.status) + '</span>' +
      (p.origem === 'express' ? '<span class="badge b-express">Pedido Express</span>' : '') +
      (souAdmin() ? '<span class="badge">' + esc(CFG.vendedores[p.vendedor_codigo] || p.vendedor_codigo) + '</span>' : '') +
      (pendentes(p.id) ? '<span class="badge b-pend">⟳ aguardando envio</span>' : '') + '</div><div></div></a>';
}

/* ----- editor de pedido ----- */
var ED = null; // { p: cópia em edição, novo: bool }
function abrirPedido(id){
  var p = S.pedidos[id];
  if (!p){ casca('<div class="card empty">Pedido não encontrado neste aparelho. <a href="#pedidos">Voltar</a></div>'); return; }
  if (!ED || ED.p.id !== id) ED = { p: JSON.parse(JSON.stringify(p)), novo: false, sujo: false };
  telaEditor();
}
function totalItens(itens){ return r2(itens.reduce(function(s,i){ return s + r2(i.qty*i.unit); }, 0)); }
function telaEditor(){
  var p = ED.p, c = p.cliente || {}, g = grupo(p.grupo), orig = p.original;
  var travado = p.status === 'faturado' || p.status === 'cancelado';
  var itTrav = travado || (!ED.novo && !ED.editItens);
  var html = '<div class="row"><a class="btn sm" href="#pedidos">← Pedidos</a><div class="grow"></div>' +
      (p.origem === 'express' ? '<span class="badge b-express">Pedido Express</span>' : '<span class="badge">Lançado no app</span>') + '</div>' +
    '<div class="row" style="margin-top:12px;align-items:center"><h1 class="grow" style="margin:0">' + (ED.novo ? 'Novo pedido' : 'Pedido ' + esc(p.numero)) + '</h1>' +
      (logoRep(p.grupo) ? '<img class="ped-logo" src="' + esc(logoRep(p.grupo).url) + '" alt="' + esc(g ? g.nome : '') + '">' : '') + '</div><div style="height:10px"></div>' +
    '<div class="muted" style="margin-top:-8px;margin-bottom:10px">' + esc(g ? g.nome : p.grupo) + ' · ' + esc(politicaNome(p.grupo, p.politica)) + ' · ' + esc(CFG.vendedores[p.vendedor_codigo] || p.vendedor_codigo) +
      (p.criado_em ? ' · ' + dataBR(p.criado_em) : '') + '</div>' +
    (pendentes(p.id) ? '<div class="note warn">Alterações guardadas neste aparelho. Sobem para o sistema assim que houver internet.</div>' : '') +
    (ED.sujo ? '<div class="note info">Você tem alterações não salvas.</div>' : '') +
    (travado ? '<div class="note info">Pedido ' + esc(STATUS_NOME[p.status]) + '. Para editar, mude o status.</div>' : '') +
    '<div class="card pad"><div class="grid2">' +
      '<div><label class="lb">Status</label><select class="in" id="eSt">' + (STATUS_NOME[p.status] && !STATUS.some(function(s){ return s[0] === p.status; }) ? '<option value="' + p.status + '" selected>' + STATUS_NOME[p.status] + ' (antigo)</option>' : '') + STATUS.map(function(s){ return '<option value="' + s[0] + '"' + (p.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="lb">Política de preço</label><select class="in" id="ePol"' + (itTrav ? ' disabled title="Toque em Editar itens para mudar a política"' : '') + '>' + (g ? g.politicas.map(function(x){ return '<option value="' + x.id + '"' + (politicaId(p.grupo, p.politica) === x.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') : '<option>' + esc(p.politica) + '</option>') + '</select></div>' +
      '<div><label class="lb">Cliente / razão social</label><input class="in" data-c="name" value="' + esc(c.name) + '"></div>' +
      '<div><label class="lb">CNPJ / CPF</label><input class="in" data-c="doc" inputmode="numeric" value="' + esc(c.doc) + '"></div>' +
      '<div><label class="lb">Telefone / WhatsApp</label><input class="in" data-c="phone" type="tel" value="' + esc(c.phone) + '"></div>' +
      '<div><label class="lb">Cidade / UF</label><input class="in" data-c="city" value="' + esc(c.city) + '"></div>' +
      '<div><label class="lb">Transportadora</label><input class="in" data-c="carrier" list="trL" autocomplete="off" placeholder="Digite para buscar" value="' + esc(c.carrier) + '">' + trDatalist() + '</div>' +
      '<div><label class="lb">Prazo de pagamento</label>' + prazoCampo(p, travado) + '</div>' +
    '</div><label class="lb">Observação</label><textarea class="in" id="eObs" rows="2">' + esc(p.obs) + '</textarea></div>' +
    '<div class="row" style="margin-top:16px"><h2 class="grow" style="margin:0">Itens (' + p.itens.length + ')</h2>' + (travado || ED.novo ? '' : (ED.editItens ? '<button class="btn sm" id="eEdIt">🔒 Travar itens</button>' : '<button class="btn sm edit-it" id="eEdIt">✎ Editar itens</button>')) + (itTrav ? '' : '<button class="btn sm pri" id="eAdd">+ Adicionar produto</button>') + '</div>' +
    (!travado && itTrav ? '<div class="muted" style="font-size:12.5px;margin-top:4px">Itens travados para evitar alteração por engano. Toque em ✎ Editar itens para adicionar, remover ou mudar quantidade e preço.</div>' : '') +
    '<div class="card" style="margin-top:8px"><div class="pad" id="eItens">' + (p.itens.length ? p.itens.map(function(it, i){ return linhaItem(p, it, i, itTrav); }).join('') : '<div class="empty">Nenhum item. Toque em “Adicionar produto”.</div>') + '</div>' +
      '<div class="totbar"><span>Total</span><span id="eTot">' + fmt(totalItens(p.itens)) + '</span></div><div id="eParc">' + parcelasBox(p) + '</div><div id="eRegra">' + regraBox(p) + '</div></div>' +
    (orig && !ED.novo ? '<div class="row" style="margin-top:12px"><button class="btn sm" id="eOrig">Ver o que o cliente enviou' + (r2(orig.total) !== totalItens(p.itens) ? ' (total original ' + fmt(orig.total) + ')' : '') + '</button>' +
      '<button class="btn sm" id="eHist">Histórico de alterações</button></div>' : '');
  var acoes = '<button class="btn" id="ePdf">Gerar espelho PDF</button><button class="btn" id="eMail">✉ Enviar por e-mail</button><button class="btn wa" id="eWa">Enviar por WhatsApp</button><button class="btn pri" id="eSalvar">' + (ED.novo ? 'Salvar pedido' : 'Salvar alterações') + '</button>';
  casca(html, acoes);
  var marcar = function(){ ED.sujo = true; };
  $app.querySelectorAll('[data-c]').forEach(function(inp){ inp.oninput = function(){ ED.p.cliente = ED.p.cliente || {}; ED.p.cliente[inp.dataset.c] = inp.value; marcar(); }; });
  document.getElementById('ePrazo').oninput = document.getElementById('ePrazo').onchange = function(){ var antes = eAvista(ED.p); ED.p.prazo = this.value; marcar(); if (aplicarPreco(ED.p)){ telaEditor(); return; } if (regraDe(ED.p.grupo) && (antes || eAvista(ED.p))){ aplicarAvista(ED.p); telaEditor(); } else atualizaRegra(); };
  document.getElementById('eObs').oninput = function(){ ED.p.obs = this.value; marcar(); };
  document.getElementById('eSt').onchange = function(){ ED.p.status = this.value; marcar(); telaEditor(); };
  document.getElementById('ePol').onchange = function(){ trocarPolitica(this.value); };
  var add = document.getElementById('eAdd'); if (add) add.onclick = function(){ abrirCatalogo(); };
  document.getElementById('eSalvar').onclick = salvarPedido;
  prepararFotos(ED.p);
  document.getElementById('ePdf').onclick = function(){
    var pp = ED.p;
    if (!confereRegra(pp, 'Gerar o PDF')) return;
    comFotos(pp, function(){ gerarEspelho(pp); });
  };
  document.getElementById('eMail').onclick = function(){ if (!ED.p.itens.length){ toast('Adicione pelo menos um item.'); return; } if (!confereRegra(ED.p, 'Enviar')) return; telaEmail(ED.p); };
  document.getElementById('eWa').onclick = function(){ if (!ED.p.itens.length){ toast('Adicione pelo menos um item.'); return; } if (!confereRegra(ED.p, 'Enviar')) return; comFotos(ED.p, function(){ enviarWhatsApp(ED.p); }); };
  var bo = document.getElementById('eOrig'); if (bo) bo.onclick = verOriginal;
  var bh = document.getElementById('eHist'); if (bh) bh.onclick = verHistorico;
  ligarItens(itTrav);
  var bEd = document.getElementById('eEdIt'); if (bEd) bEd.onclick = function(){ ED.editItens = !ED.editItens; telaEditor(); };
}
function linhaItem(p, it, i, travado){
  if (it.taxa) return '<div class="it it-taxa" data-i="' + i + '"><div class="tx-ic">🚚</div><div><div class="cod">' + esc(it.cod) + '</div><div class="ds">' + esc(it.desc) + '</div>' +
    '<div class="ctl"><b>1 × ' + fmt(it.unit) + '</b><span class="lt">' + fmt(it.unit) + '</span></div><div class="muted" style="font-size:12px;margin-top:4px">Sai automaticamente quando o pedido líquido passa de ' + fmt((REGRAS[p.grupo] && REGRAS[p.grupo].taxa || {}).abaixo || 0) + '.</div></div></div>';
  var img = imgDe(p.grupo, it.cod);
  var orig = p.original && p.original.itens ? p.original.itens.find(function(o){ return o.cod === it.cod && (o.label||'') === (it.label||''); }) : null;
  var mudouP = orig && r2(orig.unit) !== r2(it.unit), mudouQ = orig && orig.qty !== it.qty;
  return '<div class="it" data-i="' + i + '"><img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.src=\'company.png\'"><div>' +
    '<div class="cod">' + esc(it.cod) + (it.marca ? ' <span class="muted" style="font-weight:600">· ' + esc(it.marca) + '</span>' : '') + (!orig && p.original && !ED.novo ? ' <span class="tag" style="background:var(--accent)">incluído</span>' : '') + '</div>' +
    '<div class="ds">' + esc(it.desc) + (it.label ? ' · <b>' + esc(it.label) + '</b>' : '') + '</div>' +
    '<div class="ctl">' + (travado ? '<b>' + it.qty + ' × ' + fmt(it.unit) + '</b>' :
      '<div class="qty' + (mudouQ ? ' changed' : '') + '"><button type="button" data-dec>−</button><input data-q inputmode="numeric" value="' + it.qty + '"><button type="button" data-inc>+</button></div>' +
      '<input class="price-in' + (mudouP ? ' changed' : '') + '" data-u inputmode="decimal" value="' + String(r2(it.unit).toFixed(2)).replace('.', ',') + '" title="Preço unitário">') +
      '<span class="lt">' + fmt(r2(it.qty * it.unit)) + '</span>' + (travado ? '' : '<button class="rm" data-rm title="Remover">✕</button>') + '</div>' +
    (function(){ var pi = precoInfo(p, it); return pi.tab ? '<div class="muted" style="font-size:12px;margin-top:4px">Tabela ' + fmt(pi.tab) + ' · desconto ' + esc(pi.desc) + ' · final ' + fmt(it.unit) + '</div>' : ''; })() +
    (mudouP || mudouQ ? '<div class="muted" style="font-size:12px;margin-top:4px">Cliente pediu: ' + orig.qty + ' × ' + fmt(orig.unit) + '</div>' : '') +
    '</div></div>';
}
function ligarItens(travado){
  if (travado) return;
  $app.querySelectorAll('.it').forEach(function(row){
    var i = +row.dataset.i, it = ED.p.itens[i]; if (!it || it.taxa) return;
    var upd = function(){ ED.sujo = true;
      var bAnt = JSON.stringify([ED.p.desc_solez && ED.p.desc_solez.base, ED.p.desc_prog && ED.p.desc_prog.pct, ED.p.itens.length]);
      if (aplicarPreco(ED.p)){ if (bAnt !== JSON.stringify([ED.p.desc_solez && ED.p.desc_solez.base, ED.p.desc_prog && ED.p.desc_prog.pct, ED.p.itens.length])){ telaEditor(); return; } $app.querySelectorAll('.it[data-i]').forEach(function(rw){ var x = ED.p.itens[+rw.dataset.i]; if (!x) return; var pi2 = rw.querySelector('[data-u]'); if (pi2) pi2.value = String(r2(x.unit).toFixed(2)).replace('.', ','); var l2 = rw.querySelector('.lt'); if (l2) l2.textContent = fmt(r2(x.qty*x.unit)); }); }
      var lt = row.querySelector('.lt'); lt.textContent = fmt(r2(it.qty*it.unit)); document.getElementById('eTot').textContent = fmt(totalItens(ED.p.itens)); atualizaRegra(); };
    row.querySelector('[data-dec]').onclick = function(){ if (it.qty > 1){ it.qty--; row.querySelector('[data-q]').value = it.qty; upd(); } };
    row.querySelector('[data-inc]').onclick = function(){ it.qty++; row.querySelector('[data-q]').value = it.qty; upd(); };
    row.querySelector('[data-q]').onchange = function(){ var v = parseInt(this.value,10); it.qty = v > 0 ? v : 1; this.value = it.qty; upd(); };
    row.querySelector('[data-u]').onchange = function(){ var v = parseFloat(String(this.value).replace(/\./g,'').replace(',','.')); if (!(v >= 0)) v = it.unit; it.unit = r2(v); if (it.base != null && ED.p.desc_avista) it.base = r2(v / (1 - ED.p.desc_avista/100)); this.value = it.unit.toFixed(2).replace('.',','); upd(); };
    row.querySelector('[data-rm]').onclick = function(){ if (confirm('Remover ' + it.cod + ' do pedido?')){ ED.p.itens.splice(i,1); ED.sujo = true; aplicarPreco(ED.p); telaEditor(); } };
  });
}
function trocarPolitica(pid){
  var p = ED.p, g = grupo(p.grupo); if (!g) return;
  var n = 0;
  p.itens.forEach(function(it){
    var a = acharItem(p.grupo, it.cod); if (!a) return;
    var novo = a.it.p[pid];
    if (a.it.tiers && a.it.tiers[pid] && it.label){ var t = a.it.tiers[pid].find(function(x){ return x.label === it.label; }); if (t) novo = t.unit; }
    var cur = it.base != null ? it.base : it.unit;
    if (novo != null && r2(novo) !== r2(cur)){ if (it.base != null) it.base = r2(novo); else it.unit = r2(novo); n++; }
  });
  aplicarAvista(p); aplicarPreco(p);
  p.politica = g.politicas.find(function(x){ return x.id === pid; }).nome; ED.sujo = true;
  telaEditor(); if (n) toast(n + ' preço(s) atualizado(s) para a política ' + p.politica);
}
function salvarPedido(){
  var p = ED.p;
  if (!p.itens.length){ toast('Adicione pelo menos um item.'); return; }
  if (!(p.cliente && p.cliente.name)){ toast('Informe o nome do cliente.'); return; }
  if (!confereRegra(p, 'Salvar')) return;
  p.total = totalItens(p.itens);
  var marcas = []; p.itens.forEach(function(i){ if (i.marca && marcas.indexOf(i.marca) < 0) marcas.push(i.marca); });
  if (marcas.length) p.marca = marcas.join(' + ');
  p.atualizado_em = new Date().toISOString();
  if (ED.novo) p.criado_em = p.atualizado_em;
  var tipo = ED.novo ? 'inserir' : 'editar';
  if (!ED.novo && S.fila.some(function(o){ return o.id === p.id && o.tipo === 'inserir'; })) tipo = 'inserir';
  S.pedidos[p.id] = JSON.parse(JSON.stringify(p));
  var id = p.id; ED = null;
  enfileirar(id, tipo).then(function(){ toast(navigator.onLine ? 'Pedido salvo.' : 'Pedido salvo no aparelho. Sobe quando a internet voltar.'); });
  location.hash = '#pedido/' + id; render();
}
function verOriginal(){
  var o = ED.p.original || {}, c = o.cliente || {};
  modal('O que o cliente enviou', '<div class="kv"><span>Cliente</span><span>' + esc(c.name) + '</span><span>CNPJ/CPF</span><span>' + esc(c.doc) + '</span><span>Prazo</span><span>' + esc(o.prazo || '—') + '</span><span>Obs.</span><span>' + esc(o.obs || '—') + '</span></div>' +
    '<table class="tb" style="margin-top:12px"><tr><th>Código</th><th>Descrição</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Total</th></tr>' +
    (o.itens || []).map(function(i){ return '<tr><td><b>' + esc(i.cod) + '</b></td><td>' + esc(i.desc) + (i.label ? ' · ' + esc(i.label) : '') + '</td><td class="r">' + i.qty + '</td><td class="r">' + fmt(i.unit) + '</td><td class="r">' + fmt(i.qty*i.unit) + '</td></tr>'; }).join('') +
    '<tr><td colspan="4" class="r"><b>Total</b></td><td class="r"><b>' + fmt(o.total) + '</b></td></tr></table>');
}
function verHistorico(){
  var m = modal('Histórico de alterações', '<div class="empty">Carregando…</div>');
  if (!navigator.onLine){ m.body.innerHTML = '<div class="empty">O histórico precisa de internet.</div>'; return; }
  api('pedido_historico?select=*&pedido_id=eq.' + ED.p.id + '&order=quando.desc').then(function(r){
    m.body.innerHTML = r && r.length ? r.map(function(h){
      var a = h.antes || {}, d = h.depois || {}, mud = [];
      if (a.status !== d.status) mud.push('Status: ' + (STATUS_NOME[a.status]||a.status) + ' → ' + (STATUS_NOME[d.status]||d.status));
      if (r2(a.total) !== r2(d.total)) mud.push('Total: ' + fmt(a.total) + ' → ' + fmt(d.total));
      if ((a.prazo||'') !== (d.prazo||'')) mud.push('Prazo: ' + (a.prazo||'—') + ' → ' + (d.prazo||'—'));
      if (JSON.stringify(a.itens) !== JSON.stringify(d.itens) && r2(a.total) === r2(d.total)) mud.push('Itens alterados');
      if (JSON.stringify(a.cliente) !== JSON.stringify(d.cliente)) mud.push('Dados do cliente alterados');
      if ((a.obs||'') !== (d.obs||'')) mud.push('Observação alterada');
      return '<div style="padding:8px 0;border-bottom:1px solid var(--border)"><b>' + dataBR(h.quando) + '</b> · ' + esc(h.usuario_nome || '') + '<div class="muted">' + esc(mud.join(' · ') || 'Sem mudanças nos campos principais') + '</div></div>';
    }).join('') : '<div class="empty">Nenhuma alteração ainda.</div>';
  }).catch(function(e){ m.body.innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; });
}

/* ----- catálogo (adicionar produto) ----- */
/* resumo do pedido mostrado no Adicionar produto */
function resumoCat(){
  var p = ED.p, merc = p.itens.filter(function(i){ return !i.taxa; }), tx = p.itens.find(function(i){ return i.taxa; }), tot = totalItens(p.itens), un = merc.reduce(function(s2, i){ return s2 + (+i.qty || 0); }, 0), r = regraDe(p.grupo);
  var falta = r && r.minimo && tot < r.minimo ? '<small class="cr-f">faltam ' + fmt(r2(r.minimo - tot)) + ' p/ mínimo</small>' : '';
  return '<span class="cr-i">🛒 ' + merc.length + ' ' + (merc.length === 1 ? 'item' : 'itens') + ' · ' + un + ' un.' + (tx ? ' · 🚚 +' + fmt(tx.unit) : '') + '</span><b>' + fmt(tot) + '</b>' + falta;
}
function abrirCatalogo(){
  var p = ED.p, g = grupo(p.grupo), pid = politicaId(p.grupo, p.politica);
  if (!g){ toast('Catálogo deste grupo não está no aparelho.'); return; }
  var st = { marca: g.marcas[0].id, cat: '', sub: '', q: '', so: false };
  function mainCat(i){ return String(i.cat || 'Outros').split(' · ')[0]; }
  function subCat(i){ var p = String(i.cat || '').split(' · '); return p.length > 1 ? p.slice(1).join(' · ') : ''; }
  var m = modal('Adicionar produto · ' + g.nome, ''); m.ov.classList.add('catov');
  function catsDe(mar, fn, filtro){ var o = [], c = {}; mar.itens.forEach(function(i){ if (filtro && !filtro(i)) return; var k = fn(i); if (!k) return; if (!(k in c)){ c[k] = 0; o.push(k); } c[k]++; }); return o.map(function(k){ return { nome: k, n: c[k] }; }); }
  function qtdNo(cod, label){ var e = ED.p.itens.find(function(y){ return y.cod === cod && (y.label||'') === label; }); return e ? e.qty : 0; }
  function stepper(it, mm, label, extra){ var n = qtdNo(it.cod, label); return n ? '<span class="stp"><button class="btn sm" data-dec="' + esc(it.k) + '" data-mm="' + mm.id + '" data-lb="' + esc(label) + '"' + extra + ' aria-label="Diminuir">−</button><b>' + n + '</b><button class="btn sm" data-inc="' + esc(it.k) + '" data-mm="' + mm.id + '" data-lb="' + esc(label) + '"' + extra + ' aria-label="Aumentar">+</button></span>' : ''; }
  function optsDe(x){
    var it = x.i, pr = it.p[pid], av = it.av[pid], tiers = it.tiers && it.tiers[pid];
    if (!av || pr == null) return '<span class="muted" style="font-size:12.5px">' + (pr == null ? 'Preço sob consulta — ' : '') + (av ? '' : 'indisponível — ') + '</span><button class="btn sm" data-add="' + esc(it.k) + '" data-mm="' + x.m.id + '">Adicionar mesmo assim</button>' + stepper(it, x.m, '', '');
    if (tiers) return tiers.map(function(t, ti){ return '<span class="opt"><button class="btn sm" data-add="' + esc(it.k) + '" data-mm="' + x.m.id + '" data-t="' + ti + '">' + esc(t.label) + ' · ' + fmt(t.unit) + '</button>' + stepper(it, x.m, t.label, ' data-t="' + ti + '"') + '</span>'; }).join('');
    if (it.cores) return it.cores.map(function(cor){ return '<span class="opt"><button class="btn sm" data-add="' + esc(it.k) + '" data-mm="' + x.m.id + '" data-cor="' + esc(cor) + '">+ ' + esc(cor) + '</button>' + stepper(it, x.m, 'Cor: ' + cor, '') + '</span>'; }).join('');
    return '<button class="btn sm pri" data-add="' + esc(it.k) + '" data-mm="' + x.m.id + '">+ Adicionar</button>' + stepper(it, x.m, '', '');
  }
  function cartao(x, q){
    var it = x.i, pr = it.p[pid], av = it.av[pid];
    var opts = optsDe(x);
    return '<div class="cat-it' + (av ? '' : ' unav') + '"><img src="' + esc(it.img || 'company.png') + '" loading="lazy" alt="" onerror="this.src=\'company.png\'"><div>' +
      '<div><b>' + esc(it.cod) + '</b>' + (it.tag ? '<span class="tag">' + esc(it.tag) + '</span>' : '') + (av ? '' : '<span class="tag ind">INDISPONÍVEL</span>') + (q ? ' <span class="muted" style="font-size:12px">· ' + esc(x.m.nome) + '</span>' : '') + '</div>' +
      '<div class="muted" style="font-size:13px">' + esc(it.desc) + '</div>' +
      '<div class="pr pr-val">' + precoComTabela(g.id, pid, it) + '</div>' +
      '<div class="opts" data-k="' + esc(it.k) + '" data-om="' + x.m.id + '">' + opts + '</div></div></div>';
  }
  function desenha(){
    var mar = g.marcas.find(function(x){ return x.id === st.marca; });
    var isTag = st.cat.indexOf('#tag:') === 0, tagSel = isTag ? st.cat.slice(5) : '';
    var q = st.q.toLowerCase(), cats = catsDe(mar, mainCat), tags = catsDe(mar, function(i){ return i.tag || ''; }), subs = st.cat && !isTag ? catsDe(mar, subCat, function(i){ return mainCat(i) === st.cat; }) : [];
    var pool = q ? g.marcas.reduce(function(a, mm){ return a.concat(mm.itens.map(function(i){ return { i: i, m: mm }; })); }, []) : mar.itens.map(function(i){ return { i: i, m: mar }; });
    var itens = pool.filter(function(x){
      if (st.so && !x.i.av[pid]) return false;
      if (!q && isTag && x.i.tag !== tagSel) return false;
      if (!q && st.cat && !isTag && mainCat(x.i) !== st.cat) return false;
      if (!q && st.sub && subCat(x.i) !== st.sub) return false;
      return !q || (x.i.cod + ' ' + x.i.desc + ' ' + x.i.cat).toLowerCase().indexOf(q) > -1; });
    var LIM = 300, corte = itens.length > LIM; itens = itens.slice(0, LIM);
    var lista = '';
    if (q) lista = itens.map(function(x){ return cartao(x, q); }).join('');
    else { var atual = null; itens.forEach(function(x){ var c = x.i.cat || 'Outros'; if (c !== atual){ atual = c; lista += '<div class="cat-sec">' + esc(c) + '</div>'; } lista += cartao(x, q); }); }
    m.body.innerHTML = '<div class="cat-top"><div class="cat-sels"><input class="in" id="cQ" type="search" placeholder="🔍 Buscar" title="Buscar por código ou nome em todas as linhas" value="' + esc(st.q) + '">' +
      
      (g.marcas.length > 1 ? '<select class="in" id="cM" title="Linha de produtos">' + g.marcas.map(function(mm){ return '<option value="' + mm.id + '"' + (st.marca === mm.id ? ' selected' : '') + '>' + esc(mm.nome) + ' (' + mm.itens.length + ')</option>'; }).join('') + '</select>' : '') +
      (q ? '' : '<select class="in" id="cC" title="Categoria"><option value="">Categoria: todas (' + mar.itens.length + ')</option>' +
        tags.map(function(t){ var v = '#tag:' + t.nome; return '<option value="' + esc(v) + '"' + (st.cat === v ? ' selected' : '') + '>★ ' + esc(t.nome) + ' (' + t.n + ')</option>'; }).join('') +
        cats.map(function(c){ return '<option value="' + esc(c.nome) + '"' + (st.cat === c.nome ? ' selected' : '') + '>' + esc(c.nome) + ' (' + c.n + ')</option>'; }).join('') + '</select>' +
        (subs.length > 1 ? '<select class="in" id="cS" title="Subcategoria"><option value="">Subcategoria: todas</option>' + subs.map(function(c){ return '<option value="' + esc(c.nome) + '"' + (st.sub === c.nome ? ' selected' : '') + '>' + esc(c.nome) + ' (' + c.n + ')</option>'; }).join('') + '</select>' : '')) +
      '<button class="chip so" data-so aria-pressed="' + st.so + '" title="Só disponíveis"><span class="lg">Só disponíveis</span><span class="sh">Disp.</span></button><div class="cat-res" id="cRes">' + resumoCat() + '</div></div>' +
      '<div class="muted cat-info">' + esc(q ? 'Resultado da busca em todas as linhas' : (mar.sub || '')) + ' · preços da política ' + esc(politicaNome(p.grupo, pid)) + '</div></div>' +
      '<div class="cat-list">' + lista + '</div>' + (itens.length ? '' : '<div class="empty">Nada encontrado.</div>') +
      (corte ? '<div class="muted" style="text-align:center;padding:10px">Mostrando os primeiros ' + LIM + '. Escolha uma categoria ou use a busca para ver os demais.</div>' : '');
    var cC = m.body.querySelector('#cC'), cS = m.body.querySelector('#cS'), cM = m.body.querySelector('#cM');
    if (cC) cC.onchange = function(){ st.cat = this.value; st.sub = ''; desenha(); m.body.scrollTop = 0; };
    if (cS) cS.onchange = function(){ st.sub = this.value; desenha(); m.body.scrollTop = 0; };
    if (cM) cM.onchange = function(){ st.marca = this.value; st.cat = ''; st.sub = ''; st.q = ''; desenha(); m.body.scrollTop = 0; };
    var cq = m.body.querySelector('#cQ');
    cq.oninput = function(){ st.q = this.value; var pos = this.selectionStart; desenha(); var e = m.body.querySelector('#cQ'); e.focus(); e.setSelectionRange(pos,pos); };
    m.body.querySelector('[data-so]').onclick = function(){ st.so = !st.so; desenha(); };
    liga(m.body);
  }
  function liga(raiz){
    raiz.querySelectorAll('[data-add],[data-inc],[data-dec]').forEach(function(b){ b.onclick = function(){
      var k = b.dataset.add || b.dataset.inc || b.dataset.dec;
      var mm = g.marcas.find(function(x){ return x.id === b.dataset.mm; });
      var it = mm.itens.find(function(x){ return x.k === k; });
      var unit = it.p[pid] || 0, label = '', qty = 1;
      if (b.dataset.t != null){ var t = it.tiers[pid][+b.dataset.t]; unit = t.unit; label = t.label; qty = t.step || 1; }
      if (b.dataset.cor) label = 'Cor: ' + b.dataset.cor;
      if (b.dataset.lb != null) label = b.dataset.lb;
      var ix = ED.p.itens.findIndex(function(x){ return x.cod === it.cod && (x.label||'') === label; }), ex = ED.p.itens[ix];
      if (b.dataset.dec){ if (!ex) return; ex.qty -= qty; if (ex.qty <= 0) ED.p.itens.splice(ix, 1); }
      else if (ex) ex.qty += qty;
      else { ED.p.itens.push({ cod: it.cod, desc: it.desc, qty: qty, unit: r2(unit), label: label, marca: mm.nome }); aplicarAvista(ED.p); }
      ED.sujo = true; aplicarPreco(ED.p);
      if (b.dataset.add) toast(it.cod + (label ? ' (' + label + ')' : '') + ' adicionado', 1200);
      var cr = m.body.querySelector('#cRes'); if (cr){ cr.innerHTML = resumoCat(); cr.classList.remove('pulse'); void cr.offsetWidth; cr.classList.add('pulse'); }
      m.body.querySelectorAll('.opts').forEach(function(o){ if (o.dataset.k === it.k && o.dataset.om === mm.id){ o.innerHTML = optsDe({ i: it, m: mm }); liga(o); } });
    }; });
  }
  desenha();
  m.onclose = function(){ telaEditor(); };
}

function modal(titulo, html){
  var ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = '<div class="sheet"><div class="sheet-h"><b>' + esc(titulo) + '</b><button class="btn sm" data-x>Fechar</button></div><div class="sheet-b"></div></div>';
  document.body.appendChild(ov);
  var m = { ov: ov, body: ov.querySelector('.sheet-b'), onclose: null };
  m.body.innerHTML = html;
  var fechar = function(){ ov.remove(); document.body.style.overflow = ''; if (m.onclose) m.onclose(); };
  ov.querySelector('[data-x]').onclick = fechar;
  ov.onclick = function(e){ if (e.target === ov) fechar(); };
  document.body.style.overflow = 'hidden';
  return m;
}

/* ----- novo pedido ----- */
function telaNovo(arg){
  if (!S.cat){ casca('<div class="card empty">Catálogo ainda não foi baixado. Conecte à internet uma vez.</div>'); return; }
  var pre = arg ? S.clientes.find(function(c){ return c.id === arg; }) : null;
  var vend = souAdmin() ? Object.keys(CFG.vendedores) : [S.perfil.codigo];
  var html = '<h1>Novo pedido</h1><div class="card pad">' +
    '<label class="lb">Cliente</label><input class="in" id="nCli" list="cliL" placeholder="Digite o nome ou CNPJ de um cliente cadastrado, ou um cliente novo" value="' + esc(pre ? pre.nome : '') + '">' +
    '<datalist id="cliL">' + S.clientes.map(function(c){ return '<option value="' + esc(c.nome) + '">' + esc((c.doc||'') + ' ' + (c.cidade||'')) + '</option>'; }).join('') + '</datalist>' +
    '<label class="lb">Representada</label><select class="in" id="nG"><option value="">Selecione</option>' + S.cat.grupos.slice().sort(function(a, b){ return a.nome.localeCompare(b.nome, 'pt-BR'); }).map(function(g){ return '<option value="' + g.id + '">' + esc(g.nome) + '</option>'; }).join('') + '</select>' +
    '<label class="lb">Política de preço</label><select class="in" id="nPol"></select>' +
    (vend.length > 1 ? '<label class="lb">Vendedor</label><select class="in" id="nVend">' + vend.map(function(k){ return '<option value="' + k + '">' + esc(CFG.vendedores[k]) + '</option>'; }).join('') + '</select>' : '') +
    '<button class="btn pri" style="margin-top:14px;width:100%" id="nGo">Continuar → escolher produtos</button></div>';
  casca(html);
  var gsel = '';
  function pols(){ var g = grupo(gsel), el = document.getElementById('nPol'); if (!g){ el.innerHTML = '<option value="">Escolha a representada</option>'; el.disabled = true; return; } el.disabled = false; el.innerHTML = g.politicas.map(function(x){ return '<option value="' + x.id + '">' + esc(x.nome) + '</option>'; }).join(''); }
  pols();
  document.getElementById('nG').onchange = function(){ gsel = this.value; pols(); };
  document.getElementById('nGo').onclick = function(){
    if (!gsel){ toast('Selecione a representada.'); document.getElementById('nG').focus(); return; }
    var nome = document.getElementById('nCli').value.trim();
    var c = S.clientes.find(function(x){ return x.nome === nome || (x.fantasia && x.fantasia === nome) || (x.doc && soNum(x.doc) === soNum(nome)) || (x.codigo && String(x.codigo) === nome); });
    var g = grupo(gsel), pid = document.getElementById('nPol').value, d = new Date();
    var vsel = document.getElementById('nVend') ? document.getElementById('nVend').value : vend[0];
    ED = { novo: true, sujo: true, p: {
      id: uuid(), numero: 'CV-' + String(d.getFullYear()).slice(2) + p2(d.getMonth()+1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + Math.floor(Math.random()*90+10),
      origem: 'app', grupo: gsel, marca: g.nome, politica: g.politicas.find(function(x){ return x.id === pid; }).nome, vendedor_codigo: vsel,
      cliente: c ? { name: c.nome, doc: c.doc || '', phone: c.telefone || '', city: c.cidade ? c.cidade + (c.uf ? '/' + c.uf : '') : '', carrier: c.transportadora || '' } : { name: nome },
      itens: [], total: 0, prazo: '', obs: '', status: 'recebido', original: null
    } };
    S.pedidos[ED.p.id] = undefined; delete S.pedidos[ED.p.id];
    telaEditor(); window.scrollTo(0,0);
    setTimeout(abrirCatalogo, 50);
  };
}

/* ----- clientes ----- */
var CF_VAZIO = { uf:'', cidade:'', nome:'', fantasia:'', compra:'', de:'', ate:'' };
var CF = Object.assign({}, CF_VAZIO, lsGet('cv_cfiltro', {}));
var COMPRAS = [['','Qualquer'],['r30','Comprou nos últimos 30 dias'],['r60','Comprou nos últimos 60 dias'],['r90','Comprou nos últimos 90 dias'],['r180','Comprou nos últimos 180 dias'],
  ['s30','Sem comprar há mais de 30 dias'],['s60','Sem comprar há mais de 60 dias'],['s90','Sem comprar há mais de 90 dias'],['s180','Sem comprar há mais de 180 dias'],['s365','Sem comprar há mais de 1 ano'],
  ['nunca','Nunca comprou'],['entre','Última compra entre datas…']];
function dataCurta(iso){ if (!iso) return ''; var d = new Date(iso); return p2(d.getDate()) + '/' + p2(d.getMonth()+1) + '/' + d.getFullYear(); }
/* última compra e nº de pedidos de cada cliente (pedidos não cancelados, ligados pelo CNPJ ou pelo nome) */
function comprasPorCliente(){
  var m = {};
  listaPedidos().forEach(function(p){
    if (p.status === 'cancelado') return;
    var c = p.cliente || {}, k = soNum(c.doc) || ('n:' + semAcento(c.name).trim()); if (k === 'n:') return;
    var r = m[k] || (m[k] = { n: 0, ult: '' }); r.n++;
    if (String(p.criado_em||'') > r.ult) r.ult = String(p.criado_em||'');
  });
  return m;
}
function compraDe(m, c){ return m[soNum(c.doc)] || m['n:' + semAcento(c.nome).trim()] || { n: 0, ult: '' }; }
function nFiltros(){ return ['uf','cidade','nome','fantasia','compra'].filter(function(k){ return CF[k]; }).length; }
function passaFiltro(c, comp){
  if (CF.uf && (c.uf||'') !== CF.uf) return false;
  if (CF.cidade && semAcento(c.cidade) !== semAcento(CF.cidade)) return false;
  if (CF.nome && semAcento(c.nome).indexOf(semAcento(CF.nome)) < 0) return false;
  if (CF.fantasia && semAcento(c.fantasia).indexOf(semAcento(CF.fantasia)) < 0) return false;
  if (CF.compra){
    var u = comp.ult ? new Date(comp.ult).getTime() : 0, dias = u ? (Date.now() - u) / 864e5 : Infinity, n = parseInt(CF.compra.slice(1), 10);
    if (CF.compra === 'nunca') return !u;
    if (CF.compra[0] === 'r') return u && dias <= n;
    if (CF.compra[0] === 's') return !u || dias > n;
    if (CF.compra === 'entre'){
      if (!u) return false;
      if (CF.de && u < new Date(CF.de + 'T00:00:00').getTime()) return false;
      if (CF.ate && u > new Date(CF.ate + 'T23:59:59').getTime()) return false;
    }
  }
  return true;
}
function resumoFiltro(){
  var t = [];
  if (CF.uf) t.push('UF: ' + CF.uf);
  if (CF.cidade) t.push('Cidade: ' + CF.cidade);
  if (CF.nome) t.push('Razão social: ' + CF.nome);
  if (CF.fantasia) t.push('Fantasia: ' + CF.fantasia);
  if (CF.compra){ var o = COMPRAS.find(function(x){ return x[0] === CF.compra; }); t.push('Última compra: ' + (CF.compra === 'entre' ? (CF.de ? dataCurta(CF.de + 'T12:00') : '…') + ' a ' + (CF.ate ? dataCurta(CF.ate + 'T12:00') : '…') : o[1].toLowerCase())); }
  return t;
}
function telaClientes(arg){
  var q = (arg ? decodeURIComponent(arg) : '').toLowerCase();
  var comp = comprasPorCliente();
  var lista = S.clientes.filter(function(c){ return (!q || semAcento([c.nome, c.fantasia, c.doc, c.codigo, c.cidade].join(' ')).indexOf(semAcento(q)) > -1) && passaFiltro(c, compraDe(comp, c)); });
  lista.sort(function(a,b){ return String(a.nome||'').localeCompare(String(b.nome||''), 'pt-BR'); });
  var nf = nFiltros(), rf = resumoFiltro();
  casca('<div class="row" style="justify-content:space-between"><h1 style="margin:4px 0">Clientes</h1><a class="btn pri" href="#cliente/novo">+ Novo cliente</a></div>' +
    '<div class="row nw" style="margin-top:10px;flex-wrap:nowrap"><input class="in" id="qCli" placeholder="Buscar por razão social, fantasia, CNPJ, código ou cidade" value="' + esc(q) + '">' +
    '<button class="btn' + (nf ? ' pri' : '') + '" id="bFiltro" style="white-space:nowrap">⚲ Filtro' + (nf ? ' (' + nf + ')' : '') + '</button></div>' +
    (nf ? '<div class="note info row" style="justify-content:space-between"><span>' + esc(rf.join(' · ')) + '</span><button class="btn sm" id="bLimpaF">Limpar filtro</button></div>' : '') +
    '<p class="muted" style="font-size:13px">' + lista.length + ' de ' + S.clientes.length + ' cliente(s). Clientes entram aqui automaticamente pelo CNPJ quando enviam um Pedido Express ou quando você lança um pedido. Use “+ Novo cliente” para cadastrar à mão.</p>' +
    '<div class="list">' + (lista.length ? lista.map(function(c){
      var pend = S.cfila.indexOf(c.id) > -1, cp = compraDe(comp, c);
      return '<div class="card pad"><div class="row"><div class="grow"><b>' + esc(c.nome) + '</b>' +
        (c.codigo ? ' <span class="badge">cód. ' + esc(c.codigo) + '</span>' : '') +
        (c.confirmado || pend ? '' : ' <span class="badge b-pend">pré-cadastro</span>') +
        (c.status === 'inativo' ? ' <span class="badge st-cancelado">inativo</span>' : '') +
        (pend ? ' <span class="badge b-pend">' + (c._erro ? 'não subiu' : 'aguardando envio') + '</span>' : '') +
        (c.fantasia ? '<div style="font-size:13px">' + esc(c.fantasia) + '</div>' : '') +
        '<div class="muted" style="font-size:13px">' + esc([fmtDoc(c.doc), [c.cidade, c.uf].filter(Boolean).join('/'), c.telefone].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="muted" style="font-size:12.5px">Última compra: ' + (cp.ult ? dataCurta(cp.ult) : '—') + '</div>' +
        (c._erro ? '<div class="note bad" style="margin:6px 0 0">' + esc(c._erro) + '</div>' : '') + '</div>' +
        '<div class="row" style="gap:6px"><a class="btn sm" href="#cliente/' + c.id + '">Editar</a><button class="btn sm" data-ver="' + esc(c.nome) + '">' + cp.n + ' pedido(s)</button><a class="btn sm pri" href="#novo/' + c.id + '">Novo pedido</a></div></div></div>';
    }).join('') : '<div class="card empty">' + (S.clientes.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda.') + '</div>') + '</div>');
  document.getElementById('qCli').onchange = function(){ location.hash = '#clientes/' + encodeURIComponent(this.value); };
  document.getElementById('bFiltro').onclick = function(){ abrirFiltroClientes(arg); };
  var lf = document.getElementById('bLimpaF'); if (lf) lf.onclick = function(){ CF = Object.assign({}, CF_VAZIO); lsSet('cv_cfiltro', CF); telaClientes(arg); };
  $app.querySelectorAll('[data-ver]').forEach(function(b){ b.onclick = function(){ S.filtro = { st:'', org:'', vend:'', q: b.dataset.ver }; location.hash = '#pedidos'; }; });
}
function abrirFiltroClientes(arg){
  var ufs = {}; S.clientes.forEach(function(c){ if (c.uf) ufs[c.uf] = 1; }); ufs = Object.keys(ufs).sort();
  function cidadesDe(uf){ var m = {}; S.clientes.forEach(function(c){ if (c.cidade && (!uf || c.uf === uf)){ var k = semAcento(c.cidade).trim(); if (!m[k]) m[k] = c.cidade.trim(); } }); return Object.keys(m).map(function(k){ return m[k]; }).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); }); }
  var m = modal('Filtrar clientes',
    '<label class="lb">UF</label><select class="in" id="fUf"><option value="">Todas</option>' + ufs.map(function(u){ return '<option' + (CF.uf === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select>' +
    '<label class="lb">Cidade</label><select class="in" id="fCid"></select>' +
    '<label class="lb">Razão social</label><input class="in" id="fNome" placeholder="Parte da razão social" value="' + esc(CF.nome) + '">' +
    '<label class="lb">Nome fantasia</label><input class="in" id="fFan" placeholder="Parte do nome fantasia" value="' + esc(CF.fantasia) + '">' +
    '<label class="lb">Última compra</label><select class="in" id="fComp">' + COMPRAS.map(function(o){ return '<option value="' + o[0] + '"' + (CF.compra === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
    '<div class="grid2" id="fDatas"><div><label class="lb">De</label><input class="in" type="date" id="fDe" value="' + esc(CF.de) + '"></div><div><label class="lb">Até</label><input class="in" type="date" id="fAte" value="' + esc(CF.ate) + '"></div></div>' +
    '<p class="muted" style="font-size:12.5px">Última compra = pedido mais recente do cliente no programa (Pedido Express ou lançado aqui), sem contar cancelados.</p>' +
    '<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="fLimpar">Limpar</button><button class="btn pri" id="fAplicar">Aplicar filtro</button></div>');
  var g = function(id){ return document.getElementById(id); };
  function montaCid(){ var l = cidadesDe(g('fUf').value), atual = CF.cidade;
    g('fCid').innerHTML = '<option value="">Todas</option>' + l.map(function(n){ return '<option' + (semAcento(n) === semAcento(atual) ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join(''); }
  function datas(){ g('fDatas').hidden = g('fComp').value !== 'entre'; }
  montaCid(); datas();
  g('fUf').onchange = function(){ CF.cidade = ''; montaCid(); };
  g('fComp').onchange = datas;
  function fechar(){ m.ov.remove(); document.body.style.overflow = ''; }
  g('fLimpar').onclick = function(){ CF = Object.assign({}, CF_VAZIO); lsSet('cv_cfiltro', CF); fechar(); telaClientes(arg); };
  g('fAplicar').onclick = function(){
    CF = { uf: g('fUf').value, cidade: g('fCid').value, nome: g('fNome').value.trim(), fantasia: g('fFan').value.trim(), compra: g('fComp').value, de: g('fDe').value, ate: g('fAte').value };
    if (CF.compra !== 'entre'){ CF.de = ''; CF.ate = ''; }
    lsSet('cv_cfiltro', CF); fechar(); telaClientes(arg);
  };
}

/* ----- cadastro de cliente ----- */
var UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
function fmtDoc(d){
  d = soNum(d);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
}
function fmtCep(c){ c = soNum(c); return c.length === 8 ? c.slice(0,5) + '-' + c.slice(5) : c; }
function semAcento(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
function cidadesUF(uf){
  var k = 'cv_cid_' + uf, c = lsGet(k, null);
  if (c) return Promise.resolve(c);
  if (!navigator.onLine) return Promise.resolve(null);
  return fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados/' + uf + '/municipios?orderBy=nome')
    .then(function(r){ return r.json(); }).then(function(j){ var l = j.map(function(m){ return m.nome; }); lsSet(k, l); return l; })
    .catch(function(){ return null; });
}
function nomeCli(c){ return c ? [c.codigo ? c.codigo + ' ·' : '', c.nome, c.fantasia ? '(' + c.fantasia + ')' : ''].filter(Boolean).join(' ') : ''; }
function telaCliente(arg){
  var novo = !arg || arg === 'novo';
  var orig = novo ? null : S.clientes.find(function(x){ return x.id === arg; });
  if (!novo && !orig){ casca('<div class="card empty">Cliente não encontrado. <a href="#clientes">Voltar</a></div>'); return; }
  var c = Object.assign({ status: 'ativo' }, orig || {});
  if (!c.doc && orig) c.doc = '';
  var matriz = c.matriz_id ? S.clientes.find(function(x){ return x.id === c.matriz_id; }) : null;
  function f(lb, req, campo){ return '<div class="fr"><label class="lb" for="cf_' + campo + '">' + lb + (req ? ' <span class="req">*</span>' : '') + '</label><div class="fv">'; }
  function inp(campo, extra, cls){ return '<input class="in ' + (cls||'') + '" id="cf_' + campo + '" data-f="' + campo + '" value="' + esc(campo === 'doc' ? fmtDoc(c[campo]) : campo === 'cep' ? fmtCep(c[campo]) : c[campo]) + '"' + (extra||'') + '>'; }
  var html = '<div class="row"><a class="btn sm" href="#clientes">← Clientes</a><h1 style="margin:4px 0">' + (novo ? 'Novo cliente' : 'Editar cliente') + '</h1></div>' +
    '<div class="card pad cform">' +
    '<h2 class="sec">Informações sobre o Cliente</h2>' +
    f('Razão Social', true, 'nome') + inp('nome', ' maxlength="150"') + '</div></div>' +
    f('Nome Fantasia', true, 'fantasia') + inp('fantasia', ' maxlength="150"') + '</div></div>' +
    f('CNPJ', false, 'doc') + '<div class="row nw">' + inp('doc', ' inputmode="numeric" placeholder="00.000.000/0000-00"', 'w-m') + '<button class="lnk" type="button" id="cfCnpj">Consultar CNPJ</button></div></div></div>' +
    f('Inscrição Estadual', false, 'ie') + inp('ie', '', 'w-m') + '</div></div>' +
    f('Código', false, 'codigo') + '<div class="row nw">' + inp('codigo', '', 'w-s') + '<button class="lnk big" type="button" id="cfCod">⟳ Gerar Código do Cliente</button></div></div></div>' +
    f('Matriz', false, 'matriz') + '<div class="row nw"><input class="in" id="cf_matriz" list="cfMatL" placeholder="Razão Social, Nome Fantasia, Código ou CNPJ/CPF" value="' + esc(nomeCli(matriz)) + '">' +
      '<datalist id="cfMatL">' + S.clientes.filter(function(x){ return x.id !== c.id; }).map(function(x){ return '<option value="' + esc(nomeCli(x)) + '">' + esc(fmtDoc(x.doc)) + '</option>'; }).join('') + '</datalist>' +
      '<button class="lnk big" type="button" id="cfMat">🔍 Procurar</button></div></div></div>' +
    f('Suframa', false, 'suframa') + inp('suframa', '', 'w-m') + '</div></div>' +
    '<h2 class="sec">Endereço e contato</h2>' +
    f('Endereço', false, 'endereco') + inp('endereco') + '</div></div>' +
    f('Bairro', false, 'bairro') + inp('bairro') + '</div></div>' +
    f('Número', false, 'numero') + inp('numero', '', 'w-s') + '</div></div>' +
    f('CEP', false, 'cep') + '<div class="row nw">' + inp('cep', ' inputmode="numeric" placeholder="00000-000"', 'w-s') + '<button class="lnk" type="button" id="cfCep">Consultar CEP</button></div></div></div>' +
    f('Cidade', false, 'cidade') + '<div id="cfCidW"></div></div></div>' +
    f('Estado', false, 'uf') + '<select class="in w-m" id="cf_uf" data-f="uf"><option value="">Selecione</option>' + UFS.map(function(u){ return '<option' + (c.uf === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></div></div>' +
    f('Telefone', false, 'telefone') + inp('telefone', ' inputmode="tel"', 'w-m') + '</div></div>' +
    f('Fax', false, 'fax') + inp('fax', ' inputmode="tel"', 'w-m') + '</div></div>' +
    f('Telefone Adicional', false, 'telefone2') + inp('telefone2', ' inputmode="tel"', 'w-m') + '</div></div>' +
    f('Site do Cliente', false, 'site') + inp('site', ' inputmode="url"') + '</div></div>' +
    f('E-mail', false, 'email') + inp('email', ' type="email" inputmode="email"') + '</div></div>' +
    f('Observações', false, 'obs') + '<textarea class="in" rows="4" id="cf_obs" data-f="obs">' + esc(c.obs) + '</textarea></div></div>' +
    f('Status', true, 'status') + '<select class="in w-m" id="cf_status" data-f="status"><option value="ativo"' + (c.status !== 'inativo' ? ' selected' : '') + '>Ativo</option><option value="inativo"' + (c.status === 'inativo' ? ' selected' : '') + '>Inativo</option></select></div></div>' +
    '</div>';
  casca(html, '<a class="btn" href="#clientes">Cancelar</a><button class="btn pri" id="cfSalvar">' + (novo ? 'Cadastrar cliente' : 'Salvar alterações') + '</button>');
  var el = function(id){ return document.getElementById(id); };
  function val(campo){ var e = el('cf_' + campo); return e ? e.value.trim() : ''; }
  function put(campo, v, forcar){ var e = el('cf_' + campo); if (!e || v == null || v === '') return; if (forcar || !e.value.trim()) e.value = v; }
  /* cidade: lista do IBGE por estado (guardada para usar offline); sem lista, campo livre */
  function montaCidades(atual){
    var uf = el('cf_uf').value, w = el('cfCidW');
    if (!uf){ w.innerHTML = '<select class="in w-l" id="cf_cidade" disabled><option>' + (atual ? esc(atual) : 'Selecione o Estado…') + '</option></select>'; if (atual) w.innerHTML = '<input class="in w-l" id="cf_cidade" value="' + esc(atual) + '">'; return; }
    w.innerHTML = '<select class="in w-l" id="cf_cidade" disabled><option>Carregando cidades…</option></select>';
    cidadesUF(uf).then(function(l){
      if (el('cf_uf').value !== uf) return;
      if (!l){ w.innerHTML = '<input class="in w-l" id="cf_cidade" placeholder="Digite a cidade" value="' + esc(atual) + '">'; return; }
      var a = semAcento(atual), achou = l.find(function(n){ return semAcento(n) === a; });
      w.innerHTML = '<select class="in w-l" id="cf_cidade"><option value="">Selecione a cidade…</option>' +
        (atual && !achou ? '<option selected>' + esc(atual) + '</option>' : '') +
        l.map(function(n){ return '<option' + (achou === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>';
    });
  }
  montaCidades(c.cidade || '');
  el('cf_uf').onchange = function(){ montaCidades(val('cidade')); };
  el('cf_doc').onblur = function(){ this.value = fmtDoc(this.value); };
  el('cf_cep').onblur = function(){ this.value = fmtCep(this.value); };
  el('cfCnpj').onclick = function(){
    var d = soNum(val('doc')), b = this;
    if (d.length !== 14){ toast('Digite os 14 números do CNPJ.'); return; }
    if (!navigator.onLine){ toast('A consulta de CNPJ precisa de internet.'); return; }
    var dup = S.clientes.find(function(x){ return x.id !== c.id && soNum(x.doc) === d; });
    if (dup) toast('Atenção: este CNPJ já está cadastrado (' + dup.nome + ').', 4000);
    b.disabled = true; b.textContent = 'Consultando…';
    fetch('https://brasilapi.com.br/api/cnpj/v1/' + d).then(function(r){ if (!r.ok) throw new Error(r.status === 404 ? 'CNPJ não encontrado na Receita.' : 'Consulta indisponível agora, tente de novo.'); return r.json(); }).then(function(j){
      put('nome', j.razao_social); put('fantasia', j.nome_fantasia || j.razao_social);
      put('endereco', [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ')); put('bairro', j.bairro); put('numero', j.numero);
      put('cep', fmtCep(j.cep)); put('telefone', j.ddd_telefone_1); put('telefone2', j.ddd_telefone_2); put('email', (j.email||'').toLowerCase());
      if (j.uf && !el('cf_uf').value){ el('cf_uf').value = j.uf; }
      if (j.municipio && !val('cidade')) montaCidades(j.municipio); else montaCidades(val('cidade'));
      var sit = j.descricao_situacao_cadastral; toast('Dados da Receita preenchidos' + (sit && sit !== 'ATIVA' ? ' · situação: ' + sit : '') + '. Confira e complete.', 4000);
    }).catch(function(e){ toast(e.message, 3500); }).then(function(){ b.disabled = false; b.textContent = 'Consultar CNPJ'; });
  };
  el('cfCep').onclick = function(){
    var cep = soNum(val('cep')), b = this;
    if (cep.length !== 8){ toast('Digite os 8 números do CEP.'); return; }
    if (!navigator.onLine){ toast('A consulta de CEP precisa de internet.'); return; }
    b.disabled = true; b.textContent = 'Consultando…';
    fetch('https://viacep.com.br/ws/' + cep + '/json/').then(function(r){ return r.json(); }).then(function(j){
      if (j.erro) throw new Error('CEP não encontrado.');
      put('endereco', j.logradouro, true); put('bairro', j.bairro, true);
      if (j.uf) el('cf_uf').value = j.uf; montaCidades(j.localidade || val('cidade'));
      toast('Endereço preenchido pelo CEP.');
    }).catch(function(e){ toast(e.message || 'Consulta indisponível agora.'); }).then(function(){ b.disabled = false; b.textContent = 'Consultar CEP'; });
  };
  el('cfCod').onclick = function(){
    var mx = 0; S.clientes.forEach(function(x){ var n = parseInt(soNum(x.codigo), 10); if (x.id !== c.id && n > mx) mx = n; });
    el('cf_codigo').value = String(mx + 1); toast('Código ' + (mx + 1) + ' gerado.');
  };
  function achaMatriz(t){
    t = semAcento(t).trim(); if (!t) return [];
    var n = soNum(t);
    return S.clientes.filter(function(x){ return x.id !== c.id && (semAcento(nomeCli(x)).indexOf(t) > -1 || (n.length >= 3 && soNum(x.doc).indexOf(n) > -1)); });
  }
  el('cfMat').onclick = function(){
    var r = achaMatriz(val('matriz'));
    if (!val('matriz')) r = S.clientes.filter(function(x){ return x.id !== c.id; });
    var m = modal('Escolher matriz', '<input class="in" id="mqM" placeholder="Razão Social, Nome Fantasia, Código ou CNPJ/CPF" value="' + esc(val('matriz')) + '"><div id="mlM" class="list"></div>');
    function lista(rr){ document.getElementById('mlM').innerHTML = rr.slice(0, 60).map(function(x){ return '<button class="card pad" style="text-align:left" data-mid="' + x.id + '"><b>' + esc(x.nome) + '</b><div class="muted" style="font-size:13px">' + esc([x.fantasia, x.codigo ? 'cód. ' + x.codigo : '', fmtDoc(x.doc), x.cidade].filter(Boolean).join(' · ')) + '</div></button>'; }).join('') || '<div class="card empty">Nenhum cliente encontrado.</div>';
      m.body.querySelectorAll('[data-mid]').forEach(function(b){ b.onclick = function(){ var x = S.clientes.find(function(y){ return y.id === b.dataset.mid; }); el('cf_matriz').value = nomeCli(x); m.ov.remove(); document.body.style.overflow = ''; }; }); }
    lista(r);
    document.getElementById('mqM').oninput = function(){ lista(this.value.trim() ? achaMatriz(this.value) : S.clientes.filter(function(x){ return x.id !== c.id; })); };
  };
  el('cfSalvar').onclick = function(){
    var d = { nome: val('nome'), fantasia: val('fantasia'), doc: soNum(val('doc')), ie: val('ie'), codigo: val('codigo'), suframa: val('suframa'),
      endereco: val('endereco'), bairro: val('bairro'), numero: val('numero'), cep: soNum(val('cep')), cidade: val('cidade'), uf: el('cf_uf').value,
      telefone: val('telefone'), fax: val('fax'), telefone2: val('telefone2'), site: val('site'), email: val('email'), obs: el('cf_obs').value.trim(), status: el('cf_status').value };
    if (!d.nome){ toast('Preencha a Razão Social.'); el('cf_nome').focus(); return; }
    if (!d.fantasia){ toast('Preencha o Nome Fantasia.'); el('cf_fantasia').focus(); return; }
    if (d.doc && d.doc.length !== 14 && d.doc.length !== 11){ toast('CNPJ incompleto: confira os números.'); el('cf_doc').focus(); return; }
    if (d.doc && S.clientes.some(function(x){ return x.id !== c.id && soNum(x.doc) === d.doc; })){ toast('Já existe um cliente com este CNPJ.', 3500); return; }
    if (d.codigo && S.clientes.some(function(x){ return x.id !== c.id && String(x.codigo||'') === d.codigo; })){ toast('Este código já é de outro cliente. Gere outro.', 3500); return; }
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)){ toast('E-mail inválido.'); return; }
    var mt = val('matriz'), mx = null;
    if (mt){ mx = S.clientes.find(function(x){ return x.id !== c.id && nomeCli(x) === mt; }); if (!mx){ var r = achaMatriz(mt); if (r.length === 1) mx = r[0]; }
      if (!mx){ toast('Matriz não encontrada: use “Procurar” para escolher.', 3500); return; } }
    d.matriz_id = mx ? mx.id : null;
    var alvo = orig || { id: uuid(), _novo: true, confirmado: true, vendedor_codigo: S.perfil && S.perfil.codigo, criado_em: new Date().toISOString() };
    Object.assign(alvo, d); delete alvo._erro;
    if (!orig) S.clientes.push(alvo);
    if (S.cfila.indexOf(alvo.id) < 0) S.cfila.push(alvo.id);
    salvarLocal().then(function(){
      toast(novo ? 'Cliente cadastrado.' : 'Cliente atualizado.' + (navigator.onLine ? '' : ' Sobe quando a internet voltar.'));
      location.hash = '#clientes'; sincronizar();
    });
  };
}

/* ----- mais ----- */
function telaMais(){
  var n = S.fila.length;
  casca('<h1>Mais</h1><div class="card pad"><div class="kv">' +
    '<span>Usuário</span><span>' + esc(S.perfil.nome) + ' (' + esc(S.sess.user.email) + ')</span>' +
    '<span>Perfil</span><span>' + (souAdmin() ? 'Administrador — vê todos os pedidos' : 'Vendedor — vê os seus pedidos') + '</span>' +
    '<span>Catálogo</span><span>atualizado em ' + esc(S.cat ? S.cat.gerado : '—') + '</span>' +
    '<span>Última sincronização</span><span>' + (S.lastSync ? dataBR(S.lastSync) : '—') + '</span>' +
    '<span>Aguardando envio</span><span>' + n + ' pedido(s)</span></div>' +
    '<div class="row" style="margin-top:14px"><button class="btn pri" id="mSync">Sincronizar agora</button><button class="btn" id="mFotos">Baixar fotos para usar offline</button></div>' +
    '<div id="mFotosSt" class="muted" style="font-size:13px;margin-top:8px"></div></div>' +
    '<h2>Instalar no celular ou computador</h2><div class="card pad" style="font-size:14px">' +
    '<b>Android / computador (Chrome ou Edge):</b> menu ⋮ → <i>Instalar app</i> (ou ícone de instalar na barra de endereço).<br>' +
    '<b>iPhone (Safari):</b> botão Compartilhar → <i>Adicionar à Tela de Início</i>.<br>' +
    '<span class="muted">Depois de instalado e com as fotos baixadas, o app abre e lança pedidos sem internet.</span></div>' +
    '<div class="row" style="margin-top:18px"><button class="btn bad" id="mSair">Sair</button></div>');
  document.getElementById('mSync').onclick = function(){ sincronizar(true); };
  document.getElementById('mFotos').onclick = baixarFotos;
  document.getElementById('mSair').onclick = function(){
    if (S.fila.length && !confirm('Há ' + S.fila.length + ' pedido(s) ainda não enviados. Se sair agora, eles serão perdidos. Sair mesmo assim?')) return;
    S.sess = null; S.perfil = null; S.pedidos = {}; S.clientes = []; S.fila = []; S.cfila = [];
    lsSet('cv_sess', null); lsSet('cv_perfil', null); lsSet('cv_lastsync', null); salvarLocal(); render();
  };
}
function baixarFotos(){
  var st = document.getElementById('mFotosSt');
  if (!('caches' in window)){ st.textContent = 'Este navegador não permite guardar fotos offline.'; return; }
  var urls = {}; S.cat.grupos.forEach(function(g){ g.marcas.forEach(function(m){ m.itens.forEach(function(i){ if (i.img) urls[i.img] = 1; }); }); });
  urls = Object.keys(urls); var feitos = 0, falhas = 0;
  caches.open('cv-img-v1').then(function(c){
    var idx = 0;
    function prox(){
      if (idx >= urls.length) return Promise.resolve();
      var u = urls[idx++];
      return c.match(u).then(function(hit){ return hit ? null : c.add(u); }).then(function(){ feitos++; }, function(){ falhas++; }).then(function(){
        st.textContent = 'Fotos: ' + feitos + ' de ' + urls.length + (falhas ? ' · ' + falhas + ' falharam' : ''); return prox();
      });
    }
    return Promise.all([prox(), prox(), prox(), prox()]);
  }).then(function(){ st.textContent = '✓ ' + feitos + ' fotos guardadas para uso offline' + (falhas ? ' (' + falhas + ' falharam — tente de novo com internet)' : '') + '.'; });
}

/* ----- fotos dos itens para o PDF (convertidas em JPEG e guardadas na memória) ----- */
var FOTOS = {};
function fotoJpeg(url){
  if (FOTOS[url] !== undefined) return Promise.resolve(FOTOS[url]);
  return new Promise(function(res){
    var im = new Image(), fim = false;
    function ok(v){ if (fim) return; fim = true; FOTOS[url] = v; res(v); }
    im.onload = function(){
      try {
        var r = Math.min(1, 220 / Math.max(im.naturalWidth, im.naturalHeight));
        var w = Math.max(1, Math.round(im.naturalWidth * r)), h = Math.max(1, Math.round(im.naturalHeight * r));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h);
        ok({ url: c.toDataURL('image/jpeg', 0.85), w: w, h: h });
      } catch(e){ ok(null); }
    };
    im.onerror = function(){ ok(null); };
    setTimeout(function(){ if (!fim){ fim = true; res(null); } }, 8000); // sem internet: segue sem a foto (tenta de novo depois)
    im.src = url;
  });
}
function fotosDoPedido(p){ return (p.itens || []).map(function(e){ var u = imgDe(p.grupo, e.cod); return u === 'company.png' ? null : u; }); }
function fotosProntas(p){ return fotosDoPedido(p).every(function(u){ return !u || FOTOS[u] !== undefined; }); }
function comFotos(p, fn){ if (fotosProntas(p)) fn(); else { toast('Preparando fotos do PDF…'); prepararFotos(p).then(fn); } }
function prepararFotos(p){ return Promise.all(fotosDoPedido(p).map(function(u){ return u ? fotoJpeg(u) : null; })); }

/* ----- PDF espelho ----- */
function montarPdf(p, modo){
  var fab = modo === 'fabrica';
  var tot = totalItens(p.itens);
  var RED = '#b8821e', DARK = '#1b1b1d', MUTED = '#6c6c70', LINE = '#dcd9d3', SOFT = '#f6f5f2';
  var doc = new PdfDoc(), M = 36, W = doc.W, CW = W - 2*M, BOTTOM = doc.H - 58, d = new Date();
  var dateStr = p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear()+' às '+p2(d.getHours())+':'+p2(d.getMinutes());
  var comp = logoToJpeg(document.getElementById('compLogo'), 500);
  if (comp){ var ch = 50, cw = comp.w * ch / comp.h; doc.image(doc.addJpeg(comp.url, comp.w, comp.h), M, M - 6, cw, ch); }
  var g = grupo(p.grupo), c = p.cliente || {};
  var rl = logoRep(p.grupo);
  if (rl){ var lh = 46, lw = rl.w * lh / rl.h; if (lw > 150){ lw = 150; lh = rl.h * lw / rl.w; }
    doc.image(doc.addJpeg(rl.url, rl.w, rl.h), W/2 - lw/2, M - 6 + (50 - lh)/2, lw, lh); }
  doc.text(W - M, M + 10, (g ? g.nome : p.grupo).toUpperCase(), { size: 12, bold: true, color: RED, align: 'right' });
  doc.text(W - M, M + 24, 'Política: ' + politicaNome(p.grupo, p.politica), { size: 8.5, color: MUTED, align: 'right' });
  var y = 104;
  doc.text(M, y, fab ? 'PEDIDO DE VENDA' : 'ESPELHO DO PEDIDO', { size: 18, bold: true, color: RED });
  doc.text(M, y + 14, fab ? 'Pedido enviado pela Company Representações' : 'Para conferência e aprovação do cliente · ' + (STATUS_NOME[p.status] || p.status), { size: 8.5, color: MUTED });
  doc.text(W - M, y - 2, 'Nº ' + p.numero, { size: 11, bold: true, align: 'right' });
  doc.text(W - M, y + 12, 'Emitido em ' + dateStr, { size: 8.5, color: MUTED, align: 'right' });
  y += 24; doc.rect(M, y, CW, 2, RED); y += 12;
  function field(x, yy, label, value, w){
    doc.text(x, yy, label.toUpperCase(), { size: 6.8, bold: true, color: MUTED });
    var lines = pdfWrap(value || '—', true, 9.5, w);
    doc.text(x, yy + 12, lines[0] + (lines.length > 1 ? '…' : ''), { size: 9.5, bold: true, color: DARK });
  }
  var boxH = 18 + 3*28 + 4, colW = (CW - 20) / 3, fx = M + 10, fy = y + 32;
  doc.rect(M, y, CW, boxH, null, LINE, 0.8); doc.rect(M, y, CW, 18, SOFT); doc.line(M, y+18, M+CW, y+18, LINE, 0.8);
  doc.text(M + 10, y + 12.5, 'DADOS DO CLIENTE', { size: 8, bold: true, color: RED });
  field(fx, fy, 'Cliente / Razão social', c.name, 2*colW - 10); field(fx + 2*colW, fy, 'Prazo de pagamento', p.prazo, colW - 10); fy += 28;
  field(fx, fy, 'CNPJ / CPF', c.doc, colW - 10); field(fx + colW, fy, 'Telefone / WhatsApp', c.phone, colW - 10); field(fx + 2*colW, fy, 'Cidade / UF', c.city, colW - 10); fy += 28;
  field(fx, fy, 'Transportadora', c.carrier, colW - 10);
  field(fx + colW, fy, 'Representante', 'Company Representações · ' + (CFG.vendedores[p.vendedor_codigo] || '') + ' ' + (CFG.fones[p.vendedor_codigo] || ''), 2*colW - 10);
  y += boxH + 16;
  var cols = [{t:'#',w:16,a:'center'},{t:'FOTO',w:40,a:'center'},{t:'CÓDIGO',w:64,a:'left'},{t:'DESCRIÇÃO',w:0,a:'left'},{t:'QTD',w:24,a:'right'},{t:'R$ TABELA',w:58,a:'right'},{t:'DESCONTO',w:52,a:'center'},{t:'PREÇO FINAL',w:56,a:'right'},{t:'TOTAL',w:60,a:'right'}];
  cols[3].w = CW - cols.reduce(function(s,x){ return s + x.w; }, 0);
  var PAD = 5;
  function colX(i){ var x = M; for (var k=0;k<i;k++) x += cols[k].w; return x; }
  function head(){ doc.rect(M, y, CW, 18, RED); cols.forEach(function(cc,i){ var x = cc.a==='right' ? colX(i)+cc.w-PAD : cc.a==='center' ? colX(i)+cc.w/2 : colX(i)+PAD; doc.text(x, y+12, cc.t, { size: 7.5, bold: true, color: '#ffffff', align: cc.a }); }); y += 18; }
  head();
  var tq = 0, somaTab = 0;
  p.itens.forEach(function(e, idx){
    var desc = e.desc + (e.label ? ' — ' + e.label : '') + (e.marca ? ' (' + e.marca + ')' : '');
    var lines = pdfWrap(desc, false, 8.5, cols[3].w - 2*PAD), rowH = Math.max(44, lines.length*10.5 + 8);
    if (y + rowH > BOTTOM){ doc.addPage(); y = M; doc.text(M, y+8, (fab ? 'Pedido ' : 'Espelho ') + p.numero + ' · ' + (c.name||'') + ' (continuação)', { size: 8.5, bold: true, color: MUTED }); y += 18; head(); }
    if (idx % 2) doc.rect(M, y, CW, rowH, SOFT);
    var b = y + 12;
    doc.text(colX(0)+cols[0].w/2, b, String(idx+1), { size: 8.5, color: MUTED, align: 'center' });
    var ft = FOTOS[imgDe(p.grupo, e.cod)];
    if (ft){ var bx = 36, sc = Math.min(bx / ft.w, bx / ft.h), iw = ft.w * sc, ih = ft.h * sc;
      doc.image(doc.addJpeg(ft.url, ft.w, ft.h), colX(1) + (cols[1].w - iw)/2, y + 4 + (bx - ih)/2, iw, ih); }
    pdfWrap(e.cod, true, 8, cols[2].w - 2*PAD).forEach(function(l, li){ doc.text(colX(2)+PAD, b + li*10, l, { size: 8, bold: true }); });
    lines.forEach(function(l, li){ doc.text(colX(3)+PAD, b + li*10.5, l, { size: 8.5 }); });
    doc.text(colX(4)+cols[4].w-PAD, b, String(e.qty), { size: 8.5, bold: true, align: 'right' });
    var pi = precoInfo(p, e); if (pi.tab){ somaTab += pi.tab*e.qty; } else { somaTab += e.unit*e.qty; }
    doc.text(colX(5)+cols[5].w-PAD, b, pi.tab ? fmt(pi.tab) : '—', { size: 8, color: MUTED, align: 'right' });
    var dl = pdfWrap(pi.desc || '—', true, 7.5, cols[6].w - 4); dl.forEach(function(l, li){ doc.text(colX(6)+cols[6].w/2, b + li*9, l, { size: 7.5, bold: true, color: RED, align: 'center' }); });
    doc.text(colX(7)+cols[7].w-PAD, b, fmt(e.unit), { size: 8.5, bold: true, align: 'right' });
    doc.text(colX(8)+cols[8].w-PAD, b, fmt(r2(e.qty*e.unit)), { size: 8.5, bold: true, align: 'right' });
    y += rowH; doc.line(M, y, M+CW, y, LINE, 0.5); tq += e.qty;
  });
  var obs = p.obs ? pdfWrap(p.obs, false, 9, CW - 20) : [];
  if (y + 60 + (obs.length ? obs.length*12 + 34 : 0) + 70 > BOTTOM){ doc.addPage(); y = M; }
  y += 10; var tw = 220;
  doc.rect(W - M - tw, y, tw, 40, SOFT, LINE, 0.8);
  doc.text(W - M - tw + 10, y + 14, p.itens.length + (p.itens.length === 1 ? ' item' : ' itens') + ' · ' + tq + ' peças', { size: 8, color: MUTED });
  doc.text(W - M - tw + 10, y + 31, 'TOTAL DO PEDIDO', { size: 9, bold: true });
  doc.text(W - M - 10, y + 31, fmt(tot), { size: 14, bold: true, color: RED, align: 'right' });
  doc.text(M, y + 14, 'Prazo de pagamento: ' + (p.prazo || '—'), { size: 8.5, bold: true, color: RED });
  doc.text(M, y + 26, 'Política ' + politicaNome(p.grupo, p.politica) + ' · Total em preço de tabela ' + fmt(somaTab) + ' · Descontos ' + fmt(Math.max(0, somaTab - tot)), { size: 8, color: MUTED });
  if (eAvista(p)){ doc.text(M, y + 40, 'Preços já com ' + avistaDe(p).desc + '% de desconto à vista (sem o desconto: ' + fmt(totBruto(p)) + ')', { size: 9, bold: true, color: RED }); y += 8; }
  y += 56;
  if (obs.length){ doc.text(M, y, 'OBSERVAÇÕES', { size: 7.5, bold: true, color: RED }); y += 6; var oh = obs.length*12 + 12; doc.rect(M, y, CW, oh, null, LINE, 0.8); obs.forEach(function(l,i){ doc.text(M+10, y+15+i*12, l, { size: 9 }); }); y += oh + 16; }
  y = Math.max(y + 30, Math.min(BOTTOM - 20, y + 40)); var sw = (CW - 40)/2;
  doc.line(M, y, M+sw, y, '#9a9892', 0.7); doc.line(M+sw+40, y, M+CW, y, '#9a9892', 0.7);
  doc.text(M+sw/2, y+11, 'De acordo — cliente', { size: 8, color: MUTED, align: 'center' });
  doc.text(M+sw+40+sw/2, y+11, 'Company Representações', { size: 8, color: MUTED, align: 'center' });
  var np = doc.pages.length;
  doc.pages.forEach(function(ops, i){ doc.ops = ops; doc.line(M, doc.H-40, W-M, doc.H-40, LINE, 0.6);
    doc.text(M, doc.H-28, fab ? 'Company Representações · ' + (CFG.vendedores[p.vendedor_codigo] || '') + ' ' + (CFG.fones[p.vendedor_codigo] || '') : 'Espelho sujeito a confirmação de estoque e aprovação da fábrica.', { size: 7, color: MUTED });
    doc.text(W-M, doc.H-28, 'Página ' + (i+1) + ' de ' + np, { size: 7, color: MUTED, align: 'right' }); });
  var bytes = doc.output();
  var nome = (fab ? 'pedido-' : 'espelho-') + p.numero + '-' + String(c.name||'cliente').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '.pdf';
  var file = null; try { file = new File([bytes], nome, { type: 'application/pdf' }); } catch(e){}
  return { bytes: bytes, nome: nome, file: file };
}
function ehCelular(){ return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1); }
function podeCompartilhar(file){ return !!(ehCelular() && file && navigator.canShare && navigator.canShare({ files: [file] })); }
function baixarPdf(r){
  var url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
  var a = document.createElement('a'); a.href = url; a.download = r.nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}
function gerarEspelho(p){
  var r = montarPdf(p), bytes = r.bytes, nome = r.nome, file = r.file;
  if (podeCompartilhar(file)){
    navigator.share({ files: [file], title: 'Espelho ' + p.numero, text: 'Segue o espelho do pedido ' + p.numero + ' para sua aprovação.' }).catch(function(){});
  } else {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    var a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    toast('PDF do espelho salvo em Downloads.');
  }
  if (p.status === 'recebido' || p.status === 'em_revisao'){
    if (confirm('Marcar o pedido como “Espelho enviado” e salvar?')){ ED.p.status = 'espelho_enviado'; salvarPedido(); }
  }
}

/* ----- enviar por WhatsApp (espelho em PDF para o cliente) ----- */
function foneWa(f){ var n = soNum(f); if (!n) return ''; if (n.length <= 11) n = '55' + n; return n; }
function enviarWhatsApp(p){
  var r = montarPdf(p);
  if (podeCompartilhar(r.file)){
    // celular: abre a lista de apps com o PDF; escolha o WhatsApp e depois a quem enviar
    navigator.share({ files: [r.file], title: 'Pedido ' + p.numero }).catch(function(){});
  } else {
    // computador: baixa o PDF e só abre o WhatsApp (sem entrar em conversa)
    baixarPdf(r);
    var saiu = false, marca = function(){ saiu = true; };
    window.addEventListener('blur', marca);
    location.href = 'whatsapp://';
    setTimeout(function(){
      window.removeEventListener('blur', marca);
      modal('Enviar por WhatsApp', '<p>O PDF <b>' + esc(r.nome) + '</b> foi salvo na pasta <b>Downloads</b>.</p>' +
        '<p>No WhatsApp, abra a conversa de quem vai receber, clique no <b>clipe 📎</b> → <b>Documento</b> e escolha o PDF.</p>' +
        (saiu ? '' : '<p class="muted">Se o WhatsApp do computador não abriu, use o WhatsApp Web:</p>') +
        '<div class="row" style="gap:8px;margin-top:10px"><a class="btn wa" style="background:#25d366;border-color:#1ea952;color:#fff" href="https://web.whatsapp.com/" target="_blank" rel="noopener">Abrir WhatsApp Web</a></div>');
    }, 1500);
  }
  if (p.status === 'recebido' || p.status === 'em_revisao'){
    if (confirm('Marcar o pedido como “Espelho enviado” e salvar?')){ ED.p.status = 'espelho_enviado'; salvarPedido(); }
  }
}

/* ----- enviar por e-mail (pedido em PDF para a indústria) ----- */
function clienteDoPedido(p){
  var c = p.cliente || {}, d = soNum(c.doc);
  return S.clientes.find(function(x){ return (d && soNum(x.doc) === d) || (c.name && x.nome === c.name); }) || null;
}
function jaEnviado(p){ return p.status === 'enviado_fabrica' || p.status === 'faturado'; }
function emailsLista(t){ return String(t||'').split(/[,;\s]+/).map(function(x){ return x.trim(); }).filter(Boolean); }
function telaEmail(p){
  var c = p.cliente || {}, cad = clienteDoPedido(p), g = grupo(p.grupo);
  var ind = lsGet('cv_emails_ind', {});
  var cliMails = emailsLista(cad && cad.email);
  function repMails(gid){ var r = acharRep(gid), l = emailsLista(r && r.dados && r.dados.email_pedidos);
    emailsLista(ind[gid]).forEach(function(x){ if (l.indexOf(x) < 0 && cliMails.indexOf(x) < 0) l.push(x); }); return l; }
  var para = lsGet('cv_email_para', 'ambos');
  function destPadrao(gid){
    var l = [], add = function(x){ if (l.map(function(y){ return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) l.push(x); };
    if (para !== 'cliente') repMails(gid).forEach(add);
    if (para !== 'rep') cliMails.forEach(add);
    return l.join(',');
  }
  function infoMails(gid){
    var r = repMails(gid), gg = grupo(gid);
    return '<div class="mail-who"><div><b>Representada (' + esc(gg ? gg.nome : gid) + '):</b> ' + (r.length ? esc(r.join(', ')) : '<span class="warn-t">sem e-mail cadastrado — cadastre em Representadas › E-mail para envio de pedidos</span>') + '</div>' +
      '<div><b>Cliente:</b> ' + (cliMails.length ? esc(cliMails.join(', ')) : '<span class="warn-t">sem e-mail no cadastro do cliente</span>') + '</div></div>';
  }
  function assunto(gid){ var gg = grupo(gid); return 'Pedido Nº ' + p.numero + ' - ' + (gg ? gg.nome : gid); }
  var tot = totalItens(p.itens);
  var m = modal('Pedidos · Enviar por e-mail',
    '<div style="overflow:auto"><table class="tb"><thead><tr><th>Pedido</th><th>Nome fantasia (cliente)</th><th>Razão social (cliente)</th><th>Indústria</th><th class="r">Valor líquido (R$)</th><th class="r">Valor total (R$)</th><th>Já enviado?</th></tr></thead>' +
    '<tbody><tr><td><b>' + esc(p.numero) + '</b></td><td>' + esc(cad && cad.fantasia || '—') + '</td><td>' + esc(c.name || '—') + '</td><td id="mInd">' + esc(g ? g.nome : p.grupo) + '</td>' +
    '<td class="r">' + fmt(tot).replace('R$ ', '') + '</td><td class="r">' + fmt(tot).replace('R$ ', '') + '</td><td>' + (jaEnviado(p) ? 'Sim' : 'Não') + '</td></tr></tbody></table></div>' +
    '<h3 style="margin:18px 0 4px;font-size:16px">Informações para envio</h3>' +
    '<label class="lb">Cliente</label><input class="in" value="' + esc(c.name) + '" disabled>' +
    '<label class="lb">Indústria</label><select class="in" id="mG">' + S.cat.grupos.map(function(x){ return '<option value="' + x.id + '"' + (x.id === p.grupo ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select>' +
    '<label class="lb">Enviar para</label><div class="chips wrap" id="mPara2">' + [['rep','Só a representada'],['ambos','Representada e cliente'],['cliente','Só o cliente']].map(function(o){ return '<button type="button" class="chip" data-para="' + o[0] + '" aria-pressed="' + (para === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
    '<div id="mWho">' + infoMails(p.grupo) + '</div>' +
    '<label class="lb">Destinatário(s) *</label><textarea class="in" id="mPara" rows="2" placeholder="pedidos@fabrica.com.br, cliente@email.com">' + esc(destPadrao(p.grupo)) + '</textarea>' +
    '<div class="muted" style="font-size:12px;margin-top:3px">Adicione vários e-mails separados por vírgula. Preenchido conforme a escolha acima; você pode acrescentar outros e-mails separados por vírgula.</div>' +
    '<label class="lb">Assunto do e-mail *</label><input class="in" id="mAss" value="' + esc(assunto(p.grupo)) + '">' +
    '<label class="lb">Mensagem</label><textarea class="in" id="mMsg" rows="5">Olá,\n\nSegue em anexo o pedido Nº ' + esc(p.numero) + ' do cliente ' + esc(c.name || '') + ' (' + esc(fmt(tot)) + ').\n\nAtenciosamente,\n' + esc(CFG.vendedores[p.vendedor_codigo] || '') + ' · Company Representações\n' + esc(CFG.fones[p.vendedor_codigo] || '') + '</textarea>' +
    '<label class="lb">Enviar pelo</label><select class="in" id="mVia"><option value="direto"' + (lsGet('cv_email_via', CFG.emailDireto ? 'direto' : 'gmail') === 'direto' ? ' selected' : '') + '>Programa — envio direto com PDF anexado e confirmação de leitura</option>' + (ehCelular() ? '<option value="app">App de e-mail do celular</option></select>' : '') +
    (ehCelular() ? '' : '<option value="gmail"' + (lsGet('cv_email_via','gmail') === 'gmail' ? ' selected' : '') + '>Gmail (no navegador)</option><option value="app"' + (lsGet('cv_email_via','gmail') === 'app' ? ' selected' : '') + '>Programa de e-mail do computador (Outlook etc.)</option></select>') +
    '<div class="row" style="margin-top:16px;gap:8px;flex-wrap:wrap"><button class="btn pri" id="mEnv">✉ Enviar</button><button class="btn" id="mEnvNovo">✉ Enviar e novo pedido</button><span class="muted">ou</span><button class="btn sm" id="mCanc">Cancelar</button></div>');
  var el = function(id){ return m.body.querySelector('#' + id); };
  m.body.querySelectorAll('[data-para]').forEach(function(b){ b.onclick = function(){ para = b.dataset.para; lsSet('cv_email_para', para); m.body.querySelectorAll('[data-para]').forEach(function(x){ x.setAttribute('aria-pressed', x === b); }); el('mPara').value = destPadrao(el('mG').value); }; });
  el('mG').onchange = function(){ var gid = this.value, gg = grupo(gid); el('mPara').value = destPadrao(gid); el('mWho').innerHTML = infoMails(gid); el('mAss').value = assunto(gid); el('mInd').textContent = gg ? gg.nome : gid; };
  el('mCanc').onclick = function(){ m.ov.remove(); document.body.style.overflow = ''; };
  function enviar(novo){
    var para = emailsLista(el('mPara').value), ass = el('mAss').value.trim(), msg = el('mMsg').value, gid = el('mG').value;
    if (!para.length){ toast('Informe pelo menos um destinatário.'); return; }
    var ruim = para.filter(function(x){ return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
    if (ruim.length){ toast('E-mail inválido: ' + ruim.join(', ')); return; }
    if (!ass){ toast('Informe o assunto do e-mail.'); return; }
    // guarda os e-mails da indústria (sem o do cliente) para os próximos pedidos
    var rcad = acharRep(gid), rl = emailsLista(rcad && rcad.dados && rcad.dados.email_pedidos).map(function(x){ return x.toLowerCase(); }), cl = cliMails.map(function(x){ return x.toLowerCase(); });
    var extras = para.filter(function(x){ return rl.indexOf(x.toLowerCase()) < 0 && cl.indexOf(x.toLowerCase()) < 0; });
    if (extras.length) { ind[gid] = extras.join(','); lsSet('cv_emails_ind', ind); }
    var via = el('mVia') ? el('mVia').value : 'app'; lsSet('cv_email_via', via);
    if (via === 'direto'){
      var bt = el('mEnv'), bt2 = el('mEnvNovo'); bt.disabled = bt2.disabled = true; bt.textContent = 'Enviando…';
      enviarDireto(p, para, ass, msg, gid).then(function(j){
        var rs = j.resultados || [], ok = rs.filter(function(x){ return x.ok; }), ruins = rs.filter(function(x){ return !x.ok; });
        m.ov.remove(); document.body.style.overflow = '';
        if (ruins.length) alert('Enviado para ' + ok.length + ' de ' + rs.length + '.\nNão foi para: ' + ruins.map(function(x){ return x.destinatario + ' (' + String(x.erro||'').slice(0,80) + ')'; }).join('\n'));
        else toast('✓ E-mail enviado para ' + ok.length + ' destinatário' + (ok.length > 1 ? 's' : '') + '. Acompanhe a leitura na aba E-mails.', 5000);
        sincronizar();
        if (ok.length && !jaEnviado(p) && p.status !== 'cancelado' && confirm('Marcar o pedido como “Enviado à fábrica” e salvar?')){ ED.p.status = 'enviado_fabrica'; salvarPedido(); }
        if (novo) setTimeout(function(){ location.hash = '#novo'; }, 300);
      }, function(err){
        bt.disabled = bt2.disabled = false; bt.textContent = '✉ Enviar';
        alert('Não foi possível enviar direto: ' + err.message + '\n\nVocê pode escolher “Gmail” em “Enviar pelo” e enviar do jeito anterior.');
      });
      return;
    }
    var r = montarPdf(p, 'fabrica');
    if (podeCompartilhar(r.file)){
      // celular: abre a lista de apps (escolha Gmail/Outlook) com o PDF anexado; os destinatários vão copiados
      try { navigator.clipboard && navigator.clipboard.writeText(para.join(', ')); } catch(e){}
      navigator.share({ files: [r.file], title: ass, text: msg }).catch(function(){});
      toast('Escolha o Gmail ou Outlook. Os destinatários foram copiados: cole no campo “Para”.', 6000);
    } else {
      baixarPdf(r);
      var corpo = msg + '\n\n[Anexe o arquivo ' + r.nome + ', que está na pasta Downloads]';
      var url = via === 'gmail'
        ? 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(para.join(',')) + '&su=' + encodeURIComponent(ass) + '&body=' + encodeURIComponent(corpo)
        : 'mailto:' + para.join(',') + '?subject=' + encodeURIComponent(ass) + '&body=' + encodeURIComponent(corpo);
      if (via === 'gmail') window.open(url, '_blank'); else location.href = url;
      toast('E-mail aberto com destinatários e assunto. Anexe o PDF ' + r.nome + ' (pasta Downloads) e clique em Enviar.', 8000);
    }
    m.ov.remove(); document.body.style.overflow = '';
    if (!jaEnviado(p) && p.status !== 'cancelado' && confirm('Marcar o pedido como “Enviado à fábrica” e salvar?')){ ED.p.status = 'enviado_fabrica'; salvarPedido(); }
    if (novo) setTimeout(function(){ location.hash = '#novo'; }, 300);
  }
  el('mEnv').onclick = function(){ enviar(false); };
  el('mEnvNovo').onclick = function(){ enviar(true); };
}

/* ---------- produtos: consulta rápida de preços ---------- */
function telaProdutos(arg){
  if (arg && grupo(decodeURIComponent(arg))){ var gid0 = decodeURIComponent(arg); if (!S.fPr || S.fPr.grupo !== gid0) S.fPr = { grupo: gid0, pol: '', marca: '', cat: '', sub: '', q: '', so: false }; S.fPrDe = gid0; }
  else if (!arg) S.fPrDe = '';
  if (!S.cat || !S.cat.grupos || !S.cat.grupos.length){ casca('<h1>Produtos</h1><div class="card empty">O catálogo ainda não foi carregado neste aparelho. Conecte à internet e abra de novo.</div>'); return; }
  var grs = S.cat.grupos.slice().sort(function(a, b){ return a.nome.localeCompare(b.nome, 'pt'); });
  var st = S.fPr = S.fPr || { grupo: grs[0].id, pol: '', marca: '', cat: '', sub: '', q: '', so: false };
  var g = grupo(st.grupo) || grs[0]; st.grupo = g.id;
  if (!g.politicas.some(function(x){ return x.id === st.pol; })) st.pol = g.politicas[0].id;
  if (!g.marcas.some(function(x){ return x.id === st.marca; })) st.marca = g.marcas[0].id;
  var pid = st.pol, mar = g.marcas.find(function(x){ return x.id === st.marca; });
  var mainCat = function(i){ return String(i.cat || 'Outros').split(' · ')[0]; };
  var subCat = function(i){ var p = String(i.cat || '').split(' · '); return p.length > 1 ? p.slice(1).join(' · ') : ''; };
  var catsDe = function(m, fn, filtro){ var o = [], c = {}; m.itens.forEach(function(i){ if (filtro && !filtro(i)) return; var k = fn(i); if (!k) return; if (!(k in c)){ c[k] = 0; o.push(k); } c[k]++; }); return o.map(function(k){ return { nome: k, n: c[k] }; }); };
  var isTag = st.cat.indexOf('#tag:') === 0, tagSel = isTag ? st.cat.slice(5) : '';
  var q = st.q.toLowerCase().trim(), cats = catsDe(mar, mainCat), tags = catsDe(mar, function(i){ return i.tag || ''; }), subs = st.cat && !isTag ? catsDe(mar, subCat, function(i){ return mainCat(i) === st.cat; }) : [];
  var pool = q ? g.marcas.reduce(function(a, mm){ return a.concat(mm.itens.map(function(i){ return { i: i, m: mm }; })); }, []) : mar.itens.map(function(i){ return { i: i, m: mar }; });
  var itens = pool.filter(function(x){
    if (st.so && !x.i.av[pid]) return false;
    if (!q && isTag && x.i.tag !== tagSel) return false;
    if (!q && st.cat && !isTag && mainCat(x.i) !== st.cat) return false;
    if (!q && st.sub && subCat(x.i) !== st.sub) return false;
    return !q || (x.i.cod + ' ' + x.i.desc + ' ' + x.i.cat).toLowerCase().indexOf(q) > -1;
  });
  var total = itens.length, LIM = 300; itens = itens.slice(0, LIM);
  var card = function(x){
    var it = x.i, pr = it.p[pid], av = it.av[pid], tiers = it.tiers && it.tiers[pid], o = it.o && it.o[pid];
    var desc = o && pr ? Math.round((1 - pr/o) * 1000)/10 : 0;
    return '<div class="card pr-card' + (av ? '' : ' unav') + '"><div class="pr-img"><img src="' + esc(it.img || 'company.png') + '" loading="lazy" alt="" onerror="this.src=\'company.png\'">' + (av ? '' : '<span class="pr-ind">INDISPONÍVEL</span>') + '</div>' +
      '<div class="pr-b"><div class="pr-cod"><b>' + esc(it.cod) + '</b>' + (it.tag ? '<span class="tag">' + esc(it.tag) + '</span>' : '') + '</div>' +
      '<div class="pr-desc">' + esc(it.desc) + '</div>' + (q && g.marcas.length > 1 ? '<div class="muted" style="font-size:11.5px">' + esc(x.m.nome) + ' · ' + esc(mainCat(it)) + '</div>' : '') +
      (tiers ? '<div class="pr-tiers">' + tiers.map(function(t){ return '<span>' + esc(t.label) + ' <b>' + fmt(t.unit) + '</b></span>'; }).join('') + '</div>'
        : '<div class="pr-val">' + precoComTabela(g.id, pid, it) + '</div>') +
      (it.cores ? '<div class="muted" style="font-size:11.5px">Cores: ' + esc(it.cores.join(', ')) + '</div>' : '') +
      '</div></div>';
  };
  var lista = '';
  if (q) lista = '<div class="pr-grid">' + itens.map(card).join('') + '</div>';
  else { var atual = null, buf = ''; itens.forEach(function(x){ var c = x.i.cat || 'Outros'; if (c !== atual){ if (buf) lista += '<div class="pr-grid">' + buf + '</div>'; buf = ''; atual = c; lista += '<div class="cat-sec">' + esc(c) + '</div>'; } buf += card(x); }); if (buf) lista += '<div class="pr-grid">' + buf + '</div>'; }
  var lg = logoRep(g.id);
  var html = (S.fPrDe === g.id ? '<a class="btn sm" href="#representada/' + esc(g.id) + '">← ' + esc(g.nome) + '</a>' : '') + '<div class="row" style="align-items:center;gap:12px;margin-top:' + (S.fPrDe === g.id ? '10px' : '0') + '">' + (lg ? '<img class="pr-logo" src="' + esc(lg.url) + '" alt="">' : '') + '<div class="grow"><h1 style="margin:0">Produtos</h1><div class="muted" style="font-size:13px">Consulta rápida de preços · ' + esc(g.nome) + ' · política ' + esc(politicaNome(g.id, pid)) + '</div></div></div>' +
    '<div class="card pr-fil"><div class="pr-fl">' +
      '<label><span class="lb">Representada</span><select class="in" id="pG">' + grs.map(function(x){ return '<option value="' + x.id + '"' + (x.id === g.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select></label>' +
      (g.politicas.length > 1 ? '<label><span class="lb">Política de preço</span><select class="in" id="pP">' + g.politicas.map(function(x){ return '<option value="' + x.id + '"' + (x.id === pid ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') + '</select></label>' : '') +
      (g.marcas.length > 1 ? '<label><span class="lb">Linha de produtos</span><select class="in" id="pM">' + g.marcas.map(function(mm){ return '<option value="' + mm.id + '"' + (mm.id === mar.id ? ' selected' : '') + '>' + esc(mm.nome) + ' (' + mm.itens.length + ')</option>'; }).join('') + '</select></label>' : '') +
      (q ? '' : '<label><span class="lb">Categoria</span><select class="in" id="pC"><option value="">Todas (' + mar.itens.length + ')</option>' +
        tags.map(function(t){ var v = '#tag:' + t.nome; return '<option value="' + esc(v) + '"' + (st.cat === v ? ' selected' : '') + '>★ ' + esc(t.nome) + ' (' + t.n + ')</option>'; }).join('') +
        cats.map(function(c){ return '<option value="' + esc(c.nome) + '"' + (st.cat === c.nome ? ' selected' : '') + '>' + esc(c.nome) + ' (' + c.n + ')</option>'; }).join('') + '</select></label>' +
        (subs.length > 1 ? '<label><span class="lb">Subcategoria</span><select class="in" id="pS"><option value="">Todas</option>' + subs.map(function(c){ return '<option value="' + esc(c.nome) + '"' + (st.sub === c.nome ? ' selected' : '') + '>' + esc(c.nome) + ' (' + c.n + ')</option>'; }).join('') + '</select></label>' : '')) +
    '</div><div class="pr-fl2"><input class="in" id="pQ" type="search" placeholder="🔍 Buscar código ou nome' + (g.marcas.length > 1 ? ' em todas as linhas' : '') + '" value="' + esc(st.q) + '">' +
      '<div class="chips"><button class="chip" data-pso="0" aria-pressed="' + !st.so + '">Todos</button><button class="chip" data-pso="1" aria-pressed="' + st.so + '">Só disponíveis</button></div></div></div>' +
    '<div class="muted" style="font-size:12.5px;margin:10px 2px">' + total + ' produto' + (total === 1 ? '' : 's') + (total > LIM ? ' · mostrando os primeiros ' + LIM + ' (use a categoria ou a busca)' : '') + '</div>' +
    (itens.length ? lista : '<div class="card empty">Nada encontrado.</div>');
  casca(html);
  var re = function(){ telaProdutos(); };
  document.getElementById('pG').onchange = function(){ S.fPrDe = ''; st.grupo = this.value; st.pol = ''; st.marca = ''; st.cat = ''; st.sub = ''; st.q = ''; re(); };
  var e;
  if ((e = document.getElementById('pP'))) e.onchange = function(){ st.pol = this.value; re(); };
  if ((e = document.getElementById('pM'))) e.onchange = function(){ st.marca = this.value; st.cat = ''; st.sub = ''; re(); };
  if ((e = document.getElementById('pC'))) e.onchange = function(){ st.cat = this.value; st.sub = ''; re(); };
  if ((e = document.getElementById('pS'))) e.onchange = function(){ st.sub = this.value; re(); };
  document.getElementById('pQ').oninput = function(){ st.q = this.value; var pos = this.selectionStart; re(); var x = document.getElementById('pQ'); x.focus(); x.setSelectionRange(pos, pos); };
  $app.querySelectorAll('[data-pso]').forEach(function(b){ b.onclick = function(){ st.so = b.dataset.pso === '1'; re(); }; });
}

/* ---------- transportadoras ---------- */
var UF_NOMES = { AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas', BA:'Bahia', CE:'Ceará', DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão', MT:'Mato Grosso', MS:'Mato Grosso do Sul', MG:'Minas Gerais', PA:'Pará', PB:'Paraíba', PR:'Paraná', PE:'Pernambuco', PI:'Piauí', RJ:'Rio de Janeiro', RN:'Rio Grande do Norte', RS:'Rio Grande do Sul', RO:'Rondônia', RR:'Roraima', SC:'Santa Catarina', SP:'São Paulo', SE:'Sergipe', TO:'Tocantins' };
function trDatalist(){ return '<datalist id="trL">' + (S.transps || []).map(function(t){ return '<option value="' + esc(t.nome) + '">' + esc([t.telefone, [t.cidade, t.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')) + '</option>'; }).join('') + '</datalist>'; }
function foneLink(f){ var n = soNum(f); if (!n) return ''; return '<a class="tr-tel" href="tel:+55' + n + '">📞 ' + esc(f) + '</a>'; }
function telaTransportadoras(arg){
  if (arg === 'nova') return editarTransp(null);
  if (arg){ var t0 = (S.transps || []).find(function(x){ return x.id === arg; }); if (t0) return editarTransp(t0); }
  var q = (S.fTrQ || '').toLowerCase(), uf = S.fTrUf || '';
  var todos = (S.transps || []).slice().sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt'); });
  var lista = todos.filter(function(t){ return (!uf || t.uf === uf) && (!q || [t.nome, t.telefone, t.telefone2, t.cidade, t.uf].join(' ').toLowerCase().indexOf(q) > -1); });
  var ufsUsadas = Object.keys(todos.reduce(function(o, t){ if (t.uf) o[t.uf] = 1; return o; }, {})).sort();
  var aviso = S.trErr === 'tabela' ? '<div class="note warn">O cadastro de transportadoras ainda não está ligado no banco.</div>' : S.trErr ? '<div class="note bad">Não foi possível carregar: ' + esc(S.trErr) + '</div>' : '';
  var html = '<div class="row"><h1 class="grow" style="margin:0">Transportadoras</h1><a class="btn pri" href="#transportadoras/nova">+ Nova transportadora</a></div>' + aviso +
    '<div class="tr-busca"><input class="in" id="trQ" type="search" placeholder="🔍 Buscar por nome, telefone ou cidade" value="' + esc(S.fTrQ || '') + '">' +
    '<select class="in" id="trUf"><option value="">Todos os estados</option>' + ufsUsadas.map(function(u){ return '<option value="' + u + '"' + (uf === u ? ' selected' : '') + '>' + u + ' – ' + esc(UF_NOMES[u] || u) + '</option>'; }).join('') + '</select></div>' +
    '<div class="muted" style="font-size:12.5px;margin:8px 2px">' + lista.length + ' de ' + todos.length + ' transportadora' + (todos.length === 1 ? '' : 's') + '</div>' +
    '<div class="tr-grid">' + (lista.length ? lista.map(function(t){
      var loc = [t.cidade, t.uf].filter(Boolean).join(' / ');
      return '<div class="card tr-card"><div class="tr-av">' + esc(String(t.nome || '?').trim().slice(0,1).toUpperCase()) + '</div><div class="tr-i"><b>' + esc(t.nome) + '</b>' +
        (loc ? '<span class="muted">📍 ' + esc(loc) + '</span>' : '') + '<div class="tr-tels">' + foneLink(t.telefone) + foneLink(t.telefone2) + (!t.telefone && !t.telefone2 ? '<span class="muted" style="font-size:12.5px">sem telefone</span>' : '') + '</div></div>' +
        '<a class="btn sm" href="#transportadoras/' + esc(t.id) + '">Editar</a></div>';
    }).join('') : '<div class="card empty">' + (todos.length ? 'Nenhuma transportadora com essa busca.' : 'Nenhuma transportadora cadastrada.') + '</div>') + '</div>';
  casca(html);
  document.getElementById('trQ').oninput = function(){ S.fTrQ = this.value; var pos = this.selectionStart; telaTransportadoras(); var e = document.getElementById('trQ'); e.focus(); e.setSelectionRange(pos, pos); };
  document.getElementById('trUf').onchange = function(){ S.fTrUf = this.value; telaTransportadoras(); };
}
function editarTransp(t){
  var novo = !t; t = t || { nome: '', telefone: '', telefone2: '', cidade: '', uf: '' };
  var cidades = Object.keys((S.transps || []).concat(S.clientes || []).reduce(function(o, x){ if (x.cidade) o[String(x.cidade).trim()] = 1; return o; }, {})).sort();
  var html = '<a class="btn sm" href="#transportadoras">← Transportadoras</a><h1 style="margin:12px 0 10px">' + (novo ? 'Nova transportadora' : esc(t.nome)) + '</h1>' +
    '<div class="card" style="padding:16px"><div class="grid2">' +
      '<div style="grid-column:1/-1"><label class="lb">Nome *</label><input class="in" id="tNome" value="' + esc(t.nome) + '"></div>' +
      '<div><label class="lb">Telefone</label><input class="in" id="tTel" type="tel" inputmode="tel" value="' + esc(t.telefone) + '"></div>' +
      '<div><label class="lb">Telefone 2</label><input class="in" id="tTel2" type="tel" inputmode="tel" value="' + esc(t.telefone2 || '') + '"></div>' +
      '<div><label class="lb">Cidade</label><input class="in" id="tCid" list="tCidL" autocomplete="off" value="' + esc(t.cidade) + '"><datalist id="tCidL">' + cidades.map(function(c){ return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
      '<div><label class="lb">Estado</label><select class="in" id="tUf"><option value="">Selecione</option>' + UFS.slice().sort().map(function(u){ return '<option value="' + u + '"' + (t.uf === u ? ' selected' : '') + '>' + u + ' – ' + esc(UF_NOMES[u] || u) + '</option>'; }).join('') + '</select></div>' +
    '</div></div>' +
    '<div class="row" style="margin-top:14px;gap:8px">' + (novo ? '' : '<button class="btn bad" id="tDel">Excluir</button>') + '<span class="grow"></span><a class="btn" href="#transportadoras">Cancelar</a><button class="btn pri" id="tSalvar">Salvar</button></div>';
  casca(html);
  var el = function(id){ return document.getElementById(id); };
  el('tSalvar').onclick = function(){
    var row = { nome: el('tNome').value.trim(), telefone: el('tTel').value.trim(), telefone2: el('tTel2').value.trim(), cidade: el('tCid').value.trim(), uf: el('tUf').value };
    if (!row.nome){ el('tNome').classList.add('err'); toast('Informe o nome da transportadora.'); return; }
    if (!navigator.onLine){ toast('Sem internet: o cadastro de transportadora precisa de conexão.'); return; }
    var b = this; b.disabled = true; b.textContent = 'Salvando…';
    var req = novo ? api('transportadoras', { method: 'POST', body: row, prefer: 'return=representation' }) : api('transportadoras?id=eq.' + t.id, { method: 'PATCH', body: row, prefer: 'return=representation' });
    req.then(function(r){
      var salvo = (r && r[0]) || Object.assign({}, t, row);
      S.transps = (S.transps || []).filter(function(x){ return x.id !== salvo.id; }).concat([salvo]); kvSet('transportadoras', S.transps);
      toast('Transportadora salva.'); location.hash = '#transportadoras';
    }, function(e){ b.disabled = false; b.textContent = 'Salvar'; toast('Não foi possível salvar: ' + String(e.message).slice(0,140)); });
  };
  if (el('tDel')) el('tDel').onclick = function(){
    if (!confirm('Excluir a transportadora ' + t.nome + '?')) return;
    api('transportadoras?id=eq.' + t.id, { method: 'DELETE', prefer: 'return=minimal' }).then(function(){
      S.transps = (S.transps || []).filter(function(x){ return x.id !== t.id; }); kvSet('transportadoras', S.transps); toast('Transportadora excluída.'); location.hash = '#transportadoras';
    }, function(e){ toast('Não foi possível excluir: ' + String(e.message).slice(0,140)); });
  };
  el('tNome').focus();
}

/* ---------- desempenho (resumos em gráficos) ---------- */
var MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
var MESES_N = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var COR_S = ['#2a78d6', '#eb6834', '#1baf7a'];
function isoDia(d){ return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate()); }
function valorPed(p){ var t = +p.total; return t > 0 ? t : totalItens(p.itens || []); }
function fmtK(v){ return v >= 1e6 ? (Math.round(v/1e5)/10).toString().replace('.', ',') + ' mi' : v >= 1e3 ? Math.round(v/1e3) + ' mil' : String(Math.round(v)); }
function escala(max){ if (max <= 0) return [0, 1, 2, 3, 4]; var p = Math.pow(10, Math.floor(Math.log10(max/4))), st = [1,2,2.5,5,10].map(function(m){ return m*p; }).find(function(x){ return x*4 >= max; }) || p*10; return [0,1,2,3,4].map(function(i){ return i*st; }); }
/* barras verticais; grupos = [{rot, vals:[...]}], series = nomes */
function svgBarras(grupos, series, fmtV, cores){
  var W = 640, H = 240, L = 54, R = 10, T = 14, B = 34, iw = W-L-R, ih = H-T-B;
  var max = 0; grupos.forEach(function(g){ g.vals.forEach(function(v){ if (v > max) max = v; }); });
  var tk = escala(max), top = tk[4] || 1, n = grupos.length, ns = series.length;
  var gw = iw / Math.max(n, 1), bw = Math.min(64, (gw * 0.7) / ns), o = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dv-svg" role="img">';
  tk.forEach(function(v){ var y = T + ih - v/top*ih; o += '<line x1="' + L + '" x2="' + (W-R) + '" y1="' + y + '" y2="' + y + '" class="dv-grid"/><text x="' + (L-8) + '" y="' + (y+4) + '" text-anchor="end" class="dv-ax">' + esc(fmtK(v)) + '</text>'; });
  grupos.forEach(function(g, i){
    var cx = L + gw*i + gw/2, x0 = cx - bw*ns/2 - (ns-1);
    g.vals.forEach(function(v, j){
      var h = Math.max(v > 0 ? 2 : 0, v/top*ih), x = x0 + j*(bw+2), y = T + ih - h, r = Math.min(4, bw/2, h);
      if (h > 0) o += '<path class="dv-bar" fill="' + cores[j % cores.length] + '" d="M' + x + ',' + (T+ih) + 'V' + (y+r) + 'Q' + x + ',' + y + ' ' + (x+r) + ',' + y + 'H' + (x+bw-r) + 'Q' + (x+bw) + ',' + y + ' ' + (x+bw) + ',' + (y+r) + 'V' + (T+ih) + 'Z"><title>' + esc(g.rot + (ns > 1 ? ' · ' + series[j] : '') + ': ' + fmtV(v)) + '</title></path>';
      if (n * ns <= 12 && v > 0) o += '<text x="' + (x+bw/2) + '" y="' + (y-5) + '" text-anchor="middle" class="dv-val">' + esc(ns > 1 ? fmtK(v) : fmtV(v)) + '</text>';
    });
    o += '<text x="' + cx + '" y="' + (H-12) + '" text-anchor="middle" class="dv-ax">' + esc(g.rot) + '</text>';
  });
  o += '<line x1="' + L + '" x2="' + (W-R) + '" y1="' + (T+ih) + '" y2="' + (T+ih) + '" class="dv-base"/></svg>';
  if (ns > 1) o += '<div class="dv-leg">' + series.map(function(s2, j){ return '<span><i style="background:' + cores[j] + '"></i>' + esc(s2) + '</span>'; }).join('') + '</div>';
  return o;
}
/* barras horizontais (ranking) */
function listaBarras(itens, fmtV){
  var max = Math.max.apply(null, itens.map(function(x){ return x.v; }).concat([1]));
  return '<div class="dv-hb">' + itens.map(function(x){ return '<div class="dv-hr" title="' + esc(x.n + ': ' + fmtV(x.v) + (x.q != null ? ' · ' + x.q + ' pedido(s)' : '')) + '"><span class="dv-hn">' + esc(x.n) + '</span><span class="dv-ht"><i style="width:' + Math.max(1, x.v/max*100) + '%"></i></span><b>' + fmtV(x.v) + '</b></div>'; }).join('') + '</div>';
}
function telaDesempenho(){
  var hoje = new Date();
  S.fDe = S.fDe || { de: isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: isoDia(new Date(hoje.getFullYear(), hoje.getMonth()+1, 0)), vend: '', per: 'mes' };
  var f = S.fDe, admin = souAdmin(), meu = S.perfil && S.perfil.codigo;
  var base = listaPedidos().filter(function(p){ return p.status !== 'cancelado' && (admin ? (!f.vend || p.vendedor_codigo === f.vend) : p.vendedor_codigo === meu); });
  var dia = function(p){ return isoDia(new Date(p.criado_em)); };
  var d0 = new Date(f.de + 'T00:00:00'), d1 = new Date(f.ate + 'T00:00:00'), ndias = Math.round((d1 - d0)/864e5) + 1;
  var pa1 = new Date(d0.getTime() - 864e5), pa0 = new Date(d0.getTime() - ndias*864e5), pDe = isoDia(pa0), pAte = isoDia(pa1);
  var noPer = base.filter(function(p){ var d = dia(p); return d >= f.de && d <= f.ate; });
  var ant = base.filter(function(p){ var d = dia(p); return d >= pDe && d <= pAte; });
  function resumo(l){ var v = l.reduce(function(s2, p){ return s2 + valorPed(p); }, 0), cl = {}; l.forEach(function(p){ var c = p.cliente || {}; cl[soNum(c.doc) || String(c.name || '').toLowerCase()] = 1; }); return { v: v, q: l.length, t: l.length ? v/l.length : 0, c: Object.keys(cl).length }; }
  var R = resumo(noPer), A = resumo(ant);
  function delta(a, b){ if (!b) return a ? '<span class="dz-d up">novo</span>' : '<span class="dz-d">—</span>'; var x = (a - b)/b*100, up = x >= 0; return '<span class="dz-d ' + (up ? 'up' : 'dn') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(x).toFixed(0) + '%</span>'; }
  // série da evolução: por dia (até 62 dias) ou por mês
  var porDia = ndias <= 62, pts = [], ptsA = [];
  if (porDia){
    for (var i = 0; i < ndias; i++){ var dd = isoDia(new Date(d0.getTime() + i*864e5)), da = isoDia(new Date(pa0.getTime() + i*864e5)); pts.push({ k: dd, rot: dd.slice(8) + '/' + dd.slice(5,7), v: 0, q: 0 }); ptsA.push({ k: da, v: 0 }); }
    noPer.forEach(function(p){ var x = pts.find(function(z){ return z.k === dia(p); }); if (x){ x.v += valorPed(p); x.q++; } });
    ant.forEach(function(p){ var x = ptsA.find(function(z){ return z.k === dia(p); }); if (x) x.v += valorPed(p); });
    // acumulado: mostra a curva do mês crescendo
    var ac = 0, aa = 0; pts.forEach(function(z, j){ ac += z.v; z.acc = ac; aa += ptsA[j].v; ptsA[j].acc = aa; });
  } else {
    for (var cur = new Date(d0.getFullYear(), d0.getMonth(), 1); cur <= d1 && pts.length < 36; cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1)){ var y = cur.getFullYear(), m = cur.getMonth(); pts.push({ y: y, m: m, rot: MESES[m] + '/' + String(y).slice(2), v: 0, q: 0 }); }
    noPer.forEach(function(p){ var d = new Date(p.criado_em), x = pts.find(function(z){ return z.y === d.getFullYear() && z.m === d.getMonth(); }); if (x){ x.v += valorPed(p); x.q++; } });
    pts.forEach(function(z){ z.acc = z.v; }); ptsA = null;
  }
  // comparativo anual
  var mf = d1.getMonth(), yf = d1.getFullYear(), cm = [mf-2, mf-1, mf].map(function(x){ return (x + 12) % 12; }), anos = [yf-2, yf-1, yf];
  var comp = anos.map(function(a){ return { rot: String(a), vals: cm.map(function(mm){ var a2 = mm > mf ? a-1 : a; return base.filter(function(p){ var d = new Date(p.criado_em); return d.getFullYear() === a2 && d.getMonth() === mm; }).reduce(function(s2, p){ return s2 + valorPed(p); }, 0); }) }; });
  function agrupa(fn, nome){ var o = {}; noPer.forEach(function(p){ var k = fn(p); o[k] = o[k] || { k: k, n: nome(k, p), v: 0, q: 0 }; o[k].v += valorPed(p); o[k].q++; }); return Object.keys(o).map(function(k){ return o[k]; }).sort(function(a, b){ return b.v - a.v; }); }
  var porRep = agrupa(function(p){ return p.grupo; }, function(k){ var g = grupo(k); return g ? g.nome : k; });
  var porVend = agrupa(function(p){ return p.vendedor_codigo || '?'; }, function(k){ return CFG.vendedores[k] || k; });
  var porCli = agrupa(function(p){ var c = p.cliente || {}; return soNum(c.doc) || String(c.name || '—').toLowerCase(); }, function(k, p){ var cad = clienteDoPedido(p); return (cad && cad.fantasia) || (p.cliente && p.cliente.name) || '—'; }).slice(0, 6);
  var stOrd = STATUS.filter(function(x){ return x[0] !== 'cancelado'; }), nSt = {};
  noPer.forEach(function(p){ nSt[p.status] = (nSt[p.status] || 0) + 1; });
  var vazio = '<div class="dz-empty">Sem dados neste período</div>';
  // ---- área (evolução) ----
  function area(){
    var W = 720, H = 260, L = 8, Rr = 8, T = 16, B = 28, iw = W-L-Rr, ih = H-T-B, n = pts.length;
    var max = Math.max.apply(null, pts.map(function(z){ return z.acc; }).concat(ptsA ? ptsA.map(function(z){ return z.acc; }) : []).concat([1])) * 1.12;
    var X = function(i){ return L + (n > 1 ? i/(n-1)*iw : iw/2); }, Y = function(v){ return T + ih - v/max*ih; };
    var linha = function(arr){ return arr.map(function(z, i){ return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(z.acc).toFixed(1); }).join(''); };
    var o = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dz-svg" id="dzArea"><defs><linearGradient id="dzG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8962a" stop-opacity=".35"/><stop offset="1" stop-color="#c8962a" stop-opacity="0"/></linearGradient></defs>';
    [0.25, 0.5, 0.75, 1].forEach(function(f2){ var y = T + ih - f2*ih/1.12; o += '<line x1="' + L + '" x2="' + (W-Rr) + '" y1="' + y + '" y2="' + y + '" class="dz-gl"/><text x="' + (L+2) + '" y="' + (y-4) + '" class="dz-ax">' + fmtK(max/1.12*f2) + '</text>'; });
    if (ptsA) o += '<path d="' + linha(ptsA) + '" class="dz-prev"/>';
    o += '<path d="' + linha(pts) + 'L' + X(n-1) + ',' + (T+ih) + 'L' + X(0) + ',' + (T+ih) + 'Z" fill="url(#dzG)"/><path d="' + linha(pts) + '" class="dz-line"/>';
    var passo = Math.ceil(n / 8);
    pts.forEach(function(z, i){ if (i % passo === 0 || (i === n-1 && (n-1) % passo >= passo/2)) o += '<text x="' + X(i) + '" y="' + (H-8) + '" text-anchor="' + (i === 0 && n > 1 ? 'start' : i === n-1 && n > 1 ? 'end' : 'middle') + '" class="dz-ax">' + z.rot + '</text>'; });
    o += '<line id="dzX" class="dz-cross" y1="' + T + '" y2="' + (T+ih) + '" x1="-9" x2="-9"/><circle id="dzP" r="5" class="dz-pt" cx="-9" cy="-9"/><rect x="' + L + '" y="' + T + '" width="' + iw + '" height="' + ih + '" fill="transparent" id="dzHit"/></svg><div class="dz-tip" id="dzTip"></div>';
    area.geo = { X: X, Y: Y, W: W, n: n, L: L, iw: iw };
    return o;
  }
  var maxRep = porRep.length ? porRep[0].v : 1, maxCli = porCli.length ? porCli[0].v : 1, maxSt = Math.max.apply(null, stOrd.map(function(x){ return nSt[x[0]] || 0; }).concat([1]));
  var html = '<div class="dz">' +
    '<div class="dz-top"><div><h1>Desempenho</h1><div class="dz-sub">' + dataBR(f.de + 'T12:00').slice(0,8) + ' a ' + dataBR(f.ate + 'T12:00').slice(0,8) + ' · comparado com ' + dataBR(pDe + 'T12:00').slice(0,8) + ' a ' + dataBR(pAte + 'T12:00').slice(0,8) + '</div></div>' +
      '<div class="dz-ctl"><div class="dz-seg">' + [['mes','Este mês'],['ant','Mês passado'],['tri','3 meses'],['ano','Ano']].map(function(o){ return '<button data-per="' + o[0] + '" class="' + (f.per === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<input class="in dz-dt" type="date" id="dDe" value="' + f.de + '"><span class="muted">→</span><input class="in dz-dt" type="date" id="dAte" value="' + f.ate + '">' +
      (admin ? '<select class="in dz-dt" id="dVend"><option value="">Todos vendedores</option>' + Object.keys(CFG.vendedores).map(function(k){ return '<option value="' + k + '"' + (f.vend === k ? ' selected' : '') + '>' + esc(CFG.vendedores[k]) + '</option>'; }).join('') + '</select>' : '') + '</div></div>' +
    '<div class="dz-kpis">' +
      '<div class="dz-k hero"><span>Vendas</span><b>' + fmt(R.v) + '</b>' + delta(R.v, A.v) + '<small>antes: ' + fmt(A.v) + '</small></div>' +
      '<div class="dz-k"><span>Pedidos</span><b>' + R.q + '</b>' + delta(R.q, A.q) + '<small>antes: ' + A.q + '</small></div>' +
      '<div class="dz-k"><span>Ticket médio</span><b>' + (R.q ? fmt(R.t) : '—') + '</b>' + delta(R.t, A.t) + '<small>antes: ' + (A.q ? fmt(A.t) : '—') + '</small></div>' +
      '<div class="dz-k"><span>Clientes atendidos</span><b>' + R.c + '</b>' + delta(R.c, A.c) + '<small>antes: ' + A.c + '</small></div>' +
    '</div>' +
    '<div class="dz-grid">' +
      '<div class="dz-c span2"><div class="dz-h"><div><b>Evolução das vendas</b><span>' + (porDia ? 'acumulado no período' : 'por mês') + '</span></div>' + (ptsA ? '<div class="dz-lg"><i class="l1"></i>Este período<i class="l2"></i>Período anterior</div>' : '') + '</div>' + (noPer.length || (ptsA && ant.length) ? area() : vazio) + '</div>' +
      '<div class="dz-c"><div class="dz-h"><div><b>Top representadas</b><span>participação nas vendas</span></div></div>' + (porRep.length ? '<div class="dz-rank">' + porRep.map(function(x){ var lg = logoRep(x.k); return '<div class="dz-ri">' + (lg ? '<img src="' + esc(lg.url) + '" alt="">' : '<em>' + esc(x.n.replace(/^Grupo /,'').slice(0,2).toUpperCase()) + '</em>') + '<div class="dz-rb"><div class="dz-rl"><span>' + esc(x.n) + '</span><b>' + fmt(x.v) + '</b></div><div class="dz-bar"><i style="width:' + (x.v/maxRep*100) + '%"></i></div><small>' + (R.v ? Math.round(x.v/R.v*100) : 0) + '% · ' + x.q + ' pedido' + (x.q > 1 ? 's' : '') + '</small></div></div>'; }).join('') + '</div>' : vazio) + '</div>' +
      '<div class="dz-c span2"><div class="dz-h"><div><b>Comparativo anual</b><span>' + MESES_N[cm[0]] + ' a ' + MESES_N[cm[2]] + ' em ' + anos.join(', ') + '</span></div></div>' + (comp.some(function(g){ return g.vals.some(function(v){ return v > 0; }); }) ? svgBarras(comp, cm.map(function(mm){ return MESES_N[mm]; }), fmt, COR_S) : vazio) + '</div>' +
      '<div class="dz-c"><div class="dz-h"><div><b>Pedidos por etapa</b><span>status atual dos pedidos do período</span></div></div>' + (noPer.length ? '<div class="dz-fun">' + stOrd.map(function(x){ var n2 = nSt[x[0]] || 0; return '<div><span>' + esc(x[1]) + '</span><div class="dz-bar fs-' + x[0] + '"><i style="width:' + (n2/maxSt*100) + '%"></i></div><b>' + n2 + '</b></div>'; }).join('') + '</div>' : vazio) + '</div>' +
      '<div class="dz-c"><div class="dz-h"><div><b>Top clientes</b><span>maiores compras no período</span></div></div>' + (porCli.length ? '<ol class="dz-cli">' + porCli.map(function(x){ return '<li><span>' + esc(x.n) + '</span><b>' + fmt(x.v) + '</b><div class="dz-bar thin"><i style="width:' + (x.v/maxCli*100) + '%"></i></div></li>'; }).join('') + '</ol>' : vazio) + '</div>' +
      (admin && !f.vend ? '<div class="dz-c"><div class="dz-h"><div><b>Vendedores</b><span>vendas no período</span></div></div>' + (porVend.length ? '<div class="dz-vend">' + porVend.map(function(x){ return '<div><em>' + esc(x.n.slice(0,1)) + '</em><div><b>' + esc(x.n) + '</b><span>' + fmt(x.v) + ' · ' + x.q + ' pedido' + (x.q > 1 ? 's' : '') + '</span></div><strong>' + (R.v ? Math.round(x.v/R.v*100) : 0) + '%</strong></div>'; }).join('') + '</div>' : vazio) + '</div>' : '') +
    '</div><p class="dz-nota">Não conta pedidos cancelados. Cada pedido entra pela data em que foi criado; os do Pedido Express pelo valor enviado pelo cliente (ou o revisado, se você editou).</p></div>';
  casca(html);
  // tooltip da área
  var hit = document.getElementById('dzHit');
  if (hit && area.geo){
    var g2 = area.geo, svg = document.getElementById('dzArea'), tip = document.getElementById('dzTip'), cx = document.getElementById('dzX'), pt = document.getElementById('dzP');
    var mover = function(ev){
      var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * g2.W, i = Math.max(0, Math.min(g2.n-1, Math.round((x - g2.L) / g2.iw * (g2.n-1))));
      var z = pts[i], px = g2.X(i), py = g2.Y(z.acc);
      cx.setAttribute('x1', px); cx.setAttribute('x2', px); pt.setAttribute('cx', px); pt.setAttribute('cy', py);
      tip.innerHTML = '<b>' + z.rot + '</b>' + (porDia ? '<div>No dia: ' + fmt(z.v) + ' · ' + z.q + ' ped.</div><div>Acumulado: <b>' + fmt(z.acc) + '</b></div>' + (ptsA ? '<div class="muted">Período anterior: ' + fmt(ptsA[i].acc) + '</div>' : '') : '<div>' + fmt(z.v) + ' · ' + z.q + ' pedidos</div>');
      tip.style.display = 'block'; var tx = px / g2.W * r.width; var cr = svg.parentNode.getBoundingClientRect(); tip.style.left = (r.left - cr.left + Math.min(Math.max(tx, 80), r.width - 80)) + 'px'; tip.style.top = (r.top - cr.top + py / 260 * r.height - 12) + 'px';
    };
    hit.addEventListener('pointermove', mover); hit.addEventListener('pointerdown', mover);
    hit.addEventListener('pointerleave', function(){ tip.style.display = 'none'; cx.setAttribute('x1', -9); cx.setAttribute('x2', -9); pt.setAttribute('cx', -9); });
  }
  var set = function(de, ate, per){ f.de = isoDia(de); f.ate = isoDia(ate); f.per = per; telaDesempenho(); };
  document.getElementById('dDe').onchange = function(){ if (this.value){ f.de = this.value; f.per = ''; if (f.ate < f.de) f.ate = f.de; telaDesempenho(); } };
  document.getElementById('dAte').onchange = function(){ if (this.value){ f.ate = this.value; f.per = ''; if (f.de > f.ate) f.de = f.ate; telaDesempenho(); } };
  var dv = document.getElementById('dVend'); if (dv) dv.onchange = function(){ f.vend = this.value; telaDesempenho(); };
  $app.querySelectorAll('[data-per]').forEach(function(b){ b.onclick = function(){
    var a = hoje.getFullYear(), m2 = hoje.getMonth(), k = b.dataset.per;
    if (k === 'mes') set(new Date(a, m2, 1), new Date(a, m2+1, 0), k);
    if (k === 'ant') set(new Date(a, m2-1, 1), new Date(a, m2, 0), k);
    if (k === 'tri') set(new Date(a, m2-2, 1), new Date(a, m2+1, 0), k);
    if (k === 'ano') set(new Date(a, 0, 1), new Date(a, 11, 31), k);
  }; });
}

/* ---------- e-mails enviados (confirmação de leitura e alerta de 2 dias) ---------- */
var DIAS_ALERTA = 2;
function emailsDoUsuario(){ var l = S.emails || []; return souAdmin() ? l : l.filter(function(e){ return !e.vendedor_codigo || e.vendedor_codigo === (S.perfil && S.perfil.codigo); }); }
function emAlerta(e){ return e.status_envio !== 'erro' && !e.lido && !e.conferido && (Date.now() - new Date(e.enviado_em).getTime()) > DIAS_ALERTA * 864e5; }
function emailsAlerta(){ return emailsDoUsuario().filter(emAlerta); }
function telaEmails(){
  S.fEm = S.fEm || 'todos';
  var todos = emailsDoUsuario(), q = (S.fEmQ || '').toLowerCase();
  var lista = todos.filter(function(e){
    if (S.fEm === 'alerta' && !emAlerta(e)) return false;
    if (S.fEm === 'nao' && (e.lido || e.status_envio === 'erro')) return false;
    if (S.fEm === 'lido' && !e.lido) return false;
    if (S.fEm === 'erro' && e.status_envio !== 'erro') return false;
    return !q || [e.destinatario, e.assunto, e.pedido_numero, e.enviado_por].join(' ').toLowerCase().indexOf(q) > -1;
  });
  var nAl = todos.filter(emAlerta).length;
  var aviso = S.emailsErr === 'tabela' ? '<div class="note warn">O registro de e-mails ainda não está ligado no banco. Assim que terminarmos a configuração do envio direto, os e-mails aparecem aqui.</div>'
    : S.emailsErr ? '<div class="note bad">Não foi possível carregar os e-mails: ' + esc(S.emailsErr) + '</div>' : '';
  var html = '<div class="row"><h1 class="grow" style="margin:0">E-mails enviados</h1><button class="btn sm" id="emAtu">↻ Atualizar</button></div>' + aviso +
    (nAl ? '<div class="note bad" style="margin-top:10px">⚠ <b>' + nAl + ' e-mail' + (nAl > 1 ? 's' : '') + ' sem leitura há mais de ' + DIAS_ALERTA + ' dias.</b> Confira com o destinatário e, depois de resolver, toque em “Conferido”.</div>' : '') +
    '<input class="in" id="emQ" style="margin-top:10px" placeholder="Buscar por destinatário, assunto ou nº do pedido" value="' + esc(S.fEmQ || '') + '">' +
    '<div class="chips" style="margin-top:8px">' + [['todos','Todos'],['alerta','⚠ Alertas'],['nao','Não lidos'],['lido','Lidos'],['erro','Com erro']].map(function(o){ return '<button class="chip" data-fem="' + o[0] + '" aria-pressed="' + (S.fEm === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
    '<div class="card" style="margin-top:10px;overflow:auto">' + (lista.length ? '<table class="tb em-tb"><thead><tr><th>Data/hora envio</th><th>Destinatário</th><th>Assunto</th><th>Lido/Recebido</th><th>Data/hora leitura</th><th>Enviado por</th><th></th></tr></thead><tbody>' +
      lista.map(function(e){
        var al = emAlerta(e), st = e.status_envio === 'erro' ? '<span class="badge st-cancelado" title="' + esc(e.erro || '') + '">Erro no envio</span>' : e.lido ? '<span class="badge em-sim">✓ Lido</span>' + (e.aberturas > 1 ? ' <span class="muted" style="font-size:12px">' + e.aberturas + '×</span>' : '') : al ? '<span class="badge em-al">⚠ Não lido · ' + Math.floor((Date.now() - new Date(e.enviado_em).getTime())/864e5) + ' dias</span>' : '<span class="badge em-nao">Enviado · não lido</span>';
        return '<tr class="' + (al ? 'em-alerta' : '') + '"><td>' + dataBR(e.enviado_em) + '</td><td>' + esc(e.destinatario) + '</td><td>' + (e.pedido_id && S.pedidos[e.pedido_id] ? '<a href="#pedido/' + esc(e.pedido_id) + '">' + esc(e.assunto) + '</a>' : esc(e.assunto)) + '</td><td>' + st + '</td><td>' + (e.lido_em ? dataBR(e.lido_em) : '') + '</td><td>' + esc(e.enviado_por || '') + '</td>' +
          '<td>' + (al ? '<button class="btn sm" data-conf="' + esc(e.id) + '">✓ Conferido</button>' : e.conferido && !e.lido ? '<span class="muted" style="font-size:12px">conferido</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">' + (todos.length ? 'Nenhum e-mail com esse filtro.' : 'Nenhum e-mail enviado pelo programa ainda.') + '</div>') + '</div>' +
    '<p class="muted" style="font-size:12px;margin-top:10px">“Lido” é marcado quando o destinatário abre o e-mail com as imagens carregadas. Alguns programas de e-mail bloqueiam imagens (aí fica “Não” mesmo lido) e o Mail do iPhone pode marcar como lido sozinho.</p>';
  casca(html);
  document.getElementById('emAtu').onclick = function(){ sincronizar(true); };
  document.getElementById('emQ').oninput = function(){ S.fEmQ = this.value; var pos = this.selectionStart; telaEmails(); var e = document.getElementById('emQ'); e.focus(); e.setSelectionRange(pos,pos); };
  $app.querySelectorAll('[data-fem]').forEach(function(b){ b.onclick = function(){ S.fEm = b.dataset.fem; telaEmails(); }; });
  $app.querySelectorAll('[data-conf]').forEach(function(b){ b.onclick = function(){
    var id = b.dataset.conf;
    api('emails_enviados?id=eq.' + id, { method: 'PATCH', body: { conferido: true }, prefer: 'return=minimal' }).then(function(){
      var e = (S.emails || []).find(function(x){ return x.id === id; }); if (e) e.conferido = true; kvSet('emails', S.emails); telaEmails(); toast('Marcado como conferido.');
    }, function(err){ toast('Não foi possível marcar: ' + String(err.message).slice(0,120)); });
  }; });
}
function b64DeBytes(u8){ var s = '', i, n = 0x8000; for (i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s); }
/* envio direto pelo programa (função enviar-email no Supabase, via Brevo) */
function enviarDireto(p, para, ass, msg, gid){
  if (!navigator.onLine) return Promise.reject(new Error('sem internet — o envio direto precisa de conexão'));
  var r = montarPdf(p, 'fabrica');
  var bytes = r.bytes instanceof Uint8Array ? r.bytes : new Uint8Array(r.bytes);
  var corpo = { para: para, assunto: ass, mensagem: msg, pdf_base64: b64DeBytes(bytes), pdf_nome: r.nome, pedido_id: p.id, pedido_numero: p.numero, grupo: gid,
    enviado_por: ((S.perfil && CFG.vendedores[S.perfil.codigo]) || CFG.vendedores[p.vendedor_codigo] || (S.perfil && S.perfil.nome) || '') + ' (Company Representações)', vendedor_codigo: (S.perfil && S.perfil.codigo) || p.vendedor_codigo, responder_para: S.sess && S.sess.user.email };
  var go = function(){ return fetch(CFG.url + '/functions/v1/enviar-email', { method: 'POST', headers: headers(true), body: JSON.stringify(corpo) }); };
  var pre = (S.sess && Date.now() > S.sess.expires_at) ? renovar() : Promise.resolve();
  return pre.then(go).then(function(res){
    return res.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch(e){}
      if (res.status === 404) throw new Error('o envio direto ainda não foi ligado no banco');
      if (!res.ok) throw new Error(j.erro || t || ('Erro ' + res.status));
      return j; });
  });
}

/* ---------- roteador ---------- */
/* ---------- representadas (dados, contatos, política comercial, oferta do mês) ---------- */
var REP_CONTATOS = [
  ['diretor','Diretor'], ['gerente_geral','Gerente geral'], ['gerente_regional','Gerente regional'],
  ['atendente_interno','Atendente interno'], ['atendente_financeiro','Atendente financeiro'],
  ['sac','SAC (assistência técnica)'], ['marketing','Marketing']
];
var REP_ANEXOS = [
  ['tabelas','Tabelas de preço','📎 ANEXAR TABELAS'],
  ['catalogo','Catálogos','🔗 ANEXAR LINK CATÁLOGO / GOOGLE DRIVE', 'link'],
  ['oferta','⭐ Oferta do mês','📎 ANEXAR OFERTA DO MÊS'],
  ['politica','Política comercial','📎 ANEXAR POLÍTICA COMERCIAL'],
  ['geral','Anexos gerais','📎 ANEXOS GERAL']
];
function anexosRep(d){ var a = d.anexos || {}; if (!a.oferta && d.oferta_arquivos && d.oferta_arquivos.length) a.oferta = d.oferta_arquivos; return a; }
function slug(s){ return semAcento(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40) || ('rep-' + Date.now()); }
function listaReps(){
  var m = {};
  (S.cat ? S.cat.grupos : []).forEach(function(g){ m[g.id] = { id: g.id, nome: g.nome, dados: {} }; });
  (S.reps || []).forEach(function(r){ m[r.id] = Object.assign({}, m[r.id] || {}, r, { dados: r.dados || {} }); });
  return Object.keys(m).map(function(k){ return m[k]; }).sort(function(a,b){ return String(a.nome).localeCompare(String(b.nome),'pt-BR'); });
}
/* logomarca da representada: guardada como JPEG (data URL) dentro do cadastro → funciona offline no app e no PDF */
function logoRep(gid){ var r = acharRep(gid); return r && r.dados && r.dados.logo && r.dados.logo.url ? r.dados.logo : null; }
function lerLogo(file){
  return new Promise(function(res, rej){
    var fr = new FileReader();
    fr.onerror = function(){ rej(new Error('não foi possível ler o arquivo')); };
    fr.onload = function(){
      var im = new Image();
      im.onerror = function(){ rej(new Error('o arquivo não é uma imagem válida')); };
      im.onload = function(){
        var r = Math.min(1, 600 / Math.max(im.naturalWidth, im.naturalHeight));
        var w = Math.max(1, Math.round(im.naturalWidth * r)), h = Math.max(1, Math.round(im.naturalHeight * r));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h);
        res({ url: c.toDataURL('image/jpeg', 0.9), w: w, h: h, nome: file.name });
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function acharRep(id){ return listaReps().find(function(r){ return r.id === id; }); }
function soDig(s){ return String(s||'').replace(/\D/g,''); }
function linkFone(f){ var d = soDig(f); if (!d) return ''; var w = d.length <= 11 ? '55' + d : d;
  return ' <a class="btn sm" href="https://wa.me/' + w + '" target="_blank" rel="noopener">WhatsApp</a> <a class="btn sm" href="tel:+' + w + '">Ligar</a>'; }
function linkMail(e){ return e ? ' <a class="btn sm" href="mailto:' + esc(e) + '">E-mail</a>' : ''; }
function txtBloco(t){ return t ? '<div style="white-space:pre-wrap">' + esc(t) + '</div>' : '<span class="muted">—</span>'; }
function arquivosHtml(arqs, editar){
  if (!arqs || !arqs.length) return editar ? '' : '';
  return '<div class="rep-arqs">' + arqs.map(function(a, i){
    var img = /^image\//.test(a.tipo || '') || /\.(jpe?g|png|webp|gif)$/i.test(a.nome || '');
    return '<div class="rep-arq">' + (img ? '<img src="' + esc(a.url) + '" alt="" data-zoom="' + esc(a.url) + '" data-leg="' + esc(a.nome) + '">' :
      '<a class="rep-pdf" href="' + esc(a.url) + '" target="_blank" rel="noopener">' + (a.tipo === 'link' ? '🔗' : /\.(xlsx?|csv)$/i.test(a.nome||'') ? '📊' : '📄') + '<span>' + esc(a.nome || 'PDF') + '</span></a>') +
      (editar ? '<button type="button" class="btn sm bad" data-rmarq="' + i + '">Remover</button>' : '') + '</div>';
  }).join('') + '</div>';
}
function ligarZoomArqs(root){ root.querySelectorAll('[data-zoom]').forEach(function(im){ im.onclick = function(){ abrirZoom(im.dataset.zoom, im.dataset.leg || ''); }; }); }

function telaRepresentadas(){
  var l = listaReps();
  casca('<div class="row" style="justify-content:space-between"><h1 style="margin:4px 0">Representadas</h1><a class="btn pri" href="#representada/nova/editar">+ Nova representada</a></div>' +
    (S.repErr ? '<div class="note warn">' + esc(S.repErr) + '</div>' : '') +
    '<div class="list">' + l.map(function(r){
      var d = r.dados || {}, an = anexosRep(d), temOf = d.oferta_texto || (an.oferta && an.oferta.length);
      return '<div class="card pad"><div class="row">' + (d.logo && d.logo.url ? '<img class="rep-logo-mini" src="' + esc(d.logo.url) + '" alt="">' : '') + '<div class="grow"><b>' + esc(r.nome) + '</b>' + (temOf ? ' <span class="badge" style="background:#f2c14e;color:#1c1c1e">oferta do mês</span>' : '') +
        (function(){ var t = REP_ANEXOS.reduce(function(s, c){ return s + (an[c[0]] || []).length; }, 0); return t ? ' <span class="badge">📎 ' + t + ' anexo' + (t > 1 ? 's' : '') + '</span>' : ''; })() +
        '<div class="muted" style="font-size:13px">' + esc([d.cnpj ? fmtDoc(d.cnpj) : '', d.telefone, d.email_pedidos].filter(Boolean).join(' · ') || 'Dados ainda não preenchidos') + '</div></div>' +
        '<div class="row" style="gap:6px">' + (grupo(r.id) ? '<a class="btn sm" href="#produtos/' + esc(r.id) + '">📦 Produtos</a>' : '') + '<a class="btn sm pri" href="#representada/' + esc(r.id) + '">Abrir</a><a class="btn sm" href="#representada/' + esc(r.id) + '/editar">Editar</a></div></div></div>';
    }).join('') + '</div>');
}

function telaRepresentada(arg){
  var p = String(arg||'').split('/'), id = decodeURIComponent(p[0] || ''), editar = p[1] === 'editar';
  var nova = id === 'nova';
  var r = nova ? { id: '', nome: '', dados: {} } : acharRep(id);
  if (!r){ casca('<div class="card empty">Representada não encontrada. <a href="#representadas">Voltar</a></div>'); return; }
  if (editar) return editarRep(r, nova);
  var d = r.dados || {}, an = anexosRep(d);
  var html = '<div class="row"><a class="btn sm" href="#representadas">← Representadas</a><h1 style="margin:4px 0" class="grow">' + esc(r.nome) + '</h1>' + (grupo(r.id) ? '<a class="btn" href="#produtos/' + esc(r.id) + '">📦 Produtos</a>' : '') + '<a class="btn pri" href="#representada/' + esc(r.id) + '/editar">Editar</a></div>' +
    (d.logo && d.logo.url ? '<div class="card pad" style="margin-top:10px;text-align:center"><img class="rep-logo-big" src="' + esc(d.logo.url) + '" alt="Logomarca ' + esc(r.nome) + '" data-zoom="' + esc(d.logo.url) + '" data-leg="' + esc(r.nome) + '"></div>' : '') +
    '<div class="card pad cform" style="margin-top:10px"><h2 class="sec">⭐ Oferta do mês</h2>' +
      (d.oferta_texto || (an.oferta && an.oferta.length) ? txtBloco(d.oferta_texto) + arquivosHtml(an.oferta) : '<span class="muted">Nenhuma oferta cadastrada. Toque em Editar e use o botão Anexar oferta do mês (foto ou PDF).</span>') + '</div>' +
    '<div class="card pad cform" style="margin-top:10px"><h2 class="sec">Dados da representada</h2>' +
      vlin('Nome / Razão social', esc(d.razao || r.nome)) + vlin('CNPJ', esc(fmtDoc(d.cnpj)) || '—') + vlin('Endereço', txtBloco(d.endereco)) +
      vlin('Telefone da empresa', d.telefone ? esc(d.telefone) + '<div style="margin-top:4px">' + linkFone(d.telefone) + '</div>' : '—') +
      vlin('E-mail para pedidos', d.email_pedidos ? esc(d.email_pedidos) + linkMail(d.email_pedidos) : '—') +
    '<h2 class="sec">Contatos</h2>' +
      REP_CONTATOS.map(function(c){ var x = (d.contatos || {})[c[0]] || {};
        var v = [x.nome ? '<b>' + esc(x.nome) + '</b>' : '', x.fone ? esc(x.fone) : '', x.email ? esc(x.email) : ''].filter(Boolean).join(' · ');
        return vlin(c[1], v ? v + '<div style="margin-top:4px">' + linkFone(x.fone) + linkMail(x.email) + '</div>' : '—'); }).join('') +
    (d.politica ? '<h2 class="sec">Política comercial (texto antigo)</h2>' + txtBloco(d.politica) : '') +
    '<h2 class="sec">📎 Anexos</h2><div class="rep-bts">' + REP_ANEXOS.map(function(c){ var n = (an[c[0]] || []).length;
      return '<a class="btn" href="#rv_' + c[0] + '" data-pula="' + c[0] + '">' + c[1].replace('⭐ ','') + ' <span class="rep-n' + (n ? ' on' : '') + '">' + n + '</span></a>'; }).join('') + '</div>' +
    REP_ANEXOS.map(function(c){ var l = an[c[0]] || []; return l.length ? '<div class="rep-grp" id="rv_' + c[0] + '"><div class="rep-gt">' + c[1] + ' <span class="rep-n on">' + l.length + '</span></div>' + arquivosHtml(l) + '</div>' : ''; }).join('') +
    '<h2 class="sec">Observações</h2>' + txtBloco(d.obs) +
    (r.atualizado_em ? '<p class="muted" style="font-size:12px;margin-top:16px">Atualizado em ' + dataBR(r.atualizado_em) + (r.atualizado_por ? ' por ' + esc(r.atualizado_por) : '') + '</p>' : '') +
    '</div>';
  casca(html);
  ligarZoomArqs($app);
  $app.querySelectorAll('[data-pula]').forEach(function(a){ a.onclick = function(e){ e.preventDefault(); var t = document.getElementById('rv_' + a.dataset.pula); if (t) t.scrollIntoView({ behavior:'smooth', block:'center' }); else toast('Nenhum anexo nesta categoria.'); }; });
}
function vlin(lb, v){ return '<div class="fr" style="align-items:start"><div class="lb" style="font-weight:700">' + lb + '</div><div class="fv">' + v + '</div></div>'; }

function editarRep(r, nova){
  var d = JSON.parse(JSON.stringify(r.dados || {})); d.contatos = d.contatos || {};
  d.anexos = anexosRep(d); delete d.oferta_arquivos; REP_ANEXOS.forEach(function(c){ d.anexos[c[0]] = d.anexos[c[0]] || []; });
  var blocoAnexos = '<div class="rep-bts">' + REP_ANEXOS.map(function(c){
      if (c[3] === 'link') return '<button type="button" class="btn" data-lk="' + c[0] + '">' + c[2] + ' <span class="rep-n" id="rN_' + c[0] + '">0</span></button>';
      return '<label class="btn" for="rUp_' + c[0] + '">' + c[2] + ' <span class="rep-n" id="rN_' + c[0] + '">0</span></label>' +
        '<input type="file" data-up="' + c[0] + '" id="rUp_' + c[0] + '" accept="image/*,application/pdf,.xls,.xlsx,.csv,.doc,.docx" multiple hidden>'; }).join('') + '</div>' +
    '<div class="muted" style="font-size:12.5px;margin-top:4px">Catálogos: coloque o arquivo no Google Drive, copie o link de compartilhamento e use “🔗 ANEXAR LINK CATÁLOGO / GOOGLE DRIVE” (pode colocar vários links de uma vez com “＋ Mais um link”). Os outros anexos sobem direto (até 50 MB).</div>' +
    '<div class="muted" id="rUpSt" style="font-size:13px;margin-top:6px"></div>' +
    REP_ANEXOS.map(function(c){ return '<div class="rep-grp" id="rG_' + c[0] + '"><div class="rep-gt">' + c[1] + ' <span class="rep-n" id="rN2_' + c[0] + '">0</span></div><div id="rArqs_' + c[0] + '"></div></div>'; }).join('');
  function f(lb, inner){ return '<div class="fr"><label class="lb">' + lb + '</label><div class="fv">' + inner + '</div></div>'; }
  function inp(id, v, extra){ return '<input class="in" id="' + id + '" value="' + esc(v) + '"' + (extra||'') + '>'; }
  var html = '<div class="row"><a class="btn sm" href="' + (nova ? '#representadas' : '#representada/' + esc(r.id)) + '">← Voltar</a><h1 style="margin:4px 0">' + (nova ? 'Nova representada' : 'Editar · ' + esc(r.nome)) + '</h1></div>' +
    '<div class="card pad cform" style="margin-top:10px">' +
    '<h2 class="sec">Logomarca</h2>' +
    f('Logomarca', '<div id="rLogoBox"></div><input type="file" id="rLogoUp" accept="image/*" hidden>' +
      '<div class="muted" style="font-size:12.5px;margin-top:4px">Aparece no cabeçalho do pedido e no PDF. Use JPG ou PNG (de preferência com fundo branco).</div>') +
    '<h2 class="sec">Dados da representada</h2>' +
    f('Nome (como aparece no programa) <span class="req">*</span>', inp('rNome', r.nome, ' maxlength="80"')) +
    f('Razão social', inp('rRazao', d.razao, ' maxlength="150"')) +
    f('CNPJ', '<input class="in w-m" id="rCnpj" inputmode="numeric" placeholder="00.000.000/0000-00" value="' + esc(fmtDoc(d.cnpj)) + '">') +
    f('Endereço', '<textarea class="in" rows="2" id="rEnd">' + esc(d.endereco) + '</textarea>') +
    f('Telefone da empresa', '<input class="in w-m" id="rFone" inputmode="tel" placeholder="(00) 0000-0000" value="' + esc(d.telefone) + '">') +
    f('E-mail para envio de pedidos', inp('rMailPed', d.email_pedidos, ' type="email" inputmode="email"')) +
    '<h2 class="sec">Contatos</h2>' +
    REP_CONTATOS.map(function(c){ var x = d.contatos[c[0]] || {};
      return f(c[1], '<div class="rep-ct"><input class="in" data-ct="' + c[0] + '" data-k="nome" placeholder="Nome" value="' + esc(x.nome) + '">' +
        '<input class="in" data-ct="' + c[0] + '" data-k="fone" inputmode="tel" placeholder="Telefone / WhatsApp" value="' + esc(x.fone) + '">' +
        '<input class="in" data-ct="' + c[0] + '" data-k="email" type="email" inputmode="email" placeholder="E-mail" value="' + esc(x.email) + '"></div>'); }).join('') +
    '<h2 class="sec">📎 Anexos</h2>' + blocoAnexos +
    '<h2 class="sec">Observações</h2>' +
    '<textarea class="in" rows="5" id="rObs" placeholder="Qualquer anotação">' + esc(d.obs) + '</textarea>' +
    '</div>';
  casca(html, '<a class="btn" href="' + (nova ? '#representadas' : '#representada/' + esc(r.id)) + '">Cancelar</a><button class="btn pri" id="rSalvar">' + (nova ? 'Cadastrar representada' : 'Salvar alterações') + '</button>');
  var el = function(id){ return document.getElementById(id); };
  function desenhaArqs(cat){ var w = el('rArqs_' + cat), n = d.anexos[cat].length; w.innerHTML = arquivosHtml(d.anexos[cat], true); ligarZoomArqs(w);
    el('rN_' + cat).textContent = n; el('rN2_' + cat).textContent = n; el('rN_' + cat).classList.toggle('on', n > 0); el('rG_' + cat).hidden = !n;
    w.querySelectorAll('[data-rmarq]').forEach(function(b){ b.onclick = function(){ d.anexos[cat].splice(+b.dataset.rmarq, 1); desenhaArqs(cat); }; }); }
  REP_ANEXOS.forEach(function(c){ desenhaArqs(c[0]); });
  function desenhaLogo(){
    var tem = d.logo && d.logo.url;
    el('rLogoBox').innerHTML = (tem ? '<div class="rep-logo-ed"><img src="' + esc(d.logo.url) + '" alt="Logomarca"></div>' : '<div class="rep-logo-ed vazio">Sem logomarca</div>') +
      '<div class="row" style="gap:6px;margin-top:8px">' + (tem ? '<button type="button" class="btn sm bad" id="rLogoRm">Remover logomarca</button>' : '') +
      '<label class="btn sm" for="rLogoUp">' + (tem ? 'Trocar logomarca' : '📎 Anexar logomarca') + '</label></div>';
    var rm = el('rLogoRm'); if (rm) rm.onclick = function(){ delete d.logo; desenhaLogo(); el('rUpSt').textContent = 'Logomarca removida — lembre de salvar.'; };
  }
  desenhaLogo();
  el('rLogoUp').onchange = function(){
    var file = this.files && this.files[0]; this.value = ''; if (!file) return;
    if (file.size > 15 * 1024 * 1024){ toast('Imagem muito grande (limite 15 MB).'); return; }
    lerLogo(file).then(function(lg){ d.logo = lg; desenhaLogo(); toast('Logomarca pronta — lembre de salvar.'); }, function(e){ toast('Logomarca: ' + e.message, 5000); });
  };
  var enviando = 0;
  $app.querySelectorAll('[data-up]').forEach(function(inp){ inp.onchange = function(){
    var cat = inp.dataset.up, st = el('rUpSt');
    var fs = Array.prototype.slice.call(inp.files || []); inp.value = '';
    if (!fs.length) return;
    if (!navigator.onLine){ toast('Sem internet: anexe quando estiver online.'); return; }
    var pasta = (r.id || slug(el('rNome').value)) + '/' + cat;
    var n = fs.length; enviando += n; st.textContent = 'Enviando ' + n + ' arquivo(s)…';
    fs.forEach(function(file){
      var fim = function(){ enviando--; n--; st.textContent = n ? 'Enviando ' + n + ' arquivo(s)…' : 'Anexos prontos — lembre de salvar.'; };
      if (file.size > 50 * 1024 * 1024){ toast(file.name + ' tem ' + Math.round(file.size/1048576) + ' MB (limite 50 MB).', 7000); fim(); return; }
      subirArquivo(pasta, file).then(function(a){ d.anexos[cat].push(a); desenhaArqs(cat); }, function(e){ toast('Não foi possível enviar ' + file.name + ': ' + String(e.message||e).slice(0,120), 5000); }).then(fim);
    });
  }; });
  function abrirLink(catIni){
    var ph = catIni === 'catalogo' ? 'Ex.: Catálogo 2026' : 'Ex.: Catálogo 2026, Tabela Novembro';
    function linhaLk(i){
      return '<div class="lk-linha" style="border:1px solid #c9a227;border-radius:8px;padding:8px;margin-top:8px">' +
        '<div class="row" style="justify-content:space-between"><b style="font-size:13px">Link ' + i + '</b>' +
        '<button type="button" class="btn sm bad" data-lkrm>Remover</button></div>' +
        '<label class="lb">Nome do arquivo</label><input class="in" data-lknome placeholder="' + ph + '">' +
        '<label class="lb">Link (Google Drive, Dropbox, OneDrive…)</label><input class="in" data-lkurl inputmode="url" placeholder="https://drive.google.com/…"></div>';
    }
    var m = modal(catIni === 'catalogo' ? 'Links dos catálogos (Google Drive)' : 'Adicionar links',
      '<label class="lb">Onde guardar</label><select class="in" id="lkCat">' + REP_ANEXOS.map(function(c){ return '<option value="' + c[0] + '"' + (c[0] === catIni ? ' selected' : '') + '>' + c[1].replace('⭐ ','') + '</option>'; }).join('') + '</select>' +
      '<div id="lkLista">' + linhaLk(1) + '</div>' +
      '<button type="button" class="btn" id="lkMais" style="margin-top:8px">＋ Mais um link</button>' +
      '<p class="muted" style="font-size:12.5px">No Google Drive: botão direito no arquivo → Compartilhar → Acesso geral: “Qualquer pessoa com o link” → Copiar link.</p>' +
      '<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn pri" id="lkOk">Adicionar links</button></div>');
    var lista = m.body.querySelector('#lkLista');
    function renumera(){
      var ls = lista.querySelectorAll('.lk-linha');
      ls.forEach(function(l, i){ l.querySelector('b').textContent = 'Link ' + (i + 1); l.querySelector('[data-lkrm]').hidden = ls.length < 2; });
      lista.querySelectorAll('[data-lkrm]').forEach(function(b){ b.onclick = function(){ b.closest('.lk-linha').remove(); renumera(); }; });
    }
    renumera();
    m.body.querySelector('#lkMais').onclick = function(){
      lista.insertAdjacentHTML('beforeend', linhaLk(lista.children.length + 1)); renumera();
      var ult = lista.lastElementChild.querySelector('[data-lknome]'); if (ult) ult.focus();
    };
    m.body.querySelector('#lkOk').onclick = function(){
      var cat = m.body.querySelector('#lkCat').value, novos = [], erro = false;
      lista.querySelectorAll('.lk-linha').forEach(function(l, i){
        var url = l.querySelector('[data-lkurl]').value.trim(), nome = l.querySelector('[data-lknome]').value.trim();
        if (!url && !nome) return;
        if (!/^https?:\/\//i.test(url)){ if (!erro) toast('Link ' + (i + 1) + ': cole um link começando com https://'); erro = true; return; }
        novos.push({ url: url, nome: nome || 'Link', tipo: 'link' });
      });
      if (erro) return;
      if (!novos.length){ toast('Cole pelo menos um link.'); return; }
      novos.forEach(function(a){ d.anexos[cat].push(a); });
      desenhaArqs(cat); m.ov.remove(); document.body.style.overflow = '';
      el('rUpSt').textContent = (novos.length > 1 ? novos.length + ' links adicionados' : 'Link adicionado') + ' — lembre de salvar.';
    };
  }
  $app.querySelectorAll('[data-lk]').forEach(function(b){ b.onclick = function(){ abrirLink(b.dataset.lk); }; });
  el('rSalvar').onclick = function(){
    var nome = el('rNome').value.trim();
    if (!nome){ toast('Informe o nome da representada.'); el('rNome').focus(); return; }
    if (enviando){ toast('Aguarde terminar de enviar os anexos.'); return; }
    if (!navigator.onLine){ toast('Sem internet: salve quando estiver online.'); return; }
    d.razao = el('rRazao').value.trim(); d.cnpj = soDig(el('rCnpj').value); d.endereco = el('rEnd').value.trim(); d.telefone = el('rFone').value.trim();
    d.email_pedidos = el('rMailPed').value.trim(); d.obs = el('rObs').value.trim();
    $app.querySelectorAll('[data-ct]').forEach(function(i){ var c = d.contatos[i.dataset.ct] = d.contatos[i.dataset.ct] || {}; c[i.dataset.k] = i.value.trim(); });
    var id = r.id || slug(nome);
    if (nova && acharRep(id)) id = id + '-' + Date.now().toString(36).slice(-4);
    var row = { id: id, nome: nome, dados: d, atualizado_em: new Date().toISOString(), atualizado_por: S.perfil ? S.perfil.nome : null };
    var b = this; b.disabled = true; b.textContent = 'Salvando…';
    api('representadas', { method:'POST', body: row, prefer:'resolution=merge-duplicates,return=minimal' }).then(function(){
      S.reps = (S.reps || []).filter(function(x){ return x.id !== id; }); S.reps.push(row); kvSet('representadas', S.reps);
      toast('Representada salva'); location.hash = '#representada/' + encodeURIComponent(id);
    }, function(e){
      b.disabled = false; b.textContent = 'Salvar alterações';
      var m = String(e.message||e); toast(/42P01|PGRST205|relation|does not exist|42501|row-level/.test(m) ? 'O banco ainda não tem a tabela de representadas (falta rodar a atualização do banco).' : 'Erro ao salvar: ' + m.slice(0,150), 6000);
    });
  };
}
function subirArquivo(pasta, file){
  var nome = file.name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.\-]+/g,'_');
  var path = pasta.split('/').map(encodeURIComponent).join('/') + '/' + Date.now() + '-' + nome;
  var go = function(){ return fetch(CFG.url + '/storage/v1/object/representadas/' + path, { method:'POST',
    headers: { 'apikey': CFG.key, 'Authorization': 'Bearer ' + S.sess.access_token, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }, body: file }); };
  var pre = (S.sess && Date.now() > S.sess.expires_at) ? renovar() : Promise.resolve();
  return pre.then(go).then(function(r){ if (r.status === 401) return renovar().then(go); return r; }).then(function(r){
    if (!r.ok) return r.text().then(function(t){ throw new Error(/Bucket not found/i.test(t) ? 'o banco ainda não tem a pasta de ofertas (falta rodar a atualização do banco)' : t || ('Erro ' + r.status)); });
    return { url: CFG.url + '/storage/v1/object/public/representadas/' + path, nome: file.name, tipo: file.type, path: path };
  });
}

function render(){
  if (S.recup) return telaNovaSenha();
  if (S.recupErr){ var re = S.recupErr; S.recupErr = ''; return telaEsqueci('', re); }
  if (!S.sess){ telaLogin(S.syncErr && /Sessão/.test(S.syncErr) ? S.syncErr : ''); return; }
  if (!S.perfil){ casca('<div class="card empty">Carregando seu perfil…</div>'); carregarPerfil().then(render, function(e){ telaLogin(e.message); S.sess = null; lsSet('cv_sess', null); }); return; }
  var r = rota();
  if (r.nome !== 'pedido' && ED && ED.sujo && !ED.novo){ /* descarta edição não salva ao sair */ }
  if (r.nome !== 'pedido' && r.nome !== 'novo') ED = null;
  if (r.nome === 'pedido') return abrirPedido(r.arg);
  if (r.nome === 'novo') return ED && ED.novo ? telaEditor() : telaNovo(r.arg);
  if (r.nome === 'clientes') return telaClientes(r.arg);
  if (r.nome === 'cliente') return telaCliente(r.arg);
  if (r.nome === 'representadas') return telaRepresentadas();
  if (r.nome === 'representada') return telaRepresentada(r.arg);
  if (r.nome === 'emails') return telaEmails();
  if (r.nome === 'desempenho') return telaDesempenho();
  if (r.nome === 'produtos') return telaProdutos(r.arg);
  if (r.nome === 'transportadoras') return telaTransportadoras(r.arg);
  if (r.nome === 'mais') return telaMais();
  return telaPedidos();
}
var voltando = false;
window.addEventListener('hashchange', function(){
  if (voltando){ voltando = false; return; }
  var r0 = rota();
  var mesmo = ED && ((r0.nome === 'pedido' && ED.p.id === r0.arg) || (ED.novo && r0.nome === 'novo'));
  if (ED && ED.sujo && !mesmo && !confirm('Sair sem salvar as alterações deste pedido?')){ voltando = true; history.back(); return; }
  if (ED && rota().nome !== 'pedido') ED = null;
  if (ED && rota().nome === 'pedido' && ED.p.id !== rota().arg) ED = null;
  render(); window.scrollTo(0,0);
});
window.addEventListener('online', function(){ topo(); sincronizar(); });
window.addEventListener('offline', topo);
setInterval(function(){ if (navigator.onLine) sincronizar(); }, 90000);
document.addEventListener('visibilitychange', function(){ if (!document.hidden && navigator.onLine) sincronizar(); });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function(){});

Promise.all([kvGet('pedidos'), kvGet('clientes'), kvGet('fila'), carregarCatalogo(), kvGet('cfila'), kvGet('representadas'), kvGet('emails'), kvGet('transportadoras')]).then(function(r){
  S.reps = r[5] || []; S.emails = r[6] || []; S.transps = r[7] || [];
  S.pedidos = r[0] || {}; S.clientes = r[1] || []; S.fila = r[2] || []; S.cfila = r[4] || [];
  render(); sincronizar();
});
window.__cv = S;
/* olho da senha: mostra enquanto o botão estiver pressionado */
(function(){
  function alvo(e){ var b = e.target.closest && e.target.closest('.pwd .olho'); return b ? b.parentNode.querySelector('input') : null; }
  function mostra(inp, v){ if (inp){ inp.type = v ? 'text' : 'password'; inp.parentNode.classList.toggle('vendo', v); } }
  var atual = null;
  function solta(){ if (atual){ mostra(atual, false); atual = null; } }
  document.addEventListener('pointerdown', function(e){ var i = alvo(e); if (!i) return; e.preventDefault(); atual = i; mostra(i, true); }, true);
  ['pointerup','pointercancel','blur'].forEach(function(ev){ (ev === 'blur' ? window : document).addEventListener(ev, solta, true); });
  document.addEventListener('pointerout', function(e){ if (atual && alvo(e)) solta(); }, true);
  document.addEventListener('contextmenu', function(e){ if (alvo(e)) e.preventDefault(); }, true);
  document.addEventListener('click', function(e){ if (alvo(e)) e.preventDefault(); }, true);
})();
})();

/* ----- foto ampliada: toque na foto do produto (catálogo ou pedido) abre em tamanho grande; X fecha ----- */
function abrirZoom(src, legenda, precoHtml){
  fecharZoom();
  var z = document.createElement('div'); z.className = 'zoom'; z.id = 'zoomFoto';
  z.innerHTML = '<button type="button" class="zx" aria-label="Fechar foto">✕</button><img alt="">' + (legenda ? '<div class="zc"></div>' : '') + (precoHtml ? '<div class="zp">' + precoHtml + '</div>' : '');
  z.querySelector('img').src = src;
  if (legenda) z.querySelector('.zc').textContent = legenda;
  z.addEventListener('click', function(e){ if (e.target === z || e.target.classList.contains('zx')) fecharZoom(); });
  document.body.appendChild(z);
}
function fecharZoom(){ var z = document.getElementById('zoomFoto'); if (z) z.remove(); }
document.addEventListener('click', function(e){
  var im = e.target.closest && e.target.closest('.cat-it > img, .it > img, .pr-img > img');
  if (!im) return;
  var src = im.currentSrc || im.src;
  if (!src || /company\.png$/.test(src)) return; // sem foto do produto
  e.preventDefault(); e.stopPropagation();
  var box = im.closest('.pr-card') || im.parentNode, cod = box.querySelector('b, .cod'), ds = box.querySelector('.pr-desc, .ds, div.muted');
  var preco = '', pv = box.querySelector('.pr-val, .pr-tiers');
  if (pv) preco = pv.innerHTML;
  else if (box.classList.contains('it') && ED && ED.p.itens[+box.dataset.i]){
    var item = ED.p.itens[+box.dataset.i], pi = precoInfo(ED.p, item);
    preco = fmt(item.unit) + (pi.tab && pi.tab > item.unit + 0.004 ? ' <s>' + fmt(pi.tab) + '</s> <em>' + esc(pi.desc) + '</em>' : '');
  }
  abrirZoom(src, [cod && cod.textContent, ds && ds.textContent].filter(Boolean).join(' · '), preco);
}, true);
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && document.getElementById('zoomFoto')){ e.stopPropagation(); fecharZoom(); } }, true);
