import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Загрузка фото/документов идёт через Server Action (браузер → сервер → R2).
    // Дефолтный лимит 1 МБ мал для фото/PDF — поднимаем.
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
