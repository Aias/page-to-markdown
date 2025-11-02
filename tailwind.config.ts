import type { Config } from "tailwindcss";

const config = {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2563eb",
          foreground: "#f8fafc",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 30px -15px rgba(15, 23, 42, 0.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
