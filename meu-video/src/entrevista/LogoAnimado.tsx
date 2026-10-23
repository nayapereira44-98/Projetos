import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { H, W } from "./marca";

const LOGO = staticFile("viva-logo.png");
const PROPORCAO = 708 / 1653;

// Partículas douradas subindo devagar
const Brilhos: React.FC<{ quantidade?: number }> = ({ quantidade = 40 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {new Array(quantidade).fill(true).map((_, i) => {
        const x = random(`x${i}`) * W;
        const velocidade = 0.6 + random(`v${i}`) * 1.2;
        const y = H - ((random(`y${i}`) * H + frame * velocidade) % (H + 40));
        const tamanho = 4 + random(`t${i}`) * 8;
        const piscar = 0.35 + 0.65 * Math.abs(Math.sin(frame / 20 + i));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: tamanho,
              height: tamanho,
              borderRadius: "50%",
              background: "radial-gradient(circle, #FFE3A3 0%, #D9963F 70%)",
              opacity: piscar * 0.7,
              filter: "blur(1px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Logo VIVA revelada da esquerda para a direita, com brilho passando pelo dourado
export const LogoAnimado: React.FC<{ largura: number; atraso?: number }> = ({
  largura,
  atraso = 0,
}) => {
  const frame = useCurrentFrame() - atraso;
  const altura = largura * PROPORCAO;

  const revela = interpolate(frame, [0, 45], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const escala = interpolate(frame, [0, 60], [1.08, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const desfoque = interpolate(frame, [0, 35], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // o brilho passa uma vez na entrada e depois a cada 4 segundos
  const ciclo = frame < 50 ? frame : (frame - 50) % 120;
  const brilho = interpolate(ciclo, [0, 40], [-40, 140], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flutua = Math.sin(frame / 40) * 6;

  const mascara: React.CSSProperties = {
    WebkitMaskImage: `url(${LOGO})`,
    maskImage: `url(${LOGO})`,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
  };

  return (
    <div
      style={{
        width: largura,
        height: altura,
        position: "relative",
        transform: `translateY(${flutua}px) scale(${escala})`,
        clipPath: `inset(0 ${100 - revela}% 0 0)`,
        filter: `blur(${desfoque}px)`,
      }}
    >
      <Img src={LOGO} style={{ width: largura, height: altura }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          ...mascara,
          background: `linear-gradient(105deg, transparent ${brilho - 12}%, rgba(255,240,200,0.85) ${brilho}%, transparent ${brilho + 12}%)`,
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
};

export { Brilhos };
