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

## Rota em equipe (Firebase, 09/11)
- **O login é obrigatório**: quem abre o link vê só a tela "Rota Certa", com Entrar com Google ou com e-mail e senha, Criar conta (com nome) e Esqueci a senha. O app aparece depois de entrar, e a sessão fica salva no celular. Sem internet, quem já entrou antes naquele celular continua usando o app offline. O botão no topo (a inicial do nome) abre Convidar, Rotas da equipe e Sair.
- **Convidar**: no Início, "Convidar alguém para esta rota" sobe a rota para o Firestore e convida pelo e-mail. A outra pessoa entra no mesmo link, faz login com esse e-mail e abre em "Rotas da equipe".
- **Ao vivo para todos**: entregas (com o nome de quem entregou), não entregues, anotações, a ordem e a planilha somada.
- **Pego esta parada**: a parada sai da sequência de quem não pegou, aparece apagada no mapa dessa pessoa e mostra "com Bia" na lista.
- **Carro de cada um**: cada pessoa tem o próprio carro. O pacote que outra pessoa carregou aparece como "carro de João: Meio Esquerda".
- **Online**: o topo mostra "2 online" (presença atualizada a cada minuto).
- Código: `sync.js` (módulo ES que usa o Firebase Web SDK 13.2.0 pela CDN do Google). Ele conversa com `app.js` por `window.RCApp` e `window.RCSync`.
- Dados no Firestore: `routes/{id}` guarda owner, members, invites, names, emails, name, pkgs e order. As subcoleções são `st` (situação de cada pacote), `notes`, `claims`, `car` e `presence`. As regras deixam ler e gravar só quem está em `members` ou tem o e-mail em `invites`.
- O login com Google exige `nayapereira44-98.github.io` em Authentication → Configurações → Domínios autorizados.

## Equipe e convites (09/11)
- **Minha equipe** (no Início e no menu da conta): a equipe é permanente. Para convidar:
  - **pelo e-mail**: se a pessoa já usa o app, ela recebe a notificação (🔔 no topo) e aceita;
  - **pelo WhatsApp**: vai uma mensagem pronta, "Tenha a Rota Certa junto comigo…", com o link `?convite=ID`. Quem cria a conta ou entra por esse link já fica na equipe.
- **Chamar alguém para esta rota**: nem toda rota é compartilhada. Na rota aberta, você chama alguém da equipe, a pessoa recebe a notificação e escolhe "Entrar na rota" ou "Agora não".
- Firestore: `emails/{email}` → {uid, name} serve para achar quem já tem conta (só leitura de um documento por vez). `invites/{id}` → {type: team|route, from, fromName, fromEmail, toEmail, toUid, toName, routeId, routeName, status}. A equipe é o conjunto de convites de equipe aceitos, nos dois sentidos.
