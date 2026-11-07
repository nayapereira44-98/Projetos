# Rota Certa (v3, 08/11)

Refeito do zero para ser limpo e prático, no estilo do Spoke. A versão anterior (v2) está em `../rota-certa-v2/`, em espera.

## Telas
- **Início**: o que dá para fazer. Sem rota aberta: importar a planilha da Shopee (Excel), adicionar parada manual, bipar e ver o histórico. Com rota aberta: o resumo (paradas, entregues, não entregues), "Continuar", Carregar o veículo, Anotações, Somar outra planilha, Adicionar parada e "Finalizar rota" (dois toques; vai para o histórico).
- **Mapa** (Leaflet + OpenStreetMap, sem chave): cada parada é um número na ordem da rota; a próxima fica maior, em azul; as feitas ficam verdes com ✓; as parciais ficam laranja; as não entregues, vermelhas. Tocar no número abre a parada com todos os pacotes (parada Shopee + código BR + complemento). A linha segue as ruas (OSRM) e, sem resposta, liga as paradas em linha reta. Embaixo fica o cartão da próxima parada, com "Navegar (Waze)" e "Entreguei".
- **Bipar** (botão do meio): câmera aberta. Mostra o número da parada na rota, a parada Shopee, o endereço, a parte do carro e se já foi entregue, com "Entreguei este".
- **Paradas**: Pendentes, Feitas e **Anotações**. Busca por parada, rua ou final do BR. "Copiar pendências" gera o texto para conferir no app da Shopee em casa.
- **Carregar**: de trás para frente, como no Spoke. O card "Agora" mostra o pacote que vai em seguida (parada Shopee, código, endereço) e a parte do carro: **Fundo** (últimas paradas), **Meio** e **Frente** (primeiras paradas). "Bipar para carregar" marca no carro e diz onde colocar. É opcional tirar uma foto de cada parte do carro.
- **Histórico**: rotas finalizadas com entregues, não entregues e anotações, mais "Copiar resumo".

## Parada: entregar ou anotar
- "Entreguei" marca todos os pacotes da parada.
- "Problema ou entrega parcial" permite marcar pacote por pacote (Entregue / Não) e escolher o motivo (Ausente, Endereço não encontrado, Recusado, Avariado, Sem acesso, Pacote não achado). Também tem um campo de anotação, por exemplo "entreguei 1 de 7, porteiro só aceitou um".

## Rota
- A rota é montada pelo endereço: o Core junta os números da mesma rua e faz a rua inteira de uma vez, começando pela rua mais perto de você (GPS). Depois de criada, a ordem fica fixa. Planilha somada ou parada manual entram no fim. "Refazer a ordem a partir de onde estou" fica no fim da lista de Pendentes (dois toques).

## Dados
Tudo fica no celular: `rc3:route` (rota aberta), `rc3:hist` (histórico) e as fotos do carro no IndexedDB `rc3`.
