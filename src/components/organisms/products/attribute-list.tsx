"use client";

import { Fragment, useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { getAttributeValuesAction } from "@/app/(dashboard)/products/actions";

interface AttributeKey {
  key: string;
  count: number;
}

interface AttributeListProps {
  initialKeys: AttributeKey[];
}

export function AttributeList({ initialKeys }: AttributeListProps) {
  const [search, setSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, { value: string; count: number }[] | null>>({});
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({});

  const filteredKeys = useMemo(() => {
    return initialKeys.filter((k) =>
      k.key.toLowerCase().includes(search.toLowerCase())
    );
  }, [initialKeys, search]);

  async function toggleExpand(key: string) {
    if (expandedKeys[key]) {
      setExpandedKeys({ ...expandedKeys, [key]: null });
      return;
    }

    if (loadingKeys[key]) return;

    setLoadingKeys({ ...loadingKeys, [key]: true });
    try {
      const values = await getAttributeValuesAction(key);
      setExpandedKeys({ ...expandedKeys, [key]: values });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingKeys({ ...loadingKeys, [key]: false });
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search attributes..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Attribute Name</TableHead>
              <TableHead className="text-right">Products Count</TableHead>
              <TableHead className="text-right">Unique Values</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredKeys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No attributes found.
                </TableCell>
              </TableRow>
            ) : (
              filteredKeys.map((k) => (
                <Fragment key={k.key}>
                  <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(k.key)}>
                    <TableCell>
                      {expandedKeys[k.key] ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{k.key}</TableCell>
                    <TableCell className="text-right">{k.count}</TableCell>
                    <TableCell className="text-right">
                      {loadingKeys[k.key] ? (
                        <span className="text-xs text-muted-foreground">Loading...</span>
                      ) : (
                        expandedKeys[k.key]?.length ?? "—"
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedKeys[k.key] && (
                    <TableRow key={`${k.key}-expanded`}>
                      <TableCell colSpan={1}></TableCell>
                      <TableCell colSpan={3} className="bg-muted/30 p-4">
                        <div className="flex flex-wrap gap-2">
                          {expandedKeys[k.key]?.map((v, idx) => (
                            <Badge key={idx} variant="secondary" className="px-2 py-1 flex gap-2">
                              {v.value || <span className="italic text-muted-foreground text-[10px]">Empty</span>}
                              <span className="text-[10px] opacity-60">({v.count}x)</span>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
