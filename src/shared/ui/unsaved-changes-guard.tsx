"use client";

import { useEffect, useRef, useState } from "react";

/**
 * lejar.ai's unsaved-changes guard (modules 248674 + 198189): once the surrounding form is edited,
 * closing or reloading the tab asks the browser's "Leave site?" question, and clicking a link to
 * another page asks to confirm. Submitting the form clears the guard.
 */
export function UnsavedChangesGuard({ message }: { message: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [dirty, setDirty] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const mark = () => {
      touched.current = true;
      setDirty(true);
    };
    const clear = () => setDirty(false);
    const refocus = () => {
      if (touched.current) setDirty(true);
    };
    form.addEventListener("input", mark);
    form.addEventListener("change", mark);
    form.addEventListener("submit", clear);
    form.addEventListener("focusin", refocus);
    return () => {
      form.removeEventListener("input", mark);
      form.removeEventListener("change", mark);
      form.removeEventListener("submit", clear);
      form.removeEventListener("focusin", refocus);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a") : null;
      if (!a || a.hasAttribute("download")) return;
      const target = a.getAttribute("target");
      if (target && target !== "_self") return;
      const raw = a.getAttribute("href");
      if (!raw) return;
      let url: URL;
      try {
        url = new URL(raw, window.location.href);
      } catch {
        return;
      }
      const elsewhere =
        url.origin === window.location.origin &&
        (url.pathname !== window.location.pathname || url.search !== window.location.search);
      if (elsewhere && !window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);

  return <span ref={anchor} hidden aria-hidden="true" />;
}
