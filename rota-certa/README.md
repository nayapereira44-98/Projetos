# Rota Certa

Gestão do dia do entregador a partir da planilha (.xlsx) da rota exportada do app SPX Motorista Parceiro: carregamento do veículo, rota otimizada e ganhos.

## Três abas

### Carregar (no CD)
- Digite o final do código do pacote (ex.: `0507`). O app mostra em letra grande **em que zona do veículo ele vai**: A, banco do passageiro; B e C, banco traseiro; D e E, porta-malas. Também há layouts para utilitário e moto.
- A rota é dividida em **blocos** de até 10 paradas e no máximo 25 pacotes. O bloco 1 vai na zona mais à mão.
- Mostra o progresso por zona, a lista "faltam carregar" e o botão desfazer. No Android/Chrome, também lê o código de barras pela câmera.
- Compara a estimativa de tempo da rota sem organização e com organização por zonas.

### Rota
- Pacotes do mesmo endereço viram **uma parada só**, mesmo com números de parada diferentes na etiqueta.
- **Reentregas sem número** (`-` na planilha) entram no ponto certo da rota, com a etiqueta "sem nº" e um anel no mapa.
- **"Separe o bloco N"**: antes de cada bloco, lista os pacotes das próximas paradas (final do código, parada e rua) para separar de uma vez.
- A próxima parada tem horário previsto e botões Waze, Google Maps e Apple Maps, além de **Entregue**, **Não entregue** (com motivo) e **Depois** (vai para o fim).
- Janela de horário lida do complemento ("Entrega até às 17:30"), com aviso se a chegada prevista passar do horário.
- Busca de pacote pelo final do código e botão "Copiar" do código para colar no app da SPX.
- A ordem é otimizada pelas distâncias reais nas ruas (OSRM), respeitando mão única e com penalidade para trocar de rua.

### Ganhos
- Início e fim da jornada são marcados automaticamente na primeira e na última entrega.
- Km rodados pelo odômetro, pelo GPS (medição contínua) ou pela estimativa da rota mais o trajeto do CD.
- Combustível (gasolina, etanol, diesel, GNV), preço e consumo. Ganho por rota, por pacote ou por parada.
- Lucro líquido, lucro por hora, custo por km e lucro por pacote, com histórico diário e totais.
- Lista de pacotes para devolver ao CD, com o motivo.

## Referência: Spoke (antigo Circuit)
Do Spoke foram aproveitados a otimização com um toque, a escolha do GPS, o horário previsto por parada, as janelas de horário, o tempo por parada e a informação de onde está cada pacote para carregar. A crítica mais comum ao Spoke é que ele "deixa passar paradas na mesma rua". Aqui isso é tratado com a junção por endereço e com a penalidade para trocar de rua.

## Integração com o SPX Motorista Parceiro
O SPX não tem API pública nem link de integração documentado. A ponte entre os dois apps é:
1. a planilha exportada da rota;
2. o código SPX TN, que dá para copiar aqui e colar na busca do SPX.

A baixa da entrega (foto e assinatura) continua sendo feita no app da SPX.

## Arquivos
- `index.html`: interface.
- `core.js`: lógica pura (leitura, agrupamento, otimização, zonas, finanças). Roda no Node para testes.
- `app.js`: interface e armazenamento local.
- `build.py`: gera um HTML único com tudo embutido: `python3 build.py saida.html`.

Para usar: abra `index.html` no navegador ou publique com GitHub Pages (*Settings → Pages*) e acesse `/rota-certa/`.

## Créditos
- [OSRM](https://github.com/Project-OSRM/osrm-backend) (BSD-2): distâncias pelas ruas. Dados © colaboradores do OpenStreetMap.
- Deep links do Waze, do Google Maps e do Apple Maps.
- O leitor .xlsx é próprio e usa o `DecompressionStream` do navegador, porque a `read-excel-file` (MIT) não abriu o arquivo exportado pela SPX.
