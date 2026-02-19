const p = { sku: "3307" };
const initialProducts = [ { id: 1, sku: "3307", name: "Kapur Dani" } ];
const existing = initialProducts.find(prod => prod.sku?.toLowerCase() === p.sku.trim().toLowerCase());
console.log(existing);
