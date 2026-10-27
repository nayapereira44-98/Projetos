---
name: "proposta-dassah"
description: "Monta propostas comerciais da Dassah (branding e comunicação): lê o briefing, recomenda o pacote certo e gera PDF com identidade do estúdio + mensagem de envio. Use sempre que Victoria pedir proposta, orçamento ou escopo para cliente."
---

# Proposta Dassah

Gera propostas comerciais da Dassah, consultoria de branding estratégico e comunicação da Victoria. Uma boa proposta Dassah mostra que o estúdio **entendeu o momento do cliente** antes de falar de preço. É isso que vende consultoria estratégica e justifica o valor.

Escreva sempre em português do Brasil.

## 1. Coletar o briefing

Use o que já estiver na conversa: notas de reunião, transcrição, diagnóstico anterior, perfil do Instagram ou memória do cliente. Pergunte apenas o que faltar entre os itens essenciais, **tudo numa única rodada** de perguntas:

- **Cliente**: nome, marca/@ e segmento
- **Perfil**: MEI ou pequeno empreendedor, ou média empresa (é isso que define a família de pacotes)
- **Desafio**: a dor principal, com as palavras do próprio cliente sempre que possível
- **Objetivo**: o que ele quer alcançar e em quanto tempo
- **Situação atual**: canais ativos, quem produz o conteúdo hoje, se já investe em tráfego
- **Restrições**: orçamento indicado, prazo, datas importantes

Itens opcionais e úteis: concorrentes, referências de que ele gosta, quem decide a contratação.

Se faltar algo não essencial, siga em frente e marque no rascunho como `[confirmar]`.

## 2. Recomendar o pacote

A Dassah trabalha com dois perfis de oferta:

**MEI e pequenos empreendedores:**
- **Entrada**: para quem está começando ou precisa organizar a base da marca
- **Mãos Livres**: para quem quer delegar a execução do conteúdo
- **Presença + Tráfego**: para quem já tem base e quer crescer com mídia paga
- **Nicho (+15%)**: acréscimo aplicado a segmentos especializados que exigem pesquisa ou linguagem técnica (ex.: saúde, odontologia, jurídico)

**Médias empresas (modelo FEE mensal):**
- **FEE Estratégico**: direção estratégica, planejamento e acompanhamento, com execução pelo time do cliente
- **FEE Integrado**: estratégia e execução juntas

Como recomendar:
- Recomende **um** pacote principal e explique em 2 ou 3 frases por que ele resolve o desafio descrito no briefing.
- Inclua **uma alternativa**: um degrau abaixo, se o orçamento for apertado, ou um degrau acima, se o objetivo for ambicioso. Duas opções facilitam a decisão do cliente sem paralisar.

**Valores:** nunca invente preços. Use os valores que Victoria informar na conversa ou que estiverem salvos na memória. Se não houver valor, deixe `R$ [valor]` e, ao entregar, liste quais valores ela precisa preencher.

## 3. Estrutura da proposta

Siga esta ordem. Cada seção é curta: propostas longas demais não são lidas.

1. **Capa**: “Proposta para [Cliente]”, o subtítulo com o foco do trabalho, a data e a logo/assinatura Dassah.
2. **O momento de [Cliente]**: 1 ou 2 parágrafos que mostram que entendemos o contexto e a dor. É a seção mais importante: o cliente precisa se reconhecer nela.
3. **Onde queremos chegar**: de 3 a 4 objetivos concretos, mensuráveis sempre que possível.
4. **Nossa abordagem**: a lógica estratégica em 3 ou 4 etapas (ex.: Diagnóstico, Posicionamento, Presença, Crescimento).
5. **Escopo**: entregáveis do pacote recomendado, com quantidades. Inclua também **o que não está incluso**, para evitar ruído depois.
6. **Cronograma**: as fases com a duração estimada de cada uma, em semanas ou meses.
7. **Investimento**: o pacote recomendado em destaque e a alternativa ao lado, com valor, periodicidade e o que muda entre os dois.
8. **Condições**: forma de pagamento, duração mínima (para FEE), número de rodadas de revisão e **validade da proposta (15 dias)**. Marque como `[confirmar]` o que Victoria não tiver definido.
9. **Por que a Dassah**: 3 pontos curtos, sem autoelogio genérico. Use experiência real: a trajetória da Victoria em Itaú, Globo, Kimberly-Clark e em agência para Samsung e Coca-Cola, e o olhar estratégico combinado com execução.
10. **Próximos passos**: 2 ou 3 ações claras (aprovar, assinar, agendar o kick-off) e o contato.

## 4. Tom de voz

- Estratégico e próximo: consultora falando com o dono do negócio, sem jargão de agência. Se usar um termo técnico, explique em meia frase.
- Confiante sem ser vendedor: afirme o que será feito, sem prometer resultado garantido.
- Específico: use o nome do cliente, o segmento e as palavras do briefing. Uma frase que serviria para qualquer cliente deve ser reescrita.
- A marca Dassah nasce da história de Hadassa/Ester. Uma referência sutil (ex.: “para um tempo como este”) pode aparecer **no máximo uma vez**, e só quando combinar com o cliente. Nunca force.

## 5. Formato de entrega

**PDF com identidade Dassah.** Monte em HTML com páginas A4, usando `@page { size: A4; margin: 0 }` e uma seção por página ou bloco, e converta para PDF com Playwright/Chromium (`page.pdf(format='A4', print_background=True)`). Salve como `Proposta_Dassah_[Cliente]_[AAAA-MM].pdf` na pasta de outputs.

Padrão visual: siga o guia de marca Dassah, direção Relevo (`dassah/guia-de-marca.html` no repositório Projetos). A proposta precisa ter cara de peça de estúdio, não de documento de escritório.

- **Cores** (tom sobre tom; o bordô domina):
  - Bordô `#45171B`: cor da marca, capa e títulos sobre claro.
  - Chocolate `#2A0B0F`: fundo da capa e das páginas de abertura.
  - Escova `#D8D1C2`: texto sobre escuro e fundos claros de apoio.
  - Seda `#EFE7D8`: papel do miolo.
  - Âmbar `#A8641E`: só em detalhe mínimo, nunca em texto pequeno.
  - Lacre `#B3261E`: só no toque manuscrito, uma vez por proposta.
- **Fontes** (Google Fonts, carregue no HTML):
  - Fraunces: só a marca "dassah" e o nome da Victoria, em minúsculas.
  - Instrument Serif: títulos e números grandes; caixa-alta condensada só em frase de impacto.
  - Source Serif 4: texto corrido.
  - Hanken Grotesk: rótulos, rodapé, contato e fonte de dado, em caixa baixa.
- **Marca**: na capa, "dassah" em minúsculas e, quando couber, "HADASSA" repetido ao fundo como relevo tom sobre tom. O monograma "ha" (`dassah/marca/monograma-ha.svg`) vai no rodapé ou no selo. Nunca use dourado, ramo de folhas, brilho de estrela, letra cursiva na marca ou a paleta antiga (off-white, ameixa e dourado).
- **Estrutura visual**:
  - Capa escura em chocolate.
  - Miolo em seda, com muito respiro e no máximo um destaque de cor por página.
  - Na página de investimento, valores grandes em Instrument Serif, com o pacote recomendado marcado por uma linha bordô no topo e a alternativa com linha mais clara.
- **Dados**: todo número leva asterisco e a fonte por extenso na mesma página.
- **Manuscrito**: só com a letra real da Victoria, escaneada. Se ela ainda não existir, deixe sem o toque manuscrito em vez de usar fonte cursiva.
- **Conferência**: verifique o PDF renderizado antes de entregar. Converta 1 ou 2 páginas em imagem e olhe. Texto cortado, página quase vazia ou quebra ruim devem ser corrigidos.

Se Victoria pedir outro formato (slides, documento editável), mantenha a mesma estrutura e o mesmo tom.

**Mensagem de envio.** Junto com o PDF, escreva uma mensagem curta para WhatsApp ou e-mail, com 3 a 5 linhas: retoma a conversa, apresenta a proposta em uma frase e propõe o próximo passo com data.

## 6. Checklist antes de entregar

- [ ] A seção “O momento de [Cliente]” usa detalhes reais do briefing
- [ ] Um pacote recomendado, uma alternativa e a justificativa
- [ ] Nenhum preço inventado; os `[valor]` e `[confirmar]` pendentes estão listados para a Victoria
- [ ] O escopo inclui “o que não está incluso”
- [ ] Validade e condições aparecem
- [ ] O PDF foi conferido visualmente
- [ ] A mensagem de envio foi escrita

Ao final, responda à Victoria com: o pacote recomendado e o motivo em uma linha, a lista de pendências a preencher e os arquivos entregues.