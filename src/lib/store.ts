import { atom } from 'jotai';
import type { ChannelProductWithState } from '@/app/(dashboard)/products/actions';

interface ChannelProductsCache {
  products: ChannelProductWithState[];
  total: number;
}

/**
 * Cache for channel products to avoid redundant fetches in the AddMappingDialog.
 * Key format: `channelId:page:limit:search`
 */
export const channelProductsAtom = atom<Map<string, ChannelProductsCache>>(new Map());
