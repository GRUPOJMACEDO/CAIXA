/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "rgb(var(--color-ink-rgb) / <alpha-value>)",
          800: "rgb(var(--color-ink-800-rgb) / <alpha-value>)",
          700: "rgb(var(--color-ink-700-rgb) / <alpha-value>)",
          600: "rgb(var(--color-ink-600-rgb) / <alpha-value>)",
        },
        canvas: "rgb(var(--color-canvas-rgb) / <alpha-value>)",
        panel: "rgb(var(--color-panel-rgb) / <alpha-value>)",
        sidebar: "rgb(var(--color-sidebar-rgb) / <alpha-value>)",
        line: "rgb(var(--color-line-rgb) / <alpha-value>)",
        muted: "rgb(var(--color-muted-rgb) / <alpha-value>)",
        gold: {
          DEFAULT: "rgb(var(--color-accent-rgb) / <alpha-value>)",
          soft: "rgb(var(--color-accent-soft-rgb) / <alpha-value>)",
          strong: "rgb(var(--color-accent-strong-rgb) / <alpha-value>)",
        },
        prata: {
          DEFAULT: "#7C818C",
          soft: "#E7E8EA",
        },
        bronze: {
          DEFAULT: "rgb(var(--color-bronze-rgb) / <alpha-value>)",
          soft: "rgb(var(--color-bronze-soft-rgb) / <alpha-value>)",
        },
        teal: {
          DEFAULT: "rgb(var(--color-teal-rgb) / <alpha-value>)",
          soft: "rgb(var(--color-teal-soft-rgb) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "#B23B2E",
          soft: "#F6DFDA",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
