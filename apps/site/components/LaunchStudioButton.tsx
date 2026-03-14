'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@paddie-studio/ui';

interface LaunchStudioButtonProps {
  variant?: 'primary' | 'ghost';
  className?: string;
  label?: string;
}

export function LaunchStudioButton({
  variant = 'primary',
  className,
  label = 'Launch Studio',
}: LaunchStudioButtonProps) {
  const [href, setHref] = React.useState('/login');

  React.useEffect(() => {
    let active = true;
    fetch('/api/me', { credentials: 'include' })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (payload?.authenticated) {
          setHref('/app');
          return;
        }
        setHref('/login');
      })
      .catch(() => {
        if (active) setHref('/login');
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <Link href={href}>
      <Button variant={variant} className={className}>
        {label}
      </Button>
    </Link>
  );
}
