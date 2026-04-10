const revealItems = document.querySelectorAll('.reveal');
const heroArt = document.querySelector('.hero-art');
const forms = document.querySelectorAll('.subscribe-form');
const themeButtons = document.querySelectorAll('.theme-btn');

const THEME_KEY = 'mosslight-theme';

function applyTheme(theme) {
  const body = document.body;
  if (!body) return;

  const isStorybook = theme === 'storybook';
  body.classList.toggle('theme-storybook', isStorybook);
  body.classList.toggle('theme-adventure', !isStorybook);

  themeButtons.forEach((btn) => {
    const active = btn.dataset.theme === theme;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const theme = stored === 'storybook' ? 'storybook' : 'adventure';
  applyTheme(theme);

  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextTheme = btn.dataset.theme === 'storybook' ? 'storybook' : 'adventure';
      localStorage.setItem(THEME_KEY, nextTheme);
      applyTheme(nextTheme);
    });
  });
}

function initReveal() {
  if (!revealItems.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealItems.forEach((item) => observer.observe(item));
}

function initParallax() {
  if (!heroArt) return;

  window.addEventListener('mousemove', (event) => {
    const x = (event.clientX / window.innerWidth - 0.5) * 7;
    const y = (event.clientY / window.innerHeight - 0.5) * 7;
    heroArt.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
  });
}

function initForms() {
  forms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = form.querySelector('input[type="email"]');
      if (input) {
        input.value = '';
        input.placeholder = 'Received. Next dev dispatch is on the way.';
      }
    });
  });
}

initTheme();
initReveal();
initParallax();
initForms();
