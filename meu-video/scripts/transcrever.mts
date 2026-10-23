// Gera public/legendas.json a partir do vídeo da entrevista (roda no seu computador).
// Uso: npm run legendas
import { registerMediabunnyServer } from "@mediabunny/server";
import {
  WHISPER_WEBGPU_SAMPLE_RATE,
  canUseWhisperWebGpu,
  downloadWhisperModel,
  loadWhisperModel,
  toCaptions,
  transcribe,
} from "@remotion/whisper-webgpu";
import {
  ALL_FORMATS,
  Conversion,
  FilePathSource,
  Input,
  NullTarget,
  Output,
  WavOutputFormat,
} from "mediabunny";
import { writeFile } from "node:fs/promises";
import { ROTEIRO } from "../src/entrevista/roteiro.ts";

registerMediabunnyServer();

// O runtime de IA pode travar ao fechar; avisa o scripts/legendas.mjs, que encerra este processo.
const sair = (codigo: number) => console.log(codigo === 0 ? "@@PRONTO" : "@@FALHOU");
const falhou = (erro: unknown) => {
  console.error("Erro ao gerar legendas:", erro instanceof Error ? erro.message : erro);
  sair(1);
};
process.on("uncaughtException", falhou);
process.on("unhandledRejection", falhou);

const support = await canUseWhisperWebGpu();
if (!support.supported) {
  console.error(
    "Este computador não tem placa de vídeo compatível para gerar as legendas.\n" +
      "Alternativa: gere um arquivo .srt (CapCut, Premiere) e mande para o Claude.\n\n" +
      support.detailedReason,
  );
  sair(1);
  await new Promise(() => {});
}
console.log("Lendo o áudio do vídeo...");

const chunks: { startFrame: number; waveform: Float32Array }[] = [];

const input = new Input({
  formats: ALL_FORMATS,
  source: new FilePathSource(`public/${ROTEIRO.video}`),
});
const audioTrack = await input.getPrimaryAudioTrack();
if (audioTrack === null) {
  throw new Error("O vídeo não tem áudio.");
}

const conversion = await Conversion.init({
  input,
  output: new Output({ format: new WavOutputFormat(), target: new NullTarget() }),
  video: { discard: true },
  audio: (track) => {
    if (track.id !== audioTrack.id) {
      return { discard: true };
    }
    return {
      codec: "pcm-f32",
      forceTranscode: true,
      numberOfChannels: 1,
      sampleFormat: "f32",
      sampleRate: WHISPER_WEBGPU_SAMPLE_RATE,
      process: (sample) => {
        const waveform = new Float32Array(
          sample.allocationSize({ format: "f32", planeIndex: 0 }) /
            Float32Array.BYTES_PER_ELEMENT,
        );
        sample.copyTo(waveform, { format: "f32", planeIndex: 0 });
        chunks.push({
          startFrame: Math.round(sample.timestamp * WHISPER_WEBGPU_SAMPLE_RATE),
          waveform,
        });
        return sample;
      },
    };
  },
});

if (!conversion.isValid) {
  throw new Error("Não foi possível ler o áudio do vídeo.");
}
await conversion.execute();

const length = chunks.reduce(
  (max, c) => Math.max(max, c.startFrame + c.waveform.length),
  0,
);
const channelWaveform = new Float32Array(length);
for (const c of chunks) {
  const destino = Math.max(0, c.startFrame);
  const origem = Math.max(0, -c.startFrame);
  const n = Math.min(c.waveform.length - origem, channelWaveform.length - destino);
  if (n > 0) {
    channelWaveform.set(c.waveform.subarray(origem, origem + n), destino);
  }
}

console.log("Transcrevendo (na primeira vez baixa o modelo, pode demorar)...");
const model = "small";
await downloadWhisperModel({ model });
await loadWhisperModel({ model });
const transcription = await transcribe({ channelWaveform, model, language: "portuguese" });
const { captions } = toCaptions({ whisperWebGpuOutput: transcription });

await writeFile("public/legendas.json", JSON.stringify(captions, null, 2));
console.log(`Pronto: ${captions.length} palavras em public/legendas.json`);
sair(0);
