/* Pedido Express → grava o pedido no sistema Company Vendas.
   Não interfere no envio pelo WhatsApp: se falhar, guarda e tenta de novo na próxima visita. */
(function(){
  var CFG = window.CV_CONFIG, META = window.EXPRESS_META;
  if (!CFG || !META) return;
  var KEY = 'cv_express_fila';
  function fila(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; } }
  function guardar(f){ try { localStorage.setItem(KEY, JSON.stringify(f.slice(-20))); } catch(e){} }
  function uuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b); b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128;
    var h = Array.prototype.map.call(b, function(x){ return ('0'+x.toString(16)).slice(-2); }).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function enviar(row){
    return fetch(CFG.url + '/rest/v1/pedidos', {
      method: 'POST', keepalive: true,
      headers: { 'apikey': CFG.key, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(row)
    }).then(function(r){ if (!r.ok && r.status !== 409) throw new Error('HTTP ' + r.status); });
  }
  function reenviar(){
    var f = fila(); if (!f.length) return;
    var resto = [], chain = Promise.resolve();
    f.forEach(function(row){ chain = chain.then(function(){ return enviar(row).catch(function(){ resto.push(row); }); }); });
    chain.then(function(){ guardar(resto); });
  }
  function val(id){ var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  var ultimo = '';
  window.__expressHook = function(o, orderNo){
    try {
      var itens = (o.entries || []).map(function(e){
        return { cod: e.it.cod, desc: e.it.desc, qty: e.qty, unit: Math.round(e.unit*100)/100, label: e.label || '', marca: META.marca };
      });
      var total = Math.round(itens.reduce(function(s,i){ return s + i.qty*i.unit; }, 0)*100)/100;
      var assinatura = JSON.stringify([itens, val('clientName'), val('clientDoc')]);
      if (assinatura === ultimo) return; // mesmo pedido enviado de novo (ex.: tocou duas vezes)
      ultimo = assinatura;
      var prazo = val('clientPrazo');
      var row = {
        id: uuid(), numero: orderNo, origem: 'express', grupo: META.grupo, marca: META.marca, politica: META.politica,
        link: location.pathname.replace(/\//g, ''), vendedor_codigo: META.vendedor,
        cliente: { name: val('clientName'), doc: val('clientDoc'), phone: val('clientPhone'), city: val('clientCity'), carrier: val('clientCarrier') },
        itens: itens, total: total, prazo: prazo || null, obs: val('clientObs') || null, status: 'recebido'
      };
      enviar(row).catch(function(){ var f = fila(); f.push(row); guardar(f); });
    } catch(e){}
  };
  if (document.readyState === 'complete') reenviar(); else window.addEventListener('load', reenviar);
})();
