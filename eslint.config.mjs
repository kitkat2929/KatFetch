import globals from "globals";

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.worker,
        chrome: "readonly",
        JSZip: "readonly",
        resolveFilename: "readonly",
        getExtensionStrict: "readonly",
        guessExtFromUrl: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn"
    }
  }
];
