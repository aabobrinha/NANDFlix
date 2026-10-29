// `require('crypto')` no código compartilhado: só o randomUUID, que o WebView já tem.
export const randomUUID = () => globalThis.crypto.randomUUID();
export default { randomUUID };
