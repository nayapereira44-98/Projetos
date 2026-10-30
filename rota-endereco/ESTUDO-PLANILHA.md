# Estudo da planilha da rota (SPX Motorista Parceiro)

Estudo feito com 5 exportações reais, de duas rotas (27/10 com 123 pacotes e 29/10 com 86 pacotes). Este repositório é público, então aqui não há endereços nem códigos de clientes.

## Estrutura do arquivo
- Gerado no servidor da Shopee pela biblioteca **Go Excelize** (`docProps/app.xml`). As datas de criação são fixas (2006) e não servem para nada.
- **Uma aba só** (`Sheet1`), sem colunas ocultas nem fórmulas. A tag `<dimension>` vem como `A1`, então leitores que confiam nela acham a planilha vazia.
- 10 colunas: `AT ID`, `Sequence`, `Stop`, `SPX TN`, `Destination Address`, `Bairro`, `City`, `Zipcode/Postal code`, `Latitude`, `Longitude`.
- **Não há** nome do destinatário, telefone, status da entrega, número de tentativas, peso ou tamanho. Isso tudo só existe no app da Shopee.

## O que cada coluna significa (observado)
| Coluna | Observação |
|---|---|
| AT ID | Identificador da rota, por exemplo `AT20261027XXXXX`, com a data no nome. É um só por arquivo. |
| Sequence | Ordem do **pacote** na rota: 1…N, única por pacote e contínua dentro de cada parada. `-` = pacote sem posição. |
| Stop | Número da **parada** da Shopee. Vários pacotes podem dividir uma parada (até 10 nos dados vistos). `-` = sem parada. |
| SPX TN | Código do pacote: `BR` + 13 caracteres. Os 4–5 últimos bastam para achar o pacote. |
| Destination Address | Texto livre: `rua, número, complemento`. O complemento traz apartamento/bloco, "casa", referências, instruções e horários. |
| Bairro | Texto livre e inconsistente: o mesmo lugar aparece com grafias diferentes ("Chácara"/"Chácaras", "Lot. Res."). Não serve para agrupar. |
| City | Uma cidade por rota. |
| CEP | Às vezes vem sem hífen. **Ruas longas têm vários CEPs** (por faixa de número/lado). **O mesmo CEP com grafias diferentes** revela a mesma rua. |
| Latitude/Longitude | Normalmente com 7 casas. Os pacotes sem parada tendem a vir com menos precisão (6 casas). |

## Descobertas
1. **Baixar a planilha de novo traz só o que falta entregar.** A rota de 29/10 tinha 86 pacotes. Baixada de novo em 30/10, veio com os 44 pendentes, o mesmo número da aba "Em Rota" do app. Exportações feitas antes de qualquer entrega vêm iguais. A rota pode continuar de um dia para o outro com o mesmo AT ID. O status (entregue/ocorrência) não vem em coluna nenhuma: só dá para deduzir pelo que sumiu.
2. **A Shopee cria uma parada por destinatário**, não por endereço. O mesmo prédio ou casa vira paradas **seguidas** (ex.: 3, 4, 5; 57, 58, 59). Na rota de 27/10, 18 pares de paradas seguidas têm a mesma coordenada.
3. **Pacotes sem parada (`-`) são o principal motivo de "voltar no mesmo lugar".** Na rota de 27/10, 7 dos 11 pacotes `-` estavam a 0–15 m de uma parada numerada. No app da Shopee eles ficam no topo da lista, separados da parada. Quem segue a numeração entrega a parada e deixa esses para trás.
4. **Grafias diferentes da mesma rua** ("Dr ... Afonso de P ..." e "Doutor ... Affonso de Paula ...") quebram o agrupamento por rua. O **CEP em comum** mais o nome parecido resolvem.
5. **Complementos** (rota de 27/10): 42 com apartamento/bloco/condomínio, 12 com casa/portão, 6 com instrução para pessoa, 6 com referência, 5 de comércio e 1 com horário. Os horários aparecem como "Entrega até às 17:30" ou "só estou em casa às 17:00".
6. **Endereço com muitos pacotes** (até 17 num ponto) indica comércio ou centro de distribuição. É uma parada só, mas o atendimento demora mais.

## O que o app já faz com isso
- Uma parada por endereço; números diferentes no mesmo ponto viram uma parada só.
- Pacote **fora da rota da Shopee** fica junto da parada do mesmo endereço, com aviso explicando o motivo.
- Ruas unificadas pelo CEP + nome parecido.
- Horário lido do complemento, inclusive "só estou em casa às …".
- **Contagem de tentativas:** o app guarda em que dias cada código apareceu (30 dias, só no aparelho). O mesmo código num dia seguinte aparece como "2ª tentativa".

## Respostas da entregadora (30/10)
- Uma 2ª ou 3ª tentativa volta como "pacote não entregue", com o **mesmo código**. Por isso o app conta as tentativas pelo código.
- A Shopee **paga por rota**.
- Ela só marca ocorrência quando o pacote extravia. Se não consegue entregar, volta mais tarde na mesma rota. Por isso existe o botão **"Ninguém atendeu: voltar depois"**.
- Em condomínio, o porteiro costuma receber todos de uma vez. Sem porteiro, ela liga para o cliente ou procura um vizinho.
- Na rota da Shopee são quase só casas; os clientes costumam avisar o horário.
- No mesmo dia ela faz **Shopee + Mercado Livre**. O Mercado Livre não tem essa planilha, então o app permite **adicionar pacotes à mão** (busca de endereço no OpenStreetMap ou toque no mapa), e eles entram na mesma rota.
