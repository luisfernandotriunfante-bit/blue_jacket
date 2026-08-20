import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/pages/CriacaoComboPage.tsx'), 'utf8');

test('cliente sem código Winthor não bloqueia a exportação do combo', () => {
  assert.match(source, /const clientsReady = !exportOptions\.includeClients \|\| selectedClients\.length > 0;/);
  assert.doesNotMatch(source, /clientsReady = [^;]*unresolvedClientCount === 0/);
  assert.match(source, /O Excel será gerado normalmente e esses códigos ficarão em branco\./);
  assert.match(source, /gerar o Excel com esse campo em branco\./);
});
