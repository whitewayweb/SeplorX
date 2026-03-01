"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TablePaginationProps {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
}

export function TablePagination({ totalItems, itemsPerPage, currentPage }: TablePaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const [jumpPage, setJumpPage] = useState(currentPage.toString());

  useEffect(() => {
    setJumpPage(currentPage.toString());
  }, [currentPage]);

  const createPageUrl = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", pageNumber.toString());
    return `${pathname}?${params.toString()}`;
  };

  const handleJump = () => {
    const page = parseInt(jumpPage, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages && page !== currentPage) {
      router.push(createPageUrl(page));
    } else {
      setJumpPage(currentPage.toString());
    }
  };

  const handleLimitChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("limit", value);
    params.set("page", "1"); // Reset target page to 1 when changing items limit
    router.push(`${pathname}?${params.toString()}`);
  };

  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalItems === 0) return null;

  // Generate page numbers to show intelligently
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
      <div className="text-sm text-muted-foreground whitespace-nowrap">
        Showing <span className="font-medium text-foreground">{startItem}</span> to{" "}
        <span className="font-medium text-foreground">{endItem}</span> of{" "}
        <span className="font-medium text-foreground">{totalItems}</span> results
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 lg:gap-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium whitespace-nowrap text-muted-foreground">Rows per page</p>
          <Select
            value={itemsPerPage.toString()}
            onValueChange={handleLimitChange}
          >
            <SelectTrigger className="h-8 w-[70px] bg-white">
              <SelectValue placeholder={itemsPerPage.toString()} />
            </SelectTrigger>
            <SelectContent side="top">
              {[20, 25, 50, 100].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium whitespace-nowrap text-muted-foreground">Go to page</p>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={jumpPage}
            onChange={(e) => setJumpPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleJump();
              }
            }}
            onBlur={handleJump}
            className="h-8 w-14 px-2 py-1 text-center bg-white"
          />
        </div>

        <div className="flex items-center space-x-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            asChild
            disabled={!hasPrevious}
          >
            {hasPrevious ? (
              <Link href={createPageUrl(currentPage - 1)} aria-label="Previous Page">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span>
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
          </Button>

          {getPageNumbers().map((page, idx) => (
            page === '...' ? (
              <span key={`ellipsis-${idx}`} className="flex h-8 w-8 items-center justify-center">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </span>
            ) : (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                className="h-8 w-8 p-0"
                asChild
              >
                {currentPage === page ? (
                  <span>{page}</span>
                ) : (
                  <Link href={createPageUrl(page as number)}>{page}</Link>
                )}
              </Button>
            )
          ))}

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            asChild
            disabled={!hasNext}
          >
            {hasNext ? (
              <Link href={createPageUrl(currentPage + 1)} aria-label="Next Page">
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span>
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
