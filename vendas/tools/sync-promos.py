# -*- coding: utf-8 -*-
"""Copia para o programa de vendas (vendas/catalogo.json) as regras de desconto
dinâmicas dos Pedido Express, para o programa calcular igual ao site.

Rodar na raiz do repositório depois de atualizar qualquer Pedido Express:
    python3 vendas/tools/sync-promos.py

O que copia (lido do catalog-data de cada página Guirra indicada em `links`):
- pq  (preço por quantidade do próprio item): Dreamer "Oferta Quantidade" (oq) e
      BAP Energy (faixa "Promoção · mín. N")
- pg  (promoção por grupo de peças): Michael "Promoção do Mês" (pm)
- bf  (cesta Black Friday) + grupo equipo `cestas` (BASKETS da página)
- itens KIT SHOWROOM (Renove Seu Showroom) de Dylan Pro e Duonn, com foto e max
"""
import base64, hashlib, io, json, os, re, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CAT = os.path.join(RAIZ, 'vendas', 'catalogo.json')


def pagina(pasta):
    with open(os.path.join(RAIZ, pasta, 'index.html'), encoding='utf-8') as f:
        return f.read()


def catalogo_pagina(html):
    m = re.search(r'<script id="catalog-data" type="application/json">(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else []


def casar(itens_prog, itens_pag):
    """pares (item do programa, item da página) pelo código, na ordem."""
    usados, pares = set(), []
    for e in itens_pag:
        for i, it in enumerate(itens_prog):
            if i not in usados and it['cod'] == e['cod']:
                usados.add(i); pares.append((it, e)); break
    return pares


def salva_foto(data_url):
    from PIL import Image
    raw = base64.b64decode(data_url.split(',', 1)[1])
    nome = hashlib.sha1(raw).hexdigest()[:16] + '.webp'
    dest = os.path.join(RAIZ, 'vendas', 'img', nome)
    if not os.path.exists(dest):
        im = Image.open(io.BytesIO(raw)).convert('RGB')
        im.thumbnail((700, 700))
        im.save(dest, 'WEBP', quality=82)
    return '/vendas/img/' + nome


def main():
    C = json.load(open(CAT, encoding='utf-8'))
    grupos = {g['id']: g for g in C['grupos']}
    resumo = []

    # Dreamer: oferta por quantidade
    for m in grupos['dreamer']['marcas']:
        pag = catalogo_pagina(pagina(m['links']['tab']))
        n = 0
        for it, e in casar(m['itens'], pag):
            it.pop('pq', None)
            if e.get('oq'):
                it['pq'] = {'q': [[e['oq']['q'], e['oq']['p']]], 'u': e['oq'].get('u', 'un'), 'nome': 'Oferta Quantidade'}; n += 1
        resumo.append('dreamer oferta quantidade: %d itens' % n)

    # BAP: faixa promocional com quantidade mínima
    for m in grupos['bap']['marcas']:
        pag = catalogo_pagina(pagina(m['links']['tab']))
        n = 0
        for it, e in casar(m['itens'], pag):
            it.pop('pq', None)
            ts = [t for t in (e.get('tiers') or []) if t.get('min') and not t.get('max') and t['unit'] < (e.get('price') or 0) - 0.004]
            if ts:
                it['pq'] = {'q': [[t['min'], t['unit']] for t in ts], 'u': 'un', 'nome': 'Promoção'}; n += 1
        resumo.append('bap promoção por quantidade: %d itens' % n)

    # Michael: promoção do mês por grupo de peças
    for m in grupos['michael']['marcas']:
        pag = catalogo_pagina(pagina(m['links']['tab']))
        n = 0
        for it, e in casar(m['itens'], pag):
            it.pop('pg', None)
            if e.get('pm'):
                it['pg'] = {'g': e['pm']['g'], 'm': e['pm']['m'], 'u': e['pm']['p'], 'nome': 'Promoção do Mês'}; n += 1
        resumo.append('michael promoção do mês: %d itens' % n)

    # Equipo Black Friday: cestas
    eq = grupos['equipo']
    for m in eq['marcas']:
        if m['id'] != 'bf':
            continue
        html = pagina(m['links']['15c'])
        eq['cestas'] = json.loads(re.search(r'var BASKETS = (\{.*?\});', html).group(1))
        n = 0
        for it, e in casar(m['itens'], catalogo_pagina(html)):
            if e.get('bf'):
                it['bf'] = e['bf']; n += 1
        resumo.append('equipo black friday: %d itens em %d cestas' % (n, len(eq['cestas'])))

    # Renove Seu Showroom (Dylan Pro e Duonn)
    for m in grupos['dylan']['marcas']:
        if m['id'] not in ('dylanpro', 'duonn'):
            continue
        pids = list(m['links'].keys())
        kits = {}
        for pid in pids:
            for e in catalogo_pagina(pagina(m['links'][pid])):
                if e.get('showroom'):
                    kits.setdefault(e['cod'], {})[pid] = e
        m['itens'] = [i for i in m['itens'] if not i.get('showroom')]
        for cod, por in kits.items():
            e0 = next(iter(por.values()))
            m['itens'].append({
                'k': cod + '|sr', 'cod': cod, 'desc': e0.get('desc', ''), 'cat': 'Renove Seu Showroom',
                'img': salva_foto(e0['img']) if str(e0.get('img', '')).startswith('data:') else e0.get('img'),
                'p': {pid: por[pid]['price'] for pid in por}, 'o': {pid: por[pid].get('orig') for pid in por},
                'av': {pid: bool(por[pid].get('avail')) for pid in por},
                'tag': 'Promoção', 'showroom': True, 'max': e0.get('max', 1)})
        resumo.append('%s renove seu showroom: %d kits' % (m['id'], len(kits)))

    with open(CAT, 'w', encoding='utf-8') as f:
        f.write(json.dumps(C, ensure_ascii=False, separators=(',', ':')))
    print('\n'.join(resumo))


if __name__ == '__main__':
    main()
