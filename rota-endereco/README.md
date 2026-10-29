# Rota por Endereço

Versão simplificada do Rota Certa, pensada para a rua. A planilha (.xlsx) exportada do app SPX Motorista Parceiro vira uma rota em que **cada parada é um endereço** (rua + número), e não o ponto de parada da Shopee.

- Pacotes do mesmo endereço ficam juntos, mesmo quando a Shopee deu números de parada diferentes para eles.
- **Cada rua é feita inteira, de uma vez**, em ordem de número. Uma rua só é dividida quando dois números seguidos ficam a mais de 250 m um do outro. A ordem dos trechos de rua (e o sentido de cada um) é otimizada para andar menos.
- O número da **parada da Shopee** aparece ao lado de cada endereço, só para o de-para com a etiqueta. Há também uma tabela **De-para: parada da Shopee → endereço**.
- O próximo endereço mostra os pacotes (final do código, número da Shopee e complemento), os números que ainda faltam na mesma rua e os botões Waze, Google e Apple Maps.
- **Achar pacote**: escaneie a etiqueta (foto) ou digite o final do código ou o número da parada da Shopee.
- As entregas são marcadas por endereço ou por pacote, em qualquer ordem. **Refazer a ordem** recalcula só os endereços que faltam.
- O app não abre a rota sozinho: ele pergunta se você quer continuar ou começar do zero. Reabrir a planilha da mesma rota mantém as entregas e encaixa os pacotes novos.

Com a planilha de 29/10 (86 pacotes): 81 endereços em 38 ruas, cerca de 9,9 km contra 13,6 km na ordem da Shopee. Na ordem da Shopee, 11 ruas eram visitadas mais de uma vez; aqui são 4, todas ruas longas com trechos separados.

Arquivos: `index.html`, `app.js` e `build.py`, que gera um HTML único. A lógica de endereço (`buildAddresses`, `streetSegments`, `addressRoute`) fica em `../rota-certa/core.js`.
