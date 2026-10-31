import { Entrevista } from "./entrevista/Entrevista";
import { LogoSozinho } from "./entrevista/LogoSozinho";
import { Ica } from "./ica/Ica";
import { IcaV1 } from "./icaV1/Ica";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Entrevista />
      <LogoSozinho />
      <Ica />
      <IcaV1 />
    </>
  );
};
