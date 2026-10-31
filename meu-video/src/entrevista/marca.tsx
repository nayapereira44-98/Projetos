import "@fontsource/cinzel/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/great-vibes/400.css";
import "@fontsource/montserrat/600.css";
import { useCurrentFrame } from "remotion";

// Identidade visual VIVA: fundo claro, dourado, fita rosa e script framboesa.

export const W = 3584;
export const H = 1080;
export const FPS = 30;

export const CREME = "#FBF6F1";
export const BLUSH = "#F6E3E1";
export const FRAMBOESA = "#B23A5A";
export const MARROM = "#3B2418";
export const OURO =
  "linear-gradient(135deg, #7A3E0C 0%, #C9822F 30%, #F0BE6A 50%, #B8721F 70%, #7A3E0C 100%)";

export const cinzel = "Cinzel, serif";
export const cormorant = "'Cormorant Garamond', serif";
export const script = "'Great Vibes', cursive";
export const sans = "Montserrat, sans-serif";

export const FUNDO = `radial-gradient(ellipse at center, ${CREME} 0%, ${BLUSH} 100%)`;

export const Dourado: React.FC<{
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

export const Rotulo: React.FC<{ texto: string; tamanho?: number }> = ({
  texto,
  tamanho = 34,
}) => (
  <Dourado
    style={{
      fontFamily: cinzel,
      fontWeight: 600,
      fontSize: tamanho,
      letterSpacing: tamanho * 0.3,
      display: "inline-block",
    }}
  >
    {texto}
  </Dourado>
);

// Fita rosa que ondula devagar e pode ser "desenhada" (progresso de 0 a 1)
export const Fita: React.FC<{
  y?: number;
  amplitude?: number;
  opacidade?: number;
  progresso?: number;
  id?: string;
}> = ({ y = H / 2, amplitude = 260, opacidade = 0.5, progresso = 1, id = "fita" }) => {
  const frame = useCurrentFrame();
  const onda = Math.sin(frame / 50) * 60;
  const a = amplitude;
  const d = `M -100 ${y + a + onda} C 650 ${y - a * 1.6 - onda}, 1250 ${y + a * 1.6 + onda}, ${W / 2} ${y} S ${W - 650} ${y - a * 1.6 + onda}, ${W + 100} ${y - a - onda}`;
  return (
    <svg
      width={W}
      height={H}
      style={{ position: "absolute", left: 0, top: 0, opacity: opacidade }}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#F7C9D0" />
          <stop offset="0.35" stopColor="#EFA3B0" />
          <stop offset="0.5" stopColor="#FBE0E4" />
          <stop offset="0.7" stopColor="#E58A9B" />
          <stop offset="1" stopColor="#F7C9D0" />
        </linearGradient>
      </defs>
      <path
        d={d}
        stroke={`url(#${id})`}
        strokeWidth={46}
        fill="none"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progresso}
      />
      <path
        d={d}
        stroke="white"
        strokeOpacity={0.5}
        strokeWidth={6}
        fill="none"
        transform="translate(0,-12)"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progresso}
      />
    </svg>
  );
};
