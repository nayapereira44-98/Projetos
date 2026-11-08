# Rota Certa (v3, 08/11)

O nome da rota é a AT da planilha (ex.: AT20261106C9V3G). No Início, "Renomear" troca o nome.

Refeito do zero para ser limpo e prático, no estilo do Spoke. A versão anterior (v2) está em `../rota-certa-v2/`, em espera.

## Telas
- **Início**: o que dá para fazer. Sem rota aberta: importar a planilha da Shopee (Excel), adicionar parada manual, bipar e ver o histórico. Com rota aberta: o resumo (paradas, entregues, não entregues), "Continuar", Carregar o veículo, Anotações, Somar outra planilha, Adicionar parada e "Finalizar rota" (dois toques; vai para o histórico).
- **Mapa** (Leaflet + OpenStreetMap, sem chave): cada parada é um número na ordem da rota; a próxima fica maior, em azul; as feitas ficam verdes com ✓; as parciais ficam laranja; as não entregues, vermelhas. Tocar no número abre a parada com todos os pacotes (parada Shopee + código BR + complemento). A linha segue as ruas (OSRM) e, sem resposta, liga as paradas em linha reta. Embaixo fica o cartão da próxima parada, com "Navegar (Waze)" e "Entreguei".
- **Bipar** (botão do meio): câmera aberta. Mostra o número da parada na rota, a parada Shopee, o endereço, a parte do carro e se já foi entregue, com "Entreguei este".
- **Paradas**: Pendentes, Feitas e **Anotações**. Busca por parada, rua ou final do BR. "Copiar pendências" gera o texto para conferir no app da Shopee em casa.
- **Carregar** (funciona até sem planilha): no galpão, você bipa o pacote e o app sugere a parte do carro (Frente Esquerda, Frente Direita, Meio…, Fundo…; dá para editar). Essa parte vira a **posição oficial** do pacote e fica guardada pelo código. Para trocar, toque em outra parte. Sem planilha, o app enche uma parte de cada vez (20 pacotes por parte, ajustável); com a planilha, sugere pela ordem de entrega (primeiras entregas na Frente). Quando a planilha entra, o app cruza o código com o endereço e a ordem, e a posição não muda. Tocar numa parte mostra os pacotes dela e permite uma foto opcional da parte. A tela também mostra o que da rota ainda falta bipar e o que foi bipado fora da rota.
- **Na entrega**: a próxima parada, a folha da parada e o Bipar mostram **"Localização no carro: Frente Esquerda"**.
- **Histórico**: rotas finalizadas com entregues, não entregues e anotações, mais "Copiar resumo".

## Parada: entregar ou anotar
- "Entreguei" marca todos os pacotes da parada.
- "Problema ou entrega parcial" permite marcar pacote por pacote (Entregue / Não) e escolher o motivo (Ausente, Endereço não encontrado, Recusado, Avariado, Sem acesso, Pacote não achado). Também tem um campo de anotação, por exemplo "entreguei 1 de 7, porteiro só aceitou um".

## Rota
- A rota é montada pelo endereço: o Core junta os números da mesma rua e faz a rua inteira de uma vez, começando pela rua mais perto de você (GPS). Depois de criada, a ordem fica fixa. Planilha somada ou parada manual entram no fim. "Refazer a ordem a partir de onde estou" fica no fim da lista de Pendentes (dois toques).

## Dados
Tudo fica no celular: `rc3:route` (rota aberta), `rc3:hist` (histórico) e as fotos do carro no IndexedDB `rc3`.
