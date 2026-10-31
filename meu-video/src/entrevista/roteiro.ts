// Roteiro da entrevista: tudo que muda de um vídeo para outro fica aqui.
// Tempos em segundos, contados a partir do início do arquivo de vídeo original.

export type Pergunta = {
  rotulo: string;
  texto: string;
  // quando a entrevistadora começa e termina de fazer a pergunta
  inicioSeg: number;
  fimSeg: number;
};

export type Destaque = {
  // frase forte dela que aparece grande no lugar da legenda
  texto: string;
  inicioSeg: number;
  fimSeg: number;
};

export type Intervalo = { inicioSeg: number; fimSeg: number };

export const ROTEIRO = {
  // Arquivo dentro de public/. "entrevista.mp4" é a versão leve (1440×2560, H.264)
  // do original A001_10212002_C005.mov. Sem ele, aparece a foto de referência.
  video: "entrevista.mp4",
  // trecho do arquivo que entra na edição (corta a conversa depois da última resposta)
  inicioSeg: 0.4,
  fimSeg: 375,

  nome: "Taisa",
  abertura: {
    rotulo: "UMA HISTÓRIA DE FÉ",
    subtitulo: "Fé, força e gratidão na caminhada contra o câncer de mama",
  },
  encerramento: {
    rotulo: "GRATIDÃO",
    texto: "Obrigada por compartilhar a sua história.",
  },

  // Trilha instrumental em public/ (gerada por scripts/gerar_trilha.py); null = sem trilha
  trilha: "trilha.mp3" as string | null,
  volumeTrilha: 0.1,
  volumeTrilhaVinhetas: 0.6,

  // Enquadramento do rosto para os closes das laterais (0 a 1 da imagem) e zoom
  rosto: { x: 0.55, y: 0.33, zoom: 1.4 },

  // 0 = cada bloco de public/legendas.json vira uma legenda (legenda revisada);
  // use ~2600 com a legenda palavra por palavra do `npm run legendas`.
  agruparLegendasMs: 0,

  // Tempos tirados da transcrição do vídeo real.
  perguntas: [
    {
      rotulo: "PERGUNTA 1",
      texto:
        "Quando você recebeu o diagnóstico de câncer de mama, quais foram os primeiros sentimentos que passaram pelo seu coração?",
      inicioSeg: 19.8,
      fimSeg: 29.5,
    },
    {
      rotulo: "PERGUNTA 2",
      texto:
        "Como foi o início do tratamento e quais foram os maiores desafios que você precisou enfrentar durante esse período?",
      inicioSeg: 60.0,
      fimSeg: 67.8,
    },
    {
      rotulo: "PERGUNTA 3",
      texto:
        "Durante o tratamento, houve algum momento particularmente difícil em que você sentiu que precisava encontrar forças para continuar? O que a ajudou naquele momento?",
      inicioSeg: 103.5,
      fimSeg: 113.4,
    },
    {
      rotulo: "PERGUNTA 4",
      texto:
        "Agora que você está chegando à fase final do tratamento, o que mais mudou na sua maneira de enxergar a vida e cuidar de si mesma?",
      inicioSeg: 158.4,
      fimSeg: 167.0,
    },
    {
      rotulo: "PERGUNTA 5",
      texto:
        "Houve algum versículo bíblico, oração, louvor ou palavra de alguém que marcou sua vida e trouxe conforto ao seu coração nesse período?",
      inicioSeg: 196.2,
      fimSeg: 205.2,
    },
    {
      rotulo: "PERGUNTA 6",
      texto:
        "Em algum momento você percebeu o cuidado de Deus de uma maneira especial?",
      inicioSeg: 217.9,
      fimSeg: 222.6,
    },
    {
      rotulo: "PERGUNTA 7",
      texto:
        "Que mensagem você deixaria para uma mulher que acabou de receber o diagnóstico de câncer de mama e está com medo do que virá pela frente?",
      inicioSeg: 256.5,
      fimSeg: 267.0,
    },
    {
      rotulo: "PERGUNTA 8",
      texto:
        "Ao olhar para tudo o que você viveu, o que essa experiência ensinou a você sobre a vida, a fé e o amor de Deus?",
      inicioSeg: 312.4,
      fimSeg: 320.6,
    },
    {
      rotulo: "PARA ENCERRAR",
      texto:
        "Se você pudesse resumir toda essa caminhada em uma frase de gratidão a Deus, qual seria?",
      inicioSeg: 358.2,
      fimSeg: 369.8,
    },
  ] satisfies Pergunta[],

  // Frases de impacto: aparecem grandes no lugar da legenda
  destaques: [
    { texto: "Cada caso é um caso, e nem tudo está perdido.", inicioSeg: 52.4, fimSeg: 58.6 },
    { texto: "Eu sou uma nova mulher.", inicioSeg: 181.1, fimSeg: 186.6 },
    { texto: "Seja forte e corajosa.", inicioSeg: 214.4, fimSeg: 217.4 },
    {
      texto: "O câncer de mama, quando diagnosticado precocemente, tem cura.",
      inicioSeg: 288.7,
      fimSeg: 302.7,
    },
    { texto: "A vida não para.", inicioSeg: 321.0, fimSeg: 322.7 },
    { texto: "Tudo posso naquele que me fortalece.", inicioSeg: 370.3, fimSeg: 375 },
  ] satisfies Destaque[],

  // Momentos mais emocionantes: closes do rosto dela nas laterais
  closes: [
    { inicioSeg: 30, fimSeg: 42 },
    { inicioSeg: 129.2, fimSeg: 150 },
    { inicioSeg: 302.8, fimSeg: 311 },
    { inicioSeg: 343.8, fimSeg: 357.8 },
  ] satisfies Intervalo[],
};

export const SEG_ABERTURA = 9;
export const SEG_ENCERRAMENTO = 10;
