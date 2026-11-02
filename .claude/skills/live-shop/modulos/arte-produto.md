# Arte do produto (sem cara de IA)

Objetivo: parecer foto de vendedora caprichosa, não anúncio genérico. A confiança vende na live.

## Princípios
- **A foto é dela.** Só ajuste leve de luz/contraste/nitidez (o script já faz). Nunca troque fundo
  por cenário falso, nunca "melhore" o produto (cor, tamanho, acabamento) — isso gera devolução e
  denúncia por produto diferente do anunciado.
- Uma informação principal por arte: **preço**. Depois nome, 1 benefício concreto, cupom.
- Texto grande (leitura no celular durante a live). Máximo ~12 palavras além do preço.
- "De/por" só com preço antigo real. Cupom só se estiver ativo na plataforma.
- Sem logo da TikTok/Shopee, sem selo "original"/"oficial" se não for loja oficial da marca.

## Quando usar cada arte
| Arquivo | Uso |
|---|---|
| `_story.png` (1080x1920) | mostrar na tela durante a live, Stories/Status antes da live |
| `_quadrado.png` (1080x1080) | capa/imagem extra do produto, grupo de WhatsApp, feed |
| `_faixa.png` (1080x360, fundo transparente) | sobreposição na live (TikTok LIVE Studio / OBS / Streamlabs) enquanto fala do produto |

## Dicas para a foto (passar para a usuária)
- Luz de janela de lado, sem flash. Fundo liso (lençol, cartolina, mesa de madeira).
- Produto ocupando 60–70% da foto, celular na altura do produto.
- Uma foto "na mão" (mostra tamanho real) e uma "em uso". Vertical.

## Comando
```bash
python3 .claude/skills/live-shop/scripts/arte_live.py \
  --foto live-shop/produtos/<slug>/foto.jpg --nome "<nome>" --preco 49.90 \
  --de 69.90 --cupom LIVE10 --detalhe "Gelado por 12h · cabe na bolsa" \
  --tema creme --saida live-shop/artes/<AAAA-MM-DD>
```
Temas: `creme` (padrão, neutro), `rosa` (beleza/moda), `verde` (casa/saúde), `escuro` (eletrônicos).
Use o mesmo tema na live inteira — consistência faz o público reconhecer.

Confira o resultado abrindo os PNGs. Se o nome cortou estranho, encurte o `--nome`.
