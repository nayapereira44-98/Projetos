import "@fontsource/orbitron/900.css";
import "@fontsource/poppins/800.css";
import "@fontsource/poppins/900.css";
import {
  AbsoluteFill,
  Audio,
  Img,
  Composition,
  Easing,
  interpolate,
  OffthreadVideo,
  random,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  BASTIDORES,
  Evento,
  FOCO_Y,
  SOLAS,
  Som,
  Trecho,
  TRECHOS,
} from "./roteiro";

const FPS = 30;
const W = 1080;
const H = 1920;
const fonte = "Poppins, 'Noto Color Emoji', sans-serif";
const emojiFonte = "sans-serif";

// Emojis viram imagens do Twemoji (public/ica/emoji): o navegador da renderização
// não desenha emoji colorido como texto.
const codigoEmoji = (e: string) => {
  const cps = Array.from(e).map((c) => c.codePointAt(0)!.toString(16));
  return (cps.includes("200d") ? cps : cps.filter((c) => c !== "fe0f")).join(
    "-",
  );
};

const Emoji: React.FC<{ e: string; tamanho: number }> = ({ e, tamanho }) => (
  <Img
    src={staticFile(`ica/emoji/${codigoEmoji(e)}.svg`)}
    style={{
      width: tamanho,
      height: tamanho,
      display: "inline-block",
      verticalAlign: "-0.12em",
    }}
  />
);

const EMOJI_RE =
  /(\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)/u;

const TextoComEmoji: React.FC<{ texto: string; tamanho: number }> = ({
  texto,
  tamanho,
}) => (
  <>
    {texto
      .split(EMOJI_RE)
      .map((parte, i) =>
        EMOJI_RE.test(parte) ? (
          <Emoji key={i} e={parte} tamanho={tamanho * 0.95} />
        ) : (
          <span key={i}>{parte}</span>
        ),
      )}
  </>
);
// identidade da Igreja de Cristo Arena: amarelo da faixa da logo, preto e branco
const PRETO = "#161616";
const AMARELO = "#FED403";
const fonteMarca = "Orbitron, sans-serif";

const quadros = (seg: number) => Math.round(seg * FPS);
const duracaoTrecho = (t: Trecho) => quadros(t.ate - t.de);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const SomFx: React.FC<{ som: Som }> = ({ som }) => (
  <Audio
    src={staticFile(`ica/sfx_${som}.wav`)}
    volume={som === "whoosh" ? 0.35 : som === "boing" ? 0.45 : 0.4}
  />
);

// Estrelinhas e corações flutuando nas bordas, o vídeo todo
const Flutuantes: React.FC = () => {
  const frame = useCurrentFrame();
  const itens = ["⭐", "✨", "💛", "⭐", "✨", "💛", "⭐", "✨"];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {itens.map((e, i) => {
        const lado =
          i % 2 === 0
            ? 0.06 + random(`x${i}`) * 0.12
            : 0.82 + random(`x${i}`) * 0.12;
        const vel = 0.6 + random(`v${i}`) * 0.6;
        const y = ((random(`y${i}`) * H - frame * vel) % (H * 0.55)) + H * 0.1;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: lado * W,
              top: y < H * 0.1 ? y + H * 0.55 : y,
              fontSize: 44 + random(`t${i}`) * 26,
              fontFamily: emojiFonte,
              opacity: 0.85,
              transform: `rotate(${Math.sin(frame / 20 + i) * 15}deg)`,
            }}
          >
            <Emoji e={e} tamanho={60} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Confete: React.FC = () => {
  const frame = useCurrentFrame();
  const cores = [AMARELO, "#FFFFFF", "#FFE45C", PRETO, "#FFF3B0", AMARELO];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {new Array(90).fill(0).map((_, i) => {
        const x0 = random(`cx${i}`) * W;
        const vy = 18 + random(`cv${i}`) * 22;
        const vx = (random(`cvx${i}`) - 0.5) * 14;
        const y = -60 - random(`cy${i}`) * 400 + frame * vy;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x0 + frame * vx,
              top: y,
              width: 18,
              height: 28,
              borderRadius: 4,
              backgroundColor: cores[i % cores.length],
              transform: `rotate(${frame * (8 + i)}deg)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Legenda estilo "Hormozi": palavras-chave coloridas e maiores, entrada com pulo
const Legenda: React.FC<{ texto: string; inicio: number }> = ({
  texto,
  inicio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - inicio,
    fps,
    config: { damping: 12, stiffness: 220 },
  });
  const palavras = texto.split(" ");
  return (
    <div
      style={{
        position: "absolute",
        top: 1120,
        left: 70,
        right: 70,
        textAlign: "center",
        transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`,
        opacity: s,
      }}
    >
      {palavras.map((p, i) => {
        const limpa = p.replace(/[^A-ZÀ-Ú]/g, "");
        const destaque =
          limpa.length > 1 && p === p.toUpperCase() && /[A-ZÀ-Ú]/.test(p);
        const cor = destaque ? AMARELO : "white";
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: 18,
              fontFamily: fonte,
              fontWeight: 900,
              fontSize: destaque ? 96 : 78,
              lineHeight: 1.15,
              color: cor,
              WebkitTextStroke: `10px ${PRETO}`,
              paintOrder: "stroke fill",
              textShadow: "0 8px 0 rgba(22,22,22,0.35)",
            }}
          >
            {p}
          </span>
        );
      })}
    </div>
  );
};

const Banner: React.FC<{
  texto: string;
  cor: string;
  inicio: number;
  escuro?: boolean;
}> = ({ texto, inicio, escuro = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - inicio,
    fps,
    config: { damping: 10, stiffness: 160 },
  });
  return (
    <div
      style={{
        position: "absolute",
        top: 250,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        transform: `scale(${s}) rotate(${interpolate(s, [0, 1], [-8, -2])}deg)`,
      }}
    >
      <div
        style={{
          backgroundColor: escuro ? PRETO : AMARELO,
          color: escuro ? AMARELO : PRETO,
          fontFamily: fonteMarca,
          fontWeight: 900,
          fontSize: 56,
          letterSpacing: 3,
          padding: "16px 40px",
          borderRadius: 6,
          border: `6px solid ${escuro ? AMARELO : PRETO}`,
          boxShadow: "0 10px 0 rgba(22,22,22,0.35)",
        }}
      >
        <TextoComEmoji texto={texto} tamanho={56} />
      </div>
    </div>
  );
};

const Figurinha: React.FC<{
  ev: Extract<Evento, { tipo: "emoji" }>;
  inicio: number;
}> = ({ ev, inicio }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - inicio,
    fps,
    config: { damping: 9, stiffness: 180 },
  });
  const tamanho = ev.tamanho ?? 160;
  const riscado =
    ev.riscar !== undefined && frame >= inicio + quadros(ev.riscar - ev.t);
  const sRisco = ev.riscar
    ? spring({
        frame: frame - inicio - quadros(ev.riscar - ev.t),
        fps,
        config: { damping: 9 },
      })
    : 0;
  const saida = ev.sai
    ? interpolate(frame - inicio - quadros(ev.sai - ev.t), [0, 12], [0, 1], {
        ...clamp,
        easing: Easing.in(Easing.cubic),
      })
    : 0;
  const balanco = Math.sin((frame - inicio) / 6) * 6;
  return (
    <div
      style={{
        position: "absolute",
        left: ev.x * W - tamanho / 2,
        top: ev.y * H - tamanho / 2 - saida * 1200,
        width: tamanho,
        height: tamanho,
        fontSize: tamanho * 0.85,
        fontFamily: emojiFonte,
        textAlign: "center",
        lineHeight: `${tamanho}px`,
        transform: `scale(${s * (1 - saida * 0.4)}) rotate(${balanco + saida * 200}deg)`,
        filter: "drop-shadow(0 8px 6px rgba(22,22,22,0.3))",
      }}
    >
      <Emoji e={ev.emoji} tamanho={tamanho * 0.9} />
      {riscado ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            fontSize: tamanho * 1.05,
            lineHeight: `${tamanho}px`,
            transform: `scale(${sRisco})`,
          }}
        >
          <Emoji e="🚫" tamanho={tamanho} />
        </div>
      ) : null}
    </div>
  );
};

const SeloGrande: React.FC<{ indice: number; inicio: number }> = ({
  indice,
  inicio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - inicio,
    fps,
    config: { damping: 10, stiffness: 170 },
  });
  const sola = SOLAS[indice];
  return (
    <div
      style={{
        position: "absolute",
        top: 190,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        transform: `scale(${s})`,
      }}
    >
      <div
        style={{
          width: 230,
          height: 230,
          borderRadius: "50%",
          backgroundColor: AMARELO,
          border: `10px solid ${PRETO}`,
          boxShadow: "0 0 60px rgba(254,212,3,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 130,
          fontFamily: emojiFonte,
        }}
      >
        <Emoji e={sola.emoji} tamanho={140} />
      </div>
    </div>
  );
};

const FileiraSelos: React.FC<{
  quantos: number;
  tamanho?: number;
  topo?: number;
}> = ({ quantos, tamanho = 120, topo = 1480 }) => (
  <div
    style={{
      position: "absolute",
      top: topo,
      width: "100%",
      display: "flex",
      justifyContent: "center",
      gap: 22,
    }}
  >
    {SOLAS.map((s, i) => (
      <div
        key={i}
        style={{
          width: tamanho,
          height: tamanho,
          borderRadius: "50%",
          backgroundColor: i < quantos ? AMARELO : "rgba(255,255,255,0.35)",
          border: `6px solid ${PRETO}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: tamanho * 0.55,
          fontFamily: emojiFonte,
          opacity: i < quantos ? 1 : 0.5,
          transform: `scale(${i < quantos ? 1 : 0.8})`,
        }}
      >
        {i < quantos ? <Emoji e={s.emoji} tamanho={tamanho * 0.6} /> : null}
      </div>
    ))}
  </div>
);

// Um trecho do vídeo original: vídeo, voz, legendas e efeitos
const Cena: React.FC<{ trecho: Trecho; indice: number }> = ({
  trecho,
  indice,
}) => {
  const frame = useCurrentFrame();
  const dur = duracaoTrecho(trecho);
  const emQuadro = (t: number) => quadros(t - trecho.de);
  // "soco" de zoom no corte + aproximação lenta durante a fala
  const soco = interpolate(frame, [0, 6], [1.08, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const lento = interpolate(frame, [0, dur], [1, 1.05], clamp);
  // zoom suave: o enquadramento original já é fechado nas crianças
  const zoom = (1 + (trecho.zoom - 1) * 0.45) * soco * lento;
  const flashes = trecho.eventos.filter((e) => e.tipo === "flash");
  const brilhoFlash = flashes.reduce(
    (acc, e) =>
      Math.max(
        acc,
        interpolate(frame - emQuadro(e.t), [0, 2, 8], [0, 0.75, 0], clamp),
      ),
    0,
  );
  const legenda = trecho.legendas.find(
    ([a, b]) => frame >= emQuadro(a) && frame < emQuadro(b),
  );
  const selosVistos = trecho.eventos.filter(
    (e) => e.tipo === "selo" && frame >= emQuadro(e.t),
  );
  const ultimoSelo = selosVistos[selosVistos.length - 1];

  return (
    <AbsoluteFill style={{ backgroundColor: "#FFF6D6", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: `50% ${FOCO_Y * 100}%`,
        }}
      >
        <OffthreadVideo
          src={staticFile(
            trecho.fonte === "bastidores"
              ? "ica/bastidores.mp4"
              : "ica/bruto.mp4",
          )}
          trimBefore={quadros(trecho.de)}
          muted
          style={{
            width: W,
            height: H,
            objectFit: "cover",
            filter: "saturate(1.3) brightness(1.07) contrast(1.06)",
          }}
        />
      </AbsoluteFill>
      {/* faixa clara no topo deixa as legendas legíveis sobre a parede */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(255,246,214,0.55) 0%, rgba(255,246,214,0.15) 40%, rgba(255,246,214,0) 55%)",
        }}
      />
      <Audio
        src={staticFile(
          trecho.fonte === "bastidores"
            ? "ica/voz_bastidores.wav"
            : "ica/voz.wav",
        )}
        trimBefore={quadros(trecho.de)}
      />
      {indice > 0 ? <SomFx som="whoosh" /> : null}

      <Flutuantes />

      {trecho.rotulo ? (
        <Banner texto={trecho.rotulo} cor={PRETO} inicio={0} escuro />
      ) : null}

      {trecho.eventos.map((ev, i) => {
        const de = emQuadro(ev.t);
        return (
          <Sequence key={i} from={de} layout="none">
            {"som" in ev && ev.som ? <SomFx som={ev.som} /> : null}
            {ev.tipo === "emoji" ? <Figurinha ev={ev} inicio={0} /> : null}
            {ev.tipo === "banner" ? (
              <Banner texto={ev.texto} cor={ev.cor} inicio={0} />
            ) : null}
            {ev.tipo === "confete" ? <Confete /> : null}
            {ev.tipo === "final" ? <MensagemFinal /> : null}
            {ev.tipo === "logo" ? (
              <Sequence durationInFrames={quadros(ev.ate - ev.t)} layout="none">
                <VinhetaLogo
                  duracao={quadros(ev.ate - ev.t)}
                  arroba={ev.arroba}
                />
              </Sequence>
            ) : null}
          </Sequence>
        );
      })}

      {ultimoSelo && ultimoSelo.tipo === "selo" ? (
        <Sequence
          from={emQuadro(ultimoSelo.t)}
          layout="none"
          key={ultimoSelo.indice}
        >
          <SeloGrande indice={ultimoSelo.indice} inicio={0} />
        </Sequence>
      ) : null}
      {selosVistos.length > 0 ? (
        <FileiraSelos quantos={selosVistos.length} />
      ) : null}

      {legenda ? (
        <Legenda
          key={legenda[0]}
          texto={legenda[2]}
          inicio={emQuadro(legenda[0])}
        />
      ) : null}

      <AbsoluteFill
        style={{ backgroundColor: "white", opacity: brilhoFlash }}
      />
    </AbsoluteFill>
  );
};

// Logo da Igreja de Cristo Arena, sempre com o fundo original (fiel à marca)
const SeloLogo: React.FC<{ largura: number }> = ({ largura }) => (
  <Img
    src={staticFile("ica/logo_arena_fundo.png")}
    style={{
      width: largura,
      borderRadius: largura * 0.06,
      boxShadow: "0 14px 30px rgba(22,22,22,0.35)",
      border: `5px solid ${AMARELO}`,
    }}
  />
);

const VinhetaLogo: React.FC<{ duracao: number; arroba?: boolean }> = ({
  duracao,
  arroba = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 11, stiffness: 170 } });
  const sai = interpolate(frame, [duracao - 8, duracao], [1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        paddingTop: 300,
        alignItems: "center",
        backgroundColor: `rgba(22,22,22,${0.45 * sai})`,
      }}
    >
      <div
        style={{
          transform: `scale(${s * (0.9 + 0.1 * sai)})`,
          opacity: sai,
          textAlign: "center",
        }}
      >
        <SeloLogo largura={760} />
        {arroba ? (
          <div
            style={{
              marginTop: 26,
              display: "inline-block",
              backgroundColor: AMARELO,
              color: PRETO,
              fontFamily: fonteMarca,
              fontWeight: 900,
              fontSize: 54,
              letterSpacing: 3,
              padding: "12px 34px",
              borderRadius: 6,
            }}
          >
            @icacampinas
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// Mensagem final por cima do vídeo do grito "Reforma Protestante!"
const MensagemFinal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = (atraso: number) =>
    spring({
      frame: frame - atraso,
      fps,
      config: { damping: 10, stiffness: 160 },
    });
  const faixa = (
    texto: string,
    escuro: boolean,
    atraso: number,
    tamanho = 40,
  ) => (
    <div
      style={{
        textAlign: "center",
        transform: `scale(${entra(atraso)})`,
        marginBottom: 14,
      }}
    >
      <span
        style={{
          display: "inline-block",
          backgroundColor: escuro ? PRETO : AMARELO,
          color: escuro ? AMARELO : PRETO,
          fontFamily: fonteMarca,
          fontWeight: 900,
          fontSize: tamanho,
          letterSpacing: 2,
          padding: "10px 26px",
          borderRadius: 6,
        }}
      >
        <TextoComEmoji texto={texto} tamanho={tamanho} />
      </span>
    </div>
  );
  const linha = (
    texto: string,
    tamanho: number,
    cor: string,
    atraso: number,
  ) => (
    <div
      style={{
        fontFamily: fonte,
        fontWeight: 900,
        fontSize: tamanho,
        color: cor,
        textAlign: "center",
        lineHeight: 1.05,
        WebkitTextStroke: `${tamanho / 9}px ${PRETO}`,
        paintOrder: "stroke fill",
        transform: `scale(${entra(atraso)})`,
        marginBottom: 8,
      }}
    >
      <TextoComEmoji texto={texto} tamanho={tamanho} />
    </div>
  );
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: interpolate(frame, [0, 10], [0, 1], clamp),
          maskImage:
            "radial-gradient(ellipse 75% 24% at 50% 18%, black 0%, black 55%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 75% 24% at 50% 18%, black 0%, black 55%, transparent 100%)",
        }}
      >
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse at 50% 18%, rgba(255,251,230,0.9) 0%, rgba(255,251,230,0) 60%)",
          }}
        />
        <AbsoluteFill
          style={{
            background: `repeating-conic-gradient(from 0deg at 50% 18%, rgba(254,212,3,0.45) 0deg 9deg, rgba(254,212,3,0) 9deg 18deg)`,
            transform: `rotate(${frame * 0.6}deg) scale(2.2)`,
            transformOrigin: "50% 18%",
          }}
        />
      </AbsoluteFill>
      <div style={{ position: "absolute", top: 90, left: 30, right: 30 }}>
        <div
          style={{
            textAlign: "center",
            transform: `scale(${entra(0)})`,
            marginBottom: 18,
          }}
        >
          <SeloLogo largura={330} />
        </div>
        {faixa("NÃO comemoramos o Halloween 🎃🚫", false, 6)}
        {linha("Nós escolhemos", 74, "white", 12)}
        {linha("a LUZ! ✨", 118, AMARELO, 16)}
        {faixa("31 de Outubro · Reforma Protestante", true, 22, 34)}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${entra(28)})`,
        }}
      >
        <FileiraSelos quantos={5} tamanho={120} topo={1480} />
      </div>
    </AbsoluteFill>
  );
};

export const VideoIca: React.FC = () => {
  const todos = [...TRECHOS, ...BASTIDORES];
  let t = 0;
  const marcos: number[] = [];
  const blocos = todos.map((trecho, i) => {
    const de = t;
    marcos.push(de);
    t += duracaoTrecho(trecho);
    return (
      <Sequence key={i} from={de} durationInFrames={duracaoTrecho(trecho)}>
        <Cena trecho={trecho} indice={i} />
      </Sequence>
    );
  });
  const total = t;
  // trilha mais alta no grande final, baixinha durante as falas
  const inicioFinal = marcos[TRECHOS.length - 1];
  const inicioBastidores = marcos[TRECHOS.length];
  return (
    <AbsoluteFill style={{ backgroundColor: "#FFF6D6" }}>
      {blocos}
      <Audio
        src={staticFile("ica/trilha.wav")}
        volume={(f) =>
          interpolate(
            f,
            [
              0,
              20,
              inicioFinal - 10,
              inicioFinal + 10,
              inicioBastidores - 10,
              inicioBastidores + 10,
              total - 20,
              total,
            ],
            [0.35, 0.09, 0.09, 0.22, 0.22, 0.12, 0.12, 0],
            clamp,
          )
        }
      />
    </AbsoluteFill>
  );
};

export const duracaoTotal = () =>
  [...TRECHOS, ...BASTIDORES].reduce((a, tr) => a + duracaoTrecho(tr), 0);

export const Ica: React.FC = () => (
  <Composition
    id="ICA-Reforma"
    component={VideoIca}
    durationInFrames={duracaoTotal()}
    fps={FPS}
    width={W}
    height={H}
  />
);
