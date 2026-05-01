export const ORDER_STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  processing: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  "on-hold": "bg-purple-100 text-purple-800 hover:bg-purple-100",
  packed: "bg-cyan-100 text-cyan-800 hover:bg-cyan-100",
  shipped: "bg-teal-100 text-teal-800 hover:bg-teal-100",
  delivered: "bg-green-100 text-green-800 hover:bg-green-100",
  cancelled: "bg-red-100 text-red-800 hover:bg-red-100",
  returned: "bg-pink-100 text-pink-800 hover:bg-pink-100",
  refunded: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  failed: "bg-stone-100 text-stone-800 hover:bg-stone-100",
  draft: "bg-gray-100 text-gray-800 hover:bg-gray-100",
};

export function getOrderStatusBadgeClass(status?: string | null): string {
  return ORDER_STATUS_BADGE_CLASS[status ?? ""] ?? "bg-gray-100 text-gray-700 hover:bg-gray-100";
}

export function getOrderStatusLabel(status: string): string {
  return status.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
