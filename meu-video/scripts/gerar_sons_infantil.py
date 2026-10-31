"""Gera a trilha infantil (ukulele + glockenspiel) e os efeitos sonoros do vídeo ICA.

Tudo original, sintetizado aqui, sem direitos autorais.
Uso: python3 scripts/gerar_sons_infantil.py [duracao_trilha_em_segundos]
Saída: public/ica/trilha.wav e public/ica/sfx_*.wav
"""
import os
import sys
import wave

import numpy as np

SR = 44100
SAIDA = "public/ica"
rng = np.random.default_rng(7)


def salvar(nome, x, estereo=False):
    x = x / (np.abs(x).max() + 1e-9) * 0.9
    if estereo:
        x = np.stack([x, np.roll(x, int(0.008 * SR))], axis=1)
    with wave.open(os.path.join(SAIDA, nome), "wb") as w:
        w.setnchannels(2 if estereo else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def corda(freq, dur, brilho=0.5):
    """Karplus-Strong: som de corda dedilhada, parecido com ukulele."""
    n = int(dur * SR)
    p = int(SR / freq)
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = (1 - brilho) * buf[i % p] + brilho * 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out


def sino(freq, dur, vol=1.0):
    t = np.arange(int(dur * SR)) / SR
    parciais = [(1, 1), (2.76, 0.4), (5.4, 0.2), (8.93, 0.08)]
    return vol * sum(a * np.exp(-t * 3 * k) * np.sin(2 * np.pi * freq * k * t) for k, a in parciais)


# ---------- trilha ----------
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 100
BPM = 112
batida = 60 / BPM
n = int(dur * SR)
trilha = np.zeros(n)

# acordes de ukulele (cordas G C E A, afinação reentrante)
ACORDES = {
    "C": [67, 60, 64, 72],
    "G": [67, 62, 66, 71],
    "Am": [69, 60, 64, 69],
    "F": [69, 60, 65, 69],
}
SEQ = ["C", "G", "Am", "F"]
cache = {}


def nota(m, d=1.2):
    if (m, d) not in cache:
        cache[(m, d)] = corda(hz(m), d)
    return cache[(m, d)]


def soma(x, t):
    i = int(t * SR)
    if i < n:
        f = min(n, i + len(x))
        trilha[i:f] += x[: f - i]


# levada: baixo-cima-baixo-cima (padrão "pão-com-manteiga") com batidas em colcheia
padrao = [1, 0, 0.6, 0.7, 0, 0.7, 0.6, 0.7]
compasso = batida * 4
for c in range(int(dur / compasso) + 1):
    acorde = ACORDES[SEQ[c % 4]]
    for k, vol in enumerate(padrao):
        if vol == 0:
            continue
        t0 = c * compasso + k * batida / 2
        cordas = acorde if k % 2 == 0 else acorde[::-1]
        for j, m in enumerate(cordas):
            soma(0.18 * vol * nota(m), t0 + j * 0.012)

# melodia de glockenspiel saltitante
MELODIA = [72, 76, 79, 76, 74, 79, 74, 71, 72, 76, 81, 76, 77, 76, 74, 72]
for c in range(2, int(dur / compasso) - 1):
    for k in range(4):
        m = MELODIA[(c * 4 + k) % len(MELODIA)] + 12
        soma(0.10 * sino(hz(m), 1.2), c * compasso + k * batida)

fade = int(2 * SR)
trilha[:fade] *= np.linspace(0, 1, fade)
trilha[-fade:] *= np.linspace(1, 0, fade)
salvar("trilha.wav", trilha, estereo=True)

# ---------- efeitos ----------
t = np.arange(int(0.12 * SR)) / SR
salvar("sfx_pop.wav", np.sin(2 * np.pi * (300 + 900 * t / t[-1]) * t) * np.exp(-t * 40))

salvar("sfx_ding.wav", sino(hz(88), 1.2) + 0.6 * sino(hz(95), 1.2))

t = np.arange(int(0.45 * SR)) / SR
ruido = rng.normal(0, 1, len(t))
env = np.sin(np.pi * t / t[-1]) ** 2
# varredura simples: passa-baixa móvel com média exponencial
w = np.zeros_like(ruido)
for i in range(1, len(ruido)):
    a = 0.02 + 0.5 * (i / len(ruido))
    w[i] = (1 - a) * w[i - 1] + a * ruido[i]
salvar("sfx_whoosh.wav", w * env)

t = np.arange(int(0.5 * SR)) / SR
f = 180 + 120 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 4)
salvar("sfx_boing.wav", np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5))

brilho = np.zeros(int(1.2 * SR))
for k, m in enumerate([84, 88, 91, 96, 100]):
    s = sino(hz(m), 0.9, 0.7)
    i = int(k * 0.06 * SR)
    brilho[i : i + len(s)] += s[: len(brilho) - i]
salvar("sfx_brilho.wav", brilho)
print("Pronto: trilha e efeitos em", SAIDA)
