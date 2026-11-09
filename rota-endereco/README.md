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

## Dicas da comunidade (09/11)
- O chat aberto ficou para depois. No lugar dele há um **canal de dicas**: cada dica tem categoria (Condomínios e portarias, Endereços difíceis, Rota e trânsito, Carro e carregamento, App da Shopee, Geral), lugar opcional e texto. Dá para filtrar por categoria e buscar por rua, bairro ou condomínio. Cada pessoa pode apagar as próprias dicas.
- **Perfil público** (`profiles/{uid}`): apelido (padrão "Entregador XXXX"), cidade, veículo e "sobre você". Nas dicas todo mundo aparece pelo apelido.
- **Amigos**: tocando no apelido, aparece o perfil e "Adicionar como amigo". Quando a pessoa aceita (no 🔔), vocês veem o nome verdadeiro um do outro (🤝) e podem se chamar para rotas. Amigos e equipe são a mesma lista.
- Firestore: as dicas ficam em `chat/{id}` → {uid, alias, text, place, cat, t}. Mesmas regras do chat (até 500 caracteres; só apaga quem escreveu).

## Ajustes do carregamento e do mapa (10/11)
- **Volumoso** agora é só uma marca: o pacote fica na parte onde você colocou. No mapa, a parada com volumoso ainda por entregar ganha um **ponto amarelo** em cima, e a localização mostra "· volumoso".
- **Pacote com erro (não leu)**: botão no Bipar de carregar. Ele conta o pacote no **banco da frente**, mesmo que você não use o banco do passageiro. Depois, em Carregar → "⚠️ N pacotes com erro · conferir agora", você digita o final do código ou toca na lista do que falta bipar da rota, escolhe a parte do carro no desenho (e marca Volumoso, se for) e o pacote fica conferido. "Não era pacote" tira 1 da contagem.
- **Mapa**: a quantidade de pacotes aparece sempre em cima da parada (inclusive na próxima e com o mapa afastado).

## GPS e navegação (10/11)
- O **GPS do app** fica sempre ligado no mapa: o ponto azul é você e a **linha verde** é o caminho pelas ruas até a próxima parada (OSRM). A linha é refeita quando você anda 60 m ou a parada muda.
- Para a navegação com voz, o app **sugere o Google Maps** (padrão). No cartão da próxima parada, "navegar com Google Maps · trocar" deixa escolher Waze ou Apple Maps. A escolha fica salva (`rc3:nav`), e o app escolhido aparece em destaque na folha da parada.

## Várias rotas em andamento (10/11)
- **"+ Nova rota"** (no Início, no Histórico e no fim do Início com rota aberta) pausa a rota aberta e começa outra do zero. A rota pausada fica guardada inteira: planilha, entregas, anotações e **o carregamento do carro** (inclusive bipado sem planilha e pacotes com erro).
- **Rotas em andamento**: a lista aparece no Início e no Histórico; tocar abre a rota. "Finalizar rota" fecha só a rota aberta e abre a próxima em andamento.
- **Mapa**: mostra todas as rotas em andamento juntas, cada uma com uma cor. Em "Todas rotas ▾", no topo do mapa, dá para escolher quais aparecem. Tocar numa parada de outra rota abre essa rota.
- Rota da equipe: entrar numa rota compartilhada abre uma nova rota em andamento, sem fechar a sua.
- Dados: `rc3:slots` (lista de {id, R, car: {pk, err, cur}}) e `rc3:active`; `rc3:route` e `rc3:car` continuam com a rota aberta.

## Nome da rota antes da planilha (10/11)
- Toda rota em andamento pode ser renomeada a qualquer momento. No Início, use "Dar nome à rota" ou "Renomear", mesmo antes de subir a planilha (por exemplo, "Rota da manhã").
- Quando a planilha entra, a AT aparece ao lado do nome: "Rota da manhã · AT20261106C9V3G". Esse nome aparece no topo, no mapa, na lista de rotas em andamento e no histórico. Se você apagar o nome, fica só a AT.

## Parada única e raio do agrupamento (11/11)
- Endereços próximos viram **uma parada só** no mapa: um número, o total de pacotes, e a folha lista cada endereço com os pacotes, o botão Google (endereço exato), Entreguei, Problema e "Entreguei todos".
- **Raio escolhido por você**: no botão de agrupar do mapa, "Juntar automático as paradas a até": Desligado, 20, 30, 50 (padrão), 80, 100, 150, 200 m ou outro valor (5 a 1000 m). A escolha fica salva (`rc3:grpR`) e vale para as próximas planilhas.
- **Mapa limpo com agrupamento**: quando a rota tem paradas agrupadas, os números ficam todos no mesmo estilo (azul = próxima, verde = feita, laranja = parcial, vermelho = não entregue), sem as cores de grupo e de AT e sem linhas tracejadas. As outras rotas em andamento aparecem pequenas e apagadas.
- **Cartão da próxima parada**: toque no tracinho de cima (ou arraste para baixo) para diminuir; ele fica só com o número e o endereço. Toque de novo (ou arraste para cima) para abrir. A escolha fica salva (`rc3:nextMin`).
