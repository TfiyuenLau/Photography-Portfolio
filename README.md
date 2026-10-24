# Photography Portfolio

A minimalist editorial photography portfolio built with **Next.js 14**, **Three.js**, **Tailwind CSS**, and **Sharp**. Features an interactive 3D wireframe globe centered on China, automated WebP compression with EXIF metadata parsing, chronological shooting date sorting, and a local password-protected admin studio.

Fully optimized for zero-cost static deployment to **GitHub Pages**, **Cloudflare Pages**, or **Vercel**.

---

## Features

- **3D Interactive Wireframe Globe**: Built with Three.js, `@react-three/fiber`, and D3-Geo. Features smooth mouse parallax, interactive camera focus (fly-to) on city albums, trajectory arcs, and pulse telemetry.
- **Chronological Sorting by Shooting Date**: Photos across all city albums, folders, and tags are strictly ordered by original camera capture time (`DateTimeOriginal` / `CreateDate`), keeping recent work at the forefront.
- **Local Management Studio (`/admin`)**:
  - Drag-and-drop batch upload with automatic Sharp WebP conversion ($\le 2048\text{px}$, quality 88).
  - Automatic EXIF parsing: camera, lens, focal length, aperture, shutter speed, ISO, capture timestamp, and GPS coordinates.
  - Interactive map coordinate picker for city albums and shoot locations.
  - Built-in Git snapshot and commit tool.
- **Multi-dimensional Taxonomy**: Organize work by City Albums (e.g. Shenzhen, Guangzhou, Beijing), Thematic Folders (e.g. Cosplay, Street), and dynamic Tags.
- **Static Export & Zero-cost Hosting**: Pre-renders to pure static HTML/CSS/WebP (`output: 'export'`), offering blazing speed, global CDN distribution, and zero attack surface.

---

## Quick Start

### Prerequisites
- Node.js >= 20
- pnpm >= 8

### Installation & Development

```bash
# 1. Install dependencies
pnpm install

# 2. Start local development server
pnpm dev
```

- **Portfolio Site**: [http://localhost:3000](http://localhost:3000)
- **Admin Studio**: [http://localhost:3000/admin](http://localhost:3000/admin)
  - Default password: `admin123`
  - To customize the admin password, set `ADMIN_PASSWORD` in `.env.local`:
    ```env
    ADMIN_PASSWORD=your_secure_password
    ```

---

## Essential Commands

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Start development server and local `/admin` studio |
| `pnpm check` | Run TypeScript type checking (`tsc --noEmit`) |
| `pnpm lint` | Run ESLint validation |
| `pnpm build` | Build production bundle (SSG static export) |

---

## Deployment to GitHub Pages

This project is pre-configured with a GitHub Actions workflow ([`.github/workflows/nextjs.yaml`](.github/workflows/nextjs.yaml)) for automated deployment:

1. In your GitHub repository, navigate to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push your commits to `main`:
   ```bash
   git push origin main
   ```
4. GitHub Actions will automatically build and publish your static portfolio to GitHub Pages.

---

## Acknowledgements

This project was developed based on and inspired by [agarun/photos](https://github.com/agarun/photos). Sincere thanks to the original author for the design aesthetic and foundational architecture.
