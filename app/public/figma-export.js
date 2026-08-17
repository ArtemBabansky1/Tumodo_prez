/* Чистый источник одного слайда 1920×1080 для editable-capture в Figma. */

'use strict';

(async function prepareFigmaSource() {
  const params = new URLSearchParams(location.search);
  const deck = String(params.get('deck') || '').trim();
  const slideNumber = Number(params.get('slide') || 0);
  const status = document.getElementById('figma-source-status');

  function fail(message) {
    document.body.className = 'figma-source-error';
    status.textContent = message;
    document.documentElement.dataset.figmaReady = 'error';
  }

  function colorToHex(value) {
    const match = String(value || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
    if (!match) return '#000000';
    return '#' + match.slice(1, 4).map((part) => Math.max(0, Math.min(255, Math.round(Number(part))))
      .toString(16).padStart(2, '0')).join('');
  }

  function filteredBlackToHex(filter, fallbackColor) {
    if (!filter || filter === 'none') return colorToHex(fallbackColor);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.clearRect(0, 0, 1, 1);
      context.filter = filter;
      context.fillStyle = '#000000';
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      return '#' + Array.from(pixel.slice(0, 3)).map((part) => part.toString(16).padStart(2, '0')).join('');
    } catch {
      return colorToHex(fallbackColor);
    }
  }

  function bakeSvgColor(svg, color) {
    const blackOrCurrent = /^(?:black|#000|#000000|currentcolor)$/i;
    svg.querySelectorAll('*').forEach((node) => {
      for (const attribute of ['fill', 'stroke']) {
        const value = node.getAttribute(attribute);
        if (value && blackOrCurrent.test(value.trim())) node.setAttribute(attribute, color);
      }
      const style = node.getAttribute('style');
      if (style) {
        node.setAttribute('style', style.replace(
          /\b(fill|stroke)\s*:\s*(?:black|#000(?:000)?|currentcolor)\b/gi,
          (_, property) => property + ': ' + color
        ));
      }
    });
    if (blackOrCurrent.test(String(svg.getAttribute('fill') || '').trim())) svg.setAttribute('fill', color);
    if (blackOrCurrent.test(String(svg.getAttribute('stroke') || '').trim())) svg.setAttribute('stroke', color);
    svg.setAttribute('color', color);
  }

  async function inlineLocalSvgImages(root) {
    const images = Array.from(root.querySelectorAll('img[src]')).filter((img) => {
      try {
        const url = new URL(img.src, location.href);
        return url.origin === location.origin && /\.svg$/i.test(url.pathname);
      } catch {
        return false;
      }
    });

    let inlined = 0;
    await Promise.all(images.map(async (img) => {
      const url = new URL(img.src, location.href);
      const response = await fetch(url.href, { cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось загрузить SVG: ' + url.pathname);
      const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      if (parsed.querySelector('parsererror') || parsed.documentElement.nodeName.toLowerCase() !== 'svg') {
        throw new Error('Некорректный SVG: ' + url.pathname);
      }

      const computed = getComputedStyle(img);
      const bounds = img.getBoundingClientRect();
      const svg = document.importNode(parsed.documentElement, true);
      svg.querySelectorAll('script').forEach((node) => node.remove());
      Array.from(img.attributes).forEach((attribute) => {
        if (!['src', 'alt', 'width', 'height'].includes(attribute.name)) {
          svg.setAttribute(attribute.name, attribute.value);
        }
      });

      const filename = decodeURIComponent(url.pathname.split('/').pop() || 'asset.svg');
      const width = bounds.width || Number.parseFloat(computed.width) || Number(svg.getAttribute('width')) || 24;
      const height = bounds.height || Number.parseFloat(computed.height) || Number(svg.getAttribute('height')) || 24;
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('data-figma-svg-source', filename);
      svg.setAttribute('aria-label', img.alt || filename);
      svg.style.width = width + 'px';
      svg.style.height = height + 'px';
      svg.style.display = computed.display === 'inline' ? 'block' : computed.display;
      svg.style.opacity = computed.opacity;
      svg.style.filter = 'none';
      let bakedColor = filteredBlackToHex(computed.filter, computed.color);
      if (img.closest('.photo-list-icon')) {
        const brandBlue = getComputedStyle(document.documentElement).getPropertyValue('--blue-base').trim();
        if (brandBlue) bakedColor = brandBlue;
      } else if (img.closest('.service-icon')) {
        bakedColor = '#FFFFFF';
      }
      bakeSvgColor(svg, bakedColor);
      img.replaceWith(svg);
      inlined += 1;
    }));
    return inlined;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(deck) || !Number.isInteger(slideNumber) || slideNumber < 1) {
    fail('Некорректный адрес слайда');
    return;
  }

  try {
    const base = '/files/output/' + encodeURIComponent(deck) + '/';
    const response = await fetch(base + 'index.html', { cache: 'no-store' });
    if (!response.ok) throw new Error('Презентация не найдена');

    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    const slides = Array.from(source.querySelectorAll('.slide'));
    const sourceSlide = slides[slideNumber - 1];
    if (!sourceSlide) throw new Error('Слайд ' + slideNumber + ' не найден');

    document.title = (source.title || deck) + ' — слайд ' + slideNumber;

    const stylesReady = Array.from(source.querySelectorAll('link[rel="stylesheet"]')).map((item) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(item.getAttribute('href'), location.origin + base).href;
      document.head.insertBefore(link, document.head.querySelector('style'));
      return new Promise((resolve) => {
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', resolve, { once: true });
      });
    });

    const slide = document.importNode(sourceSlide, true);
    slide.querySelectorAll('[src]').forEach((node) => {
      node.src = new URL(node.getAttribute('src'), location.origin + base).href;
    });
    slide.querySelectorAll('[href]').forEach((node) => {
      const href = node.getAttribute('href');
      if (href && !/^(?:#|https?:|mailto:|tel:)/i.test(href)) {
        node.href = new URL(href, location.origin + base).href;
      }
    });

    document.body.replaceChildren(slide);
    document.body.className = 'figma-source-ready';

    await Promise.all(stylesReady);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const inlinedSvgCount = await inlineLocalSvgImages(slide);
    await Promise.all(Array.from(slide.querySelectorAll('img')).map((img) => {
      if (img.complete) return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));

    document.documentElement.dataset.figmaReady = 'true';
    document.documentElement.dataset.figmaSvgCount = String(inlinedSvgCount);
    document.documentElement.dataset.deck = deck;
    document.documentElement.dataset.slide = String(slideNumber);
  } catch (error) {
    fail(error.message || 'Не удалось подготовить слайд');
  }
})();
