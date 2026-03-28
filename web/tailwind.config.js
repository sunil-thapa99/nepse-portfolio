/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        surface: {
          DEFAULT: "#0f1419",
          raised: "#161d27",
          overlay: "#1c2633",
        },
        accent: {
          DEFAULT: "#3d9cf0",
          muted: "#2a6fa8",
        },
      },
    },
  },
  plugins: [],
};
