/* Company Vendas — app de pedidos (offline) · teste Grupo Dylan + Grupo Equipo */
(function(){
'use strict';
var CFG = window.CV_CONFIG;
var $app = document.getElementById('app');

var STATUS = [
  ['recebido','Recebido'],['em_revisao','Em revisão'],['espelho_enviado','Espelho enviado'],['aprovado','Aprovado'],
  ['enviado_fabrica','Enviado à fábrica'],['faturado','Faturado'],['cancelado','Cancelado']
];
var STATUS_NOME = {}; STATUS.forEach(function(s){ STATUS_NOME[s[0]] = s[1]; });
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
  pedidos: {}, clientes: [], fila: [], cat: null, catGerado: '', online: navigator.onLine,
  syncing: false, lastSync: lsGet('cv_lastsync', null), syncErr: '', filtro: { st:'', org:'', vend:'', q:'' }
};
function salvarLocal(){ return Promise.all([kvSet('pedidos', S.pedidos), kvSet('clientes', S.clientes), kvSet('fila', S.fila)]); }
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
    if (r.status === 204 || opt.prefer === 'return=minimal') return null;
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
var CADEIAS = { dylan: [[12,10,10],[12,10,15],[12,10,20],[12,10],[12]] };
function numBR(x){ return String(Math.round(x*10)/10).replace('.', ','); }
function precoInfo(p, it){
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
function imgDe(gid, cod){ var a = acharItem(gid, cod); return a && a.it.img ? a.it.img : 'company.png'; }

/* ---------- sincronização ---------- */
function sincronizar(manual){
  if (S.syncing || !S.sess) return Promise.resolve();
  if (!navigator.onLine){ if (manual) toast('Sem internet. Os pedidos ficam guardados e sobem quando a conexão voltar.'); return Promise.resolve(); }
  S.syncing = true; S.syncErr = ''; topo();
  var chain = Promise.resolve();
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
      S.perfil ? null : carregarPerfil()
    ]);
  }).then(function(res){
    var novos = {};
    (res[0]||[]).forEach(function(p){ novos[p.id] = pendentes(p.id) && S.pedidos[p.id] ? S.pedidos[p.id] : p; });
    S.fila.forEach(function(op){ if (S.pedidos[op.id]) novos[op.id] = S.pedidos[op.id]; });
    S.pedidos = novos; S.clientes = res[1] || [];
    S.lastSync = new Date().toISOString(); lsSet('cv_lastsync', S.lastSync);
    return salvarLocal();
  }).catch(function(e){
    S.syncErr = (e && e.auth) ? e.message : 'Não foi possível sincronizar agora (' + String(e && e.message || e).slice(0,120) + ')';
    if (e && e.auth){ S.sess = null; lsSet('cv_sess', null); }
  }).then(function(){ S.syncing = false; render(); });
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
  var n = S.fila.length, on = navigator.onLine;
  el.className = 'sync' + (!on ? ' off' : n ? ' pend' : '');
  el.innerHTML = '<span class="dot"></span>' + (S.syncing ? 'Sincronizando…' : !on ? 'Offline' + (n ? ' · ' + n + ' pendente' + (n>1?'s':'') : '') : n ? n + ' para enviar' : 'Online');
  el.title = S.lastSync ? 'Última sincronização: ' + dataBR(S.lastSync) : '';
}
function casca(conteudo, acoes){
  var r = rota().nome;
  var tabs = [['pedidos','Pedidos'],['novo','Novo pedido'],['clientes','Clientes'],['mais','Mais']];
  $app.innerHTML =
    '<header class="top"><div class="wrap"><div class="top-row"><img src="company.png" alt="Company">' +
      '<div class="top-title">Company Vendas<small>' + esc(S.perfil ? S.perfil.nome : '') + (souAdmin() ? ' · administrador' : '') + '</small></div>' +
      '<button class="sync" id="syncPill" type="button"></button></div>' +
      '<nav class="tabs">' + tabs.map(function(t){ return '<a href="#' + t[0] + '" class="' + (r === t[0] || (r==='pedido' && t[0]==='pedidos') ? 'on' : '') + '">' + t[1] + '</a>'; }).join('') + '</nav>' +
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
    '<label class="lb">Senha</label><input class="in" type="password" id="lSenha" autocomplete="current-password" required>' +
    '<button class="btn pri" style="width:100%;margin-top:14px" id="lBtn">Entrar</button></form>' +
    '<p class="muted" style="font-size:12.5px;text-align:center;margin-top:14px">O primeiro acesso precisa de internet. Depois o app funciona offline.</p></div></div>';
  document.getElementById('fLogin').onsubmit = function(ev){
    ev.preventDefault();
    var b = document.getElementById('lBtn'); b.disabled = true; b.textContent = 'Entrando…';
    login(document.getElementById('lEmail').value.trim(), document.getElementById('lSenha').value)
      .then(carregarPerfil).then(function(){ location.hash = '#pedidos'; return sincronizar(); })
      .catch(function(e){ S.sess = null; lsSet('cv_sess', null); telaLogin(e.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : e.message); });
  };
}

function listaPedidos(){
  var arr = Object.keys(S.pedidos).map(function(k){ return S.pedidos[k]; });
  arr.sort(function(a,b){ return String(b.criado_em).localeCompare(String(a.criado_em)); });
  return arr;
}
function telaPedidos(){
  var f = S.filtro, todos = listaPedidos();
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
    return '<button class="chip" data-st="' + s[0] + '" aria-pressed="' + (f.st === s[0]) + '">' + s[1] + ' <span class="ct">' + cnt(function(p){ return !s[0] || p.status === s[0]; }) + '</span></button>';
  }).join('');
  var chipsOrg = [['','Todas as origens'],['express','Pedido Express'],['app','Lançados no app']].map(function(s){
    return '<button class="chip" data-org="' + s[0] + '" aria-pressed="' + (f.org === s[0]) + '">' + s[1] + '</button>';
  }).join('') + (souAdmin() ? [['','Todos vendedores']].concat(Object.keys(CFG.vendedores).map(function(k){ return [k, CFG.vendedores[k]]; })).map(function(s){
    return '<button class="chip" data-vend="' + s[0] + '" aria-pressed="' + (f.vend === s[0]) + '">' + s[1] + '</button>';
  }).join('') : '');
  var html = '<div class="row"><h1 class="grow">Pedidos</h1><a class="btn pri" href="#novo">+ Novo pedido</a></div>' +
    '<input class="in" id="qBusca" placeholder="Buscar por cliente, CNPJ, cidade ou nº do pedido" value="' + esc(f.q) + '">' +
    '<div class="chips" style="margin-top:10px">' + chipsSt + '</div><div class="chips" style="margin-top:6px">' + chipsOrg + '</div>' +
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
  var html = '<div class="row"><a class="btn sm" href="#pedidos">← Pedidos</a><div class="grow"></div>' +
      (p.origem === 'express' ? '<span class="badge b-express">Pedido Express</span>' : '<span class="badge">Lançado no app</span>') + '</div>' +
    '<h1 style="margin-top:12px">' + (ED.novo ? 'Novo pedido' : 'Pedido ' + esc(p.numero)) + '</h1>' +
    '<div class="muted" style="margin-top:-8px;margin-bottom:10px">' + esc(g ? g.nome : p.grupo) + ' · ' + esc(politicaNome(p.grupo, p.politica)) + ' · ' + esc(CFG.vendedores[p.vendedor_codigo] || p.vendedor_codigo) +
      (p.criado_em ? ' · ' + dataBR(p.criado_em) : '') + '</div>' +
    (pendentes(p.id) ? '<div class="note warn">Alterações guardadas neste aparelho. Sobem para o sistema assim que houver internet.</div>' : '') +
    (ED.sujo ? '<div class="note info">Você tem alterações não salvas.</div>' : '') +
    (travado ? '<div class="note info">Pedido ' + esc(STATUS_NOME[p.status]) + '. Para editar, mude o status.</div>' : '') +
    '<div class="card pad"><div class="grid2">' +
      '<div><label class="lb">Status</label><select class="in" id="eSt">' + STATUS.map(function(s){ return '<option value="' + s[0] + '"' + (p.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="lb">Política de preço</label><select class="in" id="ePol"' + (travado ? ' disabled' : '') + '>' + (g ? g.politicas.map(function(x){ return '<option value="' + x.id + '"' + (politicaId(p.grupo, p.politica) === x.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('') : '<option>' + esc(p.politica) + '</option>') + '</select></div>' +
      '<div><label class="lb">Cliente / razão social</label><input class="in" data-c="name" value="' + esc(c.name) + '"></div>' +
      '<div><label class="lb">CNPJ / CPF</label><input class="in" data-c="doc" inputmode="numeric" value="' + esc(c.doc) + '"></div>' +
      '<div><label class="lb">Telefone / WhatsApp</label><input class="in" data-c="phone" type="tel" value="' + esc(c.phone) + '"></div>' +
      '<div><label class="lb">Cidade / UF</label><input class="in" data-c="city" value="' + esc(c.city) + '"></div>' +
      '<div><label class="lb">Transportadora</label><input class="in" data-c="carrier" value="' + esc(c.carrier) + '"></div>' +
      '<div><label class="lb">Prazo de pagamento</label><input class="in" id="ePrazo" list="prazosL" value="' + esc(p.prazo) + '"><datalist id="prazosL">' + PRAZOS.map(function(x){ return '<option value="' + x + '">'; }).join('') + '</datalist></div>' +
    '</div><label class="lb">Observação</label><textarea class="in" id="eObs" rows="2">' + esc(p.obs) + '</textarea></div>' +
    '<div class="row" style="margin-top:16px"><h2 class="grow" style="margin:0">Itens (' + p.itens.length + ')</h2>' + (travado ? '' : '<button class="btn sm pri" id="eAdd">+ Adicionar produto</button>') + '</div>' +
    '<div class="card" style="margin-top:8px"><div class="pad" id="eItens">' + (p.itens.length ? p.itens.map(function(it, i){ return linhaItem(p, it, i, travado); }).join('') : '<div class="empty">Nenhum item. Toque em “Adicionar produto”.</div>') + '</div>' +
      '<div class="totbar"><span>Total</span><span id="eTot">' + fmt(totalItens(p.itens)) + '</span></div></div>' +
    (orig && !ED.novo ? '<div class="row" style="margin-top:12px"><button class="btn sm" id="eOrig">Ver o que o cliente enviou' + (r2(orig.total) !== totalItens(p.itens) ? ' (total original ' + fmt(orig.total) + ')' : '') + '</button>' +
      '<button class="btn sm" id="eHist">Histórico de alterações</button></div>' : '');
  var acoes = '<button class="btn" id="ePdf">Gerar espelho PDF</button>' + (c.phone ? '<button class="btn" id="eWa">WhatsApp do cliente</button>' : '') + '<button class="btn pri" id="eSalvar">' + (ED.novo ? 'Salvar pedido' : 'Salvar alterações') + '</button>';
  casca(html, acoes);
  var marcar = function(){ ED.sujo = true; };
  $app.querySelectorAll('[data-c]').forEach(function(inp){ inp.oninput = function(){ ED.p.cliente = ED.p.cliente || {}; ED.p.cliente[inp.dataset.c] = inp.value; marcar(); }; });
  document.getElementById('ePrazo').oninput = function(){ ED.p.prazo = this.value; marcar(); };
  document.getElementById('eObs').oninput = function(){ ED.p.obs = this.value; marcar(); };
  document.getElementById('eSt').onchange = function(){ ED.p.status = this.value; marcar(); telaEditor(); };
  document.getElementById('ePol').onchange = function(){ trocarPolitica(this.value); };
  var add = document.getElementById('eAdd'); if (add) add.onclick = function(){ abrirCatalogo(); };
  document.getElementById('eSalvar').onclick = salvarPedido;
  document.getElementById('ePdf').onclick = function(){ gerarEspelho(ED.p); };
  var wa = document.getElementById('eWa'); if (wa) wa.onclick = function(){ var n = soNum(ED.p.cliente.phone); if (n.length <= 11) n = '55' + n; window.open('https://wa.me/' + n, '_blank'); };
  var bo = document.getElementById('eOrig'); if (bo) bo.onclick = verOriginal;
  var bh = document.getElementById('eHist'); if (bh) bh.onclick = verHistorico;
  ligarItens(travado);
}
function linhaItem(p, it, i, travado){
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
    var i = +row.dataset.i, it = ED.p.itens[i];
    var upd = function(){ ED.sujo = true; var lt = row.querySelector('.lt'); lt.textContent = fmt(r2(it.qty*it.unit)); document.getElementById('eTot').textContent = fmt(totalItens(ED.p.itens)); };
    row.querySelector('[data-dec]').onclick = function(){ if (it.qty > 1){ it.qty--; row.querySelector('[data-q]').value = it.qty; upd(); } };
    row.querySelector('[data-inc]').onclick = function(){ it.qty++; row.querySelector('[data-q]').value = it.qty; upd(); };
    row.querySelector('[data-q]').onchange = function(){ var v = parseInt(this.value,10); it.qty = v > 0 ? v : 1; this.value = it.qty; upd(); };
    row.querySelector('[data-u]').onchange = function(){ var v = parseFloat(String(this.value).replace(/\./g,'').replace(',','.')); if (!(v >= 0)) v = it.unit; it.unit = r2(v); this.value = it.unit.toFixed(2).replace('.',','); upd(); };
    row.querySelector('[data-rm]').onclick = function(){ if (confirm('Remover ' + it.cod + ' do pedido?')){ ED.p.itens.splice(i,1); ED.sujo = true; telaEditor(); } };
  });
}
function trocarPolitica(pid){
  var p = ED.p, g = grupo(p.grupo); if (!g) return;
  var n = 0;
  p.itens.forEach(function(it){
    var a = acharItem(p.grupo, it.cod); if (!a) return;
    var novo = a.it.p[pid];
    if (a.it.tiers && a.it.tiers[pid] && it.label){ var t = a.it.tiers[pid].find(function(x){ return x.label === it.label; }); if (t) novo = t.unit; }
    if (novo != null && r2(novo) !== r2(it.unit)){ it.unit = r2(novo); n++; }
  });
  p.politica = g.politicas.find(function(x){ return x.id === pid; }).nome; ED.sujo = true;
  telaEditor(); if (n) toast(n + ' preço(s) atualizado(s) para a política ' + p.politica);
}
function salvarPedido(){
  var p = ED.p;
  if (!p.itens.length){ toast('Adicione pelo menos um item.'); return; }
  if (!(p.cliente && p.cliente.name)){ toast('Informe o nome do cliente.'); return; }
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
function abrirCatalogo(){
  var p = ED.p, g = grupo(p.grupo), pid = politicaId(p.grupo, p.politica);
  if (!g){ toast('Catálogo deste grupo não está no aparelho.'); return; }
  var st = { marca: g.marcas[0].id, q: '', so: false };
  var m = modal('Adicionar produto · ' + g.nome, '');
  function desenha(){
    var mar = g.marcas.find(function(x){ return x.id === st.marca; });
    var q = st.q.toLowerCase();
    var pool = q ? g.marcas.reduce(function(a, mm){ return a.concat(mm.itens.map(function(i){ return { i: i, m: mm }; })); }, []) : mar.itens.map(function(i){ return { i: i, m: mar }; });
    var itens = pool.filter(function(x){ if (st.so && !x.i.av[pid]) return false; return !q || (x.i.cod + ' ' + x.i.desc + ' ' + x.i.cat).toLowerCase().indexOf(q) > -1; }).slice(0, 150);
    m.body.innerHTML = '<input class="in" id="cQ" placeholder="Buscar código ou nome em todas as marcas" value="' + esc(st.q) + '">' +
      '<div class="chips" style="margin-top:8px">' + g.marcas.map(function(mm){ return '<button class="chip" data-m="' + mm.id + '" aria-pressed="' + (!q && st.marca === mm.id) + '">' + esc(mm.nome) + ' <span class="ct">' + mm.itens.length + '</span></button>'; }).join('') +
      '<button class="chip" data-so aria-pressed="' + st.so + '">Só disponíveis</button></div>' +
      '<div class="muted" style="font-size:12px;margin:6px 0">' + esc(mar.sub || '') + ' · preços da política ' + esc(politicaNome(p.grupo, pid)) + '</div>' +
      itens.map(function(x){
        var it = x.i, pr = it.p[pid], av = it.av[pid], tiers = it.tiers && it.tiers[pid];
        var opts = '';
        if (!av || pr == null) opts = '<span class="muted" style="font-size:12.5px">' + (pr == null ? 'Preço sob consulta — ' : '') + (av ? '' : 'indisponível — ') + '</span><button class="btn sm" data-add="' + esc(it.k) + '" data-mm="' + x.m.id + '">Adicionar mesmo assim</button>';
        else if (tiers) opts = tiers.map(function(t, ti){ return '<button class="btn sm" data-add="' + esc(it.k) + '" data-mm="' + x.m.id + '" data-t="' + ti + '">' + esc(t.label) + ' · ' + fmt(t.unit) + '</button>'; }).join('');
        else if (it.cores) opts = it.cores.map(function(cor){ return '<button class="btn sm" data-add="' + esc(it.k) + '" data-mm="' + x.m.id + '" data-cor="' + esc(cor) + '">+ ' + esc(cor) + '</button>'; }).join('');
        else opts = '<button class="btn sm pri" data-add="' + esc(it.k) + '" data-mm="' + x.m.id + '">+ Adicionar</button>';
        return '<div class="cat-it' + (av ? '' : ' unav') + '"><img src="' + esc(it.img || 'company.png') + '" loading="lazy" alt="" onerror="this.src=\'company.png\'"><div>' +
          '<div><b>' + esc(it.cod) + '</b>' + (it.tag ? '<span class="tag">' + esc(it.tag) + '</span>' : '') + (av ? '' : '<span class="tag ind">INDISPONÍVEL</span>') + (q ? ' <span class="muted" style="font-size:12px">· ' + esc(x.m.nome) + '</span>' : '') + '</div>' +
          '<div class="muted" style="font-size:13px">' + esc(it.desc) + '</div>' +
          '<div class="pr">' + (pr == null ? 'Sob consulta' : fmt(pr)) + (it.o && it.o[pid] ? ' <s class="muted" style="font-weight:500">' + fmt(it.o[pid]) + '</s>' : '') + '</div>' +
          '<div class="opts">' + opts + '</div></div></div>';
      }).join('') + (itens.length ? '' : '<div class="empty">Nada encontrado.</div>');
    var cq = m.body.querySelector('#cQ');
    cq.oninput = function(){ st.q = this.value; var pos = this.selectionStart; desenha(); var e = m.body.querySelector('#cQ'); e.focus(); e.setSelectionRange(pos,pos); };
    m.body.querySelectorAll('[data-m]').forEach(function(b){ b.onclick = function(){ st.marca = b.dataset.m; st.q = ''; desenha(); m.body.scrollTop = 0; }; });
    m.body.querySelector('[data-so]').onclick = function(){ st.so = !st.so; desenha(); };
    m.body.querySelectorAll('[data-add]').forEach(function(b){ b.onclick = function(){
      var mm = g.marcas.find(function(x){ return x.id === b.dataset.mm; });
      var it = mm.itens.find(function(x){ return x.k === b.dataset.add; });
      var unit = it.p[pid] || 0, label = '', qty = 1;
      if (b.dataset.t != null){ var t = it.tiers[pid][+b.dataset.t]; unit = t.unit; label = t.label; qty = t.step || 1; }
      if (b.dataset.cor) label = 'Cor: ' + b.dataset.cor;
      var ex = ED.p.itens.find(function(x){ return x.cod === it.cod && (x.label||'') === label; });
      if (ex) ex.qty += qty; else ED.p.itens.push({ cod: it.cod, desc: it.desc, qty: qty, unit: r2(unit), label: label, marca: mm.nome });
      ED.sujo = true; toast(it.cod + (label ? ' (' + label + ')' : '') + ' adicionado', 1400);
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
    '<label class="lb">Representada</label><div class="chips" id="nG">' + S.cat.grupos.map(function(g, i){ return '<button class="chip" data-g="' + g.id + '" aria-pressed="' + (i === 0) + '">' + esc(g.nome) + '</button>'; }).join('') + '</div>' +
    '<label class="lb">Política de preço</label><select class="in" id="nPol"></select>' +
    (vend.length > 1 ? '<label class="lb">Vendedor</label><select class="in" id="nVend">' + vend.map(function(k){ return '<option value="' + k + '">' + esc(CFG.vendedores[k]) + '</option>'; }).join('') + '</select>' : '') +
    '<label class="lb">Cliente</label><input class="in" id="nCli" list="cliL" placeholder="Digite o nome ou CNPJ de um cliente cadastrado, ou um cliente novo" value="' + esc(pre ? pre.nome : '') + '">' +
    '<datalist id="cliL">' + S.clientes.map(function(c){ return '<option value="' + esc(c.nome) + '">' + esc((c.doc||'') + ' ' + (c.cidade||'')) + '</option>'; }).join('') + '</datalist>' +
    '<button class="btn pri" style="margin-top:14px;width:100%" id="nGo">Continuar → escolher produtos</button></div>';
  casca(html);
  var gsel = S.cat.grupos[0].id;
  function pols(){ var g = grupo(gsel); document.getElementById('nPol').innerHTML = g.politicas.map(function(x){ return '<option value="' + x.id + '">' + esc(x.nome) + '</option>'; }).join(''); }
  pols();
  $app.querySelectorAll('[data-g]').forEach(function(b){ b.onclick = function(){ gsel = b.dataset.g; $app.querySelectorAll('[data-g]').forEach(function(x){ x.setAttribute('aria-pressed', x === b); }); pols(); }; });
  document.getElementById('nGo').onclick = function(){
    var nome = document.getElementById('nCli').value.trim();
    var c = S.clientes.find(function(x){ return x.nome === nome || (x.doc && x.doc === soNum(nome)); });
    var g = grupo(gsel), pid = document.getElementById('nPol').value, d = new Date();
    var vsel = document.getElementById('nVend') ? document.getElementById('nVend').value : vend[0];
    ED = { novo: true, sujo: true, p: {
      id: uuid(), numero: 'CV-' + String(d.getFullYear()).slice(2) + p2(d.getMonth()+1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + Math.floor(Math.random()*90+10),
      origem: 'app', grupo: gsel, marca: g.nome, politica: g.politicas.find(function(x){ return x.id === pid; }).nome, vendedor_codigo: vsel,
      cliente: c ? { name: c.nome, doc: c.doc || '', phone: c.telefone || '', city: c.cidade || '', carrier: c.transportadora || '' } : { name: nome },
      itens: [], total: 0, prazo: '', obs: '', status: 'em_revisao', original: null
    } };
    S.pedidos[ED.p.id] = undefined; delete S.pedidos[ED.p.id];
    telaEditor(); window.scrollTo(0,0);
    setTimeout(abrirCatalogo, 50);
  };
}

/* ----- clientes ----- */
function telaClientes(arg){
  var q = (arg ? decodeURIComponent(arg) : '').toLowerCase();
  var cnt = {}; listaPedidos().forEach(function(p){ var d = soNum(p.cliente && p.cliente.doc) || (p.cliente && p.cliente.name); cnt[d] = (cnt[d]||0) + 1; });
  var lista = S.clientes.filter(function(c){ return !q || (c.nome + ' ' + (c.doc||'') + ' ' + (c.cidade||'')).toLowerCase().indexOf(q) > -1; });
  casca('<h1>Clientes</h1><input class="in" id="qCli" placeholder="Buscar cliente" value="' + esc(q) + '">' +
    '<p class="muted" style="font-size:13px">Clientes entram aqui automaticamente pelo CNPJ quando enviam um Pedido Express ou quando você lança um pedido.</p>' +
    '<div class="list">' + (lista.length ? lista.map(function(c){
      return '<div class="card pad"><div class="row"><div class="grow"><b>' + esc(c.nome) + '</b>' + (c.confirmado ? '' : ' <span class="badge b-pend">pré-cadastro</span>') +
        '<div class="muted" style="font-size:13px">' + esc([c.doc, c.cidade, c.telefone].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="row" style="gap:6px"><button class="btn sm" data-ver="' + esc(c.nome) + '">' + (cnt[c.doc] || 0) + ' pedido(s)</button><a class="btn sm pri" href="#novo/' + c.id + '">Novo pedido</a></div></div></div>';
    }).join('') : '<div class="card empty">' + (S.clientes.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda.') + '</div>') + '</div>');
  document.getElementById('qCli').onchange = function(){ location.hash = '#clientes/' + encodeURIComponent(this.value); };
  $app.querySelectorAll('[data-ver]').forEach(function(b){ b.onclick = function(){ S.filtro = { st:'', org:'', vend:'', q: b.dataset.ver }; location.hash = '#pedidos'; }; });
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
    S.sess = null; S.perfil = null; S.pedidos = {}; S.clientes = []; S.fila = [];
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

/* ----- PDF espelho ----- */
function gerarEspelho(p){
  var tot = totalItens(p.itens);
  var RED = '#b8821e', DARK = '#1b1b1d', MUTED = '#6c6c70', LINE = '#dcd9d3', SOFT = '#f6f5f2';
  var doc = new PdfDoc(), M = 36, W = doc.W, CW = W - 2*M, BOTTOM = doc.H - 58, d = new Date();
  var dateStr = p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear()+' às '+p2(d.getHours())+':'+p2(d.getMinutes());
  var comp = logoToJpeg(document.getElementById('compLogo'), 500);
  if (comp){ var ch = 50, cw = comp.w * ch / comp.h; doc.image(doc.addJpeg(comp.url, comp.w, comp.h), M, M - 6, cw, ch); }
  var g = grupo(p.grupo), c = p.cliente || {};
  doc.text(W - M, M + 10, (g ? g.nome : p.grupo).toUpperCase(), { size: 12, bold: true, color: RED, align: 'right' });
  doc.text(W - M, M + 24, 'Política: ' + politicaNome(p.grupo, p.politica), { size: 8.5, color: MUTED, align: 'right' });
  var y = 104;
  doc.text(M, y, 'ESPELHO DO PEDIDO', { size: 18, bold: true, color: RED });
  doc.text(M, y + 14, 'Para conferência e aprovação do cliente · ' + (STATUS_NOME[p.status] || p.status), { size: 8.5, color: MUTED });
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
  var cols = [{t:'#',w:18,a:'center'},{t:'CÓDIGO',w:70,a:'left'},{t:'DESCRIÇÃO',w:0,a:'left'},{t:'QTD',w:28,a:'right'},{t:'PREÇO TABELA',w:62,a:'right'},{t:'DESCONTO',w:56,a:'center'},{t:'PREÇO FINAL',w:60,a:'right'},{t:'TOTAL',w:64,a:'right'}];
  cols[2].w = CW - cols.reduce(function(s,x){ return s + x.w; }, 0);
  var PAD = 5;
  function colX(i){ var x = M; for (var k=0;k<i;k++) x += cols[k].w; return x; }
  function head(){ doc.rect(M, y, CW, 18, RED); cols.forEach(function(cc,i){ var x = cc.a==='right' ? colX(i)+cc.w-PAD : cc.a==='center' ? colX(i)+cc.w/2 : colX(i)+PAD; doc.text(x, y+12, cc.t, { size: 7.5, bold: true, color: '#ffffff', align: cc.a }); }); y += 18; }
  head();
  var tq = 0, somaTab = 0;
  p.itens.forEach(function(e, idx){
    var desc = e.desc + (e.label ? ' — ' + e.label : '') + (e.marca ? ' (' + e.marca + ')' : '');
    var lines = pdfWrap(desc, false, 8.5, cols[2].w - 2*PAD), rowH = Math.max(18, lines.length*10.5 + 8);
    if (y + rowH > BOTTOM){ doc.addPage(); y = M; doc.text(M, y+8, 'Espelho ' + p.numero + ' · ' + (c.name||'') + ' (continuação)', { size: 8.5, bold: true, color: MUTED }); y += 18; head(); }
    if (idx % 2) doc.rect(M, y, CW, rowH, SOFT);
    var b = y + 12;
    doc.text(colX(0)+cols[0].w/2, b, String(idx+1), { size: 8.5, color: MUTED, align: 'center' });
    doc.text(colX(1)+PAD, b, e.cod, { size: 8.5, bold: true });
    lines.forEach(function(l, li){ doc.text(colX(2)+PAD, b + li*10.5, l, { size: 8.5 }); });
    doc.text(colX(3)+cols[3].w-PAD, b, String(e.qty), { size: 8.5, bold: true, align: 'right' });
    var pi = precoInfo(p, e); if (pi.tab){ somaTab += pi.tab*e.qty; } else { somaTab += e.unit*e.qty; }
    doc.text(colX(4)+cols[4].w-PAD, b, pi.tab ? fmt(pi.tab) : '—', { size: 8, color: MUTED, align: 'right' });
    var dl = pdfWrap(pi.desc || '—', true, 7.5, cols[5].w - 4); dl.forEach(function(l, li){ doc.text(colX(5)+cols[5].w/2, b + li*9, l, { size: 7.5, bold: true, color: RED, align: 'center' }); });
    doc.text(colX(6)+cols[6].w-PAD, b, fmt(e.unit), { size: 8.5, bold: true, align: 'right' });
    doc.text(colX(7)+cols[7].w-PAD, b, fmt(r2(e.qty*e.unit)), { size: 8.5, bold: true, align: 'right' });
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
  y += 56;
  if (obs.length){ doc.text(M, y, 'OBSERVAÇÕES', { size: 7.5, bold: true, color: RED }); y += 6; var oh = obs.length*12 + 12; doc.rect(M, y, CW, oh, null, LINE, 0.8); obs.forEach(function(l,i){ doc.text(M+10, y+15+i*12, l, { size: 9 }); }); y += oh + 16; }
  y = Math.max(y + 30, Math.min(BOTTOM - 20, y + 40)); var sw = (CW - 40)/2;
  doc.line(M, y, M+sw, y, '#9a9892', 0.7); doc.line(M+sw+40, y, M+CW, y, '#9a9892', 0.7);
  doc.text(M+sw/2, y+11, 'De acordo — cliente', { size: 8, color: MUTED, align: 'center' });
  doc.text(M+sw+40+sw/2, y+11, 'Company Representações', { size: 8, color: MUTED, align: 'center' });
  var np = doc.pages.length;
  doc.pages.forEach(function(ops, i){ doc.ops = ops; doc.line(M, doc.H-40, W-M, doc.H-40, LINE, 0.6);
    doc.text(M, doc.H-28, 'Espelho sujeito a confirmação de estoque e aprovação da fábrica.', { size: 7, color: MUTED });
    doc.text(W-M, doc.H-28, 'Página ' + (i+1) + ' de ' + np, { size: 7, color: MUTED, align: 'right' }); });
  var bytes = doc.output();
  var nome = 'espelho-' + p.numero + '-' + String(c.name||'cliente').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '.pdf';
  var file = null; try { file = new File([bytes], nome, { type: 'application/pdf' }); } catch(e){}
  var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (mobile && file && navigator.canShare && navigator.canShare({ files: [file] })){
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

/* ---------- roteador ---------- */
function render(){
  if (!S.sess){ telaLogin(S.syncErr && /Sessão/.test(S.syncErr) ? S.syncErr : ''); return; }
  if (!S.perfil){ casca('<div class="card empty">Carregando seu perfil…</div>'); carregarPerfil().then(render, function(e){ telaLogin(e.message); S.sess = null; lsSet('cv_sess', null); }); return; }
  var r = rota();
  if (r.nome !== 'pedido' && ED && ED.sujo && !ED.novo){ /* descarta edição não salva ao sair */ }
  if (r.nome !== 'pedido' && r.nome !== 'novo') ED = null;
  if (r.nome === 'pedido') return abrirPedido(r.arg);
  if (r.nome === 'novo') return ED && ED.novo ? telaEditor() : telaNovo(r.arg);
  if (r.nome === 'clientes') return telaClientes(r.arg);
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

Promise.all([kvGet('pedidos'), kvGet('clientes'), kvGet('fila'), carregarCatalogo()]).then(function(r){
  S.pedidos = r[0] || {}; S.clientes = r[1] || []; S.fila = r[2] || [];
  render(); sincronizar();
});
window.__cv = S;
})();
