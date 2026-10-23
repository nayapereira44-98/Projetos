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

const support = await canUseWhisperWebGpu();
if (!support.supported) {
  throw new Error(support.detailedReason);
}

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

const model = "small";
await downloadWhisperModel({ model });
await loadWhisperModel({ model });
const transcription = await transcribe({ channelWaveform, model, language: "portuguese" });
const { captions } = toCaptions({ whisperWebGpuOutput: transcription });

await writeFile("public/legendas.json", JSON.stringify(captions, null, 2));
console.log(`Pronto: ${captions.length} palavras em public/legendas.json`);
