"""Remove o ruído de fundo da fala com o DeepFilterNet (github.com/Rikorose/DeepFilterNet).

Uso: python3 scripts/limpar_audio.py entrada.wav saida.wav [atenuacao_db]
A entrada deve ser WAV 48 kHz mono. atenuacao_db limita quanto ruído é removido
(padrão 100 = remove tudo; valores como 30 deixam a voz mais natural).
"""
import sys
import types
import wave

import numpy as np
import torch

# compatibilidade: o DeepFilterNet ainda importa um módulo removido do torchaudio novo
fake = types.ModuleType("torchaudio.backend.common")
fake.AudioMetaData = object
sys.modules.setdefault("torchaudio.backend", types.ModuleType("torchaudio.backend"))
sys.modules["torchaudio.backend.common"] = fake

from df.enhance import enhance, init_df  # noqa: E402

entrada, saida = sys.argv[1], sys.argv[2]
limite = float(sys.argv[3]) if len(sys.argv) > 3 else None

with wave.open(entrada) as w:
    assert w.getframerate() == 48000 and w.getnchannels() == 1
    audio = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768

modelo, estado, _ = init_df()
limpo = enhance(modelo, estado, torch.from_numpy(audio)[None], atten_lim_db=limite)
limpo = limpo.squeeze().numpy()

with wave.open(saida, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(48000)
    w.writeframes((np.clip(limpo, -1, 1) * 32767).astype(np.int16).tobytes())
print("Pronto:", saida)
