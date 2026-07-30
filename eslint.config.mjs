const browserGlobals = {
  window: "readonly", document: "readonly", localStorage: "readonly",
  sessionStorage: "readonly", crypto: "readonly", FileReader: "readonly",
  Blob: "readonly", URL: "readonly", URLSearchParams: "readonly",
  setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly",
  clearInterval: "readonly", console: "readonly", TextEncoder: "readonly",
  Intl: "readonly", navigator: "readonly", fetch: "readonly",
  alert: "readonly", confirm: "readonly", prompt: "readonly",
  FormData: "readonly", Response: "readonly", Headers: "readonly",
  Request: "readonly", File: "readonly", FileList: "readonly",
  HTMLInputElement: "readonly", HTMLSelectElement: "readonly",
  HTMLTextAreaElement: "readonly", HTMLButtonElement: "readonly",
  HTMLDialogElement: "readonly", HTMLAnchorElement: "readonly",
  HTMLFormElement: "readonly", HTMLDivElement: "readonly",
  HTMLTableElement: "readonly", HTMLTableCellElement: "readonly",
  HTMLTableRowElement: "readonly", HTMLTableSectionElement: "readonly",
  HTMLUListElement: "readonly", KeyboardEvent: "readonly",
  MouseEvent: "readonly", Event: "readonly", DragEvent: "readonly",
  TouchEvent: "readonly", CustomEvent: "readonly", ClipboardEvent: "readonly",
  InputEvent: "readonly", FocusEvent: "readonly", ErrorEvent: "readonly",
  PointerEvent: "readonly", ProgressEvent: "readonly", WheelEvent: "readonly",
  MutationObserver: "readonly", IntersectionObserver: "readonly",
  ResizeObserver: "readonly", Uint8Array: "readonly", ArrayBuffer: "readonly",
  DataView: "readonly", DataTransfer: "readonly", JSON: "readonly",
  Math: "readonly", Date: "readonly", RegExp: "readonly",
  Array: "readonly", Object: "readonly", Map: "readonly", Set: "readonly",
  WeakMap: "readonly", WeakSet: "readonly", Promise: "readonly",
  Proxy: "readonly", Symbol: "readonly", Reflect: "readonly",
  Error: "readonly", TypeError: "readonly", RangeError: "readonly",
  SyntaxError: "readonly", ReferenceError: "readonly", URIError: "readonly",
  String: "readonly", Number: "readonly", Boolean: "readonly",
  BigInt: "readonly", undefined: "readonly", NaN: "readonly",
  Infinity: "readonly", isNaN: "readonly", isFinite: "readonly",
  parseFloat: "readonly", parseInt: "readonly", decodeURI: "readonly",
  decodeURIComponent: "readonly", encodeURI: "readonly",
  encodeURIComponent: "readonly", caches: "readonly",
  TextDecoder: "readonly", DOMParser: "readonly", location: "readonly",
  btoa: "readonly", atob: "readonly", AbortController: "readonly",
  indexedDB: "readonly", __BUILD_ID__: "readonly", __PROD__: "readonly"
};

const defaultRules = {
  "no-unused-vars": ["warn", { args: "none" }],
  "no-undef": "error",
  "no-extra-semi": "warn",
  "eqeqeq": ["warn", "smart"],
  "no-var": "warn"
};

export default [
  {
    ignores: ["dist/**", "node_modules/**", "server/**", "*.config.*"]
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...browserGlobals }
    },
    rules: defaultRules
  },
  {
    files: ["display.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...browserGlobals }
    },
    rules: defaultRules
  }
];
