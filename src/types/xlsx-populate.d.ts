declare module "xlsx-populate" {
  export interface Workbook {
    sheet(name: string): Sheet | undefined;
    outputAsync(): Promise<Uint8Array | Blob | Buffer>;
  }

  export interface Sheet {
    row(index: number): Row;
    cell(row: number, column: number | string): Cell;
  }

  export interface Row {
    cell(column: number | string): Cell;
  }

  export interface Cell {
    value(val?: string | number | boolean | Date | null): string | number | boolean | Date | null | Cell;
    value(): string | number | boolean | Date | null;
  }

  const XlsxPopulate: {
    fromDataAsync(data: Uint8Array | Buffer | ArrayBuffer): Promise<Workbook>;
    fromFileAsync(path: string): Promise<Workbook>;
    fromBlankAsync(): Promise<Workbook>;
  };

  export default XlsxPopulate;
}
