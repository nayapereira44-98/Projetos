// Corte para Reels do vídeo das crianças (IMG_2655.MOV): Halloween × Reforma Protestante.
// Tempos em segundos do vídeo original. Palavras em MAIÚSCULAS na legenda ganham cor.

export type Som = "pop" | "ding" | "whoosh" | "boing" | "brilho";

export type Evento =
  | {
      t: number;
      tipo: "emoji";
      emoji: string;
      x: number;
      y: number;
      tamanho?: number;
      riscar?: number; // momento em que ganha o 🚫
      sai?: number; // momento em que voa para fora da tela
      som?: Som;
    }
  | { t: number; tipo: "banner"; texto: string; cor: string; som?: Som }
  | { t: number; tipo: "selo"; indice: number; som?: Som }
  | { t: number; tipo: "flash"; som?: Som }
  | { t: number; tipo: "confete"; som?: Som }
  | { t: number; tipo: "final"; som?: Som } // mensagem final por cima do vídeo
  | { t: number; tipo: "logo"; ate: number; arroba?: boolean; som?: Som }
  | { t: number; tipo: "som"; som: Som };

export type Trecho = {
  de: number;
  ate: number;
  zoom: number;
  rotulo?: string; // etiqueta fixa no topo (ex.: BASTIDORES)
  fonte?: "bastidores"; // trecho tirado do vídeo de bastidores
  legendas: [number, number, string][];
  eventos: Evento[];
};

export const SOLAS = [
  { emoji: "📖", nome: "Somente a Escritura", cor: "#FED403" },
  { emoji: "👑", nome: "Somente Cristo", cor: "#FED403" },
  { emoji: "❤️", nome: "Somente a Graça", cor: "#FED403" },
  { emoji: "🙏", nome: "Somente a Fé", cor: "#FED403" },
  { emoji: "⭐", nome: "Glória somente a Deus", cor: "#FED403" },
];

export const TRECHOS: Trecho[] = [
  {
    de: 0.0,
    ate: 5.9,
    zoom: 1.2,
    legendas: [
      [0.0, 2.85, "Quem sabe o que a gente comemora"],
      [2.85, 5.9, "no dia 31 de OUTUBRO?"],
    ],
    eventos: [
      { t: 0.0, tipo: "logo", ate: 1.6, som: "brilho" },
      {
        t: 1.7,
        tipo: "banner",
        texto: "📅 31 DE OUTUBRO",
        cor: "#FED403",
        som: "pop",
      },
      { t: 5.0, tipo: "emoji", emoji: "🤔", x: 0.82, y: 0.2, som: "boing" },
    ],
  },
  {
    de: 19.1,
    ate: 23.3,
    zoom: 1.45,
    legendas: [
      [19.1, 21.5, "Por que a gente NÃO comemora HALLOWEEN?"],
      [21.5, 22.3, "Porque é do MAL!"],
      [22.3, 23.3, "Por que é do MAL?"],
    ],
    eventos: [
      {
        t: 20.6,
        tipo: "emoji",
        emoji: "🎃",
        x: 0.2,
        y: 0.22,
        tamanho: 190,
        riscar: 21.6,
        som: "pop",
      },
      { t: 21.6, tipo: "som", som: "boing" },
    ],
  },
  {
    de: 29.8,
    ate: 37.9,
    zoom: 1.3,
    legendas: [
      [29.8, 32.2, "BRUXA é de DEUS?"],
      [32.2, 33.9, "MONSTRO é de DEUS?"],
      [33.9, 34.95, "Já sei!"],
      [34.95, 36.2, "FANTASMA é de DEUS?"],
      [36.2, 37.9, "NÃO é de Deus!"],
    ],
    eventos: [
      {
        t: 29.9,
        tipo: "emoji",
        emoji: "🧙‍♀️",
        x: 0.18,
        y: 0.2,
        riscar: 36.3,
        som: "pop",
      },
      {
        t: 32.3,
        tipo: "emoji",
        emoji: "👹",
        x: 0.82,
        y: 0.2,
        riscar: 36.3,
        som: "pop",
      },
      {
        t: 35.0,
        tipo: "emoji",
        emoji: "👻",
        x: 0.5,
        y: 0.19,
        riscar: 36.3,
        som: "pop",
      },
      { t: 36.3, tipo: "som", som: "boing" },
    ],
  },
  {
    de: 42.8,
    ate: 51.4,
    zoom: 1.45,
    legendas: [
      [42.8, 46.0, "Ter MEDO é de DEUS?"],
      [46.0, 48.4, "O que DEUS faz com o nosso MEDO?"],
      [48.4, 51.4, "Tira e JOGA FORA!"],
    ],
    eventos: [
      {
        t: 43.4,
        tipo: "emoji",
        emoji: "😨",
        x: 0.8,
        y: 0.2,
        sai: 49.2,
        som: "pop",
      },
      { t: 49.2, tipo: "som", som: "whoosh" },
      { t: 49.6, tipo: "emoji", emoji: "🙌", x: 0.2, y: 0.2, som: "ding" },
    ],
  },
  {
    de: 79.4,
    ate: 83.0,
    zoom: 1.2,
    legendas: [
      [79.4, 81.3, "Então, será que é de DEUS?"],
      [81.3, 82.4, "O que vocês acham?"],
      [82.4, 83.0, "NÃO É!"],
    ],
    eventos: [{ t: 82.45, tipo: "som", som: "pop" }],
  },
  {
    de: 82.95,
    ate: 90.7,
    zoom: 1.4,
    legendas: [
      [82.95, 86.9, "Mas tem outra coisa MUITO MAIS IMPORTANTE"],
      [86.9, 89.3, "que a gente comemora"],
      [89.3, 90.7, "dia 31 de OUTUBRO!"],
    ],
    eventos: [
      { t: 85.2, tipo: "emoji", emoji: "✨", x: 0.82, y: 0.2, som: "brilho" },
      { t: 89.4, tipo: "emoji", emoji: "📅", x: 0.18, y: 0.2, som: "pop" },
    ],
  },
  {
    de: 94.5,
    ate: 97.5,
    zoom: 1.25,
    legendas: [[94.5, 97.5, "Chama: REFORMA PROTESTANTE!"]],
    eventos: [
      {
        t: 94.7,
        tipo: "banner",
        texto: "📜 REFORMA PROTESTANTE",
        cor: "#FED403",
        som: "brilho",
      },
      { t: 95.8, tipo: "confete" },
    ],
  },
  {
    de: 107.3,
    ate: 111.3,
    zoom: 1.4,
    legendas: [
      [107.3, 109.1, "Foi a gente conseguir"],
      [109.1, 111.3, "conhecer um pouquinho de JESUS"],
    ],
    eventos: [
      { t: 110.8, tipo: "emoji", emoji: "✝️", x: 0.82, y: 0.2, som: "ding" },
      { t: 110.9, tipo: "flash" },
    ],
  },
  {
    de: 120.1,
    ate: 125.6,
    zoom: 1.3,
    legendas: [
      [120.1, 122.2, "O Senhor é a minha LUZ"],
      [122.2, 124.0, "e a minha SALVAÇÃO."],
      [124.0, 125.6, "A quem temerei?"],
    ],
    eventos: [
      {
        t: 120.2,
        tipo: "banner",
        texto: "☀️ SALMOS 27:1",
        cor: "#FED403",
        som: "ding",
      },
      { t: 121.85, tipo: "flash", som: "brilho" },
    ],
  },
  {
    de: 127.85,
    ate: 132.7,
    zoom: 1.45,
    legendas: [
      [127.85, 129.9, "É pra gente ter MEDO de monstro?"],
      [129.9, 132.0, "De bruxa?"],
      [132.0, 132.7, "NÃO!"],
    ],
    eventos: [
      {
        t: 129.3,
        tipo: "emoji",
        emoji: "👹",
        x: 0.82,
        y: 0.2,
        riscar: 132.0,
        som: "pop",
      },
      {
        t: 131.3,
        tipo: "emoji",
        emoji: "🧙‍♀️",
        x: 0.18,
        y: 0.2,
        riscar: 132.0,
        som: "pop",
      },
      { t: 132.0, tipo: "som", som: "boing" },
    ],
  },
  {
    de: 260.7,
    ate: 276.9,
    zoom: 1.3,
    legendas: [
      [260.7, 262.5, "Somente a ESCRITURA"],
      [262.5, 264.3, "Somente a ESCRITURA!"],
      [264.3, 265.9, "Somente CRISTO"],
      [265.9, 267.4, "Somente CRISTO!"],
      [267.4, 268.8, "Somente a GRAÇA"],
      [268.8, 270.3, "Somente a GRAÇA!"],
      [270.3, 271.6, "Somente a FÉ"],
      [271.6, 272.8, "Somente a FÉ!"],
      [272.8, 275.0, "Glória somente a DEUS"],
      [275.0, 276.9, "Glória somente a DEUS!"],
    ],
    eventos: [
      { t: 260.85, tipo: "selo", indice: 0, som: "ding" },
      { t: 264.4, tipo: "selo", indice: 1, som: "ding" },
      { t: 267.45, tipo: "selo", indice: 2, som: "ding" },
      { t: 270.35, tipo: "selo", indice: 3, som: "ding" },
      { t: 272.85, tipo: "selo", indice: 4, som: "ding" },
      { t: 275.1, tipo: "confete", som: "brilho" },
    ],
  },
  {
    de: 279.95,
    ate: 286.9,
    zoom: 1.4,
    legendas: [
      [279.95, 281.9, "Então, no dia 31 de OUTUBRO,"],
      [281.9, 283.6, "a gente comemora a FÉ"],
      [283.6, 285.9, "que nós temos no Senhor JESUS CRISTO,"],
      [285.9, 286.9, "nosso SALVADOR!"],
    ],
    eventos: [
      { t: 285.1, tipo: "emoji", emoji: "💛", x: 0.82, y: 0.2, som: "ding" },
      { t: 285.3, tipo: "emoji", emoji: "💙", x: 0.18, y: 0.22 },
    ],
  },
  {
    de: 287.2,
    ate: 290.1,
    zoom: 1.25,
    legendas: [
      [287.2, 288.2, "Vocês aprenderam?"],
      [288.2, 289.6, "Vão esquecer?"],
      [289.6, 290.1, "NÃO!"],
    ],
    eventos: [{ t: 289.6, tipo: "confete", som: "brilho" }],
  },
  // Grande final (vídeo de bastidores): as crianças gritam "Reforma Protestante!"
  {
    de: 72.6,
    ate: 81.2,
    zoom: 1.2,
    fonte: "bastidores",
    legendas: [
      [72.6, 77.3, "Pessoal, o que a gente comemora?"],
      [77.3, 78.66, "REFORMA PROTESTANTE!"],
      [78.66, 81.2, "REFORMA PROTESTANTE!"],
    ],
    eventos: [
      { t: 77.35, tipo: "final", som: "brilho" },
      { t: 77.4, tipo: "confete" },
      { t: 78.7, tipo: "confete", som: "ding" },
    ],
  },
];

// Depois do grande final: bastidores divertidos
export const BASTIDORES: Trecho[] = [
  {
    de: 55.6,
    ate: 64.0,
    zoom: 1.2,
    fonte: "bastidores",
    rotulo: "BASTIDORES 😂",
    legendas: [
      [55.6, 58.0, "Ensaiando… REFORMA…"],
      [58.0, 60.5, "PROTESTANTE…"],
      [60.5, 62.7, "REFORMA…"],
      [62.7, 64.0, "PROTESTANTE!"],
    ],
    eventos: [
      { t: 62.85, tipo: "emoji", emoji: "😂", x: 0.82, y: 0.2, som: "pop" },
    ],
  },
  {
    de: 299.6,
    ate: 305.9,
    zoom: 1.3,
    rotulo: "BASTIDORES 😂",
    legendas: [
      [299.6, 300.95, "Eu gosto do DOCE!"],
      [300.95, 302.3, "Você gosta do doce?"],
      [302.3, 304.2, "Eu gosto, eu estava comendo agora!"],
      [304.2, 305.9, "Você estava comendo doce?!"],
    ],
    eventos: [
      { t: 300.2, tipo: "emoji", emoji: "🍬", x: 0.82, y: 0.2, som: "pop" },
      { t: 304.3, tipo: "logo", ate: 305.9, arroba: true, som: "ding" },
    ],
  },
];

// foco vertical do zoom (0 = topo, 1 = base): as crianças ficam na metade de baixo
export const FOCO_Y = 0.62;
