import tailwindcss from "@tailwindcss/vite";

export default {
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    historyApiFallback: true,
  },
  build: {
    outDir: "dist",
  },
};
