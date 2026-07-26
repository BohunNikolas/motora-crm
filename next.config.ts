import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Загрузка фото/документов идёт через Server Action (браузер → сервер → R2).
    // Дефолтный лимит 1 МБ мал для фото/PDF — поднимаем.
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  // Публичный обзор системы (гид для партнёров): чистый URL /guide → статика.
  async rewrites() {
    return [{ source: "/guide", destination: "/guide.html" }];
  },
};

export default nextConfig;
