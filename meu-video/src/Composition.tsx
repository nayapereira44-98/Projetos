import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Composition,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Props = {
  titulo: string;
  subtitulo: string;
};

const calculateMetadata: CalculateMetadataFunction<Props> = () => {
  return {};
};

export const MyComposition = () => {
  return (
    <Composition
      id="MyComp"
      component={MyComponent}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        titulo: "Meu primeiro vídeo",
        subtitulo: "feito com Remotion",
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};

export const MyComponent: React.FC<Props> = ({ titulo, subtitulo }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const entrada = spring({ frame, fps, config: { damping: 200 } });
  const entradaSub = spring({
    frame: frame - 15,
    fps,
    config: { damping: 200 },
  });
  const saida = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#111",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "sans-serif",
        opacity: saida,
      }}
    >
      <div
        style={{
          color: "white",
          fontSize: 120,
          fontWeight: 800,
          textAlign: "center",
          padding: "0 80px",
          lineHeight: 1.1,
          opacity: entrada,
          transform: `translateY(${interpolate(entrada, [0, 1], [80, 0])}px)`,
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          color: "#ff4d6d",
          fontSize: 64,
          fontWeight: 600,
          marginTop: 40,
          opacity: entradaSub,
          transform: `translateY(${interpolate(entradaSub, [0, 1], [40, 0])}px)`,
        }}
      >
        {subtitulo}
      </div>
    </AbsoluteFill>
  );
};
