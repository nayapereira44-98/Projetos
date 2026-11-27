# Contador ML

Conta os pacotes do Mercado Livre na hora de carregar o carro. Cada etiqueta bipada soma 1; se bipar o mesmo pacote de novo, a tela fica vermelha com "JÁ ESCANEADO" e não soma.

**Endereço:** https://nayapereira44-98.github.io/Projetos/contador-ml/

## Como usar

1. Abra o endereço no celular e toque em **Abrir câmera** (libere a câmera quando o celular pedir).
2. Aponte para o código de barras do **Envio** ou para o QR da etiqueta. Vale também a etiqueta da transportadora ("ID: ...").
3. O número grande no topo mostra quantos pacotes estão no carro.
4. Etiqueta rasgada: digite o número do envio no campo e toque em **Contar**.
5. Bipou errado: toque no pacote na lista e em **Tirar da contagem**.
6. Começar outro dia: **Nova carga (zerar)** e confirme com **Sim, zerar tudo**.

O código da nota fiscal (DANFE, 44 números) não conta: aparece um aviso amarelo.
O QR e o código de barras do mesmo pacote são reconhecidos como o mesmo pacote.

## Como funciona

- Um arquivo só (`index.html`), sem login e sem servidor.
- A contagem fica guardada no próprio celular (não se perde se fechar a página). Limpar os dados do navegador apaga a contagem.
- Leitor de códigos: [ZXing](https://github.com/zxing-js/library) (licença Apache 2.0), carregado pela internet.
- Custo: nenhum (GitHub Pages).
