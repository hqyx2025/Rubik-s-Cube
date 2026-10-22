// Share the blog's saved theme without depending on its single-page application.
(() => {
  const root = document.documentElement;
  let theme;
  try { theme = localStorage.getItem('blog-theme'); } catch {}
  if (!['light', 'dark'].includes(theme)) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const apply = () => {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#111f19' : '#f3f6f5';
    const button = document.getElementById('cubeTheme');
    if (button) {
      button.textContent = theme === 'dark' ? '见晴' : '入夜';
      button.setAttribute('aria-label', theme === 'dark' ? '切换浅色模式' : '切换深色模式');
    }
  };
  apply();
  addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('cubeTheme').addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('blog-theme', theme); } catch {}
      apply();
    });
  });
  addEventListener('storage', event => {
    if (event.key === 'blog-theme' && ['light', 'dark'].includes(event.newValue)) { theme = event.newValue; apply(); }
  });
})();
