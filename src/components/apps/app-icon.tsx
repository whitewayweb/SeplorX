"use client";

import { icons } from "lucide-react";
import type { LucideProps } from "lucide-react";

interface AppIconProps extends LucideProps {
  name: string;
}

export function AppIcon({ name, ...props }: AppIconProps) {
  const Icon = icons[name as keyof typeof icons];
  if (!Icon) {
    return <icons.Box {...props} />;
  }
  return <Icon {...props} />;
}
