import { AbsoluteFill, Img, Still, staticFile } from "remotion";

// Rascunhos de layout para o telão (~3500x1080) com vídeo gravado na vertical.
// A foto é um print do celular: recortamos só a área do vídeo.

const W = 3500;
const H = 1080;

const ROSA = "#E0218A";
const ROSA_CLARO = "#F7C6DC";
const VINHO = "#3A0C2A";

const fonte = "Georgia, 'Times New Roman', serif";
const fonteSans = "Helvetica, Arial, sans-serif";

// Área do vídeo dentro do print (em pixels do arquivo original 1290x2796)
const RECORTE_TOPO = 470;
const RECORTE_ALTURA = 2164;
const ORIGINAL_LARGURA = 1290;

const Foto: React.FC<{
  altura: number;
  largura: number;
  desfoque?: number;
  zoom?: number;
  focoY?: number;
}> = ({ altura, largura, desfoque = 0, zoom = 1, focoY = 0 }) => {
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
          filter: desfoque ? `blur(${desfoque}px) brightness(0.55)` : undefined,
        }}
      />
    </div>
  );
};

const Legenda: React.FC<{ texto: string; tamanho?: number }> = ({
  texto,
  tamanho = 64,
}) => (
  <div
    style={{
      fontFamily: fonteSans,
      fontWeight: 700,
      fontSize: tamanho,
      color: "white",
      lineHeight: 1.25,
    }}
  >
    {texto}
  </div>
);

const Pergunta: React.FC<{ texto: string; tamanho?: number }> = ({
  texto,
  tamanho = 76,
}) => (
  <div>
    <div
      style={{
        fontFamily: fonteSans,
        fontSize: 30,
        letterSpacing: 8,
        color: ROSA_CLARO,
        marginBottom: 24,
      }}
    >
      PERGUNTA
    </div>
    <div
      style={{
        fontFamily: fonte,
        fontStyle: "italic",
        fontSize: tamanho,
        color: "white",
        lineHeight: 1.2,
      }}
    >
      “{texto}”
    </div>
  </div>
);

const Laco: React.FC<{ tamanho: number; cor?: string }> = ({
  tamanho,
  cor = ROSA,
}) => (
  <svg width={tamanho} height={tamanho * 1.3} viewBox="0 0 100 130">
    <path
      d="M50 10 C30 10 25 35 40 55 L15 120 L32 125 L50 75 L68 125 L85 120 L60 55 C75 35 70 10 50 10 Z M50 22 C60 22 62 38 50 52 C38 38 40 22 50 22 Z"
      fill={cor}
    />
  </svg>
);

// A: vídeo no centro, fundo desfocado; pergunta à esquerda, legenda à direita
const LayoutA: React.FC = () => {
  const larguraVideo = 608;
  return (
    <AbsoluteFill style={{ backgroundColor: VINHO }}>
      <AbsoluteFill style={{ alignItems: "center" }}>
        <Foto altura={H} largura={W} desfoque={40} zoom={3.4} focoY={300} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(90deg, ${VINHO}ee 0%, ${VINHO}88 35%, transparent 50%, ${VINHO}88 65%, ${VINHO}ee 100%)`,
        }}
      />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ boxShadow: "0 0 80px rgba(0,0,0,0.6)" }}>
          <Foto altura={H} largura={larguraVideo} />
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 200,
          width: 1150,
          top: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Pergunta texto="Como você recebeu o diagnóstico?" />
      </div>
      <div
        style={{
          position: "absolute",
          right: 200,
          width: 1150,
          top: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Legenda texto="Eu lembro que saí do consultório e fiquei um tempo parada no carro, sem conseguir falar nada." />
      </div>
      <div style={{ position: "absolute", left: 200, bottom: 70 }}>
        <Laco tamanho={50} />
      </div>
    </AbsoluteFill>
  );
};

// B: vídeo à esquerda, painel editorial grande à direita
const LayoutB: React.FC = () => {
  const larguraVideo = 608;
  return (
    <AbsoluteFill style={{ backgroundColor: "#FBF3F7" }}>
      <div style={{ position: "absolute", left: 420, top: 0 }}>
        <Foto altura={H} largura={larguraVideo} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          width: 420,
          top: 0,
          bottom: 0,
          backgroundColor: ROSA,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 420 + larguraVideo + 200,
          right: 260,
          top: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 50,
        }}
      >
        <div
          style={{
            fontFamily: fonte,
            fontSize: 150,
            color: VINHO,
            lineHeight: 1.05,
          }}
        >
          “Eu escolhi viver cada dia.”
        </div>
        <div style={{ width: 160, height: 8, backgroundColor: ROSA }} />
        <div
          style={{
            fontFamily: fonteSans,
            fontSize: 58,
            color: "#5a3a4c",
            lineHeight: 1.3,
          }}
        >
          Nome da Entrevistada · sobrevivente do câncer de mama
        </div>
      </div>
    </AbsoluteFill>
  );
};

// C: tríptico — vídeo no centro, closes do rosto nas laterais
const LayoutC: React.FC = () => {
  const larguraVideo = 608;
  const lateral = (W - larguraVideo) / 2;
  return (
    <AbsoluteFill style={{ backgroundColor: "black", flexDirection: "row" }}>
      <div style={{ position: "relative", opacity: 0.45 }}>
        <Foto altura={H} largura={lateral} zoom={3} focoY={420} />
        <AbsoluteFill
          style={{ backgroundColor: ROSA, mixBlendMode: "color", opacity: 0.6 }}
        />
      </div>
      <Foto altura={H} largura={larguraVideo} />
      <div style={{ position: "relative", opacity: 0.45 }}>
        <Foto altura={H} largura={lateral} zoom={3} focoY={420} />
        <AbsoluteFill
          style={{ backgroundColor: ROSA, mixBlendMode: "color", opacity: 0.6 }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 90,
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontFamily: fonteSans,
            fontWeight: 700,
            fontSize: 72,
            color: "white",
            backgroundColor: "rgba(0,0,0,0.55)",
            padding: "12px 36px",
          }}
        >
          E foi aí que eu entendi que eu não estava sozinha.
        </span>
      </div>
    </AbsoluteFill>
  );
};

// Tela de pergunta: a voz da entrevistadora continua, a tela mostra o texto
const TelaPergunta: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at center, #6b1748 0%, ${VINHO} 70%)`,
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <Laco tamanho={70} cor={ROSA_CLARO} />
    <div style={{ width: 2000, textAlign: "center", marginTop: 40 }}>
      <Pergunta texto="O que você diria hoje para uma mulher que acabou de receber o diagnóstico?" />
    </div>
  </AbsoluteFill>
);

export const Mockups: React.FC = () => (
  <>
    <Still id="A-centro" component={LayoutA} width={W} height={H} />
    <Still id="B-editorial" component={LayoutB} width={W} height={H} />
    <Still id="C-triptico" component={LayoutC} width={W} height={H} />
    <Still id="D-pergunta" component={TelaPergunta} width={W} height={H} />
  </>
);
