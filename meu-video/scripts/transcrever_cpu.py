"""Transcreve o vídeo sem placa de vídeo (CPU) e gera public/legendas.json.

Alternativa ao `npm run legendas` para computadores sem GPU.
Uso: pip install faster-whisper && python3 scripts/transcrever_cpu.py public/entrevista.mov
"""
import json
import os
import subprocess
import sys

import numpy as np

from faster_whisper import WhisperModel

arquivo = sys.argv[1] if len(sys.argv) > 1 else "public/entrevista.mov"
modelo = WhisperModel(os.environ.get("MODELO", "large-v3"), device="cpu", compute_type="int8")
# decodifica com o ffmpeg (16 kHz, mono) para não depender da versão do PyAV
pcm = subprocess.run(
    ["ffmpeg", "-loglevel", "error", "-i", arquivo, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
    capture_output=True,
    check=True,
).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
segmentos, _ = modelo.transcribe(
    audio,
    language="pt",
    word_timestamps=True,
    vad_filter=True,
    beam_size=5,
    # contexto ajuda o modelo com nomes e termos médicos
    initial_prompt=os.environ.get(
        "CONTEXTO",
        "Entrevista com Taise sobre câncer de mama triplo-negativo, quimioterapia e fé em Deus.",
    ),
)

legendas = []
for seg in segmentos:
    print(f"[{seg.start:7.1f}s] {seg.text.strip()}", flush=True)
    for p in seg.words or []:
        legendas.append(
            {
                # formato Caption do @remotion/captions: espaço antes de cada palavra
                "text": " " + p.word.strip(),
                "startMs": round(p.start * 1000),
                "endMs": round(p.end * 1000),
                "timestampMs": round((p.start + p.end) / 2 * 1000),
                "confidence": round(p.probability, 3),
            }
        )

with open("public/legendas.json", "w", encoding="utf-8") as f:
    json.dump(legendas, f, ensure_ascii=False, indent=1)
print(f"Pronto: {len(legendas)} palavras em public/legendas.json")
