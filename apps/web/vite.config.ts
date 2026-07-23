import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(rootDir, '../..');

function syncDocsPublic(): Plugin {
  const run = () => {
    execSync('bash scripts/sync-docs-public.sh', {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  };
  return {
    name: 'sync-docs-public',
    buildStart() {
      run();
    },
    configureServer() {
      run();
    },
  };
}

export default defineConfig(({ mode }) => {
  // Merge repo-root + apps/web VITE_* (web wins on conflicts). Root holds Google
  // OAuth clients; apps/web holds Firebase. Windows builders often only sync one
  // of the two .env files.
  const mergedViteEnv = {
    ...loadEnv(mode, repoRoot, 'VITE_'),
    ...loadEnv(mode, rootDir, 'VITE_'),
  };
  for (const [key, value] of Object.entries(mergedViteEnv)) {
    process.env[key] = value;
  }

  const googleClientConfigured = Boolean(
    mergedViteEnv.VITE_GOOGLE_DESKTOP_CLIENT_ID ||
      mergedViteEnv.VITE_GOOGLE_ANDROID_CLIENT_ID,
  );
  if (!googleClientConfigured) {
    console.warn(
      '[vite] VITE_GOOGLE_DESKTOP_CLIENT_ID (or VITE_GOOGLE_ANDROID_CLIENT_ID) is not set — Tauri Google sign-in will fail. Put it in apps/web/.env or the repo-root .env.',
    );
  } else {
    console.info('[vite] Google Desktop/Android OAuth client id is configured for this build.');
  }

  // Explicit define so import.meta.env.VITE_* is replaced even when code assigns
  // import.meta.env to a local variable (Vite only statically replaces direct access).
  const envDefines = Object.fromEntries(
    Object.entries(mergedViteEnv).map(([key, value]) => [
      `import.meta.env.${key}`,
      JSON.stringify(value),
    ]),
  );

  return {
    root: __dirname,
    envDir: rootDir,
    define: envDefines,
    cacheDir: '../../node_modules/.vite/apps/web',
    server: {
      port: 4200,
      host: 'localhost',
    },
    preview: {
      port: 4300,
      host: 'localhost',
    },
    plugins: [react(), syncDocsPublic()],
    resolve: {
      conditions: ['@subspace-lattice/source'],
    },
    build: {
      outDir: './dist',
      emptyOutDir: true,
      reportCompressedSize: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    test: {
      name: 'web',
      watch: false,
      globals: true,
      environment: 'jsdom',
      passWithNoTests: true,
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    },
  };
});
