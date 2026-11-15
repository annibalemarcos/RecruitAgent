import React from 'react';

/**
 * Normalizes any URL string, resolving relative paths (?step=..., /path)
 * and adding https:// protocol if missing for plain domains.
 */
export function normalizeUrl(url?: string): string {
  if (!url) return '';
  let target = url.trim();
  if (!target || target === '#' || target.startsWith('javascript:')) return '';

  if (target.startsWith('mailto:') || target.startsWith('tel:')) {
    return target;
  }

  // Handle relative URLs like ?step=results or /api/...
  if (target.startsWith('/') || target.startsWith('?') || target.startsWith('#')) {
    try {
      return new URL(target, window.location.href).href;
    } catch {
      return `${window.location.origin}${target}`;
    }
  }

  // Handle plain domains (e.g. empresa.com.br, google.com)
  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    return `https://${target}`;
  }

  return target;
}

/**
 * Displays a non-intrusive floating feedback badge when a middle-click action is executed.
 */
let toastTimeout: any = null;
export function showMiddleClickFeedback(url: string, label?: string): void {
  try {
    let container = document.getElementById('middle-click-feedback-toast');
    if (!container) {
      container = document.createElement('div');
      container.id = 'middle-click-feedback-toast';
      container.className =
        'fixed top-5 right-5 z-[9999] pointer-events-none transition-all duration-300 opacity-0 translate-y-[-8px]';
      document.body.appendChild(container);
    }

    // Format display text
    let displayText = label || url;
    try {
      if (displayText.startsWith('http://') || displayText.startsWith('https://')) {
        const u = new URL(displayText);
        displayText = u.hostname + (u.pathname.length > 1 ? u.pathname : '');
      } else if (displayText.startsWith('mailto:')) {
        displayText = displayText.replace('mailto:', '');
      }
    } catch {}

    container.innerHTML = `
      <div style="background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(59, 130, 246, 0.5); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.3);" class="backdrop-blur px-3.5 py-2 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-2">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background: #38bdf8; box-shadow: 0 0 8px #38bdf8;"></span>
        <span style="color: #94a3b8;">Abrindo em nova aba:</span>
        <span style="color: #67e8f9; font-weight: 600; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayText}</span>
      </div>
    `;

    // Animate in
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      if (container) {
        container.style.opacity = '0';
        container.style.transform = 'translateY(-8px)';
      }
    }, 1800);
  } catch {
    // Non-critical visual effect
  }
}

/**
 * Safely opens a URL in a new browser tab.
 * Handles iframe restrictions, popup blockers, and relative URLs.
 */
export function openInNewTab(url?: string, label?: string): boolean {
  if (!url) return false;
  const targetUrl = normalizeUrl(url);
  if (!targetUrl) return false;

  showMiddleClickFeedback(targetUrl, label);

  // Use a real temporary anchor so browsers honor the active mouse gesture consistently.
  try {
    const link = document.createElement('a');
    link.href = targetUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.position = 'fixed';
    link.style.left = '-9999px';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch (e) {
    console.warn('Failed to open link in new tab:', e);
    return false;
  }
}

/**
 * Extracts a clickable URL or action from an element or its ancestors.
 */
export function findClickableTarget(
  element: Element | null
): { url: string; label?: string } | null {
  if (!element || !(element instanceof Element)) return null;

  // 1. Check for closest explicit link <a>
  const anchor = element.closest('a[href]') as HTMLAnchorElement | null;
  if (anchor) {
    const href = anchor.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('javascript:')) {
      return {
        url: href,
        label: anchor.innerText?.trim() || anchor.title || href,
      };
    }
  }

  // 2. Check for explicit data attributes
  const dataEl = element.closest(
    '[data-url], [data-href], [data-link], [data-step]'
  ) as HTMLElement | null;
  if (dataEl) {
    const step = dataEl.getAttribute('data-step');
    if (step) {
      return {
        url: `?step=${step}`,
        label: `Aba: ${dataEl.innerText?.trim() || step}`,
      };
    }

    const url =
      dataEl.getAttribute('data-url') ||
      dataEl.getAttribute('data-href') ||
      dataEl.getAttribute('data-link');
    if (url && url !== '#' && !url.startsWith('javascript:')) {
      return {
        url,
        label: dataEl.innerText?.trim() || dataEl.title || url,
      };
    }
  }

  // 3. Check for data-email
  const emailEl = element.closest('[data-email]') as HTMLElement | null;
  if (emailEl) {
    const email = emailEl.getAttribute('data-email');
    if (email) {
      return {
        url: `mailto:${email}`,
        label: email,
      };
    }
  }

  // 4. Check for container with data-company-url
  const companyEl = element.closest('[data-company-url]') as HTMLElement | null;
  if (companyEl) {
    // Only if user didn't click inside an interactive form control or destructive button
    const isInteractive = element.closest(
      'button:not([data-company-url]), input, textarea, select, label'
    );
    if (!isInteractive) {
      const compUrl = companyEl.getAttribute('data-company-url');
      if (compUrl) {
        return {
          url: compUrl,
          label: companyEl.getAttribute('data-company-name') || compUrl,
        };
      }
    }
  }

  // 5. Check if the element text itself looks like an email or URL
  const text = (element.innerText || element.textContent || '').trim();
  if (text.length > 3 && text.length < 150) {
    // Match email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      return {
        url: `mailto:${emailMatch[0]}`,
        label: emailMatch[0],
      };
    }

    // Match URL or domain
    const urlMatch = text.match(
      /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|br|gov|edu|co|tech|dev|app|me)[^\s]*)/i
    );
    if (urlMatch) {
      return {
        url: urlMatch[0],
        label: urlMatch[0],
      };
    }
  }

  return null;
}

/**
 * Initializes global middle-click listener on window.
 * Catches button === 1 on mousedown, mouseup, and auxclick.
 * Prevents autoscroll icon lock and guarantees reliable tab opening in all browsers.
 */
let isInitialized = false;
let globalCleanup: (() => void) | null = null;

export function initGlobalMiddleClick(): () => void {
  if (isInitialized && globalCleanup) {
    return globalCleanup;
  }

  let lastHandledTime = 0;
  let lastOpenedUrl = '';
  let pendingTarget: { url: string; label?: string } | null = null;

  const triggerOpen = (targetInfo: { url: string; label?: string }, e: MouseEvent) => {
    const now = Date.now();
    if (now - lastHandledTime < 350 && lastOpenedUrl === targetInfo.url) {
      return;
    }
    lastHandledTime = now;
    lastOpenedUrl = targetInfo.url;
    pendingTarget = null;

    e.preventDefault();
    e.stopPropagation();
    openInNewTab(targetInfo.url, targetInfo.label);
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 1) {
      // Find candidate
      const targetInfo = findClickableTarget(e.target as Element);
      if (targetInfo) {
        pendingTarget = targetInfo;
        // Prevent default browser auto-scroll lock
        e.preventDefault();
      } else {
        pendingTarget = null;
      }
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (e.button === 1) {
      const targetInfo = pendingTarget || findClickableTarget(e.target as Element);
      if (targetInfo) {
        triggerOpen(targetInfo, e);
      }
      pendingTarget = null;
    }
  };

  const handleAuxClick = (e: MouseEvent) => {
    if (e.button === 1) {
      const targetInfo = pendingTarget || findClickableTarget(e.target as Element);
      if (targetInfo) {
        triggerOpen(targetInfo, e);
      }
      pendingTarget = null;
    }
  };

  const handleCtrlClick = (e: MouseEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const targetInfo = findClickableTarget(e.target as Element);
    if (!targetInfo) return;
    // Handle anchors and data-link controls uniformly, without also navigating in this tab.
    e.preventDefault();
    e.stopPropagation();
    openInNewTab(targetInfo.url, targetInfo.label);
  };

  const handleCtrlRightClick = (e: MouseEvent) => {
    if (e.button !== 2 || (!e.ctrlKey && !e.metaKey)) return;
    const targetInfo = findClickableTarget(e.target as Element);
    if (!targetInfo) return;
    e.preventDefault();
    e.stopPropagation();
    openInNewTab(targetInfo.url, targetInfo.label);
  };

  window.addEventListener('mousedown', handleMouseDown, true);
  window.addEventListener('mouseup', handleMouseUp, true);
  window.addEventListener('auxclick', handleAuxClick, true);
  window.addEventListener('click', handleCtrlClick, true);
  window.addEventListener('contextmenu', handleCtrlRightClick, true);

  isInitialized = true;
  globalCleanup = () => {
    window.removeEventListener('mousedown', handleMouseDown, true);
    window.removeEventListener('mouseup', handleMouseUp, true);
    window.removeEventListener('auxclick', handleAuxClick, true);
    window.removeEventListener('click', handleCtrlClick, true);
    window.removeEventListener('contextmenu', handleCtrlRightClick, true);
    isInitialized = false;
    globalCleanup = null;
  };

  return globalCleanup;
}

/**
 * React helper props for components that want explicit middle click handlers.
 */
export function onMiddleClickHandler(url?: string, label?: string) {
  let handledTime = 0;

  const trigger = (e: React.MouseEvent) => {
    if (e.button === 1 && url) {
      const now = Date.now();
      if (now - handledTime < 350) return;
      handledTime = now;
      e.preventDefault();
      e.stopPropagation();
      openInNewTab(url, label);
    }
  };

  return {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button === 1 && url) {
        e.preventDefault();
      }
    },
    onMouseUp: trigger,
    onAuxClick: trigger,
  };
}
