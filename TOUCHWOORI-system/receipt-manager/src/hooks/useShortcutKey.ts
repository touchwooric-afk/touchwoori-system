'use client';

import { useEffect, useRef, useState } from 'react';

export interface ShortcutMods {
  meta?: boolean;   // ⌘ (Mac) / Ctrl (Windows)
  shift?: boolean;  // ⇧ / Shift
  alt?: boolean;    // ⌥ / Alt
}

interface UseHotkeyOptions {
  /** false면 단축키 비활성화. 기본값 true */
  enabled?: boolean;
  /** true면 기본 브라우저 동작 방지 (e.preventDefault). 기본값 true */
  preventDefault?: boolean;
}

/** Mac이면 true 반환 (SSR 안전) */
function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);
  return isMac;
}

/**
 * 단축키를 등록하고 버튼에 표시할 레이블 문자열을 반환합니다.
 *
 * @param key       - 키 이름. 예: 's', 'Enter', 'Escape'
 * @param mods      - 조합키. { meta: true } → ⌘/Ctrl
 * @param callback  - 단축키 실행 시 호출할 함수
 * @param options   - { enabled, preventDefault }
 * @returns 버튼 shortcut prop에 바로 넘길 수 있는 표시 문자열
 *
 * @example
 * const saveLabel = useHotkey('s', { meta: true }, handleSave, { enabled: modalOpen });
 * // saveLabel = "⌘S" (Mac) 또는 "Ctrl+S" (Windows)
 * // <Button shortcut={saveLabel}>저장</Button>
 */
export function useHotkey(
  key: string,
  mods: ShortcutMods,
  callback: () => void,
  options: UseHotkeyOptions = {}
): string {
  const { enabled = true, preventDefault = true } = options;
  const isMac = useIsMac();

  // 최신 callback을 ref로 유지 — effect 재등록 없이 항상 최신 함수 호출
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const keyMatch = e.key.toLowerCase() === key.toLowerCase();
      const metaMatch = mods.meta ? (e.metaKey || e.ctrlKey) : (!e.metaKey && !e.ctrlKey);
      const shiftMatch = mods.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = mods.alt ? e.altKey : !e.altKey;

      if (keyMatch && metaMatch && shiftMatch && altMatch) {
        if (preventDefault) e.preventDefault();
        callbackRef.current();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, key, mods.meta, mods.shift, mods.alt, preventDefault]);

  // 표시 레이블 생성
  const parts: string[] = [];
  if (mods.meta) parts.push(isMac ? '⌘' : 'Ctrl+');
  if (mods.shift) parts.push(isMac ? '⇧' : 'Shift+');
  if (mods.alt) parts.push(isMac ? '⌥' : 'Alt+');

  // 특수 키 표시 변환
  const displayKey: Record<string, string> = {
    enter: '↵',
    escape: 'Esc',
    backspace: '⌫',
    delete: '⌦',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    tab: '⇥',
  };
  parts.push(displayKey[key.toLowerCase()] ?? key.toUpperCase());

  return parts.join('');
}

/**
 * 단축키 동작 없이 표시 레이블만 필요할 때 사용.
 * (Tab, Enter 처럼 input onKeyDown에서 직접 처리하는 경우)
 */
export function useShortcutLabel(
  key: string,
  mods: ShortcutMods = {}
): string {
  const isMac = useIsMac();
  const parts: string[] = [];
  if (mods.meta) parts.push(isMac ? '⌘' : 'Ctrl+');
  if (mods.shift) parts.push(isMac ? '⇧' : 'Shift+');
  if (mods.alt) parts.push(isMac ? '⌥' : 'Alt+');

  const displayKey: Record<string, string> = {
    enter: '↵',
    escape: 'Esc',
    backspace: '⌫',
    tab: '⇥',
  };
  parts.push(displayKey[key.toLowerCase()] ?? key.toUpperCase());
  return parts.join('');
}
