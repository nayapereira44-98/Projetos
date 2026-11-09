# Padrão: área de membros para produtos digitais

Referência estudada em 30/10/2026: membros.altralabs.com.br (Altra), na parte pública (vitrine, produto, material grátis e login). A área logada (player de aula, progresso) não foi vista; quando houver prints dela, completar este arquivo.

Use como modelo de **estrutura e acabamento**. Nunca copie marca, nome, textos, imagens, logo ou código da referência: cada projeto tem a sua identidade.

## O que é

Um site que funciona ao mesmo tempo como **vitrine** (vende e capta contatos) e **área do aluno** (entrega o que a pessoa comprou ou pegou grátis). Quem compra numa plataforma de pagamento (Hotmart, Kiwify, Stripe…) entra com o e-mail da compra e encontra os produtos já liberados.

## Páginas e o papel de cada uma

| Página | Endereço típico | O que tem | Para quê |
|---|---|---|---|
| Vitrine | `/explorar` | Faixa de abertura (selo "Área de membros", título em duas linhas com pesos diferentes, uma frase com números reais como "141 aulas", botões Entrar e Começar grátis, aviso "Já comprou? Entre com o e-mail da compra"); abas de filtro (Tudo, Grátis, Cursos, Ferramentas, Acervos) que mudam o endereço (`?ver=cursos`); uma seção por tipo, com título, frase curta e contagem ("20 itens") | Mostrar tudo o que existe e levar para o grátis ou para a compra |
| Material grátis | `/gratis/{slug}` | Cartão grande à esquerda (tipo, título, promessa, parágrafo, lista "O que você leva" com +) e cartão de cadastro à direita ("Pegue agora": nome, e-mail, botão, aviso de e-mails com saída em um clique, "Já tem conta? Entrar") | Captar contato em troca de valor real; a pessoa entra na hora e o item fica salvo na conta |
| Produto | `/p/{slug}` | Capa grande com foto, tipo ("Curso + Acervo"), título, promessa, botões "Quero este produto" e "Já comprei, entrar", selos de quantidade ("40 aulas", "17 itens"); "O que tem dentro" com módulos numerados em acordeão, cada aula com código (A01), título e duração; bônus em cartões com número grande | Vender mostrando o conteúdo de verdade, aula por aula |
| Entrar | `/entrar` | "Bem-vindo de volta", "Use o e-mail da compra", e-mail, senha, Esqueci minha senha, Criar conta, **Entrar sem senha, com link no e-mail** | Entrada sem atrito para quem comprou fora |
| Área do aluno | `/minha-area`, `/p/{slug}/aula/{id}` | (não vista) Biblioteca com o que a pessoa tem, player de aula, materiais, progresso | Entregar e reter |
| Parcerias | seção na vitrine | Três cartões: para quem ensina (professor), para quem divulga (afiliado), para empresas (serviço) | Abrir outras fontes de receita |
| Rodapé | todas | Marca e ano, frase da marca, links (Explorar, Newsletter, Seja professor, Seja afiliado, Para empresas), e-mail de suporte | Confiança e caminhos secundários |

## Cartões do catálogo

- **Item grátis:** tipo e quantidade em texto pequeno ("Skills / 14 itens"), selo "Grátis" à direita, título, descrição de 2 a 3 linhas dizendo o resultado, ação no rodapé do cartão ("Pegar grátis"). Todos com a mesma altura na linha.
- **Curso ou acervo:** capa vertical (cerca de 3:4) com foto cinematográfica e título grande na própria capa; abaixo, legenda "Curso / 40 aulas"; selos "Em breve" ou "Teste grátis" quando for o caso.
- Grade de 4 colunas no computador; no celular, carrossel horizontal com o próximo cartão aparecendo pela metade (indica que dá para arrastar).

## Linguagem visual (o que faz parecer caro)

- **Fundo quase preto quente** (#0B0B0A) e cartões um tom acima (#141413), borda fina de 1 px com pouco contraste, cantos de 16–24 px. Texto off-white (#F2F0EB), cinzas quentes para apoio (#A9A59D, #7A766F). Nenhuma cor de destaque: o destaque é o botão claro sobre o escuro.
- **Dois tipos de letra:** uma display larga e pesada para títulos (Unbounded na referência), alternando com a mesma família em peso fino na segunda linha ("A outra forma / de aprender."); uma sem serifa limpa para o resto (Instrument Sans). Escolha outra dupla no seu projeto, mas mantenha o contraste de peso.
- **Rótulos em maiúsculas espaçadas** e pequenos ("ÁREA DE MEMBROS", "40 AULAS", "GRÁTIS PARA SEMPRE").
- **Números grandes e finos** como elemento gráfico (01, 02… nos módulos; 08, 03 nos bônus).
- **Botões em pílula:** principal claro e preenchido, secundário só com contorno. Dois botões no máximo por bloco.
- **Imagens só onde importam:** capas de produto com fotografia cinematográfica; o resto é tipografia e espaço.
- **Muito respiro:** seções bem separadas, linhas finas dividindo cabeçalho, abas e rodapé.
- **Textos curtos e concretos:** cada descrição diz o que a pessoa leva ou consegue ("Roteiros de Reels, legendas e stories no seu jeito de falar"), sem adjetivos vazios.

## Como funciona por trás (o que construir)

| Parte | Como fazer |
|---|---|
| Base | Next.js (a referência usa Next.js com rotas no servidor), páginas da vitrine pré-renderizadas para SEO e prévia no WhatsApp |
| Conta e login | Supabase Auth (ou similar): e-mail e senha + **link mágico por e-mail**; conta criada automaticamente no cadastro grátis ou na compra |
| Liberação após compra | Webhook da plataforma de pagamento (Hotmart, Kiwify, Eduzz, Stripe) chamando o servidor: busca ou cria a conta pelo e-mail e grava o direito ao produto; reembolso ou chargeback remove o direito. Validar a assinatura do webhook |
| Catálogo | Tabelas `produtos` (tipo, slug, título, promessa, capa, preço, link de compra, status: publicado, em breve, teste grátis), `modulos`, `aulas` (código, título, duração, vídeo, materiais), `itens` (para kits e acervos), `acessos` (pessoa, produto, origem, data) |
| Grátis | Formulário nome + e-mail → cria conta, grava acesso e consentimento de e-mail, envia link de entrada; integração com a ferramenta de e-mail marketing |
| Vídeo das aulas | Hospedagem com proteção (Bunny Stream, Panda Video ou Mux): link assinado e com prazo, só para quem tem acesso; nunca vídeo público solto |
| Arquivos (skills, templates, prompts) | Armazenamento privado com download por link temporário |
| Progresso | Tabela de aulas concluídas e "continuar de onde parou" |
| Filtros | Parâmetro no endereço (`?ver=cursos`) para cada aba ser um link compartilhável |
| Afiliados e parceiros | No início, formulários que caem no e-mail ou CRM; a comissão fica na plataforma de pagamento |

## Lista de conferência para um projeto desse tipo

- [ ] A vitrine abre rápido e mostra o grátis antes do pago.
- [ ] Cada produto mostra o conteúdo real (módulos, aulas, duração), não só promessas.
- [ ] "Já comprei, entrar" aparece em toda página de venda.
- [ ] Quem comprou entra com o e-mail da compra, inclusive sem senha (link mágico).
- [ ] O webhook libera o produto em segundos e retira no reembolso.
- [ ] Vídeos e arquivos só abrem para quem tem acesso.
- [ ] Cadastro grátis pede só nome e e-mail, com aviso claro de e-mails e saída em um clique (LGPD).
- [ ] Prévia bonita ao compartilhar cada produto no WhatsApp.
- [ ] Carrossel no celular, grade no computador, botões com 44 px ou mais.
- [ ] Política de Privacidade, Termos e e-mail de suporte visíveis.
