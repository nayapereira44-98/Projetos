# Rota Certa (por endereço)

App de entrega para quem usa o SPX Motorista Parceiro. Ele lê a planilha (.xlsx) que o app da Shopee exporta e monta a rota **por endereço**. O número de parada da Shopee aparece só como referência para o de-para com a etiqueta.

Endereço publicado: `https://nayapereira44-98.github.io/Projetos/` (redireciona para `rota-endereco/`).

## Telas (barra de abas embaixo)
- **Mapa**: mapa de verdade (OpenStreetMap) com **todas as paradas** numeradas. Laranja é pendente, cinza é entregue, verde é a próxima; parada com vários pacotes tem destaque. Uma linha liga as pendentes na ordem.
  - O cartão de baixo mostra a parada escolhida, ou a próxima: endereço, número da Shopee, **todos os pacotes do endereço** (cada um marcável), Waze/Google/Apple, **Entreguei aqui** e "Ainda nesta rua e por perto".
  - **Localizador** (botão de mira): ponto azul ao vivo e o aviso "Perto: Rua X · 22 m · faltam nº …".
- **+ Adicionar pacote** (Mercado Livre ou outro): digite o endereço e escolha o resultado da busca (OpenStreetMap, perto da rota), ou toque no mapa. Complemento e código são opcionais. O pacote entra na rota com a marca "Mercado Livre" e continua lá quando você reabre a planilha da Shopee.
- **Ninguém atendeu: voltar depois**: o endereço vai para o fim da fila até ser entregue.
- **Paradas**: lista agrupada por rua, com busca por rua, final do código ou número da parada da Shopee.
- **Escanear** (botão central): foto da etiqueta. Mostra a parada, todos os pacotes daquele endereço e "Ver no mapa".
- **Painel**:
  - **Iniciar entregas / Finalizar entregas**, com o cronômetro no topo do app;
  - pacotes e paradas feitos, tempo médio por parada e pacotes por hora;
  - previsão de término e quantos pacotes ainda cabem até o horário escolhido;
  - faturamento: Shopee + Mercado Livre, combustível, lucro, lucro por hora e por pacote;
  - histórico dos dias.
- **Ajustes**: abrir ou atualizar a planilha (a mesma rota mantém as entregas), refazer a ordem a partir de um endereço, tabela de-para Shopee → parada e começar do zero.

## Várias plataformas, uma rota só
Regra do produto: **todas as plataformas (Shopee, Mercado Livre e as que vierem) entram na mesma ordem por endereço.**
- Cada pacote mostra de onde veio. O endereço que tem pacotes de mais de uma plataforma avisa: "Neste endereço tem entrega de Shopee e Mercado Livre: 1 Shopee, 1 Mercado Livre".
- As plataformas ficam cadastradas em `PLATFORMS` (`app.js`). Para incluir outra, basta uma linha ali e a leitura do arquivo dela.
- **Próximas 10 paradas no Google Maps**: manda as 10 próximas pendentes, na ordem do app e com todas as plataformas, para o Google Maps. É o máximo que o link aceita. Com o celular no CarPlay ou Android Auto, a sequência aparece na tela do carro.
- **Planilha do Mercado Livre (ou de outra plataforma)**: Excel ou CSV, aberta antes ou depois da Shopee. As colunas são reconhecidas pelo nome (endereço, número, complemento, código, destinatário, bairro, cidade, CEP, latitude, longitude); se o endereço não for reconhecido, o app pergunta qual coluna é qual. Sem coordenadas, cada endereço é procurado no OpenStreetMap (1 por segundo) e guardado no aparelho. O que não for achado fica em Ajustes → "Localizar". Reabrir a planilha não duplica os pacotes que têm código.
- Ao marcar o local de um pacote novo no mapa, tocar num pino coloca o pacote no mesmo endereço da parada.

## Regras de rota
- Uma parada por endereço. Números diferentes no **mesmo ponto** (até 25 m na mesma rua, ou 10 m em qualquer rua) viram uma parada só, por exemplo "José Pioli, 212 / 225 / 245" (Shopee 30 + 31).
- Cada rua é feita inteira, em ordem de número. A ordem e o sentido dos trechos são otimizados (`Core.addressRoute`).

Planilha de 29/10: 86 pacotes viram 74 paradas, com cerca de 9,9 km contra 13,6 km na ordem da Shopee.

## Arquivos
`index.html` (tela e estilos, com o CSS do Leaflet embutido), `app.js` e `build.py`, que gera o HTML único. A lógica fica em `../rota-certa/core.js`.

Créditos: [Leaflet](https://leafletjs.com) (BSD-2), mapas © colaboradores do OpenStreetMap, [ZXing](https://github.com/zxing-js/library) (Apache-2.0).
