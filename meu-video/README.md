# Vídeo da entrevista – VIVA

Vídeo para o telão (3584×1080) com abertura animada, telas de pergunta,
legendas e encerramento. Tudo que muda fica em `src/entrevista/roteiro.ts`.

## Passo a passo (no seu computador)

1. Instale o Node.js (versão 22 ou mais nova) e rode `npm i` nesta pasta.
2. Coloque em `public/`:
   - o vídeo da entrevista com o nome `entrevista.mp4` (ou mude `video` no roteiro);
   - a logo `viva-logo.png` (arte do evento na horizontal, fundo transparente).
3. Gere as legendas: `npm run legendas` (cria `public/legendas.json`).
4. Abra o editor: `npm run dev`. Ajuste no `roteiro.ts` os tempos de cada pergunta,
   as frases de destaque, os closes e o nome dela, vendo o resultado ao vivo.
5. Exporte: `npm run render` → `out/entrevista-viva.mp4`.
