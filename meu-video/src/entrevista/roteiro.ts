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
  // Arquivo dentro de public/ (ex.: "entrevista.mp4"). Sem ele, aparece a foto de referência.
  video: "entrevista.mp4",
  // trecho do arquivo que entra na edição
  inicioSeg: 0,
  fimSeg: 360,

  nome: "Nome da Entrevistada",
  abertura: {
    rotulo: "UMA HISTÓRIA DE FÉ",
    subtitulo: "Fé, força e gratidão na caminhada contra o câncer de mama",
  },
  encerramento: {
    rotulo: "GRATIDÃO",
    texto: "Obrigada por compartilhar a sua história.",
  },

  // Trilha instrumental opcional em public/ (ex.: "trilha.mp3"); null = sem trilha
  trilha: null as string | null,
  volumeTrilha: 0.12,

  // Enquadramento do rosto para os closes das laterais (0 a 1 da imagem) e zoom
  rosto: { x: 0.5, y: 0.33, zoom: 1.4 },

  // Os tempos abaixo são provisórios e devem ser ajustados com o vídeo real.
  perguntas: [
    {
      rotulo: "PERGUNTA 1",
      texto:
        "Quando você recebeu o diagnóstico de câncer de mama, quais foram os primeiros sentimentos que passaram pelo seu coração?",
      inicioSeg: 0,
      fimSeg: 9,
    },
    {
      rotulo: "PERGUNTA 2",
      texto:
        "Como foi o início do tratamento e quais foram os maiores desafios que você precisou enfrentar durante esse período?",
      inicioSeg: 40,
      fimSeg: 48,
    },
    {
      rotulo: "PERGUNTA 3",
      texto:
        "Durante o tratamento, houve algum momento particularmente difícil em que você sentiu que precisava encontrar forças para continuar? O que a ajudou naquele momento?",
      inicioSeg: 80,
      fimSeg: 91,
    },
    {
      rotulo: "PERGUNTA 4",
      texto:
        "Agora que você está chegando à fase final do tratamento, o que mais mudou na sua maneira de enxergar a vida e cuidar de si mesma?",
      inicioSeg: 122,
      fimSeg: 131,
    },
    {
      rotulo: "PERGUNTA 5",
      texto:
        "Houve algum versículo bíblico, oração, louvor ou palavra de alguém que marcou sua vida e trouxe conforto ao seu coração nesse período?",
      inicioSeg: 165,
      fimSeg: 174,
    },
    {
      rotulo: "PERGUNTA 6",
      texto:
        "Em algum momento você percebeu o cuidado de Deus de uma maneira especial?",
      inicioSeg: 205,
      fimSeg: 211,
    },
    {
      rotulo: "PERGUNTA 7",
      texto:
        "Que mensagem você deixaria para uma mulher que acabou de receber o diagnóstico de câncer de mama e está com medo do que virá pela frente?",
      inicioSeg: 245,
      fimSeg: 254,
    },
    {
      rotulo: "PERGUNTA 8",
      texto:
        "Ao olhar para tudo o que você viveu, o que essa experiência ensinou a você sobre a vida, a fé e o amor de Deus?",
      inicioSeg: 288,
      fimSeg: 296,
    },
    {
      rotulo: "PARA ENCERRAR",
      texto:
        "Se você pudesse resumir toda essa caminhada em uma frase de gratidão a Deus, qual seria?",
      inicioSeg: 330,
      fimSeg: 337,
    },
  ] satisfies Pergunta[],

  // Frases de impacto (preencher depois da transcrição)
  destaques: [
    {
      texto: "Exemplo de frase forte dela, que aparece grande aqui.",
      inicioSeg: 60,
      fimSeg: 66,
    },
  ] satisfies Destaque[],

  // Momentos mais emocionantes: closes do rosto dela nas laterais
  closes: [{ inicioSeg: 100, fimSeg: 110 }] satisfies Intervalo[],
};

export const SEG_ABERTURA = 9;
export const SEG_ENCERRAMENTO = 10;
