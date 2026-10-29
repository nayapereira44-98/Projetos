import { Entrevista } from "./entrevista/Entrevista";
import { LogoSozinho } from "./entrevista/LogoSozinho";
import { Ica } from "./ica/Ica";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Entrevista />
      <LogoSozinho />
      <Ica />
    </>
  );
};
