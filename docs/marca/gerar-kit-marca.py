"""Gera o kit de marca da Empower Boss (SVG com o texto em contornos).
Uso: python3 docs/marca/gerar-kit-marca.py <pasta_fontes> <pasta_saida>
Fontes (Google Fonts, tamanho ótico 11): bodoni900.ttf, bodoni600i.ttf, quick600.ttf."""
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONTS, OUT = sys.argv[1], sys.argv[2]
F = {k: TTFont(os.path.join(FONTS, f)) for k, f in
     {"bodoni": "bodoni900.ttf", "italico": "bodoni600i.ttf", "quick": "quick600.ttf"}.items()}

PRETO, PAPEL, DOURADO, ROXO, NORTE, BRANCO = "#121212", "#F5F1EA", "#B8913A", "#30154C", "#1F5C5A", "#FFFFFF"
TRACK = {"bodoni": -0.03, "italico": 0.0, "quick": 0.0}


def run(font, text, size, x, baseline):
    f = F[font]
    upem = f["head"].unitsPerEm
    cmap, gs, hmtx = f.getBestCmap(), f.getGlyphSet(), f["hmtx"]
    s = size / upem
    pen, bp = SVGPathPen(gs), BoundsPen(gs)
    cx = 0.0
    for ch in text:
        g = cmap[ord(ch)]
        t = (s, 0, 0, -s, x + cx * s, baseline)
        gs[g].draw(TransformPen(pen, t))
        gs[g].draw(TransformPen(bp, t))
        cx += hmtx[g][0] + TRACK[font] * upem
    return pen.getCommands(), (cx - TRACK[font] * upem) * s, bp.bounds


def nome(text, size, x, baseline, tinta, ponto):
    """Nome com o ponto final à parte (para levar outra cor)."""
    d1, adv, b1 = run("bodoni", text, size, x, baseline)
    d2, _, b2 = run("bodoni", ".", size, x + adv + TRACK["bodoni"] * size, baseline)
    return f'<path fill="{tinta}" d="{d1}"/><path fill="{ponto}" d="{d2}"/>', (b1[0], min(b1[1], b2[1]), b2[2], max(b1[3], b2[3]))


def svg(w, h, body, titulo, fundo=None):
    bg = f'<rect width="{w:.1f}" height="{h:.1f}" fill="{fundo}"/>' if fundo else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}" width="{w:.1f}" height="{h:.1f}">'
            f"<title>{titulo}</title>{bg}{body}</svg>\n")


def guardar(rel, conteudo):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(conteudo)


def so_nome(text, tinta, ponto, fundo, titulo, pad=0):
    corpo, b = nome(text, 200, 0, 0, tinta, ponto)
    w, h = b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad
    return svg(w, h, f'<g transform="translate({pad - b[0]:.1f} {pad - b[1]:.1f})">{corpo}</g>', titulo, fundo)


def nome_slogan(tinta, ponto, slogan_cor, fundo, pad=0):
    corpo, b = nome("Empower Boss", 200, 0, 0, tinta, ponto)
    top = -b[1]
    ds, adv, bs = run("italico", "Run it like one.", 84, b[0], 0)
    base2 = b[3] + 40 - bs[1]
    ds, adv, bs = run("italico", "Run it like one.", 84, b[0], base2)
    w = max(b[2], bs[2]) - b[0] + 2 * pad
    h = bs[3] - b[1] + 2 * pad
    g = f'<g transform="translate({pad - b[0]:.1f} {pad - b[1]:.1f})">{corpo}<path fill="{slogan_cor}" d="{ds}"/></g>'
    return svg(w, h, g, "Empower Boss. Run it like one.", fundo)


def simbolo(fundo, tinta, ponto, contorno=None):
    """"Boss." centrado num quadrado de cantos vivos (3% do lado)."""
    S = 1000
    corpo_t, adv, b = run("bodoni", "Boss.", 300, 0, 0)
    w = b[2] - b[0]
    x = (S - w) / 2 - b[0]
    base = S / 2 - (b[1] + b[3]) / 2
    corpo, _ = nome("Boss", 300, x, base, tinta, ponto)
    if contorno:
        sq = f'<rect x="15" y="15" width="{S - 30}" height="{S - 30}" rx="30" fill="none" stroke="{contorno}" stroke-width="30"/>'
    else:
        sq = f'<rect width="{S}" height="{S}" rx="30" fill="{fundo}"/>'
    return svg(S, S, sq + corpo, "Boss. (símbolo Empower Boss)")


ROSA = ('<rect width="100" height="100" rx="3" fill="{f}"/>'
        '<circle cx="50" cy="50" r="36" fill="none" stroke="{t}" stroke-width="2.4"/>'
        '<path fill="{t}" fill-rule="evenodd" d="M50 20Q57 43 80 50Q57 57 50 80Q43 57 20 50Q43 43 50 20Z M50 39a11 11 0 1 0 0.01 0Z"/>'
        '<circle cx="50" cy="50" r="6.5" fill="{p}"/>')


def bussola_horizontal(tinta, by, fundo_icone, tinta_icone):
    icone = f'<g transform="scale(2.4)">{ROSA.format(f=fundo_icone, t=tinta_icone, p=DOURADO)}</g>'
    nb = 120
    corpo, b = nome("Bússola", 150, 290, nb, tinta, DOURADO)
    d, adv, _ = run("quick", "by Empower Boss", 44, 294, nb + 66)
    w = max(b[2], 294 + adv) + 4
    return svg(w, 240, icone + corpo + f'<path fill="{by}" d="{d}"/>', "Bússola by Empower Boss")


# --- Empower Boss
eb = "empower-boss"
guardar(f"{eb}/logotipo/empower-boss-preto.svg", so_nome("Empower Boss", PRETO, DOURADO, None, "Empower Boss."))
guardar(f"{eb}/logotipo/empower-boss-papel.svg", so_nome("Empower Boss", PAPEL, DOURADO, None, "Empower Boss."))
guardar(f"{eb}/logotipo/empower-boss-sobre-preto.svg", so_nome("Empower Boss", PAPEL, DOURADO, PRETO, "Empower Boss.", 60))
guardar(f"{eb}/logotipo/empower-boss-sobre-papel.svg", so_nome("Empower Boss", PRETO, DOURADO, PAPEL, "Empower Boss.", 60))
guardar(f"{eb}/logotipo/empower-boss-sobre-dourado.svg", so_nome("Empower Boss", PRETO, PRETO, DOURADO, "Empower Boss.", 60))
guardar(f"{eb}/logotipo-com-slogan/empower-boss-slogan-preto.svg", nome_slogan(PRETO, DOURADO, "#4A4642", None))
guardar(f"{eb}/logotipo-com-slogan/empower-boss-slogan-papel.svg", nome_slogan(PAPEL, DOURADO, "#CFC6B6", None))
guardar(f"{eb}/logotipo-com-slogan/empower-boss-slogan-sobre-preto.svg", nome_slogan(PAPEL, DOURADO, "#CFC6B6", PRETO, 70))
guardar(f"{eb}/simbolo/boss-preto.svg", simbolo(PRETO, PAPEL, DOURADO))
guardar(f"{eb}/simbolo/boss-papel.svg", simbolo(PAPEL, PRETO, DOURADO))
guardar(f"{eb}/simbolo/boss-dourado.svg", simbolo(DOURADO, PRETO, PRETO))
guardar(f"{eb}/simbolo/boss-contorno-preto.svg", simbolo(None, PRETO, DOURADO, contorno=PRETO))
guardar(f"{eb}/simbolo/boss-so-palavra.svg", so_nome("Boss", PRETO, DOURADO, None, "Boss."))

# --- Bússola
bu = "bussola"
guardar(f"{bu}/icone/bussola-icone.svg", svg(100, 100, ROSA.format(f=NORTE, t=BRANCO, p=DOURADO), "Bússola"))
guardar(f"{bu}/icone/bussola-icone-papel.svg", svg(100, 100, ROSA.format(f=PAPEL, t=NORTE, p=DOURADO), "Bússola"))
guardar(f"{bu}/logotipo/bussola-norte.svg", so_nome("Bússola", NORTE, DOURADO, None, "Bússola."))
guardar(f"{bu}/logotipo/bussola-papel.svg", so_nome("Bússola", PAPEL, DOURADO, None, "Bússola."))
guardar(f"{bu}/logotipo/bussola-sobre-norte.svg", so_nome("Bússola", BRANCO, DOURADO, NORTE, "Bússola.", 60))
guardar(f"{bu}/horizontal/bussola-horizontal-sobre-papel.svg", bussola_horizontal(PRETO, "#4A4642", NORTE, BRANCO))
guardar(f"{bu}/horizontal/bussola-horizontal-sobre-norte.svg", bussola_horizontal(BRANCO, "#D3E4E2", PAPEL, NORTE))
print("ok")
