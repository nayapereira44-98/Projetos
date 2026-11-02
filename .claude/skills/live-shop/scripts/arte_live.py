#!/usr/bin/env python3
"""Gera artes de produto para LIVE (TikTok Shop / Shopee) a partir da FOTO REAL do produto.

Nada de imagem gerada por IA: a foto é a sua, só ajustamos luz/corte e colocamos
um cartão limpo com nome, preço e cupom — o visual de "loja de bairro caprichada".

Saídas (na pasta --saida):
  <slug>_story.png    1080x1920  (vertical: tela de LIVE, Stories, status)
  <slug>_quadrado.png 1080x1080  (feed, capa do produto, grupo de WhatsApp)
  <slug>_faixa.png    1080x360   (faixa para sobrepor na LIVE / OBS / TikTok LIVE Studio)

Uso:
  python3 arte_live.py --foto produto.jpg --nome "Garrafa Térmica 500ml" \
      --preco 49.90 [--de 69.90] [--cupom LIVE10] [--detalhe "Mantém gelado 12h"] \
      [--tema creme|rosa|verde|escuro] [--saida ../../../../live-shop/artes]

Só usa Pillow (pip install pillow).
"""
import argparse
import os
import re
import unicodedata

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

TEMAS = {
    # fundo, cartão, texto, destaque, texto do destaque
    "creme": ((245, 239, 230), (255, 252, 247), (40, 34, 30), (196, 84, 52), (255, 255, 255)),
    "rosa": ((248, 231, 233), (255, 250, 250), (58, 32, 40), (214, 69, 105), (255, 255, 255)),
    "verde": ((228, 238, 229), (251, 254, 251), (28, 48, 36), (46, 125, 82), (255, 255, 255)),
    "escuro": ((28, 28, 30), (44, 44, 48), (245, 245, 245), (255, 196, 0), (25, 25, 25)),
}

FONTES = {
    "bold": [
        "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ],
    "black": [
        "/usr/share/fonts/opentype/inter/Inter-Black.otf",
        "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ],
    "regular": [
        "/usr/share/fonts/opentype/inter/Inter-Medium.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ],
}


def fonte(peso, tamanho):
    for caminho in FONTES[peso]:
        if os.path.exists(caminho):
            return ImageFont.truetype(caminho, tamanho)
    return ImageFont.load_default(size=tamanho)


def brl(valor):
    inteiro, centavos = f"{valor:.2f}".split(".")
    inteiro = f"{int(inteiro):,}".replace(",", ".")
    return f"R$ {inteiro},{centavos}"


def slug(texto):
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:40] or "produto"


def preparar_foto(caminho):
    """Corrige rotação do celular e dá um ajuste leve (sem 'cara de filtro')."""
    foto = ImageOps.exif_transpose(Image.open(caminho)).convert("RGB")
    foto = ImageOps.autocontrast(foto, cutoff=0.5)
    foto = ImageEnhance.Brightness(foto).enhance(1.04)
    foto = ImageEnhance.Color(foto).enhance(1.05)
    foto = ImageEnhance.Sharpness(foto).enhance(1.15)
    return foto


def cantos(img, raio):
    mascara = Image.new("L", img.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, *img.size], raio, fill=255)
    img = img.copy()
    img.putalpha(mascara)
    return img


def sombra(base, caixa, raio, deslocamento=10, desfoque=22, alfa=60):
    camada = Image.new("RGBA", base.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = caixa
    ImageDraw.Draw(camada).rounded_rectangle(
        [x0, y0 + deslocamento, x1, y1 + deslocamento], raio, fill=(0, 0, 0, alfa)
    )
    base.alpha_composite(camada.filter(ImageFilter.GaussianBlur(desfoque)))


def quebrar(draw, texto, fnt, largura):
    linhas, atual = [], ""
    for palavra in texto.split():
        teste = f"{atual} {palavra}".strip()
        if draw.textlength(teste, font=fnt) <= largura:
            atual = teste
        else:
            if atual:
                linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas


def ajustar_fonte(draw, texto, peso, maximo, minimo, largura, max_linhas):
    for t in range(maximo, minimo - 1, -4):
        f = fonte(peso, t)
        linhas = quebrar(draw, texto, f, largura)
        if len(linhas) <= max_linhas:
            return f, linhas
    f = fonte(peso, minimo)
    return f, quebrar(draw, texto, f, largura)[:max_linhas]


def bloco_texto(draw, x, y, largura, a, tema, escala=1.0):
    """Desenha nome, detalhe, preço e cupom. Retorna o y final."""
    fundo, cartao, texto, destaque, texto_dest = tema
    f_nome, linhas = ajustar_fonte(draw, a.nome, "bold", int(64 * escala), int(40 * escala), largura, 2)
    for linha in linhas:
        draw.text((x, y), linha, font=f_nome, fill=texto)
        y += int(f_nome.size * 1.18)
    if a.detalhe:
        f_det, linhas = ajustar_fonte(draw, a.detalhe, "regular", int(38 * escala), int(28 * escala), largura, 2)
        y += int(6 * escala)
        for linha in linhas:
            draw.text((x, y), linha, font=f_det, fill=tuple(int(c * 0.7 + fundo[i] * 0.3) for i, c in enumerate(texto)))
            y += int(f_det.size * 1.25)
    y += int(18 * escala)
    if a.de and a.de > a.preco:
        f_de = fonte("regular", int(36 * escala))
        de_txt = f"de {brl(a.de)}"
        draw.text((x, y), de_txt, font=f_de, fill=tuple(int(c * 0.55 + fundo[i] * 0.45) for i, c in enumerate(texto)))
        w = draw.textlength(de_txt, font=f_de)
        meio = y + f_de.size * 0.62
        draw.line([(x + draw.textlength("de ", font=f_de), meio), (x + w, meio)], fill=destaque, width=max(3, int(4 * escala)))
        y += int(f_de.size * 1.3)
    f_preco = fonte("black", int(104 * escala))
    prefixo = "por " if a.de and a.de > a.preco else ""
    if prefixo:
        f_por = fonte("bold", int(40 * escala))
        draw.text((x, y + int(f_preco.size * 0.45)), prefixo, font=f_por, fill=texto)
        px = x + draw.textlength(prefixo, font=f_por)
    else:
        px = x
    draw.text((px, y), brl(a.preco), font=f_preco, fill=destaque)
    y += int(f_preco.size * 1.36)
    if a.cupom:
        f_cup = fonte("bold", int(38 * escala))
        txt = f"CUPOM  {a.cupom.upper()}"
        w = draw.textlength(txt, font=f_cup)
        pad_x, pad_y = int(26 * escala), int(14 * escala)
        caixa = [x, y, x + w + 2 * pad_x, y + f_cup.size + 2 * pad_y]
        draw.rounded_rectangle(caixa, int(14 * escala), fill=destaque)
        draw.text((x + pad_x, y + pad_y - int(2 * escala)), txt, font=f_cup, fill=texto_dest)
        y = caixa[3] + int(12 * escala)
    return y


def foto_recortada(foto, largura, altura):
    return ImageOps.fit(foto, (largura, altura), Image.LANCZOS, centering=(0.5, 0.45))


def story(foto, a, tema):
    W, H = 1080, 1920
    fundo, cartao = tema[0], tema[1]
    base = Image.new("RGBA", (W, H), fundo + (255,))
    m = 60
    fh = 1150
    caixa_foto = (m, m + 40, W - m, m + 40 + fh)
    sombra(base, caixa_foto, 36)
    base.alpha_composite(cantos(foto_recortada(foto, W - 2 * m, fh).convert("RGBA"), 36), (m, m + 40))
    topo = caixa_foto[3] - 60
    rasc = ImageDraw.Draw(Image.new("RGB", (W, H)))
    fim = bloco_texto(rasc, 0, 0, W - 2 * m - 140, a, tema) + 48 + 40
    caixa_card = (m + 20, topo, W - m - 20, min(H - 110, topo + fim))
    sombra(base, caixa_card, 32, alfa=45)
    d = ImageDraw.Draw(base)
    d.rounded_rectangle(caixa_card, 32, fill=cartao + (255,))
    bloco_texto(d, caixa_card[0] + 50, topo + 48, caixa_card[2] - caixa_card[0] - 100, a, tema)
    if a.chamada:
        f = fonte("bold", 34)
        w = d.textlength(a.chamada, font=f)
        d.text(((W - w) / 2, caixa_card[3] + 50), a.chamada, font=f, fill=tema[2])
    return base.convert("RGB")


def quadrado(foto, a, tema):
    W = H = 1080
    fundo, cartao = tema[0], tema[1]
    base = Image.new("RGBA", (W, H), fundo + (255,))
    m = 48
    fw = 560
    caixa_foto = (m, m, m + fw, H - m)
    sombra(base, caixa_foto, 30)
    base.alpha_composite(cantos(foto_recortada(foto, fw, H - 2 * m).convert("RGBA"), 30), (m, m))
    d = ImageDraw.Draw(base)
    x = m + fw + 44
    largura = W - x - m
    # centraliza verticalmente: mede numa cópia
    rasc = ImageDraw.Draw(Image.new("RGB", (W, H)))
    altura = bloco_texto(rasc, x, 0, largura, a, tema, escala=0.72)
    bloco_texto(d, x, max(m, (H - altura) // 2), largura, a, tema, escala=0.72)
    return base.convert("RGB")


def faixa(foto, a, tema):
    W, H = 1080, 360
    fundo, cartao = tema[0], tema[1]
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([0, 0, W - 1, H - 1], 40, fill=cartao + (240,))
    t = H - 48
    base.alpha_composite(cantos(foto_recortada(foto, t, t).convert("RGBA"), 28), (24, 24))
    rasc = ImageDraw.Draw(Image.new("RGB", (W, H)))
    x = t + 60
    altura = bloco_texto(rasc, x, 0, W - x - 40, a, tema, escala=0.5)
    bloco_texto(d, x, max(20, (H - altura) // 2), W - x - 40, a, tema, escala=0.5)
    return base


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--foto", required=True, help="foto real do produto (jpg/png/heic convertido)")
    p.add_argument("--nome", required=True)
    p.add_argument("--preco", type=float, required=True, help="preço que o cliente paga na live")
    p.add_argument("--de", type=float, help="preço antigo REAL (só se o produto já foi vendido por esse valor)")
    p.add_argument("--cupom", help="código de cupom ativo na plataforma")
    p.add_argument("--detalhe", help="1 benefício concreto, ex: 'Cabe na bolsa · 500ml'")
    p.add_argument("--chamada", default="Toque no carrinho e garanta o seu", help="frase do rodapé do story")
    p.add_argument("--tema", choices=TEMAS, default="creme")
    p.add_argument("--saida", default=".")
    a = p.parse_args()

    os.makedirs(a.saida, exist_ok=True)
    foto = preparar_foto(a.foto)
    tema = TEMAS[a.tema]
    nome = slug(a.nome)
    saidas = {
        f"{nome}_story.png": story(foto, a, tema),
        f"{nome}_quadrado.png": quadrado(foto, a, tema),
        f"{nome}_faixa.png": faixa(foto, a, tema),
    }
    for arquivo, img in saidas.items():
        destino = os.path.join(a.saida, arquivo)
        img.save(destino, optimize=True)
        print(destino)


if __name__ == "__main__":
    main()
