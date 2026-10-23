import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import {
  AbsoluteFill,
  Audio,
  CalculateMetadataFunction,
  Composition,
  getStaticFiles,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Brilhos, LogoAnimado } from "./LogoAnimado";
import {
  cormorant,
  CREME,
  Dourado,
  Fita,
  FPS,
  FRAMBOESA,
  FUNDO,
  H,
  MARROM,
  OURO,
  Rotulo,
  sans,
  script,
  W,
} from "./marca";
import {
  Intervalo,
  Pergunta,
  ROTEIRO,
  SEG_ABERTURA,
  SEG_ENCERRAMENTO,
} from "./roteiro";

const LARGURA_VIDEO = 608;
const FOTO_REF = "foto-ref.jpg";

type Props = { legendas: Caption[] };

const temArquivo = (nome: string | null) =>
  nome !== null && getStaticFiles().some((f) => f.name === nome);

const surge = (frame: number, duracao: number, borda = 12) =>
  interpolate(frame, [0, borda, duracao - borda, duracao], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

// Vídeo (ou foto de referência) recortado num quadro, com zoom e foco
const Midia: React.FC<{
  largura: number;
  altura: number;
  zoom?: number;
  focoX?: number;
  focoY?: number;
  mudo?: boolean;
  aPartirDoSeg: number;
  filtro?: string;
}> = ({
  largura,
  altura,
  zoom = 1,
  focoX = 0.5,
  focoY = 0.5,
  mudo = false,
  aPartirDoSeg,
  filtro,
}) => {
  const estilo: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: `${focoX * 100}% ${focoY * 100}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${focoX * 100}% ${focoY * 100}%`,
    filter: filtro,
  };
  return (
    <div style={{ width: largura, height: altura, overflow: "hidden" }}>
      {temArquivo(ROTEIRO.video) ? (
        <OffthreadVideo
          src={staticFile(ROTEIRO.video)}
          trimBefore={Math.round(aPartirDoSeg * FPS)}
          muted={mudo}
          style={estilo}
        />
      ) : temArquivo(FOTO_REF) ? (
        <Img src={staticFile(FOTO_REF)} style={estilo} />
      ) : (
        <div style={{ ...estilo, backgroundColor: "#d9d4d2" }} />
      )}
    </div>
  );
};

const Abertura: React.FC = () => {
  const frame = useCurrentFrame();
  const duracao = SEG_ABERTURA * FPS;
  const texto = (atraso: number) => ({
    opacity: interpolate(frame, [atraso, atraso + 20], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    transform: `translateY(${interpolate(frame, [atraso, atraso + 25], [30, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })}px)`,
  });
  const linha = interpolate(frame, [40, 70], [0, 560], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        background: FUNDO,
        opacity: interpolate(frame, [duracao - 20, duracao], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      <Fita
        y={560}
        opacidade={0.4}
        progresso={interpolate(frame, [0, 70], [0, 1], {
          extrapolateRight: "clamp",
        })}
        id="fita-abertura"
      />
      <Brilhos />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "row",
          gap: 160,
        }}
      >
        <LogoAnimado largura={1250} atraso={8} />
        <div style={{ width: 4, height: linha, backgroundImage: OURO }} />
        <div style={{ width: 1500 }}>
          <div style={texto(55)}>
            <Rotulo texto={ROTEIRO.abertura.rotulo} />
          </div>
          <div
            style={{
              ...texto(70),
              fontFamily: script,
              fontSize: 170,
              color: FRAMBOESA,
              lineHeight: 1.2,
            }}
          >
            {ROTEIRO.nome}
          </div>
          <div
            style={{
              ...texto(90),
              fontFamily: cormorant,
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 62,
              color: MARROM,
              marginTop: 10,
            }}
          >
            {ROTEIRO.abertura.subtitulo}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TelaPergunta: React.FC<{ pergunta: Pergunta; duracao: number }> = ({
  pergunta,
  duracao,
}) => {
  const frame = useCurrentFrame();
  const palavras = pergunta.texto.split(" ");
  return (
    <AbsoluteFill
      style={{
        background: FUNDO,
        opacity: surge(frame, duracao, 15),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Fita
        y={540}
        amplitude={320}
        opacidade={0.35}
        progresso={interpolate(frame, [0, 45], [0, 1], {
          extrapolateRight: "clamp",
        })}
        id="fita-pergunta"
      />
      <Brilhos quantidade={20} />
      <div style={{ width: 2400, textAlign: "center", position: "relative" }}>
        <div
          style={{
            opacity: interpolate(frame, [5, 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            marginBottom: 36,
          }}
        >
          <Rotulo texto={pergunta.rotulo} tamanho={40} />
        </div>
        <div
          style={{
            fontFamily: cormorant,
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 104,
            color: MARROM,
            lineHeight: 1.18,
          }}
        >
          {palavras.map((p, i) => {
            const inicio = 15 + i * 2;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  marginRight: "0.25em",
                  opacity: interpolate(frame, [inicio, inicio + 12], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  transform: `translateY(${interpolate(frame, [inicio, inicio + 12], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
                }}
              >
                {p}
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 60 }}>
        <Img src={staticFile("viva-logo.png")} style={{ width: 230 }} />
      </div>
    </AbsoluteFill>
  );
};

const Laterais: React.FC<{ intervalo: Intervalo; duracao: number }> = ({
  intervalo,
  duracao,
}) => {
  const frame = useCurrentFrame();
  const lateral = (W - LARGURA_VIDEO - 12) / 2;
  const close = (
    <div style={{ position: "relative" }}>
      <Midia
        largura={lateral}
        altura={H}
        zoom={ROTEIRO.rosto.zoom}
        focoX={ROTEIRO.rosto.x}
        focoY={ROTEIRO.rosto.y}
        mudo
        aPartirDoSeg={intervalo.inicioSeg}
        filtro="sepia(0.3) brightness(1.05)"
      />
      <AbsoluteFill style={{ backgroundColor: CREME, opacity: 0.5 }} />
    </div>
  );
  return (
    <AbsoluteFill
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        opacity: surge(frame, duracao, 20),
      }}
    >
      {close}
      <div style={{ transform: "scaleX(-1)" }}>{close}</div>
    </AbsoluteFill>
  );
};

const Corpo: React.FC<Props> = ({ legendas }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seg = ROTEIRO.inicioSeg + frame / fps;

  const atual = [...ROTEIRO.perguntas].reverse().find((p) => p.inicioSeg <= seg);
  const proxima = ROTEIRO.perguntas.find((p) => p.inicioSeg > seg);
  // zoom lento durante cada resposta
  const inicioResposta = atual ? atual.fimSeg : ROTEIRO.inicioSeg;
  const fimResposta = proxima ? proxima.inicioSeg : ROTEIRO.fimSeg;
  const zoom = interpolate(seg, [inicioResposta, fimResposta], [1, 1.07], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const destaque = ROTEIRO.destaques.find(
    (d) => seg >= d.inicioSeg && seg < d.fimSeg,
  );
  const { pages } = createTikTokStyleCaptions({
    captions: legendas,
    combineTokensWithinMilliseconds: 2600,
  });
  const ms = seg * 1000;
  const pagina = pages.find(
    (p) => ms >= p.startMs && ms < p.startMs + p.durationMs,
  );

  const painel = (lado: "left" | "right"): React.CSSProperties => ({
    position: "absolute",
    [lado]: 230,
    width: 1180,
    top: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  });

  return (
    <AbsoluteFill style={{ background: FUNDO }}>
      <Fita y={560} opacidade={0.4} id="fita-corpo" />
      {ROTEIRO.trilha && temArquivo(ROTEIRO.trilha) ? (
        <Audio src={staticFile(ROTEIRO.trilha)} volume={ROTEIRO.volumeTrilha} loop />
      ) : null}

      {ROTEIRO.closes.map((c, i) => {
        const duracao = Math.round((c.fimSeg - c.inicioSeg) * fps);
        return (
          <Sequence
            key={i}
            from={Math.round((c.inicioSeg - ROTEIRO.inicioSeg) * fps)}
            durationInFrames={duracao}
            layout="none"
          >
            <Laterais intervalo={c} duracao={duracao} />
          </Sequence>
        );
      })}

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            padding: 6,
            backgroundImage: OURO,
            boxShadow: "0 30px 80px rgba(122,62,12,0.25)",
          }}
        >
          <Midia
            largura={LARGURA_VIDEO}
            altura={H - 12}
            zoom={zoom}
            focoY={ROTEIRO.rosto.y}
            aPartirDoSeg={ROTEIRO.inicioSeg}
          />
        </div>
      </AbsoluteFill>

      {atual ? (
        <div style={painel("left")}>
          <div style={{ marginBottom: 24 }}>
            <Rotulo texto={atual.rotulo} />
          </div>
          <div
            style={{
              fontFamily: cormorant,
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 64,
              color: MARROM,
              lineHeight: 1.2,
              opacity: 0.85,
            }}
          >
            {atual.texto}
          </div>
        </div>
      ) : null}

      <div style={painel("right")}>
        {destaque ? (
          <div
            style={{
              fontFamily: cormorant,
              fontWeight: 600,
              fontSize: 110,
              color: MARROM,
              lineHeight: 1.05,
              opacity: surge(
                (seg - destaque.inicioSeg) * fps,
                (destaque.fimSeg - destaque.inicioSeg) * fps,
              ),
            }}
          >
            “<Dourado>{destaque.texto}</Dourado>”
          </div>
        ) : legendas.length === 0 ? (
          <div
            style={{ fontFamily: sans, fontSize: 48, color: MARROM, opacity: 0.4 }}
          >
            As legendas aparecem aqui depois da transcrição.
          </div>
        ) : pagina ? (
          <div
            style={{
              fontFamily: sans,
              fontWeight: 600,
              fontSize: 72,
              color: MARROM,
              lineHeight: 1.3,
              opacity: interpolate(ms - pagina.startMs, [0, 150], [0, 1], {
                extrapolateRight: "clamp",
              }),
            }}
          >
            {pagina.text.trim()}
          </div>
        ) : null}
      </div>

      <div style={{ position: "absolute", right: 120, bottom: 50 }}>
        <Img src={staticFile("viva-logo.png")} style={{ width: 240 }} />
      </div>

      {ROTEIRO.perguntas.map((p, i) => {
        const antes = 10;
        const duracao = Math.round((p.fimSeg - p.inicioSeg) * fps) + antes + 10;
        return (
          <Sequence
            key={i}
            from={Math.round((p.inicioSeg - ROTEIRO.inicioSeg) * fps) - antes}
            durationInFrames={duracao}
          >
            <TelaPergunta pergunta={p} duracao={duracao} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const Encerramento: React.FC = () => {
  const frame = useCurrentFrame();
  const aparece = (atraso: number) =>
    interpolate(frame, [atraso, atraso + 25], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  return (
    <AbsoluteFill
      style={{
        background: FUNDO,
        justifyContent: "center",
        alignItems: "center",
        opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" }),
      }}
    >
      <Fita y={600} opacidade={0.35} id="fita-fim" />
      <Brilhos />
      <LogoAnimado largura={1000} atraso={10} />
      <div style={{ opacity: aparece(60), marginTop: 50 }}>
        <Rotulo texto={ROTEIRO.encerramento.rotulo} />
      </div>
      <div
        style={{
          opacity: aparece(75),
          fontFamily: cormorant,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 76,
          color: MARROM,
          marginTop: 16,
        }}
      >
        {ROTEIRO.encerramento.texto}
      </div>
      <div
        style={{
          opacity: aparece(90),
          fontFamily: script,
          fontSize: 110,
          color: FRAMBOESA,
        }}
      >
        {ROTEIRO.nome}
      </div>
    </AbsoluteFill>
  );
};

export const Video: React.FC<Props> = ({ legendas }) => {
  const abertura = SEG_ABERTURA * FPS;
  const corpo = Math.round((ROTEIRO.fimSeg - ROTEIRO.inicioSeg) * FPS);
  return (
    <AbsoluteFill style={{ backgroundColor: CREME }}>
      <Sequence durationInFrames={abertura}>
        <Abertura />
      </Sequence>
      <Sequence from={abertura} durationInFrames={corpo}>
        <Corpo legendas={legendas} />
      </Sequence>
      <Sequence from={abertura + corpo}>
        <Encerramento />
      </Sequence>
    </AbsoluteFill>
  );
};

const calculateMetadata: CalculateMetadataFunction<Props> = async () => {
  let legendas: Caption[] = [];
  if (temArquivo("legendas.json")) {
    legendas = await fetch(staticFile("legendas.json")).then((r) => r.json());
  }
  return { props: { legendas } };
};

export const Entrevista: React.FC = () => (
  <Composition
    id="Entrevista"
    component={Video}
    durationInFrames={
      (SEG_ABERTURA + SEG_ENCERRAMENTO) * FPS +
      Math.round((ROTEIRO.fimSeg - ROTEIRO.inicioSeg) * FPS)
    }
    fps={FPS}
    width={W}
    height={H}
    defaultProps={{ legendas: [] }}
    calculateMetadata={calculateMetadata}
  />
);
