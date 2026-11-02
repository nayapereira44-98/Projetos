# Produto novo (o fluxo principal)

A usuária grava/fotografa o produto e manda. Você devolve tudo pronto para a live.

## 1. Receber
Arquivos chegam em `live-shop/produtos/<slug-do-produto>/` (foto.jpg, video.mp4).
Se só veio vídeo, extraia 3 frames (2s, meio, fim) com ffmpeg e use o mais nítido e bem iluminado.

## 2. Perguntar só o que falta (uma mensagem só)
- Nome curto do produto (como o cliente procura: "garrafa térmica 500ml", não o nome do fornecedor)
- Preço na live e, se houver, preço antigo REAL
- Cupom/desconto ativo (código) e em qual plataforma
- Estoque disponível
- É produto próprio (vendedora) ou de outra loja (afiliada)? Comissão, se afiliada
- Custo (para saber o lucro), opcional

## 3. Ficha do produto
Adicione a linha em `live-shop/produtos/produtos.csv` e classifique o papel na live:
- **Isca** (barato, todo mundo usa, puxa a primeira venda) — até ~R$ 30
- **Carro-chefe** (melhor lucro/comissão por venda)
- **Complemento** (combina com outro: "leva junto")

## 4. Entregar
1. As 3 artes (`modulos/arte-produto.md`)
2. Falas da live para este produto: abertura do produto (10s), demonstração (o que mostrar na câmera),
   3 respostas para dúvidas prováveis (tamanho, entrega, como usar), chamada para comprar
3. 1 legenda de vídeo curto + 5 hashtags (`modulos/conteudo-curto.md`)
4. Resultado do compliance (ok / trocar X por Y)

Formato da resposta:
```
✅ <Produto> — papel: isca | carro-chefe | complemento
Artes: story · quadrado · faixa  (caminhos)
Falas da live: ...
Legenda: ...
Checagem de regras: ok / ajustes
Falta de você: ... (se algo ficou pendente)
```
