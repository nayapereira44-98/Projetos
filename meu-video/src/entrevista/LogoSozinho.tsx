import {
  AbsoluteFill,
  Composition,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { Brilhos, LogoAnimado } from "./LogoAnimado";
import { FPS, Fita, FUNDO } from "./marca";

// Só a logo VIVA animada, para usar em outros vídeos (1920×1080, 5 s).
const DURACAO = 5 * FPS;

const Logo: React.FC<{ comFundo: boolean }> = ({ comFundo }) => {
  const frame = useCurrentFrame();
  const saida = interpolate(frame, [DURACAO - 15, DURACAO], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: comFundo ? FUNDO : undefined }}>
      {comFundo ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: "scale(0.536)",
            transformOrigin: "0 0",
            width: 3584,
            height: 1080 * (1 / 0.536),
          }}
        >
          <Fita
            y={1000}
            opacidade={0.4}
            progresso={interpolate(frame, [0, 50], [0, 1], {
              extrapolateRight: "clamp",
            })}
            id="fita-logo"
          />
        </div>
      ) : null}
      {comFundo ? <Brilhos quantidade={25} /> : null}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: saida,
        }}
      >
        <LogoAnimado largura={1300} atraso={5} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const LogoSozinho: React.FC = () => (
  <>
    <Composition
      id="LogoVIVA-transparente"
      component={Logo}
      durationInFrames={DURACAO}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ comFundo: false }}
    />
    <Composition
      id="LogoVIVA-com-fundo"
      component={Logo}
      durationInFrames={DURACAO}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ comFundo: true }}
    />
  </>
);
