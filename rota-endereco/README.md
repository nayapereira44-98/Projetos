# Rota Certa (por endereço)

App de entrega para quem usa o SPX Motorista Parceiro. Ele lê a planilha (.xlsx) que o app da Shopee exporta e monta a rota **por endereço**. O número de parada da Shopee aparece só como referência para o de-para com a etiqueta.

Endereço publicado: `https://nayapereira44-98.github.io/Projetos/` (redireciona para `rota-endereco/`).

## Telas (barra de abas embaixo)
- **Mapa**: mapa de verdade (OpenStreetMap) com **todas as paradas** numeradas. Laranja é pendente, cinza é entregue, verde é a próxima; parada com vários pacotes tem destaque. Uma linha liga as pendentes na ordem.
  - O cartão de baixo mostra a parada escolhida, ou a próxima: endereço, número da Shopee, **todos os pacotes do endereço** (cada um marcável), Waze/Google/Apple, **Entreguei aqui** e "Ainda nesta rua e por perto".
  - **Localizador** (botão de mira): ponto azul ao vivo e o aviso "Perto: Rua X · 22 m · faltam nº …".
- **+ Adicionar pacote** (Mercado Livre ou outro): digite o endereço e escolha o resultado da busca (OpenStreetMap, perto da rota), ou toque no mapa. Complemento e código são opcionais. O pacote entra na rota com a marca "Mercado Livre" e continua lá quando você reabre a planilha da Shopee.
- **Ninguém atendeu: voltar depois**: o endereço vai para o fim da fila até ser entregue.
- **Praticidade no mapa** (pedido de 31/10):
  - o cartão de baixo fica **compacto** (número, endereço, quantidade de pacotes, saco, finais dos códigos, **Waze** e **Entreguei**) e abre em "Detalhes";
  - o botão de tela cheia esconde o cartão;
  - o mapa recalcula o tamanho sozinho;
  - **o contador preto no pino** mostra quantos pacotes faltam no endereço.
- **Perto de mim (padrão, pedido de 02/11)**: a localização manda, não a ordem.
  - A parada da vez é a **pendente mais perto de você**, terminando a área atual antes de ir para outra. O cartão "segura" o endereço enquanto você está nele (80 m) e só troca se outro ficar 50 m mais perto, para não mudar na hora do toque.
  - O seletor **Perto de mim / Rota** no topo do mapa volta para a ordem da rota quando quiser.
  - **"Aqui tem entrega"**: a até 60 m de **qualquer** endereço pendente, mesmo fora da ordem ou numa rua errada, aparece um aviso laranja com os pacotes e o saco, e o celular vibra.
- **Áreas (raio de 700 m, ajustável)**: endereços próximos formam a "Área 1, 2, 3…", numeradas na ordem da rota e fixas durante o dia. A lista de paradas é agrupada por área, e os sacos podem ser por área.
- **Controle da conferência na separação** (pedido de 02/11):
  - no topo da aba Paradas: "Conferidos 30 de 44 · faltam 14", com barra;
  - cada endereço da lista mostra "📷 2/3", e cada pacote do cartão mostra "conferido" ou "sem foto";
  - "Ver o que falta" lista por área só os pacotes ainda não conferidos. Tocar num pacote marca ou desmarca à mão, para quando a etiqueta não sai na foto;
  - o botão Escanear do meio também marca o pacote como conferido.
- **Conferir pacotes por foto**: escolha ou tire várias fotos de etiquetas de uma vez. O app lê os códigos, marca como conferidos e mostra cada pacote → área, com ✓/○ por área, para separar tudo de uma área junto.
- **Mapa "eu + próxima entrega"** (pedido de 31/10, inspirado nos apps de entrega):
  - o GPS liga sozinho ao abrir o mapa e mostra o ponto azul com o círculo de precisão;
  - a câmera enquadra você e a próxima parada e acompanha enquanto você anda;
  - se você arrastar o mapa, aparece **Recentralizar**;
  - o **caminho pelas ruas** até a próxima parada é desenhado (OSRM), e o cartão mostra "a 600 m · 3 min";
  - a próxima parada pulsa, as 10 seguintes ficam em destaque com a linha tracejada, as demais ficam pequenas e os endereços entregues somem (há opção em Ajustes);
  - a menos de 40 m do endereço, o celular vibra e o cartão mostra **"Você chegou"**;
  - uma falha momentânea do GPS não desliga a localização: só a permissão negada desliga.
  - Mapa de fundo: OpenStreetMap. O CARTO exige chave. Para a versão paga, avaliar um provedor com plano comercial (ex.: MapTiler ou Stadia).
- **Sacos de 10 em 10**: cada endereço mostra "Saco 21–30", pelo número da etiqueta da Shopee (padrão) ou pela parada do app (Ajustes → Sacos). O Mercado Livre aparece como saco próprio.
- **Paradas**: lista agrupada por rua, com busca por rua, final do código ou número da parada da Shopee.
- **Escanear** (botão central): foto da etiqueta. Mostra a parada, todos os pacotes daquele endereço e "Ver no mapa".
- **Painel**:
  - **Iniciar entregas / Finalizar entregas**, com o cronômetro no topo do app;
  - pacotes e paradas feitos, tempo médio por parada e pacotes por hora;
  - previsão de término e quantos pacotes ainda cabem até o horário escolhido;
  - faturamento: Shopee + Mercado Livre, combustível, lucro, lucro por hora e por pacote;
  - histórico dos dias.
- **Ajustes**: abrir ou atualizar a planilha (a mesma rota mantém as entregas), refazer a ordem a partir de um endereço, tabela de-para Shopee → parada e começar do zero.

## Endereço x CEP x posição (pedido de 03/11)
A Shopee às vezes manda o pino no lugar errado ou um CEP de outra rua, e a rota passa a ir e voltar. Ao abrir a planilha, o app confere cada endereço de três jeitos:
- **Pino x casas vizinhas** (sem internet): na numeração brasileira o número da casa é mais ou menos a distância em metros desde o começo da rua. Um endereço longe de todas as outras casas da mesma rua (com folga pela diferença de número), ou de todos os endereços do mesmo CEP, está com a posição errada.
- **Rua x CEP** (ViaCEP, Correios): a rua da etiqueta é comparada com a rua do CEP. CEP geral da cidade não conta.
- **Posição sugerida**: pela numeração das casas vizinhas (interpolação), pela busca da rua da etiqueta e pela busca da rua do CEP (OpenStreetMap, 1 por segundo).

Os alertas aparecem no topo de Paradas, no cartão do endereço e em Ajustes → Conferência de endereços. Para cada um: **usar uma posição sugerida**, **marcar no mapa** ou **está certo**. A rota é refeita na hora, e "voltar à posição da planilha" desfaz. As respostas do ViaCEP e das buscas ficam guardadas no aparelho.

## Rota mais inteligente
- Com o GPS ligado, a primeira ordem do dia **sai de onde você está** (normalmente o CD), e não da parada 1 da Shopee. Em Ajustes há **"Refazer a rota a partir de onde estou"**.
- Endereços com horário no complemento (**"entrega até 12:00"**, **"após 14h"**) entram pelo relógio: a rota simula a hora de chegada e puxa os prazos para antes.
- Ajustes mostra a distância da ordem do app e da ordem da Shopee, pelo mesmo critério.

## Painel: bruto, líquido, indicadores e histórico
- **Bruto e líquido de hoje**: bruto (Shopee + Mercado Livre) − combustível − outros gastos = líquido, com margem, valor por pacote, líquido por hora e por km.
- **Km do dia**: o que você digitar > o **medido pelo GPS** enquanto o app está aberto durante as entregas > a rota estimada + ida e volta do CD. Novos campos: ida e volta do CD (km) e outros gastos (R$).
- **Indicadores** de hoje x a sua média: pacotes por hora, minutos por parada, km por pacote, bruto e líquido por pacote, líquido por hora e margem. Hoje entra na comparação depois de 30 minutos e 10 pacotes.
- **Oportunidades de melhoria**: avisos automáticos comparando a última rota com a média (km por pacote, tempo por parada, líquido por hora, peso do combustível, endereços "voltar depois", valor por pacote de cada plataforma, melhor rota).
- **Histórico de rotas** (7 dias, 30 dias ou tudo): totais, médias por rota (bruto, líquido, km, combustível, pacotes), valor médio por pacote por plataforma, gráfico bruto x líquido e tabela por rota.
- **Registrar rota anterior** para trazer rotas antigas, **editar** ou apagar uma rota, e **baixar a planilha** do histórico (CSV, abre no Excel).

## Visual (03/11)
Topo claro com progresso fino, cartões com borda leve, chips em tons suaves (a cor indica o tipo sem gritar), barra de abas translúcida com indicador da aba ativa, cabeçalho de área em linha, aviso "Aqui tem entrega" compacto logo acima do cartão (não cobre mais o mapa) e histórico em lista (sem rolar para o lado no celular). Modo claro e escuro.

## Encerrar a rota e comparar rotas e dias (pedido de 03/11)
- **Encerrar a rota e começar outra** (Painel, fim da rota no mapa e Ajustes): mostra o resumo (pacotes, tempo, km, bruto, combustível e líquido) e avisa se ainda faltam pacotes. Ao confirmar, salva a rota no histórico, zera o km digitado e os outros gastos e volta para abrir a próxima planilha. Abrir a planilha de outra rota também salva a anterior.
- **Comparativo de rotas e dias**: alterna entre **Por rota** e **Por dia** (as rotas do mesmo dia somadas). Cada cartão mostra o líquido, o líquido por pacote e por hora, os pacotes por hora e os km por pacote, com seta verde ou vermelha contra a média do período, a diferença para a rota ou o dia anterior e as marcas **Melhor** e **Pior** (por líquido por hora).

## Várias plataformas, uma rota só
Regra do produto: **todas as plataformas (Shopee, Mercado Livre e as que vierem) entram na mesma ordem por endereço.**
- Cada pacote mostra de onde veio. O endereço que tem pacotes de mais de uma plataforma avisa: "Neste endereço tem entrega de Shopee e Mercado Livre: 1 Shopee, 1 Mercado Livre".
- As plataformas ficam cadastradas em `PLATFORMS` (`app.js`). Para incluir outra, basta uma linha ali e a leitura do arquivo dela.
- **Próximas 10 paradas no Google Maps**: manda as 10 próximas pendentes, na ordem do app e com todas as plataformas, para o Google Maps. É o máximo que o link aceita. Com o celular no CarPlay ou Android Auto, a sequência aparece na tela do carro.
- **Planilha do Mercado Livre (ou de outra plataforma)**: Excel ou CSV, aberta antes ou depois da Shopee. As colunas são reconhecidas pelo nome (endereço, número, complemento, código, destinatário, bairro, cidade, CEP, latitude, longitude); se o endereço não for reconhecido, o app pergunta qual coluna é qual. Sem coordenadas, cada endereço é procurado no OpenStreetMap (1 por segundo) e guardado no aparelho. O que não for achado fica em Ajustes → "Localizar". Reabrir a planilha não duplica os pacotes que têm código.
- Ao marcar o local de um pacote novo no mapa, tocar num pino coloca o pacote no mesmo endereço da parada.

## Regras de rota
- **CEP + número da casa** também identifica o mesmo endereço, mesmo com a rua escrita de outro jeito ou a coordenada imprecisa (até 300 m). Um CEP usado em mais de duas ruas (CEP geral da cidade) é ignorado. O cartão mostra o CEP.
- Uma parada por endereço. Números diferentes no **mesmo ponto** (até 25 m na mesma rua, ou 10 m em qualquer rua) viram uma parada só, por exemplo "José Pioli, 212 / 225 / 245" (Shopee 30 + 31).
- Cada rua é feita inteira, em ordem de número. A ordem e o sentido dos trechos são otimizados (`Core.addressRoute`).

Planilha de 29/10: 86 pacotes viram 74 paradas, com cerca de 9,9 km contra 13,6 km na ordem da Shopee.

## Arquivos
`index.html` (tela e estilos, com o CSS do Leaflet embutido), `app.js` e `build.py`, que gera o HTML único. A lógica fica em `../rota-certa/core.js`.

Créditos: [Leaflet](https://leafletjs.com) (BSD-2), mapas © colaboradores do OpenStreetMap, [ZXing](https://github.com/zxing-js/library) (Apache-2.0).
