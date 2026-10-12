import type { Config } from "tailwindcss";

// Every colour reads a CSS variable from src/styles/tokens.css (dark default + light).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        s1: v("surface-1"),
        s2: v("surface-2"),
        s3: v("surface-3"),
        t1: v("text-1"),
        t2: v("text-2"),
        t3: v("text-3"),
        accent: v("accent"),
        focus: v("focus"),
        info: v("info"),
        warn: v("warning"),
      },
      borderColor: { DEFAULT: "var(--border)", line: "var(--border)" },
      borderRadius: { sm: "6px", md: "10px", lg: "14px" },
      fontFamily: {
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["12px", "1.45"],
        sm: ["14px", "1.45"],
        base: ["16px", "1.5"],
        lg: ["20px", { lineHeight: "1.4", letterSpacing: "-0.01em" }],
        xl: ["28px", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        hero: ["40px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      boxShadow: { soft: "var(--shadow)" },
      transitionTimingFunction: { out: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      keyframes: {
        progress: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(300%)" } },
      },
    },
  },
  plugins: [],
} satisfies Config;
