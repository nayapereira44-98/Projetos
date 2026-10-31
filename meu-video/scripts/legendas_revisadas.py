"""Legenda revisada à mão a partir da transcrição automática (Whisper large-v3 + medium).

Cada linha: (início em segundos, fim em segundos, texto). Os tempos são do arquivo
de vídeo original. Gera public/legendas.json, já dividido em blocos que cabem
no painel do telão. As falas da entrevistadora ficam de fora, porque as perguntas
aparecem em tela cheia.

Uso: python3 scripts/legendas_revisadas.py
"""
import json

FALAS = [
    (0.9, 4.5, "Bom, pessoal, meu nome é Taisa, tenho 38 anos."),
    (4.7, 15.9, "No dia 17 de março, eu fui diagnosticada com câncer de mama triplo-negativo, grau 3."),
    (16.2, 19.3, "No caso, eu já estava no estágio de grau 3."),
    (29.6, 41.4, "Na época, eu senti muita tristeza, um vazio muito grande e um medo muito grande de morrer."),
    (43.3, 52.2, "Muitas vezes a gente vai, pesquisa no Google e acolhe as piores notícias que vêm de lá, né?"),
    (52.4, 58.3, "Sendo que cada caso é um caso, e nem tudo está perdido."),
    (68.1, 71.9, "O início do tratamento foi bem desafiador para mim."),
    (72.1, 82.6, "Na segunda infusão, eu tive uma reação alérgica, tive um mini ataque cardíaco."),
    (83.2, 86.3, "Foi bem difícil depois, nas próximas sessões."),
    (89.8, 94.3, "Eu tinha muita crise de ansiedade, mas graças a Deus..."),
    (94.3, 101.8, "Deus me abençoou, e todas as vezes que eu chegava no hospital, eu era bem acolhida."),
    (114.0, 114.6, "Sim."),
    (116.6, 121.7, "Nas primeiras quimioterapias vermelhas, foi a parte que eu senti mais."),
    (122.1, 129.0, "Meu organismo já estava bem judiado, né?"),
    (129.2, 135.4, "Foi onde eu me peguei mais em Deus."),
    (135.7, 142.0, "A gente fica muito vulnerável. Eu lembro que eu chorava."),
    (142.4, 149.8, "E eu pedia forças a Deus. Meus amigos, minha base de oração, que é a Débora."),
    (151.0, 153.2, "Graças a Deus que eu tenho ela na minha vida."),
    (153.5, 158.0, "Foi a maior parte que me ajudou."),
    (169.2, 171.1, "Deus é maravilhoso."),
    (172.5, 180.1, "Eu já me sinto curada, mesmo sem ter finalizado o tratamento ainda."),
    (181.1, 186.5, "Eu sou uma nova mulher."),
    (186.7, 194.3, "Deus me mostrou quão forte eu sou e a fé que eu tenho em Deus."),
    (205.4, 214.4, "Sim. Todos os dias que eu me sentia sozinha, eu lembrava de uma frase:"),
    (214.5, 216.3, "“Seja forte e corajosa.”"),
    (223.3, 231.1, "Deus foi me abençoando muito antes do diagnóstico, isso eu tenho certeza."),
    (234.5, 243.9, "Ele me abençoou com um bom trabalho, que inclusive é resposta de oração, de joelhos dobrados no chão."),
    (244.6, 247.6, "Ele me abençoou com uma equipe maravilhosa no hospital."),
    (248.5, 256.4, "Ele me abençoou com pessoas, com as minhas amigas, pessoas que eu jamais imaginaria."),
    (268.4, 281.1, "Eu sei que não é fácil, mas a gente precisa ser forte. É um diagnóstico bem, como que eu posso dizer, bem agressivo, né?"),
    (281.4, 287.6, "Mas hoje em dia a tecnologia está aí também, para ajudar."),
    (288.7, 302.7, "O câncer de mama, quando diagnosticado precocemente, tem cura."),
    (302.8, 310.7, "Seja forte e corajosa, confie em Deus e pensamento positivo sempre."),
    (321.1, 322.4, "É que a vida não para."),
    (322.8, 330.3, "A gente precisa aproveitar os nossos, aproveitar a vida, aproveitar os nossos filhos,"),
    (330.6, 335.3, "os nossos amigos, e nunca perder a fé em Deus."),
    (335.5, 343.0, "Deus está conosco, carrega a gente no colo. Ele faz tudo da melhor forma, como tem que ser."),
    (343.8, 353.0, "No início do tratamento, eu questionei muito a Deus, mas Deus me mostrou de uma outra forma."),
    (353.1, 357.6, "Hoje eu vejo o mundo de uma outra forma, e o cuidado de Deus comigo."),
    (370.4, 374.5, "Tudo posso naquele que me fortalece."),
]

MAX_CARACTERES = 75


def blocos(texto):
    atual = ""
    for palavra in texto.split():
        if atual and len(atual) + 1 + len(palavra) > MAX_CARACTERES:
            yield atual
            atual = palavra
        else:
            atual = f"{atual} {palavra}".strip()
    if atual:
        yield atual


legendas = []
for inicio, fim, texto in FALAS:
    partes = list(blocos(texto))
    total = sum(len(p) for p in partes)
    t = inicio
    for parte in partes:
        duracao = (fim - inicio) * len(parte) / total
        legendas.append(
            {
                "text": " " + parte,
                "startMs": round(t * 1000),
                "endMs": round((t + duracao) * 1000),
                "timestampMs": None,
                "confidence": None,
            }
        )
        t += duracao

with open("public/legendas.json", "w", encoding="utf-8") as f:
    json.dump(legendas, f, ensure_ascii=False, indent=1)
print(f"Pronto: {len(legendas)} blocos de legenda em public/legendas.json")
