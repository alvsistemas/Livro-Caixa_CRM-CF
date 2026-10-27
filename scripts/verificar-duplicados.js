/* Confere se alguma função de topo foi declarada duas vezes num conjunto de arquivos que rodam
   juntos (o CRM em js/crm/ e o Controle financeiro). Duas declarações não dão erro no navegador:
   a última simplesmente substitui a primeira, em silêncio — foi assim que um hojeLocalISO
   repetido passou a ignorar a data recebida. */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', 'public');
const grupos = {
  'CRM (js/crm/)': fs.readdirSync(path.join(raiz, 'js', 'crm')).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(raiz, 'js', 'crm', f)),
  'Controle financeiro': fs.readdirSync(path.join(raiz, 'financeiro')).filter((f) => f.endsWith('.js')).map((f) => path.join(raiz, 'financeiro', f)),
};
let falhou = false;
for (const [nome, arquivos] of Object.entries(grupos)) {
  const onde = new Map();
  for (const a of arquivos) {
    fs.readFileSync(a, 'utf8').split('\n').forEach((linha, i) => {
      const m = /^(?:async\s+)?function\s+([\w$]+)\s*\(/.exec(linha);
      if (m) (onde.get(m[1]) || onde.set(m[1], []).get(m[1])).push(`${path.basename(a)}:${i + 1}`);
    });
  }
  const repetidas = [...onde].filter(([, l]) => l.length > 1);
  if (repetidas.length) { falhou = true; console.error(`✘ ${nome}: função declarada mais de uma vez:`); repetidas.forEach(([f, l]) => console.error(`   - ${f}: ${l.join(', ')}`)); }
  else console.log(`✔ ${nome}: nenhuma função repetida`);
}
process.exit(falhou ? 1 : 0);
