/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const REACT = /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/
/**
 * What the game itself is built on. Every other dependency today comes with antd's date
 * picker; one added later lands in the antd file too, unless it is listed here.
 */
const GAME_LIBS = /[\\/]node_modules[\\/](react|react-dom|scheduler|motion|motion-dom|motion-utils|framer-motion|zustand)[\\/]/

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // React, and antd's date picker with all it brings, each in a file of its own. They
        // change far less often than the game, so browsers keep them cached across updates.
        codeSplitting: {
          groups: [
            { name: 'react', test: REACT },
            { name: 'antd', test: (id) => id.includes('node_modules') && !GAME_LIBS.test(id) },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
