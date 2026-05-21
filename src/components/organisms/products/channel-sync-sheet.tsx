"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Loader2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { toast } from "sonner";

import { TablePagination } from "@/components/ui/table-pagination";
import { fetchProductMappingsAction, deleteChannelMappingsBatch } from "@/app/(dashboard)/products/actions";
import { type GetProductMappingsQuery } from "@/data/products";

interface ChannelSyncSheetProps {
  productId: number;
  channelId: number;
  channelName: string;
  availableStock: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function ChannelSyncSheet({
  productId,
  channelId,
  channelName,
  availableStock,
  isOpen,
  onOpenChange,
  onUpdate
}: ChannelSyncSheetProps) {
  const [data, setData] = useState<{
    id: number;
    channelId: number;
    externalProductId: string;
    label: string | null;
    syncStatus: string;
    channelStock: number | null;
  }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Pagination & Filter State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const query: GetProductMappingsQuery = {
        channelId,
        limit,
        offset: (page - 1) * limit,
        search: search.trim() || undefined,
        status: status || undefined,
      };
      const result = await fetchProductMappingsAction(productId, query);
      if ('error' in result) {
        toast.error(result.error || "Failed to load mappings");
      } else {
        setData(result.data);
        setTotal(result.total);
      }
    } catch {
      toast.error("Failed to load mappings");
    } finally {
      setLoading(false);
    }
  }, [productId, channelId, isOpen, page, limit, search, status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [data]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(data.map(item => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} mapping(s)?`)) return;
    
    setIsDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      const res = await deleteChannelMappingsBatch(idsArray);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Mappings deleted successfully");
        setSelectedIds(new Set());
        loadData();
        onUpdate();
      }
    } catch {
      toast.error("Failed to delete mappings");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl lg:max-w-5xl overflow-y-auto p-4 sm:p-6">
        <SheetHeader className="mb-4">
          <SheetTitle>Manage {channelName} Mappings</SheetTitle>
          <SheetDescription>
            View and manage mapped products for this channel.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-2 justify-between items-center">
            <div className="flex flex-1 items-center gap-2 w-full">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID or Title..."
                  className="pl-9 w-full bg-white"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1); // Reset page on search
                  }}
                />
              </div>
              <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1); }}>
                <SelectTrigger className="w-[140px] bg-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_sync">In Sync</SelectItem>
                  <SelectItem value="pending_update">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedIds.size} selected</Badge>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                  Delete
                </Button>
              </div>
            )}
          </div>

          {/* Data Table */}
          <div className="border rounded-md bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox 
                      checked={data.length > 0 && selectedIds.size === data.length}
                      onCheckedChange={handleSelectAll}
                      disabled={loading || data.length === 0}
                    />
                  </TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap">External ID</TableHead>
                  <TableHead className="w-full">Title</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-right w-[1%] whitespace-nowrap">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No mappings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={(checked) => handleSelectOne(row.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="w-[1%]">
                        <span className="font-mono text-xs bg-muted/60 rounded px-1.5 py-0.5 whitespace-nowrap">
                          {row.externalProductId}
                        </span>
                      </TableCell>
                      <TableCell className="w-full whitespace-normal break-words">
                        {row.label ? (
                          <Link href={`/products/channels/${channelId}?q=${encodeURIComponent(row.externalProductId)}`} className="text-xs text-blue-600 hover:text-blue-800 hover:underline" title={row.label}>
                            {row.label}
                          </Link>
                        ) : (
                          <Link href={`/products/channels/${channelId}?q=${encodeURIComponent(row.externalProductId)}`} className="text-xs text-blue-600 hover:text-blue-800 hover:underline italic" title="View in Channels">
                            View Item
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="w-[1%]">
                        {row.syncStatus === "in_sync" && (
                          <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 whitespace-nowrap">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> In Sync
                          </Badge>
                        )}
                        {row.syncStatus === "pending_update" && (
                          <Badge variant="outline" className="text-yellow-600 bg-yellow-50 border-yellow-200 whitespace-nowrap">
                            <RefreshCw className="mr-1 h-3 w-3" /> Pending
                          </Badge>
                        )}
                        {row.syncStatus === "failed" && (
                          <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200 whitespace-nowrap">
                            <XCircle className="mr-1 h-3 w-3" /> Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap w-[1%]">
                        <span className="text-xs font-semibold tabular-nums">{availableStock}</span>
                        {row.channelStock !== null && row.channelStock !== availableStock && (
                          <span className="text-[10px] text-muted-foreground/60 ml-1" title={`Channel reports ${row.channelStock}`}>({row.channelStock})</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t pt-3">
            <TablePagination
              totalItems={total}
              itemsPerPage={limit}
              currentPage={page}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
