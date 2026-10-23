import { preferences } from '../preferences.js';
await preferences.ready;
document.getElementById('cubeAccount').textContent = preferences.user ? '我的账号' : '登录 / 注册';
{
  const root = document.documentElement;
  let theme = preferences.getItem('blog-theme') || 'light';
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
  document.getElementById('cubeTheme').addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      preferences.setItem('blog-theme', theme);
      apply();
  });
}
