// `require('fs')` no código compartilhado (lib/) vira o disco do celular.
import { fs } from './disco.js';

export const { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, rmSync, mkdirSync, readdirSync } = fs;
export default fs;
