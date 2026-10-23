"""Transcreve o vídeo sem placa de vídeo (CPU) e gera public/legendas.json.

Alternativa ao `npm run legendas` para computadores sem GPU.
Uso: pip install faster-whisper && python3 scripts/transcrever_cpu.py public/entrevista.mov
"""
import json
import sys

from faster_whisper import WhisperModel

arquivo = sys.argv[1] if len(sys.argv) > 1 else "public/entrevista.mov"
modelo = WhisperModel("medium", device="cpu", compute_type="int8")
segmentos, _ = modelo.transcribe(
    arquivo, language="pt", word_timestamps=True, vad_filter=True, beam_size=5
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
