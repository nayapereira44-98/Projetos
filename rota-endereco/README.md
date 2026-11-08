# Rota Certa (v3, 08/11)

O nome da rota é a AT da planilha (ex.: AT20261106C9V3G). No Início, "Renomear" troca o nome.

Refeito do zero para ser limpo e prático, no estilo do Spoke. A versão anterior (v2) está em `../rota-certa-v2/`, em espera.

## Telas
- **Início**: o que dá para fazer. Sem rota aberta: importar a planilha da Shopee (Excel), adicionar parada manual, bipar e ver o histórico. Com rota aberta: o resumo (paradas, entregues, não entregues), "Continuar", Carregar o veículo, Anotações, Somar outra planilha, Adicionar parada e "Finalizar rota" (dois toques; vai para o histórico).
- **Mapa** (Leaflet + OpenStreetMap, sem chave): cada parada é um número na ordem da rota; a próxima fica maior, em azul; as feitas ficam verdes com ✓; as parciais ficam laranja; as não entregues, vermelhas. Tocar no número abre a parada com todos os pacotes (parada Shopee + código BR + complemento). A linha segue as ruas (OSRM) e, sem resposta, liga as paradas em linha reta. Embaixo fica o cartão da próxima parada, com "Navegar (Waze)" e "Entreguei".
- **Bipar** (botão do meio): câmera aberta. Mostra o número da parada na rota, a parada Shopee, o endereço, a parte do carro e se já foi entregue, com "Entreguei este".
- **Paradas**: Pendentes, Feitas e **Anotações**. Busca por parada, rua ou final do BR. "Copiar pendências" gera o texto para conferir no app da Shopee em casa.
- **Carregar** (funciona até sem planilha): antes de carregar, dois toques: o **tipo de carro** (SUV/Hatch, Sedan, Utilitário) e **como ele está hoje**: banco traseiro levantado ou rebatido, com ou sem o banco do passageiro (Utilitário: só o baú ou baú + passageiro). Cada opção mostra um desenho do carro visto de cima. As partes são: Banco do passageiro (opcional), Meio Direita, Meio Esquerda (banco traseiro, que inclui o assoalho), Fundo Direita e Fundo Esquerda (porta-malas). No galpão, você bipa e o app mostra o desenho com a parte acesa, mais "Coloque em: Meio Esquerda". Essa é a **posição oficial** do pacote, guardada pelo código. Para trocar, toque em outra parte no desenho. O botão **Volumoso** manda o pacote para o **Fundo, embaixo**. Sem planilha, o app enche uma parte de cada vez; com a planilha, sugere pela ordem de entrega (primeiras entregas no passageiro e no meio, últimas no fundo). Quando a planilha entra, o app cruza o código com o endereço e a ordem, e a posição não muda. A tela mostra o carro com a quantidade de pacotes em cada parte (tocar abre a lista e a foto opcional), o que falta bipar e o que está fora da rota. "Trocar" muda o carro ou a disposição sem perder onde os pacotes estão.
- **Na entrega**: a próxima parada, a folha da parada e o Bipar mostram **"Localização no carro: Meio Esquerda"** (ou "Fundo Direita · volumoso, embaixo"). O Bipar também mostra "Parada 42 · Shopee 37 · pacote 1 de 3".
- **Histórico**: rotas finalizadas com entregues, não entregues e anotações, mais "Copiar resumo".

## Parada: entregar ou anotar
- "Entreguei" marca todos os pacotes da parada.
- "Problema ou entrega parcial" permite marcar pacote por pacote (Entregue / Não) e escolher o motivo (Ausente, Endereço não encontrado, Recusado, Avariado, Sem acesso, Pacote não achado). Também tem um campo de anotação, por exemplo "entreguei 1 de 7, porteiro só aceitou um".

## Rota
- A rota é montada pelo endereço: o Core junta os números da mesma rua e faz a rua inteira de uma vez, começando pela rua mais perto de você (GPS). Depois de criada, a ordem fica fixa. Planilha somada ou parada manual entram no fim. "Refazer a ordem a partir de onde estou" fica no fim da lista de Pendentes (dois toques).

## Dados
Tudo fica no celular: `rc3:route` (rota aberta), `rc3:hist` (histórico) e as fotos do carro no IndexedDB `rc3`.
