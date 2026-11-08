"""Gera public/trilha.mp3: trilha instrumental original (piano + cordas suaves).

Progressão emocional Lá menor – Fá – Dó – Sol, 72 bpm. Uso:
    python3 scripts/gerar_trilha.py [duracao_em_segundos]
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
BPM = 72
BATIDA = 60 / BPM
COMPASSO = BATIDA * 4
DURACAO = float(sys.argv[1]) if len(sys.argv) > 1 else 390

def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)

# acordes (notas MIDI): Am, F, C, G
ACORDES = [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [55, 59, 62],
]
BAIXOS = [45, 41, 48, 43]
# melodia simples (uma nota longa por meio compasso) que entra no meio
MELODIA = [76, 72, 77, 76, 72, 71, 74, 74]

n = int(DURACAO * SR)
mix = np.zeros(n)

def adiciona(sinal, inicio_seg):
    i = int(inicio_seg * SR)
    if i >= n:
        return
    fim = min(n, i + len(sinal))
    mix[i:fim] += sinal[: fim - i]

def piano(freq, dur, vel):
    t = np.arange(int(dur * SR)) / SR
    env = np.exp(-t * 2.2) * np.minimum(1, t / 0.005)
    tom = sum(a * np.sin(2 * np.pi * freq * k * t) for k, a in [(1, 1), (2, 0.35), (3, 0.12), (4, 0.05)])
    return vel * env * tom

def cordas(freq, dur, vel):
    t = np.arange(int(dur * SR)) / SR
    ataque = np.minimum(1, t / 1.2)
    soltura = np.minimum(1, (dur - t) / 1.2).clip(0)
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5 * t)
    tom = sum(np.sin(2 * np.pi * freq * d * vib * t) for d in (0.997, 1.0, 1.003)) / 3
    tom += 0.3 * np.sin(2 * np.pi * freq * 2 * t)
    return vel * ataque * soltura * tom

total_compassos = int(DURACAO / COMPASSO) + 1
ultimos = total_compassos - 4
for c in range(total_compassos):
    t0 = c * COMPASSO
    idx = c % 4
    acorde = ACORDES[idx] if c < ultimos else ACORDES[2]
    # intensidade: começa suave, cresce no meio e volta a acalmar no fim
    fase = c / total_compassos
    forca = 0.55 + 0.45 * np.sin(np.pi * fase)

    for nota in acorde:
        adiciona(cordas(hz(nota), COMPASSO + 1.2, 0.07 * forca), t0)
    adiciona(cordas(hz(BAIXOS[idx] if c < ultimos else 36), COMPASSO + 1.2, 0.09 * forca), t0)

    if 2 <= c < ultimos:
        arpejo = [acorde[0] + 12, acorde[1] + 12, acorde[2] + 12, acorde[1] + 24]
        for k in range(8):
            nota = arpejo[k % 4]
            adiciona(piano(hz(nota), 2.5, 0.10 * forca * (1.0 if k % 4 == 0 else 0.75)), t0 + k * BATIDA / 2)

    if total_compassos * 0.3 < c < ultimos - 2:
        for meio in range(2):
            nota = MELODIA[(c * 2 + meio) % len(MELODIA)]
            adiciona(piano(hz(nota), 3.5, 0.13 * forca), t0 + meio * COMPASSO / 2)

# acorde final de piano
adiciona(sum(piano(hz(m), 6, 0.12) for m in (48, 55, 60, 64, 67)), ultimos * COMPASSO)

# entra e sai suave
fade = int(3 * SR)
mix[:fade] *= np.linspace(0, 1, fade)
mix[-fade * 2:] *= np.linspace(1, 0, fade * 2)
mix /= np.abs(mix).max() * 1.1

estereo = np.stack([mix, np.roll(mix, int(0.012 * SR))], axis=1)
seca = os.path.join(tempfile.gettempdir(), "trilha_seca.wav")
with wave.open(seca, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((estereo * 32767).astype(np.int16).tobytes())

subprocess.run(
    [
        "ffmpeg", "-loglevel", "error", "-y", "-i", seca,
        "-af", "aecho=0.8:0.6:90|180|370:0.35|0.25|0.15,lowpass=f=7000,loudnorm=I=-18",
        "-ar", "44100", "-b:a", "192k", "public/trilha.mp3",
    ],
    check=True,
)
print("Pronto: public/trilha.mp3")
