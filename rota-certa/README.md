# Rota Certa

Roteirizador de entregas para a planilha (.xlsx) da rota exportada pelo app do entregador da Shopee.

## O que faz

- **Lê o Excel no próprio celular** (colunas `Sequence`, `Stop`, `SPX TN`, `Destination Address`, `Bairro`, `Latitude`, `Longitude`). Nada é enviado para servidor.
- **Junta pacotes do mesmo endereço numa parada só**, mesmo quando a etiqueta traz números de parada diferentes (ex.: Rua Mogi Mirim, 1465 vinha como paradas 57, 58 e 59). Também junta pacotes a até *N* metros (ajustável, padrão 20 m).
- **Encaixa pacotes sem sequência** (`-` na planilha) no ponto certo da rota.
- **Recalcula a ordem** para andar menos: distâncias reais pelas ruas (OSRM / OpenStreetMap, respeita mão única) com penalidade para trocar de rua, então termina uma rua antes de ir para a próxima. Sem internet para o serviço de rotas, usa linha reta com fator de ruas.
- **Navegação**: botão Waze e Google Maps por parada, e a rota inteira em trechos de até 10 paradas no Google Maps.
- **Marca entregue** e guarda o progresso no aparelho.

Com a planilha de 27/10/2026: 123 pacotes, 63 paradas Shopee + 11 sem número → **46 paradas reais**; percurso pelas ruas de ~14,4 km (ordem Shopee) para ~10,1 km.

## Como usar

Abra `index.html` no navegador do celular (ou publique com GitHub Pages: *Settings → Pages → Deploy from branch*, pasta `/`, e acesse `/rota-certa/`).

## Algoritmo

Caminho aberto (sem voltar ao início): vizinho mais próximo com 40 reinícios aleatórios + 2-opt + Or-opt (blocos de 1–3 paradas), com custo assimétrico. Para ~50 paradas roda em menos de meio segundo no celular.

## Créditos

- [OSRM](https://github.com/Project-OSRM/osrm-backend) (BSD-2) – matriz de distâncias pelas ruas via servidor público de demonstração.
- Dados de mapa © colaboradores do OpenStreetMap (ODbL).
- Deep links oficiais do [Waze](https://developers.google.com/waze/deeplinks) e do [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

Bibliotecas MIT avaliadas: `read-excel-file` (falhou com o zip gerado pela Shopee, por isso o app tem um leitor .xlsx próprio que usa o `DecompressionStream` nativo do navegador).
