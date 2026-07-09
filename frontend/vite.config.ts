import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // LANアクセスする場合は .env.local に VITE_DEV_HOST=<LAN IP> を設定する
  const devHost = env.VITE_DEV_HOST || 'localhost'

  return {
    plugins: [
      react(),
      mkcert({
        hosts: devHost === 'localhost' ? ['localhost'] : ['localhost', devHost],
      }),
    ],
    server: {
      https: {},
      host: devHost,
      port: 5160,
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  }
})
