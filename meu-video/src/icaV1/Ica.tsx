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
  CORES,
  Evento,
  FOCO_Y,
  SEG_CARTAO,
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
const AZUL = "#1E3A8A";

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
  const itens = ["⭐", "✨", "💛", "💙", "⭐", "💚", "✨", "🧡"];
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
  const cores = [
    "#FFC93C",
    "#2E86FF",
    "#2EC27E",
    "#FF8A1F",
    "#FF5FA2",
    "#8B5CF6",
  ];
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
        const cor = destaque ? (CORES[limpa] ?? "#FFC93C") : "white";
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
              WebkitTextStroke: `10px ${AZUL}`,
              paintOrder: "stroke fill",
              textShadow: "0 8px 0 rgba(30,58,138,0.35)",
            }}
          >
            {p}
          </span>
        );
      })}
    </div>
  );
};

const Banner: React.FC<{ texto: string; cor: string; inicio: number }> = ({
  texto,
  cor,
  inicio,
}) => {
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
          backgroundColor: cor,
          color: "white",
          fontFamily: fonte,
          fontWeight: 900,
          fontSize: 66,
          padding: "18px 44px",
          borderRadius: 28,
          border: "8px solid white",
          boxShadow: "0 12px 0 rgba(30,58,138,0.25)",
          WebkitTextStroke: `4px ${AZUL}`,
          paintOrder: "stroke fill",
        }}
      >
        <TextoComEmoji texto={texto} tamanho={66} />
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
        filter: "drop-shadow(0 8px 6px rgba(30,58,138,0.3))",
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
          backgroundColor: sola.cor,
          border: "10px solid white",
          boxShadow: "0 0 60px rgba(255,201,60,0.9)",
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
          backgroundColor: i < quantos ? s.cor : "rgba(255,255,255,0.35)",
          border: "6px solid white",
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
          src={staticFile("ica/bruto.mp4")}
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
      <Audio src={staticFile("ica/voz.wav")} trimBefore={quadros(trecho.de)} />
      {indice > 0 ? <SomFx som="whoosh" /> : null}

      <Flutuantes />

      {trecho.rotulo ? (
        <Banner texto={trecho.rotulo} cor="#8B5CF6" inicio={0} />
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

const CartaoFinal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = (atraso: number) =>
    spring({
      frame: frame - atraso,
      fps,
      config: { damping: 10, stiffness: 160 },
    });
  const giro = frame * 0.6;
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
        lineHeight: 1.1,
        WebkitTextStroke: `${tamanho / 9}px ${AZUL}`,
        paintOrder: "stroke fill",
        transform: `scale(${entra(atraso)})`,
        marginBottom: 18,
      }}
    >
      <TextoComEmoji texto={texto} tamanho={tamanho} />
    </div>
  );
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 45%, #FFFBEA 0%, #FFE58A 55%, #FFC93C 100%)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "repeating-conic-gradient(from 0deg at 50% 45%, rgba(255,255,255,0.45) 0deg 10deg, rgba(255,255,255,0) 10deg 20deg)",
          transform: `rotate(${giro}deg) scale(2)`,
        }}
      />
      <Flutuantes />
      <div style={{ position: "relative", padding: "0 60px", marginTop: -120 }}>
        {linha("NÃO comemoramos o Halloween 🎃🚫", 64, "white", 4)}
        {linha("Nós escolhemos", 96, "white", 14)}
        {linha("a LUZ! ✨", 150, "#FFFFFF", 20)}
        <div style={{ height: 30 }} />
        {linha("31 de Outubro", 84, "#FF8A1F", 30)}
        {linha("REFORMA PROTESTANTE", 74, "#2E86FF", 36)}
      </div>
      <div
        style={{
          transform: `scale(${entra(46)})`,
          position: "absolute",
          inset: 0,
        }}
      >
        <FileiraSelos quantos={5} tamanho={130} topo={1500} />
      </div>
      <Confete />
      <SomFx som="brilho" />
    </AbsoluteFill>
  );
};

export const VideoIca: React.FC = () => {
  let t = 0;
  const blocos = TRECHOS.map((trecho, i) => {
    const de = t;
    t += duracaoTrecho(trecho);
    return (
      <Sequence key={i} from={de} durationInFrames={duracaoTrecho(trecho)}>
        <Cena trecho={trecho} indice={i} />
      </Sequence>
    );
  });
  const inicioCartao = t;
  const fimCartao = t + quadros(SEG_CARTAO);
  const total = fimCartao + duracaoTrecho(BASTIDORES);
  return (
    <AbsoluteFill style={{ backgroundColor: "#FFF6D6" }}>
      {blocos}
      <Sequence from={inicioCartao} durationInFrames={quadros(SEG_CARTAO)}>
        <CartaoFinal />
      </Sequence>
      <Sequence from={fimCartao} durationInFrames={duracaoTrecho(BASTIDORES)}>
        <Cena trecho={BASTIDORES} indice={1} />
      </Sequence>
      <Audio
        src={staticFile("ica/trilha.wav")}
        volume={(f) =>
          interpolate(
            f,
            [
              0,
              20,
              inicioCartao - 10,
              inicioCartao,
              fimCartao,
              fimCartao + 10,
              total - 20,
              total,
            ],
            [0.35, 0.09, 0.09, 0.5, 0.5, 0.12, 0.12, 0],
            clamp,
          )
        }
      />
    </AbsoluteFill>
  );
};

export const duracaoTotal = () =>
  TRECHOS.reduce((a, tr) => a + duracaoTrecho(tr), 0) +
  quadros(SEG_CARTAO) +
  duracaoTrecho(BASTIDORES);

export const IcaV1: React.FC = () => (
  <Composition
    id="ICA-Reforma-v1"
    component={VideoIca}
    durationInFrames={duracaoTotal()}
    fps={FPS}
    width={W}
    height={H}
  />
);
