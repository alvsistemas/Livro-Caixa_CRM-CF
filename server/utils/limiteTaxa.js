// Limitador de tentativas simples, em memória (janela fixa), sem dependência externa.
// Serve pra frear tentativa-e-erro de senha, código de 2FA e abuso do "esqueci minha senha"
// (que dispara e-mail). Em memória significa que zera se o servidor reiniciar e que cada
// instância conta separado — pra um painel de uma instância só no Render, é suficiente.
class Limitador {
  constructor({ janelaMs, max }) {
    this.janelaMs = janelaMs;
    this.max = max;
    this.registros = new Map(); // chave -> { inicio, contagem }
  }

  // Registra uma tentativa pra essa chave. Devolve { permitido, restantes, retryAposSegundos }.
  tentar(chave, agora = Date.now()) {
    let r = this.registros.get(chave);
    if (!r || agora - r.inicio >= this.janelaMs) {
      r = { inicio: agora, contagem: 0 };
      this.registros.set(chave, r);
    }
    r.contagem += 1;
    const permitido = r.contagem <= this.max;
    return {
      permitido,
      restantes: Math.max(0, this.max - r.contagem),
      retryAposSegundos: permitido ? 0 : Math.ceil((r.inicio + this.janelaMs - agora) / 1000),
    };
  }

  // Limpa registros vencidos (evita o Map crescer pra sempre)
  limpar(agora = Date.now()) {
    for (const [chave, r] of this.registros) {
      if (agora - r.inicio >= this.janelaMs) this.registros.delete(chave);
    }
  }
}

// Cria um middleware Express. "chaveDe(req)" decide quem é contado (ex: IP, ou IP + e-mail).
function criarMiddlewareLimite({ janelaMs, max, chaveDe, mensagem }) {
  const limitador = new Limitador({ janelaMs, max });
  const timer = setInterval(() => limitador.limpar(), Math.max(janelaMs, 60 * 1000));
  if (timer.unref) timer.unref(); // não impede o servidor/testes de encerrarem
  const middleware = (req, res, next) => {
    const chave = chaveDe ? chaveDe(req) : req.ip;
    const r = limitador.tentar(chave);
    if (r.permitido) return next();
    res.setHeader('Retry-After', String(r.retryAposSegundos));
    return res.status(429).json({
      error: mensagem || 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    });
  };
  middleware.limitador = limitador; // exposto pra testes
  return middleware;
}

module.exports = { Limitador, criarMiddlewareLimite };
