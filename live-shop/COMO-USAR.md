# Live Shop — seu processo de novembro

Meta: **R$ 1.000 em novembro** somando TikTok Shop + Shopee.

## A rotina (o que você faz × o que o Claude faz)

| Quando | Você | Claude (skill `live-shop`) |
|---|---|---|
| **Produto novo** | grava 1 vídeo curto + 1 foto na luz da janela, manda aqui com preço/cupom/estoque | ficha do produto, 3 artes com a SUA foto (story, quadrado, faixa), falas da live, legenda, checagem de regras |
| **Dia de live (manhã)** | diz quais produtos entram hoje | roteiro minuto a minuto + checklist + legenda dos vídeos de aquecimento |
| **Dia de live (tarde)** | posta 1–3 vídeos curtos e avisa nos Stories/WhatsApp | — |
| **Ao vivo** | apresenta, mostra a arte/faixa na tela, fixa o produto | — |
| **Depois da live** | manda print dos números | coloca na planilha, diz onde vendeu e onde travou, ajusta a próxima |
| **Segunda-feira** | — | resumo da semana: quanto falta da meta e as 3 ações da semana |

## Como pedir (é só escrever assim)
- "Produto novo" + foto/vídeo + "R$ 49,90, cupom LIVE10, tenho 20"
- "Faz o roteiro da live de hoje às 20h na Shopee com a garrafa e o porta-copo"
- "Posso falar 'emagrece' na live?"
- "Como foi a live?" + print dos números
- "Quanto falta pra meta?"

## Calendário de novembro (sugestão)
- 4 lives por semana, 60 min, **mesmo horário** (ex.: ter/qua/qui 20h + sáb 10h).
- **11/11** e **Black Friday (27/11)**: oferta especial preparada antes, live mais longa.
- Comece pelos 2–3 produtos mais baratos e fáceis de mostrar (produto "isca").

## Pastas
- `produtos/` — coloque cada produto numa pasta própria (`produtos/garrafa-termica/foto.jpg`)
- `artes/` — as artes saem aqui, separadas por data
- `produtos/produtos.csv` — sua lista de produtos
- `controle-novembro.csv` — uma linha por live (abre no Excel/Google Planilhas)

## Antes da primeira live — confira no painel
1. TikTok: você vai vender como **loja** (precisa CNPJ/MEI) ou como **afiliada** (mínimo de
   seguidores, referência mais citada 1.000)? Confira no Seller Center / Central de Criadores.
2. Shopee: taxa atual por venda na Central do Vendedor.
3. Defina se os R$ 1.000 são faturamento, lucro ou comissão — muda muito quantas vendas precisa.

A skill fica em `.claude/skills/live-shop/` e carrega sozinha quando você abre o Claude Code nesse repositório.
