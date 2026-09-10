'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { Switch } from '@/components/ui/switch';

const storageKey = 'gnt-theme';

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.classList.toggle('dark', dark);
}

export function ThemeSwitch() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const initial = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(initial);
    applyTheme(initial);
    setReady(true);
  }, []);

  function changeTheme(enabled: boolean) {
    setDark(enabled);
    applyTheme(enabled);
    window.localStorage.setItem(storageKey, enabled ? 'dark' : 'light');
  }

  return (
    <div className="theme-control" title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <Sun aria-hidden="true" />
      <Switch
        checked={ready ? dark : false}
        onCheckedChange={changeTheme}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      />
      <Moon aria-hidden="true" />
    </div>
  );
}
