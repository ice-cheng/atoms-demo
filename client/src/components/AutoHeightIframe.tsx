import React, { useRef, useEffect, useCallback } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';

interface AutoHeightIframeProps {
  srcDoc: string;
  title: string;
  minHeight?: number;
  maxHeight?: number;
  mode?: 'auto-height' | 'scroll';
  className?: string;
  sandbox?: string;
  onLoad?: (iframe: HTMLIFrameElement) => void;
}

const STABLE_THRESHOLD_PX = 5;
const STABLE_READS_TO_STOP = 3;
const DEBOUNCE_MS = 200;
const DEFAULT_AUTO_MAX_HEIGHT = 3000;

const AutoHeightIframe: React.FC<AutoHeightIframeProps> = ({
  srcDoc,
  title,
  minHeight = 400,
  maxHeight,
  mode = 'auto-height',
  className = '',
  sandbox = 'allow-scripts allow-same-origin',
  onLoad,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const stableCountRef = useRef(0);
  const lastHeightRef = useRef(0);
  const rafPendingRef = useRef(false);

  const effectiveMaxHeight = mode === 'auto-height'
    ? maxHeight ?? DEFAULT_AUTO_MAX_HEIGHT
    : maxHeight;

  const measureHeight = useCallback((): number => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) return 0;
    const body = iframe.contentDocument.body;
    const html = iframe.contentDocument.documentElement;
    const scrollHeight = Math.max(
      body.scrollHeight,
      html.scrollHeight,
      body.offsetHeight,
      html.offsetHeight,
      body.clientHeight,
      html.clientHeight,
    );
    let height = Math.max(scrollHeight, minHeight);
    if (effectiveMaxHeight) height = Math.min(height, effectiveMaxHeight);
    return height;
  }, [minHeight, effectiveMaxHeight]);

  const applyHeight = useCallback((height: number) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const currentPx = iframe.style.height;
    const current = currentPx ? parseInt(currentPx, 10) : 0;
    if (Math.abs(height - current) < STABLE_THRESHOLD_PX) {
      stableCountRef.current += 1;
      if (
        stableCountRef.current >= STABLE_READS_TO_STOP &&
        observerRef.current
      ) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      return;
    }
    stableCountRef.current = 0;
    lastHeightRef.current = height;
    iframe.style.height = `${height}px`;
  }, []);

  const scheduleAdjust = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        const h = measureHeight();
        if (h > 0) applyHeight(h);
      });
    }, DEBOUNCE_MS);
  }, [measureHeight, applyHeight]);

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    stableCountRef.current = 0;
    lastHeightRef.current = 0;

    if (mode === 'auto-height') {
      const firstPass = () => {
        const h1 = measureHeight();
        if (h1 > 0) applyHeight(h1);
        requestAnimationFrame(() => {
          const h2 = measureHeight();
          if (h2 > 0) applyHeight(h2);
        });
      };
      firstPass();
    }

    try {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (win && doc && mode === 'auto-height') {
        const MutationObserverCtor = (win as unknown as {
          MutationObserver: typeof MutationObserver;
        }).MutationObserver;
        if (MutationObserverCtor) {
          observerRef.current = new MutationObserverCtor(() => {
            scheduleAdjust();
          });
          observerRef.current.observe(doc.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });

          win.addEventListener('resize', scheduleAdjust);
        }
      }
    } catch (err) {
      logger.warn('iframe MutationObserver 注入失败', err);
    }

    if (onLoad) onLoad(iframe);
  }, [mode, measureHeight, applyHeight, scheduleAdjust, onLoad]);

  useEffect(() => {
    if (mode === 'auto-height' && iframeRef.current?.contentDocument?.body) {
      scheduleAdjust();
    }
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      stableCountRef.current = 0;
      lastHeightRef.current = 0;
      rafPendingRef.current = false;
    };
  }, [srcDoc, mode, scheduleAdjust]);

  const containerStyle: React.CSSProperties = {};
  if (mode === 'scroll') {
    if (effectiveMaxHeight) containerStyle.maxHeight = `${effectiveMaxHeight}px`;
    containerStyle.overflowY = 'auto';
    containerStyle.overflowX = 'auto';
  } else if (mode === 'auto-height' && effectiveMaxHeight) {
    containerStyle.maxHeight = `${effectiveMaxHeight}px`;
    containerStyle.overflowY = 'auto';
  }

  const iframeStyle: React.CSSProperties = {
    width: '100%',
    minHeight: `${minHeight}px`,
    overflowX: 'auto',
  };
  if (mode === 'auto-height') {
    iframeStyle.height = `${minHeight}px`;
  } else {
    iframeStyle.height = '100%';
  }

  return (
    <div style={containerStyle} className="w-full bg-white">
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        title={title}
        style={iframeStyle}
        className={`border-0 bg-white ${className}`}
        sandbox={sandbox}
        onLoad={handleLoad}
      />
    </div>
  );
};

export default AutoHeightIframe;
