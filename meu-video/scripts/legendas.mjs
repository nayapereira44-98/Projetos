// Roda a transcrição num processo separado e o encerra quando termina,
// porque o runtime de IA às vezes não fecha sozinho.
import { spawn } from "node:child_process";

const filho = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/transcrever.mts"],
  { stdio: ["inherit", "pipe", "pipe"] },
);

filho.stderr.on("data", (dados) => process.stderr.write(dados));
filho.stdout.on("data", (dados) => {
  const texto = dados.toString();
  process.stdout.write(texto.replace(/@@(PRONTO|FALHOU)\n?/g, ""));
  if (texto.includes("@@PRONTO") || texto.includes("@@FALHOU")) {
    filho.kill("SIGKILL");
    process.exit(texto.includes("@@PRONTO") ? 0 : 1);
  }
});
filho.on("exit", (codigo) => process.exit(codigo ?? 1));
