"""Gera os logótipos Big Boss (família do ponto) em SVG com o texto em contornos,
mais os ícones PNG/ICO da app. Uso: python3 genlogo.py <pasta_fontes> <repo>"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from PIL import Image, ImageDraw, ImageFont

FONTS, REPO = sys.argv[1], sys.argv[2]
BODONI = os.path.join(FONTS, "bodoni900.ttf")
QUICK = os.path.join(FONTS, "quick600.ttf")
fonts = {p: TTFont(p) for p in (BODONI, QUICK)}

ROXO, GOLD, PAPEL, PRETO, BRANCO = "#30154C", "#B8913A", "#F5F1EA", "#121212", "#FFFFFF"


def run(fontpath, text, size, x, baseline, tracking=0.0):
    """Devolve (path d, avanço total, bbox) do texto na posição dada."""
    f = fonts[fontpath]
    upem = f["head"].unitsPerEm
    cmap, gs, hmtx = f.getBestCmap(), f.getGlyphSet(), f["hmtx"]
    s = size / upem
    svg = SVGPathPen(gs)
    bp = BoundsPen(gs)
    cx = 0.0
    for ch in text:
        g = cmap[ord(ch)]
        t = (s, 0, 0, -s, x + cx * s, baseline)
        gs[g].draw(TransformPen(svg, t))
        gs[g].draw(TransformPen(bp, t))
        cx += hmtx[g][0] + tracking * upem
    adv = (cx - tracking * upem) * s
    return svg.getCommands(), adv, bp.bounds


def measure(fontpath, text, size, tracking=0.0):
    _, adv, b = run(fontpath, text, size, 0, 0, tracking)
    return adv, b


TRACK = -0.03


def wordmark(x, baseline, size, ink, dot):
    d1, adv, b1 = run(BODONI, "Big Boss", size, x, baseline, TRACK)
    d2, adv2, b2 = run(BODONI, ".", size, x + adv + TRACK * size, baseline, TRACK)
    return (f'<path fill="{ink}" d="{d1}"/><path fill="{dot}" d="{d2}"/>',
            (b1[0], min(b1[1], b2[1]), b2[2], max(b1[3], b2[3])))


def icon(x, y, size, bg, ink, dot, stroke=None, word="Big"):
    r = size * 0.03
    if stroke:
        sw = size * 0.035
        sq = f'<rect x="{x+sw/2:.2f}" y="{y+sw/2:.2f}" width="{size-sw:.2f}" height="{size-sw:.2f}" rx="{r:.2f}" fill="none" stroke="{stroke}" stroke-width="{sw:.2f}"/>'
    else:
        sq = f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{r:.2f}" fill="{bg}"/>'
    fs = size * (0.40 if word == "Big" else 0.62)
    adv, b = measure(BODONI, word + ".", fs, TRACK)
    w = b[2] - b[0]
    h = b[3] - b[1]  # em coordenadas com y invertido: b[1] é -topo
    tx = x + (size - w) / 2 - b[0]
    base = y + size / 2 - (b[3] + b[1]) / 2  # centra a caixa visual
    d1, a1, _ = run(BODONI, word, fs, tx, base, TRACK)
    d2, _, _ = run(BODONI, ".", fs, tx + a1 + TRACK * fs, base, TRACK)
    return sq + f'<path fill="{ink}" d="{d1}"/><path fill="{dot}" d="{d2}"/>'


def byline(x, baseline, size, ink, anchor="start"):
    adv, b = measure(QUICK, "by Empower Boss", size)
    if anchor == "middle":
        x = x - adv / 2
    d, _, _ = run(QUICK, "by Empower Boss", size, x, baseline)
    return f'<path fill="{ink}" d="{d}"/>', adv


def svg(w, h, body, title="Big Boss by Empower Boss"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" width="{w:.2f}" height="{h:.2f}">'
            f'<title>{title}</title>{body}</svg>\n')


# Variantes de cor: (tinta, ponto, linha "by", ícone: fundo, tinta, ponto, contorno)
VARIANTS = {
    "sobre-branco": dict(ink=ROXO, dot=GOLD, by="#5B4A70", ibg=ROXO, iink=BRANCO, idot=GOLD, istroke=None),
    "sobre-roxo": dict(ink=BRANCO, dot=GOLD, by="#BDAED4", ibg=BRANCO, iink=ROXO, idot=GOLD, istroke=None),
    "branco": dict(ink=BRANCO, dot=BRANCO, by=BRANCO, ibg=None, iink=BRANCO, idot=BRANCO, istroke=BRANCO),
    "preto": dict(ink=PRETO, dot=PRETO, by=PRETO, ibg=None, iink=PRETO, idot=PRETO, istroke=PRETO),
}


def write(rel, content):
    p = os.path.join(REPO, "public", rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(content)


for name, v in VARIANTS.items():
    # compacto: só o nome
    size = 100
    wm, b = wordmark(0, 0, size, v["ink"], v["dot"])
    pad = 2
    w, h = b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad
    write(f"brand/compacto/bigboss-compacto-{name}.svg",
          svg(w, h, f'<g transform="translate({pad - b[0]:.2f} {pad - b[1]:.2f})">{wm}</g>'))

    # horizontal: ícone + nome + "by Empower Boss"
    isz = 120
    wsize = 78
    wm, wb = wordmark(0, 0, wsize, v["ink"], v["dot"])
    gap = 30
    by, byadv = byline(0, 0, 24, v["by"])
    # nome em cima, by em baixo, bloco centrado na altura do ícone
    name_h = -wb[1]
    block = name_h + 14 + 18
    top = (isz - block) / 2
    nb = top + name_h
    wm, wb = wordmark(isz + gap, nb, wsize, v["ink"], v["dot"])
    by, _ = byline(isz + gap + 3, nb + 14 + 18, 24, v["by"])
    ic = icon(0, 0, isz, v["ibg"], v["iink"], v["idot"], v["istroke"])
    w = max(wb[2], isz + gap + 3 + byadv) + 2
    write(f"brand/horizontal/bigboss-horizontal-{name}.svg", svg(w, isz, ic + wm + by))

    # empilhado: ícone por cima, nome e "by" centrados
    isz = 150
    wsize = 96
    adv, wb0 = measure(BODONI, "Big Boss.", wsize, TRACK)
    wwidth = wb0[2] - wb0[0]
    W = max(wwidth, isz) + 4
    nb = isz + 34 - wb0[1]
    wm, wb = wordmark((W - wwidth) / 2 - wb0[0], nb, wsize, v["ink"], v["dot"])
    by, _ = byline(W / 2, nb + 50, 30, v["by"], anchor="middle")
    ic = icon((W - isz) / 2, 0, isz, v["ibg"], v["iink"], v["idot"], v["istroke"])
    write(f"brand/empilhado/bigboss-empilhado-{name}.svg", svg(W, nb + 56, ic + wm + by))

    # símbolo: só o ícone
    write(f"brand/simbolo/bigboss-simbolo-{name}.svg",
          svg(100, 100, icon(0, 0, 100, v["ibg"], v["iink"], v["idot"], v["istroke"]), "Big Boss"))

# Ícones da app (SVG)
write("brand/app/bigboss-icone-roxo.svg", svg(512, 512, icon(0, 0, 512, ROXO, BRANCO, GOLD), "Big Boss"))
write("brand/app/bigboss-icone-branco.svg", svg(512, 512, icon(0, 0, 512, BRANCO, ROXO, GOLD), "Big Boss"))
fav = svg(64, 64, icon(0, 0, 64, ROXO, BRANCO, GOLD, word="B"), "Big Boss")
write("brand/app/favicon.svg", fav)
write("favicon.svg", fav)


# PNG com Pillow (mesma fonte), com supersampling
def png(size, word, pad_ratio=0.0, radius=True):
    S = 4
    big = size * S
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    r = int(big * 0.03) if radius else 0
    dr.rounded_rectangle([0, 0, big - 1, big - 1], radius=r, fill=ROXO)
    inner = big * (1 - 2 * pad_ratio)
    fs = int(inner * (0.40 if word == "Big" else 0.62))
    font = ImageFont.truetype(BODONI, fs)
    track = TRACK * fs
    parts = [(word, BRANCO), (".", GOLD)]
    # largura total com tracking
    widths = []
    for t, _ in parts:
        for ch in t:
            widths.append(font.getlength(ch))
    total = sum(widths) + track * (len(widths) - 1)
    # caixa vertical visual
    bb = font.getbbox(word + ".", anchor="ls")
    x = (big - total) / 2
    y = big / 2 - (bb[1] + bb[3]) / 2
    for t, col in parts:
        for ch in t:
            dr.text((x, y), ch, font=font, fill=col, anchor="ls")
            x += font.getlength(ch) + track
    return img.resize((size, size), Image.LANCZOS)


pub = os.path.join(REPO, "public")
png(192, "Big").save(os.path.join(pub, "icon-192.png"))
png(512, "Big").save(os.path.join(pub, "icon-512.png"))
png(512, "Big", pad_ratio=0.1, radius=False).save(os.path.join(pub, "icon-maskable-512.png"))
png(180, "Big", radius=False).convert("RGB").save(os.path.join(pub, "apple-touch-icon.png"))
png(256, "B").save(os.path.join(pub, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
print("ok")
