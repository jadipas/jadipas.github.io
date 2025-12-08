# Portfolio Website

A personal portfolio website for Iordanis Antypas, a PhD Researcher in Robotics & AI. Built with Astro, React, Tailwind CSS, and Three.js for interactive 3D visualizations.

## About

This portfolio showcases research in robotics and AI, including publications, news, and interactive content about sensorimotor augmentation, scene representation, and robot manipulation.

## 🚀 Tech Stack

-   **Astro** - Modern static site generation
-   **React** - Component framework
-   **Tailwind CSS** - Utility-first styling
-   **Three.js** - 3D graphics library
-   **TypeScript** - Type-safe development
-   **Framer Motion** - Animation library

## 📁 Project Structure

```text
/
├── public/              # Static assets
├── src/
│   ├── components/      # React components (Hero, Mascot, NewsSection, etc.)
│   ├── data/            # Data files (profile, publications, news)
│   ├── layouts/         # Base layout template
│   ├── lib/             # Utilities and libraries (model.ts, orbitcontrols.js)
│   ├── pages/           # Astro pages and routes
│   └── styles/          # Global styles
├── astro.config.mjs     # Astro configuration
├── tailwind.config.mjs   # Tailwind configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Project dependencies
```

## 🧞 Available Commands

| Command           | Action                               |
| :---------------- | :----------------------------------- |
| `npm install`     | Install dependencies                 |
| `npm run dev`     | Start dev server at `localhost:4321` |
| `npm run build`   | Build production site to `./dist/`   |
| `npm run preview` | Preview production build locally     |
| `npm run astro`   | Run Astro CLI commands               |

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Open [http://localhost:4321](http://localhost:4321) in your browser

## Deployment

Build the site for production:

```sh
npm run build
```

The output will be in the `dist/` directory, ready for deployment.

## License

This project is open source and available under the MIT License.
