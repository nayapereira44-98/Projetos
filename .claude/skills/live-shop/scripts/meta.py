#!/usr/bin/env python3
"""Calculadora de meta da LIVE: quanto vender por dia/live para bater a meta do mês.

Exemplos:
  # vendedora (estoque próprio): meta de LUCRO de R$1000
  python3 meta.py --meta 1000 --tipo lucro --preco 49.90 --custo 22 --taxa 20 --fixa 4.5 --lives 16

  # vendedora: meta de FATURAMENTO de R$1000
  python3 meta.py --meta 1000 --tipo faturamento --preco 49.90 --lives 16

  # afiliada: meta de COMISSÃO de R$1000 com 10% de comissão
  python3 meta.py --meta 1000 --tipo comissao --preco 49.90 --comissao 10 --lives 16

  # acompanhar: já vendi R$320 até o dia 12
  python3 meta.py --meta 1000 --tipo faturamento --preco 49.90 --lives 16 --feito 320 --dia 12

Taxas mudam com frequência: confirme no Seller Center (TikTok) e na Central do Vendedor (Shopee).
"""
import argparse
import calendar
import math
from datetime import date


def brl(v):
    i, c = f"{v:.2f}".split(".")
    return f"R$ {int(i):,}".replace(",", ".") + f",{c}"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--meta", type=float, required=True)
    p.add_argument("--tipo", choices=["faturamento", "lucro", "comissao"], default="faturamento")
    p.add_argument("--preco", type=float, required=True, help="ticket médio na live")
    p.add_argument("--custo", type=float, default=0, help="custo do produto + embalagem por unidade")
    p.add_argument("--taxa", type=float, default=0, help="%% de comissão da plataforma (vendedora)")
    p.add_argument("--fixa", type=float, default=0, help="taxa fixa por item (R$)")
    p.add_argument("--comissao", type=float, default=0, help="%% de comissão de afiliada")
    p.add_argument("--lives", type=int, default=16, help="lives planejadas no mês")
    p.add_argument("--conversao", type=float, default=1.5, help="%% de espectadores que compram (chute inicial)")
    p.add_argument("--feito", type=float, default=0, help="quanto da meta já foi feito")
    p.add_argument("--dia", type=int, help="dia do mês de hoje (padrão: hoje)")
    a = p.parse_args()

    if a.tipo == "faturamento":
        por_venda = a.preco
    elif a.tipo == "lucro":
        por_venda = a.preco * (1 - a.taxa / 100) - a.fixa - a.custo
    else:
        por_venda = a.preco * a.comissao / 100
    if por_venda <= 0:
        raise SystemExit(f"Cada venda dá {brl(por_venda)} — preço não cobre custo + taxas. Reveja o preço.")

    hoje = date.today()
    dia = a.dia or hoje.day
    dias_mes = calendar.monthrange(hoje.year, hoje.month)[1]
    falta = max(0.0, a.meta - a.feito)
    vendas = math.ceil(falta / por_venda)
    lives_restantes = max(1, round(a.lives * (dias_mes - dia + 1) / dias_mes)) if a.feito or a.dia else a.lives
    por_live = math.ceil(vendas / lives_restantes)
    espectadores = math.ceil(por_live / (a.conversao / 100))

    print(f"Meta ({a.tipo}): {brl(a.meta)} | feito: {brl(a.feito)} | falta: {brl(falta)}")
    print(f"Cada venda rende para a meta: {brl(por_venda)}")
    print(f"Vendas que faltam: {vendas}")
    print(f"Lives restantes no mês (estimado): {lives_restantes}")
    print(f"=> {por_live} venda(s) por live")
    print(f"=> ~{espectadores} espectadores únicos por live (com conversão de {a.conversao}%)")
    if a.feito and a.dia:
        ritmo = a.feito / dia * dias_mes
        print(f"Ritmo atual projeta {brl(ritmo)} no fim do mês -> {'NO CAMINHO' if ritmo >= a.meta else 'ABAIXO: aumente lives ou ticket'}")


if __name__ == "__main__":
    main()
