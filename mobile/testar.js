// npm run testar: monta o www e abre o "celular" numa janela do PC.
// Abre o Electron sem ELECTRON_RUN_AS_NODE (que, se estiver ligado no terminal,
// faz o Electron rodar como Node e não abrir janela).
const { spawn } = require('child_process');
const path = require('path');

const electron = require(path.join(__dirname, '..', 'node_modules', 'electron'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const p = spawn(electron, [path.join(__dirname, 'testar-janela.js')], { stdio: 'inherit', env });
p.on('exit', (codigo) => process.exit(codigo || 0));
