import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
    {
        ignores: [
            "app/.server/generated/**",
            "build/**",
            ".react-router/**",
            "node_modules/**",
            "public/**",
            "agent_runs/**",
        ],
    },
    js.configs.recommended,
    // Intentionally the non-type-checked preset to keep linting fast.
    tseslint.configs.recommended,
    {
        // Plain JS files (server entry, config files) run in Node.
        files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
        languageOptions: {
            globals: {
                process: "readonly",
                console: "readonly",
                Buffer: "readonly",
                URL: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly",
                fetch: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
            },
        },
    },
    {
        files: ["app/**/*.tsx"],
        plugins: {
            "react-hooks": reactHooks,
        },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
        },
    },
    {
        rules: {
            // Pre-existing code relies on these patterns widely; surface them
            // as warnings instead of blocking the lint run.
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    // Allow `const { secret, ...rest } = obj` omission pattern.
                    ignoreRestSiblings: true,
                },
            ],
            // Allow `let fn; setTimeout(() => fn?.()); fn = ...` patterns.
            "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
        },
    },
    // Must stay last so formatting concerns are left to Prettier.
    prettier
);
