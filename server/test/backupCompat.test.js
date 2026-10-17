const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { converterBackupAntigo } = require('../routes/backup');

describe('converterBackupAntigo — backups do CRM de consórcio entram na versão nova', () => {
  test('renomeia tipoCarta e creditoValor', () => {
    const b = converterBackupAntigo({
      clientes: [{ id: '1', tipoCarta: 'imovel' }],
      comissoes: [{ id: '2', tipoCarta: 'veiculo', creditoValor: 100000 }],
    });
    assert.deepEqual(b.clientes[0], { id: '1', tipoProduto: 'imovel' });
    assert.deepEqual(b.comissoes[0], { id: '2', tipoProduto: 'veiculo', valorVenda: 100000 });
  });

  test('não mexe em backup que já é da versão nova', () => {
    const b = converterBackupAntigo({ comissoes: [{ id: '2', tipoProduto: 'padrao', valorVenda: 5 }] });
    assert.deepEqual(b.comissoes[0], { id: '2', tipoProduto: 'padrao', valorVenda: 5 });
  });

  test('aguenta backup sem essas listas', () => {
    assert.doesNotThrow(() => converterBackupAntigo({}));
  });
});
