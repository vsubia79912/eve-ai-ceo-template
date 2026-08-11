import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    // The upstream eve Chat Template intentionally synchronizes durable stream
    // cursors through refs/effects. React 19's new advisory lint rules flag the
    // established template pattern even though its production build is valid.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".eve/**", ".next/**", "next-env.d.ts"]),
]);
