# Torn Dashboard (GitHub Pages-ready)

This project is organized as a static site that works on GitHub Pages.

## Structure

- `index.html`: main dashboard page
- `pages/`: additional route-like pages
- `assets/css/styles.css`: shared styles
- `assets/js/main.js`: shared client-side behavior
- `404.html`: custom not found page for GitHub Pages
- `.nojekyll`: disables Jekyll processing

## Deploy on GitHub Pages

1. Push this repository to GitHub.
2. Open repository Settings > Pages.
3. Under Build and deployment:
   - Source: Deploy from a branch
   - Branch: `main` (or your default), folder `/ (root)`
4. Save and wait for deployment.

All links and asset references are relative, so they work on project pages as well.
