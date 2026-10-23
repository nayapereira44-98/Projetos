import "@fontsource/cinzel/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/great-vibes/400.css";
import "@fontsource/montserrat/600.css";
import { AbsoluteFill, Img, Still, staticFile } from "remotion";

// Rascunhos de layout para o telão (~3500x1080) com vídeo gravado na vertical,
// seguindo a identidade da Conferência de Mulheres VIVA:
// fundo claro, letras douradas, fita rosa e assinatura em script framboesa.

const W = 3500;
const H = 1080;

const CREME = "#FBF6F1";
const BLUSH = "#F6E3E1";
const ROSA_FITA = "#EFA3B0";
const FRAMBOESA = "#B23A5A";
const MARROM = "#3B2418";
const OURO = "linear-gradient(135deg, #7A3E0C 0%, #C9822F 30%, #F0BE6A 50%, #B8721F 70%, #7A3E0C 100%)";

const cinzel = "Cinzel, serif";
const cormorant = "'Cormorant Garamond', serif";
const script = "'Great Vibes', cursive";
const sans = "Montserrat, sans-serif";

// Área do vídeo dentro do print (em pixels do arquivo original 1290x2796)
const RECORTE_TOPO = 470;
const RECORTE_ALTURA = 2164;
const ORIGINAL_LARGURA = 1290;

const Foto: React.FC<{
  altura: number;
  largura: number;
  zoom?: number;
  focoY?: number;
  filtro?: string;
}> = ({ altura, largura, zoom = 1, focoY = 0, filtro }) => {
  const escala = (altura / RECORTE_ALTURA) * zoom;
  const larguraImg = ORIGINAL_LARGURA * escala;
  return (
    <div
      style={{
        width: largura,
        height: altura,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Img
        src={staticFile("foto-tela.png")}
        style={{
          position: "absolute",
          width: larguraImg,
          left: (largura - larguraImg) / 2,
          top: -RECORTE_TOPO * escala - focoY * escala,
          filter: filtro,
        }}
      />
    </div>
  );
};

const Dourado: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <span
    style={{
      backgroundImage: OURO,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      ...style,
    }}
  >
    {children}
  </span>
);

const Logo: React.FC<{ largura: number }> = ({ largura }) => (
  <Img src={staticFile("viva-logo.png")} style={{ width: largura }} />
);

// Fita rosa atravessando a tela, como na arte do evento
const Fita: React.FC<{ y?: number; amplitude?: number; opacidade?: number }> = ({
  y = H / 2,
  amplitude = 260,
  opacidade = 0.55,
}) => {
  const d = `M -100 ${y + amplitude} C 600 ${y - amplitude * 1.6}, 1200 ${y + amplitude * 1.6}, 1750 ${y} S 2900 ${y - amplitude * 1.6}, 3600 ${y - amplitude}`;
  return (
    <svg
      width={W}
      height={H}
      style={{ position: "absolute", left: 0, top: 0, opacity: opacidade }}
    >
      <defs>
        <linearGradient id="fita" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#F7C9D0" />
          <stop offset="0.35" stopColor={ROSA_FITA} />
          <stop offset="0.5" stopColor="#FBE0E4" />
          <stop offset="0.7" stopColor="#E58A9B" />
          <stop offset="1" stopColor="#F7C9D0" />
        </linearGradient>
      </defs>
      <path d={d} stroke="url(#fita)" strokeWidth={46} fill="none" />
      <path
        d={d}
        stroke="white"
        strokeOpacity={0.5}
        strokeWidth={6}
        fill="none"
        transform="translate(0,-12)"
      />
    </svg>
  );
};

const MolduraVideo: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{
      padding: 6,
      backgroundImage: OURO,
      boxShadow: "0 30px 80px rgba(122,62,12,0.25)",
    }}
  >
    {children}
  </div>
);

const Rotulo: React.FC<{ texto: string }> = ({ texto }) => (
  <Dourado
    style={{
      fontFamily: cinzel,
      fontWeight: 600,
      fontSize: 34,
      letterSpacing: 10,
      display: "inline-block",
      marginBottom: 28,
    }}
  >
    {texto}
  </Dourado>
);

// A: vídeo no centro com moldura dourada; pergunta à esquerda, legenda à direita
const LayoutA: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at center, ${BLUSH} 0%, ${CREME} 60%)`,
    }}
  >
    <Fita y={560} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <MolduraVideo>
        <Foto altura={H - 12} largura={596} />
      </MolduraVideo>
    </AbsoluteFill>
    <div
      style={{
        position: "absolute",
        left: 220,
        width: 1120,
        top: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Rotulo texto="PERGUNTA" />
      <div
        style={{
          fontFamily: cormorant,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 92,
          color: MARROM,
          lineHeight: 1.15,
        }}
      >
        Como você recebeu o diagnóstico?
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        right: 220,
        width: 1120,
        top: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontFamily: sans,
          fontWeight: 600,
          fontSize: 66,
          color: MARROM,
          lineHeight: 1.3,
        }}
      >
        Eu lembro que saí do consultório e fiquei um tempo parada no carro, sem
        conseguir falar nada.
      </div>
    </div>
    <div style={{ position: "absolute", right: 220, bottom: 60 }}>
      <Logo largura={260} />
    </div>
  </AbsoluteFill>
);

// B: vídeo à esquerda, frase de impacto grande à direita
const LayoutB: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: CREME }}>
    <div
      style={{
        position: "absolute",
        left: 0,
        width: 760,
        top: 0,
        bottom: 0,
        backgroundColor: BLUSH,
      }}
    />
    <div style={{ position: "absolute", left: 420, top: 0 }}>
      <MolduraVideo>
        <Foto altura={H - 12} largura={596} />
      </MolduraVideo>
    </div>
    <div
      style={{
        position: "absolute",
        left: 1300,
        right: 300,
        top: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: cormorant,
          fontWeight: 600,
          fontSize: 170,
          color: MARROM,
          lineHeight: 1.0,
        }}
      >
        “Eu escolhi <Dourado>viver</Dourado> cada dia.”
      </div>
      <div
        style={{
          width: 220,
          height: 5,
          backgroundImage: OURO,
          margin: "60px 0 40px",
        }}
      />
      <div style={{ fontFamily: script, fontSize: 110, color: FRAMBOESA }}>
        Nome da Entrevistada
      </div>
    </div>
    <div style={{ position: "absolute", right: 120, top: 70 }}>
      <Logo largura={240} />
    </div>
  </AbsoluteFill>
);

// C: tríptico — vídeo no centro, closes do rosto em tom quente nas laterais
const LayoutC: React.FC = () => {
  const lateral = (W - 608) / 2;
  const close = (
    <div style={{ position: "relative" }}>
      <Foto
        altura={H}
        largura={lateral}
        zoom={3}
        focoY={420}
        filtro="sepia(0.35) saturate(0.9) brightness(1.05)"
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(90deg, ${CREME}00 0%, ${CREME}55 100%)`,
        }}
      />
      <AbsoluteFill style={{ backgroundColor: BLUSH, opacity: 0.35 }} />
    </div>
  );
  return (
    <AbsoluteFill style={{ backgroundColor: CREME, flexDirection: "row" }}>
      {close}
      <div style={{ width: 6, backgroundImage: OURO }} />
      <Foto altura={H} largura={596} />
      <div style={{ width: 6, backgroundImage: OURO }} />
      <div style={{ transform: "scaleX(-1)" }}>{close}</div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 80,
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontFamily: sans,
            fontWeight: 600,
            fontSize: 70,
            color: MARROM,
            backgroundColor: `${CREME}e6`,
            padding: "16px 48px",
            borderRadius: 60,
          }}
        >
          E foi aí que eu entendi que eu não estava sozinha.
        </span>
      </div>
    </AbsoluteFill>
  );
};

// D: tela de pergunta — a voz continua, a tela mostra o texto
const TelaPergunta: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at center, ${CREME} 0%, ${BLUSH} 100%)`,
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <Fita y={540} amplitude={320} opacidade={0.35} />
    <div style={{ width: 2200, textAlign: "center", position: "relative" }}>
      <Rotulo texto="PERGUNTA" />
      <div
        style={{
          fontFamily: cormorant,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 110,
          color: MARROM,
          lineHeight: 1.15,
        }}
      >
        O que você diria hoje para uma mulher que acabou de receber o
        diagnóstico?
      </div>
    </div>
    <div style={{ position: "absolute", bottom: 60 }}>
      <Logo largura={220} />
    </div>
  </AbsoluteFill>
);

// E: abertura do vídeo com a marca do evento
const Abertura: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at center, ${CREME} 0%, ${BLUSH} 100%)`,
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "row",
      gap: 160,
    }}
  >
    <Logo largura={1150} />
    <div style={{ width: 4, height: 520, backgroundImage: OURO }} />
    <div>
      <Rotulo texto="UMA HISTÓRIA DE FORÇA" />
      <div
        style={{
          fontFamily: script,
          fontSize: 170,
          color: FRAMBOESA,
          lineHeight: 1.1,
        }}
      >
        Nome da Entrevistada
      </div>
      <div
        style={{
          fontFamily: cormorant,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 64,
          color: MARROM,
          marginTop: 20,
        }}
      >
        Outubro Rosa · Conferência de Mulheres
      </div>
    </div>
  </AbsoluteFill>
);

export const Mockups: React.FC = () => (
  <>
    <Still id="A-centro" component={LayoutA} width={W} height={H} />
    <Still id="B-editorial" component={LayoutB} width={W} height={H} />
    <Still id="C-triptico" component={LayoutC} width={W} height={H} />
    <Still id="D-pergunta" component={TelaPergunta} width={W} height={H} />
    <Still id="E-abertura" component={Abertura} width={W} height={H} />
  </>
);
