import type { Metadata } from 'next';

import { StructureManager } from '@/features/catalog/structure-manager';

export const metadata: Metadata = { title: 'Academic structure' };

export default function StructurePage() {
  return <StructureManager />;
}
